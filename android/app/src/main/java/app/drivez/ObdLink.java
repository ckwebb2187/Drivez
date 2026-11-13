package app.drivez;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.SystemClock;
import android.provider.MediaStore;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedWriter;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

// Live engine data from an ELM327-style Bluetooth OBD-II adapter (clones, OBDLink LX/MX+),
// ported from the WRX Logger app. The web app reads it with DrivezNative.obdState().
// Values are sent in US units (F, mph, psi); the web app converts for metric users.
public class ObdLink {
    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    // Standard Mode 01 PIDs: key, code, bytes, slow (read every 10th cycle). Only the ones the car
    // reports as supported, and that a shown bubble (or the log) needs, are read: fewer reads = less battery.
    private static final Object[][] PIDS = {
        {"load", 0x04, 1, false}, {"coolant", 0x05, 1, true}, {"stft1", 0x06, 1, false}, {"ltft1", 0x07, 1, true},
        {"stft2", 0x08, 1, false}, {"ltft2", 0x09, 1, true}, {"fuelPress", 0x0A, 1, false}, {"map", 0x0B, 1, false},
        {"rpm", 0x0C, 2, false}, {"speed", 0x0D, 1, false}, {"timing", 0x0E, 1, false}, {"iat", 0x0F, 1, true},
        {"maf", 0x10, 2, false}, {"throttle", 0x11, 1, false}, {"runtime", 0x1F, 2, true}, {"milDist", 0x21, 2, true},
        {"railRel", 0x22, 2, false}, {"railPress", 0x23, 2, false}, {"lambda", 0x24, 4, false}, {"egr", 0x2C, 1, true},
        {"evap", 0x2E, 1, true}, {"fuelLevel", 0x2F, 1, true}, {"clearDist", 0x31, 2, true}, {"baro", 0x33, 1, true},
        {"lambdaW", 0x34, 4, false}, {"catTemp", 0x3C, 2, true}, {"voltage", 0x42, 2, true}, {"absLoad", 0x43, 2, false},
        {"cmdLambda", 0x44, 2, false}, {"relThrottle", 0x45, 1, false}, {"ambient", 0x46, 1, true}, {"pedal", 0x49, 1, false},
        {"cmdThrottle", 0x4C, 1, false}, {"ethanol", 0x52, 1, true}, {"oil", 0x5C, 1, true}, {"fuelRate", 0x5E, 2, false},
        {"demandTorque", 0x61, 1, false}, {"actualTorque", 0x62, 1, false},
    };
    private static final String DEFAULT_WATCH = "rpm,map,baro,timing,load,maf,throttle,speed,coolant,iat";
    private static final String[] CSV_COLS = {"map", "timing", "load", "maf", "throttle", "speed", "coolant", "iat", "baro"};

    private final Context ctx;
    private volatile boolean running;
    private volatile BluetoothSocket socket;
    private volatile InputStream in;
    private volatile OutputStream out;

    private volatile String status = "off"; // off | connecting | live | error
    private volatile String message = "";
    private volatile String adapterInfo = "";
    private volatile String deviceName = "";
    private volatile Map<String, Double> values = new HashMap<>();
    private volatile Double boost;
    private volatile double peakBoost = Double.NaN;
    private volatile double rate;
    private volatile long updated;
    private volatile Set<String> watch = new HashSet<>(Arrays.asList(DEFAULT_WATCH.split(",")));
    private volatile Set<Integer> supported; // null until the car answers the "which PIDs" question
    private volatile long lastRead; // when the web app last asked for values (asleep = slow down)

    private BufferedWriter csv;
    private Uri csvUri;
    private String csvName;
    private long csvStart;
    private volatile String lastSaved = "";

    public ObdLink(Context ctx) { this.ctx = ctx; }

    // One adapter connection for the whole app, so the gauges keep working in the Waze overlay.
    private static ObdLink shared;
    static synchronized ObdLink shared(Context c) {
        if (shared == null) shared = new ObdLink(c.getApplicationContext());
        return shared;
    }

    public boolean hasPermission() {
        return Build.VERSION.SDK_INT < 31 || ctx.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
    }

    private BluetoothAdapter adapter() {
        BluetoothManager m = (BluetoothManager) ctx.getSystemService(Context.BLUETOOTH_SERVICE);
        return m == null ? null : m.getAdapter();
    }

