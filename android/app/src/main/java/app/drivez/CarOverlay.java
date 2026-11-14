package app.drivez;

import android.bluetooth.BluetoothDevice;
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

    @Override
    public void onReceive(Context c, Intent i) {
        BluetoothDevice d = i.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
        if (d == null || !isCar(c, d)) return;
        SharedPreferences p = prefs(c);
        if (BluetoothDevice.ACTION_ACL_CONNECTED.equals(i.getAction())) {
            if (!enabled(c) || OverlayService.isRunning() || p.getBoolean("skipTrip", false)) return;
            if (!Settings.canDrawOverlays(c)) return; // "Display over other apps" not allowed yet
            Intent waze = OverlayService.wazeIntent(c);
            if (waze == null) return;
            try {
                c.startForegroundService(new Intent(c, OverlayService.class));
                c.startActivity(waze);
                p.edit().putBoolean("autoStarted", true).apply();
            } catch (Exception ignored) { }
        } else if (BluetoothDevice.ACTION_ACL_DISCONNECTED.equals(i.getAction())) {
            boolean ours = p.getBoolean("autoStarted", false);
            p.edit().putBoolean("autoStarted", false).putBoolean("skipTrip", false).apply();
            if (ours && OverlayService.isRunning()) { stoppingAuto = true; OverlayService.stop(c); }
        }
    }
}
