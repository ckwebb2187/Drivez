package app.drivez;

import android.app.UiModeManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.res.Configuration;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONObject;

// Knows when the phone is plugged into (or wirelessly on) Android Auto, so drives can count
// toward the car linked to Android Auto. Uses the same public signal Google's car library
// reads (the Android Auto app's "car connection" provider), plus the system's car mode.
// No Google approval is needed for this: it only reads the connection state.
public class CarAuto {
    public interface Listener { void changed(String json); }

    private static final Uri CONNECTION = Uri.parse("content://androidx.car.app.connection");
    private static final String STATE = "CarConnectionState";
    private static final String UPDATED = "androidx.car.app.connection.action.CAR_CONNECTION_UPDATED";

    private final Context ctx;
    private final Listener listener;
    private final Handler main = new Handler(Looper.getMainLooper());
    private String type = "none"; // none | projection (Android Auto) | native (built-in Android Automotive)
    private BroadcastReceiver receiver;
    private final Runnable poll = new Runnable() { public void run() { refresh(); main.postDelayed(this, 30000); } };

    public CarAuto(Context ctx, Listener listener) { this.ctx = ctx; this.listener = listener; }

    public void start() {
        if (receiver != null) return;
        receiver = new BroadcastReceiver() { @Override public void onReceive(Context c, Intent i) { refresh(); } };
        IntentFilter f = new IntentFilter(UPDATED);
        f.addAction(UiModeManager.ACTION_ENTER_CAR_MODE);
        f.addAction(UiModeManager.ACTION_EXIT_CAR_MODE);
        try {
            if (Build.VERSION.SDK_INT >= 33) ctx.registerReceiver(receiver, f, Context.RECEIVER_EXPORTED);
            else ctx.registerReceiver(receiver, f);
        } catch (Exception ignored) { }
        main.post(poll);
    }

    public void stop() {
        main.removeCallbacks(poll);
        if (receiver != null) { try { ctx.unregisterReceiver(receiver); } catch (Exception ignored) { } receiver = null; }
    }

    private void refresh() {
        new Thread(() -> {
            String next = read();
            main.post(() -> { if (!next.equals(type)) { type = next; listener.changed(status()); } });
        }).start();
    }

    private String read() {
        if (ctx.getPackageManager().hasSystemFeature("android.hardware.type.automotive")) return "native";
        try (Cursor c = ctx.getContentResolver().query(CONNECTION, new String[]{ STATE }, null, null, null)) {
            if (c != null && c.moveToNext()) {
                int i = c.getColumnIndex(STATE);
                int v = i >= 0 ? c.getInt(i) : 0;
                if (v == 2) return "projection";
                if (v == 1) return "native";
            }
        } catch (Exception ignored) { /* Android Auto not installed */ }
        UiModeManager ui = (UiModeManager) ctx.getSystemService(Context.UI_MODE_SERVICE);
        if (ui != null && ui.getCurrentModeType() == Configuration.UI_MODE_TYPE_CAR) return "projection";
        return "none";
    }

    public String status() {
        JSONObject o = new JSONObject();
        try { o.put("type", type); o.put("connected", !"none".equals(type)); } catch (Exception ignored) { }
        return o.toString();
    }
}