    // Paired devices, OBD-looking ones first: {"permission":true,"on":true,"devices":[{name,address,obd}]}
    public String devices() {
        JSONObject o = new JSONObject();
        try {
            o.put("permission", hasPermission());
            BluetoothAdapter a = adapter();
            o.put("on", a != null && a.isEnabled());
            JSONArray list = new JSONArray();
            if (a != null && a.isEnabled() && hasPermission()) {
                Set<BluetoothDevice> bonded = a.getBondedDevices();
                List<JSONObject> obd = new ArrayList<>(), rest = new ArrayList<>();
                for (BluetoothDevice d : bonded) {
                    String n = d.getName() == null ? d.getAddress() : d.getName();
                    boolean looks = looksLikeObd(n);
                    JSONObject j = new JSONObject().put("name", n).put("address", d.getAddress()).put("obd", looks);
                    (looks ? obd : rest).add(j);
                }
                for (JSONObject j : obd) list.put(j);
                for (JSONObject j : rest) list.put(j);
            }
            o.put("devices", list);
        } catch (Exception ignored) { }
        return o.toString();
    }

    static boolean looksLikeObd(String n) {
        String s = n.toUpperCase(Locale.US);
        return s.contains("OBD") || s.contains("ELM") || s.contains("VLINK") || s.contains("V-LINK") || s.contains("KONNWEI") || s.contains("VGATE") || s.contains("ICAR");
    }

    // Which values to read, as a comma list of keys (e.g. "rpm,map,baro,coolant").
    public void watch(String keys) {
        Set<String> w = new HashSet<>();
        for (String k : (keys == null ? "" : keys).split(",")) if (!k.trim().isEmpty()) w.add(k.trim());
        if (w.contains("boost")) { w.add("map"); w.add("baro"); }
        watch = w;
    }

    public String state() {
        lastRead = SystemClock.elapsedRealtime();
        JSONObject o = new JSONObject();
        try {
            o.put("status", status);
            o.put("message", message);
            o.put("adapter", adapterInfo);
            o.put("device", deviceName);
            JSONObject v = new JSONObject();
            for (Map.Entry<String, Double> e : values.entrySet()) v.put(e.getKey(), round(e.getValue()));
            if (boost != null) v.put("boost", round(boost));
            o.put("values", v);
            if (!Double.isNaN(peakBoost)) o.put("peakBoost", round(peakBoost));
            o.put("rate", round(rate));
            o.put("updated", updated);
            o.put("logging", csvName != null);
            o.put("logFile", csvName == null ? "" : csvName);
            o.put("lastSaved", lastSaved);
            Set<Integer> sup = supported;
            if (sup != null) {
                JSONArray a = new JSONArray();
                for (Object[] p : PIDS) if (sup.contains((Integer) p[1])) a.put(p[0]);
                o.put("supported", a);
            }
        } catch (Exception ignored) { }
        return o.toString();
    }

    private static double round(double v) { return Math.round(v * 100.0) / 100.0; }

    public void resetPeak() { Double b = boost; peakBoost = b == null ? Double.NaN : b; }

    public synchronized void connect(final String address, final String name) {
        if (running) disconnect();
        final BluetoothAdapter a = adapter();
        if (a == null) { fail("This phone has no Bluetooth."); return; }
        if (!hasPermission()) { fail("Allow Bluetooth for Kaido Maps first."); return; }
        running = true;
        status = "connecting";
        deviceName = name == null ? "" : name;
        message = "Connecting to " + deviceName + "…";
        values = new HashMap<>();
        boost = null;
        peakBoost = Double.NaN;
        rate = 0;
        supported = null;
        new Thread(() -> {
            try {
                open(a, address);
                if (!running) return;
                message = "Waking up the ECU…";
                initialize();
                if (!running) return;
                status = "live";
                message = "";
                pollLoop();
            } catch (Throwable e) {
                if (!running) return; // the driver disconnected
                Throwable t = e.getCause() != null && e instanceof java.lang.reflect.InvocationTargetException ? e.getCause() : e;
                fail(t.getMessage() != null ? t.getMessage() : "Couldn't connect to the adapter.");
            }
        }, "obd-poller").start();
    }

    public synchronized void disconnect() {
        running = false;
        closeSocket();
        stopLog();
        status = "off";
        message = "";
    }

