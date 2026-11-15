package app.drivez;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothProfile;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.provider.Settings;
import android.service.quicksettings.TileService;

import org.json.JSONObject;

// Auto overlay: when the phone joins your car's Bluetooth, open Waze with Kaido's overlay on top,
// even if Kaido isn't open. When you leave the car, the overlay it started goes away.
// Listed in the manifest, so Android wakes Kaido for these Bluetooth events.
public class CarOverlay extends BroadcastReceiver {
    private static final String PREFS = "car_overlay";
    static volatile boolean stoppingAuto = false; // true while we stop it ourselves (not the driver)

    static SharedPreferences prefs(Context c) { return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    static boolean enabled(Context c) { return prefs(c).getBoolean("on", true); }

    static void setEnabled(Context c, boolean on) {
        prefs(c).edit().putBoolean("on", on).apply();
        try { TileService.requestListeningState(c, new ComponentName(c, OverlayAutoTile.class)); } catch (Exception ignored) { }
    }

    // The car picked in Kaido (OBD auto-connect). Empty = any Bluetooth named like the Subaru.
    static void setCar(Context c, String address, String name) {
        prefs(c).edit().putString("car", address == null ? "" : address).putString("carName", name == null ? "" : name).apply();
    }

    static String state(Context c) {
        JSONObject o = new JSONObject();
        try {
            SharedPreferences p = prefs(c);
            o.put("on", enabled(c));
            o.put("carName", p.getString("carName", ""));
            o.put("last", p.getString("last", ""));
        } catch (Exception ignored) { }
        return o.toString();
    }

    // The driver stopped the overlay by hand: don't pop it back up for the rest of this trip.
    static void stoppedByDriver(Context c) { prefs(c).edit().putBoolean("skipTrip", true).apply(); }

    private static boolean isCar(Context c, BluetoothDevice d) {
        SharedPreferences p = prefs(c);
        String car = p.getString("car", "");
        if (!car.isEmpty()) return car.equalsIgnoreCase(d.getAddress());
        String name;
        try { name = d.getName(); } catch (SecurityException e) { name = null; }
        return name != null && name.toLowerCase().matches(".*(boo?baru|subaru).*");
    }

    // What happened last time, shown in Kaido's settings so problems are easy to spot.
    private static void log(Context c, String what) {
        String t = new java.text.SimpleDateFormat("MMM d h:mm a", java.util.Locale.US).format(new java.util.Date());
        prefs(c).edit().putString("last", t + ": " + what).apply();
    }

    // Start the overlay and open Waze. Returns a short reason when it can't.
    static String start(Context c, boolean fromCar) {
        SharedPreferences p = prefs(c);
        if (OverlayService.isRunning()) return "already on";
        if (!Settings.canDrawOverlays(c)) return "needs \"Display over other apps\"";
        Intent waze = OverlayService.wazeIntent(c);
        if (waze == null) return "Waze isn't installed";
        try {
            c.startForegroundService(new Intent(c, OverlayService.class));
        } catch (Exception e) {
            // Android blocked starting from the background: offer a one-tap notification instead.
            tapToStart(c);
            return "Android blocked it, sent a tap-to-start notification";
        }
        try { c.startActivity(waze); } catch (Exception ignored) { }
        if (fromCar) p.edit().putBoolean("autoStarted", true).apply();
        return "started";
    }

    private static void tapToStart(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        nm.createNotificationChannel(new NotificationChannel("car", "In the car", NotificationManager.IMPORTANCE_HIGH));
        Intent go = new Intent(c, MainActivity.class).putExtra("startOverlay", true).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent pi = PendingIntent.getActivity(c, 7, go, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        nm.notify(7, new Notification.Builder(c, "car").setSmallIcon(android.R.drawable.ic_dialog_map)
            .setContentTitle("You're in the car").setContentText("Tap to open Waze with your Kaido overlay")
            .setContentIntent(pi).setAutoCancel(true).build());
    }

    @Override
    public void onReceive(Context c, Intent i) {
        BluetoothDevice d = i.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
        if (d == null) return;
        String a = i.getAction();
        boolean up, down;
        if (BluetoothDevice.ACTION_ACL_CONNECTED.equals(a)) { up = true; down = false; }
        else if (BluetoothDevice.ACTION_ACL_DISCONNECTED.equals(a)) { up = false; down = true; }
        else { // car audio / calls connecting (some cars only send these)
            int st = i.getIntExtra(BluetoothProfile.EXTRA_STATE, -1);
            up = st == BluetoothProfile.STATE_CONNECTED; down = false; // only a full disconnect means you left
        }
        if (!up && !down) return;
        String name;
        try { name = d.getName(); } catch (SecurityException e) { name = null; }
        if (!isCar(c, d)) { if (up) log(c, "connected to " + (name == null ? "a device" : name) + " (not your car)"); return; }
        SharedPreferences p = prefs(c);
        if (up) {
            if (!enabled(c)) { log(c, "car connected, auto is off"); return; }
            if (p.getBoolean("skipTrip", false)) { log(c, "car connected, you stopped it this trip"); return; }
            if (OverlayService.isRunning()) return;
            log(c, "car connected: " + start(c, true));
        } else {
            boolean ours = p.getBoolean("autoStarted", false);
            p.edit().putBoolean("autoStarted", false).putBoolean("skipTrip", false).apply();
            if (ours && OverlayService.isRunning()) { stoppingAuto = true; OverlayService.stop(c); }
        }
    }
}
