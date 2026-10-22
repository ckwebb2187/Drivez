package app.drivez;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

// Knows which Bluetooth devices (car stereos, CarPlay/Android Auto head units) are connected,
// so miles only count toward a car's odometer when the phone is connected to that car.
public class CarBluetooth {
    public interface Listener { void changed(String json); }

    private final Context ctx;
    private final Listener listener;
    private final Map<String, String> connected = new LinkedHashMap<>(); // address -> name
    private boolean started;

    public CarBluetooth(Context ctx, Listener listener) { this.ctx = ctx; this.listener = listener; }

    public boolean hasPermission() {
        return Build.VERSION.SDK_INT < 31 || ctx.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
    }

    private BluetoothAdapter adapter() {
        BluetoothManager m = (BluetoothManager) ctx.getSystemService(Context.BLUETOOTH_SERVICE);
        return m == null ? null : m.getAdapter();
    }

    private final BroadcastReceiver receiver = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            BluetoothDevice d = i.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
            if (d == null) return;
            String name = safeName(d);
            if (BluetoothDevice.ACTION_ACL_CONNECTED.equals(i.getAction())) connected.put(d.getAddress(), name);
            else connected.remove(d.getAddress());
            listener.changed(status());
        }
    };

    public void start() {
        if (started || !hasPermission()) return;
        started = true;
        IntentFilter f = new IntentFilter();
        f.addAction(BluetoothDevice.ACTION_ACL_CONNECTED);
        f.addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED);
        ctx.registerReceiver(receiver, f);
        // Devices that were already connected before the app opened.
        BluetoothAdapter a = adapter();
        if (a == null || !a.isEnabled()) return;
        for (int profile : new int[]{ BluetoothProfile.A2DP, BluetoothProfile.HEADSET }) {
            try {
                a.getProfileProxy(ctx, new BluetoothProfile.ServiceListener() {
                    @Override public void onServiceConnected(int p, BluetoothProfile proxy) {
                        try { for (BluetoothDevice d : proxy.getConnectedDevices()) connected.put(d.getAddress(), safeName(d)); } catch (SecurityException ignored) { }
                        a.closeProfileProxy(p, proxy);
                        listener.changed(status());
                    }
                    @Override public void onServiceDisconnected(int p) { }
                }, profile);
            } catch (SecurityException ignored) { }
        }
    }

    public void stop() {
        if (!started) return;
        started = false;
        try { ctx.unregisterReceiver(receiver); } catch (Exception ignored) { }
    }

    private String safeName(BluetoothDevice d) {
        try { String n = d.getName(); return n == null ? d.getAddress() : n; } catch (SecurityException e) { return d.getAddress(); }
    }

    // {permission, enabled, connected:[{name,address}], paired:[{name,address}]}
    public String status() {
        JSONObject o = new JSONObject();
        try {
            o.put("permission", hasPermission());
            BluetoothAdapter a = adapter();
            o.put("enabled", a != null && a.isEnabled());
            JSONArray con = new JSONArray();
            for (Map.Entry<String, String> e : connected.entrySet()) con.put(new JSONObject().put("address", e.getKey()).put("name", e.getValue()));
            o.put("connected", con);
            JSONArray paired = new JSONArray();
            if (a != null && hasPermission()) {
                try {
                    Set<BluetoothDevice> bonded = a.getBondedDevices();
                    if (bonded != null) for (BluetoothDevice d : bonded) paired.put(new JSONObject().put("address", d.getAddress()).put("name", safeName(d)));
                } catch (SecurityException ignored) { }
            }
            o.put("paired", paired);
        } catch (Exception ignored) { }
        return o.toString();
    }
}