    private void fail(String msg) {
        running = false;
        closeSocket();
        stopLog();
        status = "error";
        message = msg;
    }

    // ---------------------------------------------------------------- ELM327 link

    private void open(BluetoothAdapter a, String address) throws Exception {
        try { a.cancelDiscovery(); } catch (SecurityException ignored) { } // needs BLUETOOTH_SCAN on 12+; we never scan
        BluetoothDevice device = a.getRemoteDevice(address);
        BluetoothSocket s = null;
        try {
            s = device.createRfcommSocketToServiceRecord(SPP);
            s.connect();
        } catch (IOException e) {
            if (s != null) try { s.close(); } catch (IOException ignored) { }
            // Many clones need the hidden channel-1 fallback.
            Method m = device.getClass().getMethod("createRfcommSocket", int.class);
            s = (BluetoothSocket) m.invoke(device, 1);
            s.connect();
        }
        socket = s;
        in = s.getInputStream();
        out = s.getOutputStream();
    }

    private void initialize() throws IOException {
        send("ATZ", 3000);   // reset (clones can take ~1 s)
        sleep(500);
        send("ATE0", 1500);  // echo off
        send("ATL0", 1500);  // linefeeds off
        send("ATS0", 1500);  // spaces off -> "410C1AF8"
        send("ATH0", 1500);  // headers off
        send("ATAT1", 1500); // adaptive timing
        send("ATSP0", 1500); // auto protocol
        String version = join(send("ATI", 1500));
        boolean ok = false;
        List<String> probe = send("0100", 8000); // first request starts the protocol search
        for (String l : probe) if (l.startsWith("4100")) ok = true;
        if (!ok) throw new IOException("The car didn't answer. Is the ignition on?");
        supported = readSupported(probe);
        adapterInfo = version + " · protocol " + join(send("ATDPN", 1500));
    }

    // Asks the car which Mode 01 PIDs it answers (bitmaps from 0100, 0120, 0140, 0160).
    private Set<Integer> readSupported(List<String> first) {
        Set<Integer> sup = new HashSet<>();
        List<String> lines = first;
        for (int base = 0; base <= 0x60; base += 0x20) {
            try {
                if (base > 0) lines = send(String.format(Locale.US, "01%02X", base), 1500);
                String prefix = String.format(Locale.US, "41%02X", base);
                long bits = -1;
                for (String l : lines) if (l.startsWith(prefix) && l.length() >= prefix.length() + 8) bits = Long.parseLong(l.substring(prefix.length(), prefix.length() + 8), 16);
                if (bits < 0) break;
                for (int i = 0; i < 32; i++) if ((bits & (1L << (31 - i))) != 0) sup.add(base + i + 1);
                if (!sup.contains(base + 0x20)) break; // the car has no next block
            } catch (Exception e) {
                break;
            }
        }
        return sup.isEmpty() ? null : sup;
    }

    private void pollLoop() throws IOException {
        Map<String, Double> latest = new HashMap<>();
        long cycle = 0;
        double baro = 101.3;
        int timeouts = 0;
        long windowStart = SystemClock.elapsedRealtime();
        int windowCycles = 0;
        while (running) {
            boolean logging = csv != null;
            Set<String> w = watch;
            Set<Integer> sup = supported;
            List<Object[]> pids = new ArrayList<>();
            for (Object[] p : PIDS) {
                String k = (String) p[0];
                boolean wanted = w.contains(k) || (logging && Arrays.asList(CSV_COLS).contains(k)) || (logging && k.equals("rpm"));
                if (!wanted || (sup != null && !sup.contains((Integer) p[1]))) continue;
                if ((Boolean) p[3] && cycle % 10 != 0) continue;
                pids.add(p);
            }
            // Nobody looking (app in the background) and not logging: slow right down.
            if (!logging && SystemClock.elapsedRealtime() - lastRead > 3000) sleep(700);
            if (pids.isEmpty()) sleep(250);
            for (Object[] p : pids) {
                if (!running) return;
                try {
                    Double v = read((String) p[0], (Integer) p[1], (Integer) p[2]);
                    if (v != null) latest.put((String) p[0], v);
                    timeouts = 0;
                } catch (Timeout t) {
                    if (++timeouts >= 5) throw new IOException("The adapter stopped answering.");
                }
            }
            Double b = latest.get("baro");
            if (b != null) baro = b;
            Double map = latest.get("map");
            Double bst = map == null ? null : (map - baro) * 0.145038;

            windowCycles++;
            long now = SystemClock.elapsedRealtime();
            if (now - windowStart >= 1000) {
                rate = windowCycles * 1000.0 / (now - windowStart);
                windowStart = now;
                windowCycles = 0;
            }
            writeRow(latest, bst);
            values = new HashMap<>(latest);
            boost = bst;
            if (bst != null && (Double.isNaN(peakBoost) || bst > peakBoost)) peakBoost = bst;
            updated = System.currentTimeMillis();
            cycle++;
        }
    }

    private static class Timeout extends IOException { Timeout(String c) { super("Adapter didn't answer: " + c); } }

    private Double read(String key, int code, int bytes) throws IOException {
        String prefix = String.format(Locale.US, "41%02X", code);
        for (String l : send(String.format(Locale.US, "01%02X", code), 1500)) {
            if (!l.startsWith(prefix)) continue;
            String payload = l.substring(prefix.length());
            int n = payload.length() / 2;
            if (n < bytes) return null;
            int[] b = new int[n];
            try {
                for (int k = 0; k < n; k++) b[k] = Integer.parseInt(payload.substring(2 * k, 2 * k + 2), 16);
            } catch (NumberFormatException e) {
                return null;
            }
            return decode(key, b);
        }
        return null;
    }

    private static Double decode(String k, int[] b) {
        switch (k) {
            case "load": case "throttle": return b[0] * 100.0 / 255.0;
            case "coolant": case "iat": return (b[0] - 40) * 9.0 / 5.0 + 32.0; // F
            case "map": case "baro": return (double) b[0]; // kPa (1 byte: caps ~22 psi boost)
            case "rpm": return (b[0] * 256 + b[1]) / 4.0;
            case "speed": return b[0] * 0.621371; // mph
            case "timing": return b[0] / 2.0 - 64.0;
            case "maf": return (b[0] * 256 + b[1]) / 100.0;
            case "stft1": case "ltft1": case "stft2": case "ltft2": return (b[0] - 128) * 100.0 / 128.0;
            case "fuelPress": return b[0] * 3 * 0.145038; // psi
            case "runtime": return (double) (b[0] * 256 + b[1]); // seconds
            case "milDist": case "clearDist": return (b[0] * 256 + b[1]) * 0.621371; // miles
            case "railRel": return (b[0] * 256 + b[1]) * 0.079 * 0.145038; // psi
            case "railPress": return (b[0] * 256 + b[1]) * 10 * 0.145038; // psi (direct injection)
            case "lambda": case "lambdaW": case "cmdLambda": return (b[0] * 256 + b[1]) * 2.0 / 65536.0;
            case "egr": case "evap": case "fuelLevel": case "relThrottle": case "pedal": case "cmdThrottle": case "ethanol": return b[0] * 100.0 / 255.0;
            case "catTemp": return ((b[0] * 256 + b[1]) / 10.0 - 40) * 9.0 / 5.0 + 32.0; // F
            case "voltage": return (b[0] * 256 + b[1]) / 1000.0;
            case "absLoad": return (b[0] * 256 + b[1]) * 100.0 / 255.0;
            case "ambient": case "oil": return (b[0] - 40) * 9.0 / 5.0 + 32.0; // F
            case "fuelRate": return (b[0] * 256 + b[1]) / 20.0 * 0.264172; // US gal/h
            case "demandTorque": case "actualTorque": return (double) (b[0] - 125);
            default: return null;
        }
    }

    private synchronized List<String> send(String cmd, long timeoutMs) throws IOException {
        InputStream i = in;
        OutputStream o = out;
        if (i == null || o == null) throw new IOException("Not connected");
        while (i.available() > 0) i.read();
        o.write((cmd + "\r").getBytes(StandardCharsets.US_ASCII));
        o.flush();
        StringBuilder sb = new StringBuilder();
        byte[] buf = new byte[256];
        long deadline = System.currentTimeMillis() + timeoutMs;
        String raw = null;
        while (System.currentTimeMillis() < deadline) {
            int n = i.available();
            if (n > 0) {
                int r = i.read(buf, 0, Math.min(n, buf.length));
                if (r < 0) throw new IOException("The adapter disconnected.");
                sb.append(new String(buf, 0, r, StandardCharsets.US_ASCII));
                int p = sb.indexOf(">");
                if (p >= 0) { raw = sb.substring(0, p); break; }
            } else {
                sleep(5);
            }
        }
        if (raw == null) throw new Timeout(cmd);
        List<String> lines = new ArrayList<>();
        for (String l : raw.replace("SEARCHING...", "").split("[\\r\\n]")) {
            l = l.trim();
            if (!l.isEmpty() && !l.equals(cmd)) lines.add(l);
        }
        return lines;
    }

    private void closeSocket() {
        BluetoothSocket s = socket;
        socket = null;
        in = null;
        out = null;
        if (s != null) try { s.close(); } catch (IOException ignored) { }
    }

    private static void sleep(long ms) throws IOException {
        try { Thread.sleep(ms); } catch (InterruptedException e) { throw new IOException("Interrupted"); }
    }

    private static String join(List<String> l) {
        StringBuilder sb = new StringBuilder();
        for (String s : l) { if (sb.length() > 0) sb.append(' '); sb.append(s); }
        return sb.toString();
    }

    // ---------------------------------------------------------------- CSV log (Datazap / Virtual Dyno format)

    // Starts or stops logging. Files go to Downloads/KaidoMaps (Android 10+) or the app's own folder.
    public synchronized String setLogging(boolean on) {
        try {
            if (on && csv == null) startLog();
            else if (!on) stopLog();
        } catch (Exception e) {
            return e.getMessage() == null ? "Couldn't start the log." : e.getMessage();
        }
        return "";
    }

    private void startLog() throws IOException {
        String name = "kaido_engine_" + new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date()) + ".csv";
        OutputStream os;
        if (Build.VERSION.SDK_INT >= 29) {
            ContentValues v = new ContentValues();
            v.put(MediaStore.Downloads.DISPLAY_NAME, name);
            v.put(MediaStore.Downloads.MIME_TYPE, "text/csv");
            v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/KaidoMaps");
            v.put(MediaStore.Downloads.IS_PENDING, 1);
            ContentResolver r = ctx.getContentResolver();
            csvUri = r.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
            if (csvUri == null) throw new IOException("Couldn't create the log file.");
            os = r.openOutputStream(csvUri);
        } else {
            File dir = ctx.getExternalFilesDir(null);
            os = new FileOutputStream(new File(dir, name));
            csvUri = null;
        }
        if (os == null) throw new IOException("Couldn't open the log file.");
        csv = new BufferedWriter(new OutputStreamWriter(os, StandardCharsets.UTF_8));
        csv.write("Time (sec),RPM,Boost (psi),Manifold Abs (kPa),Timing (deg),Load (%),MAF (g/s),Throttle (%),Speed (mph),Coolant (F),IAT (F),Baro (kPa)");
        csv.newLine();
        csvName = name;
        csvStart = SystemClock.elapsedRealtime();
    }

    private synchronized void writeRow(Map<String, Double> v, Double bst) {
        if (csv == null) return;
        try {
            StringBuilder sb = new StringBuilder();
            sb.append(fmt((SystemClock.elapsedRealtime() - csvStart) / 1000.0, 3));
            sb.append(',').append(fmt(v.get("rpm"), 0));
            sb.append(',').append(fmt(bst, 2));
            for (String k : CSV_COLS) sb.append(',').append(fmt(v.get(k), 1));
            csv.write(sb.toString());
            csv.newLine();
        } catch (IOException ignored) { }
    }

    private synchronized void stopLog() {
        if (csv == null) return;
        try { csv.flush(); csv.close(); } catch (IOException ignored) { }
        if (csvUri != null) {
            try {
                ContentValues done = new ContentValues();
                done.put(MediaStore.Downloads.IS_PENDING, 0);
                ctx.getContentResolver().update(csvUri, done, null, null);
            } catch (Exception ignored) { }
        }
        lastSaved = (Build.VERSION.SDK_INT >= 29 ? "Downloads/KaidoMaps/" : "") + csvName;
        csv = null;
        csvUri = null;
        csvName = null;
    }

    private static String fmt(Double v, int decimals) {
        return v == null ? "" : String.format(Locale.US, "%." + decimals + "f", v);
    }
}
