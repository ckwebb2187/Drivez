package app.drivez;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.provider.Settings;
import android.service.quicksettings.TileService;
import android.content.ComponentName;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.drawable.GradientDrawable;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;

import org.json.JSONObject;

// Overlay Mode: Waze runs full screen as the live map and Kaido floats its widgets (engine gauges,
// speed) on top in a transparent window. Taps on the map pass straight through to Waze; in
// "Edit layout" the widgets can be dragged. A foreground service keeps the overlay alive while
// Waze is in front. Waze itself is never read or changed.
public class OverlayService extends Service {
    static final String WAZE = "com.waze";
    private static final String CHANNEL = "overlay";
    private static final String ACTION_STOP = "app.drivez.overlay.STOP";
    private static final String ACTION_EDIT = "app.drivez.overlay.EDIT";
    private static final String ACTION_AUTO = "app.drivez.overlay.AUTO";
    private static volatile boolean running = false;
    private static OverlayService instance;

    private WindowManager wm;
    private WebView web;
    private WindowManager.LayoutParams lp;
    private boolean editing = false;
    private MediaWatcher media; // what's playing, for the music widget
    // Floating Kaido button: its own small window that takes taps, so the overlay can be
    // controlled from Waze (edit, auto in car, open Kaido, stop) without the notification.
    private LinearLayout btnWin, menu;
    private WindowManager.LayoutParams blp;
    private TextView editItem, autoItem;
    private int btnLeft = -1;

    static boolean isRunning() { return running; }

    // Turn Overlay Mode on: needs "Display over other apps" first, then starts the overlay and opens Waze.
    // Returns "permission" (settings opened, try again after), "nowaze" (Play Store opened) or "started".
    static String launch(Context c) {
        if (!Settings.canDrawOverlays(c)) {
            Intent i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + c.getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try { c.startActivity(i); } catch (Exception ignored) { }
            return "permission";
        }
        Intent waze = wazeIntent(c);
        if (waze == null) {
            Intent store = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + WAZE));
            store.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try { c.startActivity(store); } catch (Exception e) {
                try { c.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=" + WAZE)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception ignored) { }
            }
            return "nowaze";
        }
        c.startForegroundService(new Intent(c, OverlayService.class));
        try { c.startActivity(waze); } catch (Exception ignored) { }
        return "started";
    }

    static void stop(Context c) { c.stopService(new Intent(c, OverlayService.class)); }

    static Intent wazeIntent(Context c) {
        Intent i = c.getPackageManager().getLaunchIntentForPackage(WAZE);
        if (i != null) i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return i;
    }

    static String state(Context c) {
        JSONObject o = new JSONObject();
        try {
            o.put("running", running);
            o.put("editing", instance != null && instance.editing);
            o.put("permission", Settings.canDrawOverlays(c));
            boolean waze;
            try { c.getPackageManager().getPackageInfo(WAZE, 0); waze = true; } catch (PackageManager.NameNotFoundException e) { waze = false; }
            o.put("waze", waze);
        } catch (Exception ignored) { }
        return o.toString();
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        running = true;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Overlay Mode", NotificationManager.IMPORTANCE_LOW));
        if (Build.VERSION.SDK_INT >= 34) startForeground(1, notification(), 0x40000000); // FOREGROUND_SERVICE_TYPE_SPECIAL_USE
        else startForeground(1, notification());
        showOverlay();
        showButton();
        refreshTile();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String a = intent == null ? null : intent.getAction();
        if (ACTION_STOP.equals(a)) { stopSelf(); return START_NOT_STICKY; }
        if (ACTION_EDIT.equals(a)) setEditing(!editing);
        if (ACTION_AUTO.equals(a)) {
            CarOverlay.setEnabled(this, !CarOverlay.enabled(this));
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(1, notification());
            updateMenu();
        }
        return START_STICKY;
    }

    private Notification notification() {
        PendingIntent stop = PendingIntent.getService(this, 1, new Intent(this, OverlayService.class).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent edit = PendingIntent.getService(this, 2, new Intent(this, OverlayService.class).setAction(ACTION_EDIT), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent auto = PendingIntent.getService(this, 4, new Intent(this, OverlayService.class).setAction(ACTION_AUTO), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent open = PendingIntent.getActivity(this, 3, new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_dialog_map)
            .setContentTitle("Kaido overlay is on")
            .setContentText(editing ? "Drag your widgets, then tap Done." : "Your gauges are floating over Waze.")
            .setContentIntent(open)
            .setOngoing(true)
            .addAction(new Notification.Action.Builder(null, editing ? "Done editing" : "Edit layout", edit).build())
            .addAction(new Notification.Action.Builder(null, "Stop overlay", stop).build())
            .addAction(new Notification.Action.Builder(null, CarOverlay.enabled(this) ? "Auto in car: ON" : "Auto in car: OFF", auto).build())
            .build();
    }

    private void showOverlay() {
        wm = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        web = new WebView(this);
        web.setBackgroundColor(Color.TRANSPARENT);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setGeolocationEnabled(true);
        s.setUserAgentString(s.getUserAgentString() + " DrivezAndroid/" + BuildConfig.VERSION_NAME + " DrivezOverlay");
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {
                boolean ok = checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
                cb.invoke(origin, ok, false);
            }
        });
        web.addJavascriptInterface(new Bridge(), "DrivezNative");
        // Display-only: the window ignores touches so every tap lands on Waze. Android 12+ only lets
        // touches pass through a full-screen overlay at 80% opacity or less, so it runs at 0.8.
        lp = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT);
        lp.alpha = 0.8f;
        wm.addView(web, lp);
        web.loadUrl(BuildConfig.SITE + "/overlay");
        media = new MediaWatcher(this, json -> web.post(() -> {
            if (web != null) web.evaluateJavascript("window.dispatchEvent(new CustomEvent('drivez-media',{detail:" + json + "}))", null);
        }));
        media.start();
    }

    // Edit layout: the overlay takes touches so widgets can be dragged; Waze can't be tapped until Done.
    void setEditing(boolean on) {
        editing = on;
        if (web == null) return;
        web.post(() -> {
            if (on) { lp.flags &= ~WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE; lp.alpha = 1f; }
            else { lp.flags |= WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE; lp.alpha = 0.8f; }
            try { wm.updateViewLayout(web, lp); } catch (Exception ignored) { }
            web.evaluateJavascript("window.dispatchEvent(new CustomEvent('drivez-overlay-edit',{detail:" + on + "}))", null);
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(1, notification());
            updateMenu();
        });
    }

    private int dp(float v) { return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics())); }

    private TextView item(String text, View.OnClickListener on) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextColor(Color.WHITE);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        t.setPadding(dp(16), dp(12), dp(16), dp(12));
        t.setOnClickListener(on);
        menu.addView(t, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        return t;
    }

    private void updateMenu() {
        if (editItem == null) return;
        editItem.setText(editing ? "Done editing" : "Edit layout");
        autoItem.setText(CarOverlay.enabled(this) ? "Auto in car: ON" : "Auto in car: OFF");
    }

    private void showButton() {
        int size = dp(48);
        btnWin = new LinearLayout(this);
        btnWin.setOrientation(LinearLayout.VERTICAL);
        ImageView icon = new ImageView(this);
        icon.setImageResource(R.mipmap.ic_launcher);
        GradientDrawable ring = new GradientDrawable();
        ring.setShape(GradientDrawable.OVAL);
        ring.setColor(0xE60A0C10);
        ring.setStroke(dp(2), 0xFF3B82F6);
        icon.setBackground(ring);
        icon.setPadding(dp(5), dp(5), dp(5), dp(5));
        icon.setClipToOutline(true);
        btnWin.addView(icon, new LinearLayout.LayoutParams(size, size));
        menu = new LinearLayout(this);
        menu.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable box = new GradientDrawable();
        box.setColor(0xF20A0C10);
        box.setCornerRadius(dp(14));
        box.setStroke(dp(1), 0x40FFFFFF);
        menu.setBackground(box);
        menu.setVisibility(View.GONE);
        editItem = item("Edit layout", v -> { setEditing(!editing); openMenu(false); });
        autoItem = item("Auto in car", v -> {
            CarOverlay.setEnabled(this, !CarOverlay.enabled(this));
            updateMenu();
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(1, notification());
        });
        item("Open Kaido Maps", v -> { openMenu(false); try { startActivity(new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception ignored) { } });
        item("Stop overlay", v -> stopSelf());
        item("Close", v -> openMenu(false));
        LinearLayout.LayoutParams mlp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        mlp.topMargin = dp(6);
        btnWin.addView(menu, mlp);
        updateMenu();

        SharedPreferences p = getSharedPreferences("overlay_button", MODE_PRIVATE);
        int sw = getResources().getDisplayMetrics().widthPixels, sh = getResources().getDisplayMetrics().heightPixels;
        btnLeft = Math.max(0, Math.min(sw - size, p.getInt("x", sw - size - dp(10))));
        blp = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT);
        blp.gravity = Gravity.TOP | Gravity.START;
        blp.x = btnLeft;
        blp.y = Math.max(0, Math.min(sh - size, p.getInt("y", Math.round(sh * 0.28f))));
        // Tap: open the menu. Drag: move the button (remembered).
        final float[] start = new float[4];
        final boolean[] moved = new boolean[1];
        icon.setOnTouchListener((v, e) -> {
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    start[0] = e.getRawX(); start[1] = e.getRawY(); start[2] = btnLeft; start[3] = blp.y; moved[0] = false; return true;
                case MotionEvent.ACTION_MOVE:
                    float dx = e.getRawX() - start[0], dy = e.getRawY() - start[1];
                    if (!moved[0] && Math.hypot(dx, dy) < dp(8)) return true;
                    if (!moved[0]) openMenu(false);
                    moved[0] = true;
                    int w = getResources().getDisplayMetrics().widthPixels, h = getResources().getDisplayMetrics().heightPixels;
                    btnLeft = Math.max(0, Math.min(w - size, Math.round(start[2] + dx)));
                    blp.x = btnLeft;
                    blp.y = Math.max(0, Math.min(h - size, Math.round(start[3] + dy)));
                    try { wm.updateViewLayout(btnWin, blp); } catch (Exception ignored) { }
                    return true;
                case MotionEvent.ACTION_UP:
                    if (moved[0]) p.edit().putInt("x", btnLeft).putInt("y", blp.y).apply();
                    else openMenu(menu.getVisibility() != View.VISIBLE);
                    return true;
                default: return true;
            }
        });
        try { wm.addView(btnWin, blp); } catch (Exception ignored) { btnWin = null; }
    }

    // The menu opens under the button, shifted left when the button sits near the right edge.
    private void openMenu(boolean open) {
        if (btnWin == null) return;
        int size = dp(48), sw = getResources().getDisplayMetrics().widthPixels;
        if (open) {
            updateMenu();
            menu.setVisibility(View.VISIBLE);
            menu.measure(View.MeasureSpec.UNSPECIFIED, View.MeasureSpec.UNSPECIFIED);
            int mw = Math.max(size, menu.getMeasuredWidth());
            boolean right = btnLeft + mw > sw;
            btnWin.setGravity(right ? Gravity.END : Gravity.START);
            blp.x = right ? Math.max(0, btnLeft + size - mw) : btnLeft;
        } else {
            menu.setVisibility(View.GONE);
            btnWin.setGravity(Gravity.START);
            blp.x = btnLeft;
        }
        try { wm.updateViewLayout(btnWin, blp); } catch (Exception ignored) { }
    }

    @Override
    public void onConfigurationChanged(Configuration c) {
        super.onConfigurationChanged(c);
        if (btnWin == null) return;
        int size = dp(48), sw = getResources().getDisplayMetrics().widthPixels, sh = getResources().getDisplayMetrics().heightPixels;
        btnLeft = Math.max(0, Math.min(sw - size, btnLeft));
        blp.y = Math.max(0, Math.min(sh - size, blp.y));
        openMenu(false);
    }

    private void refreshTile() {
        try { TileService.requestListeningState(this, new ComponentName(this, OverlayTile.class)); } catch (Exception ignored) { }
    }

    @Override
    public void onDestroy() {
        running = false;
        instance = null;
        if (media != null) media.stop();
        // Stopped by the driver mid-trip: don't pop back up until they next get in the car.
        if (!CarOverlay.stoppingAuto && CarOverlay.prefs(this).getBoolean("autoStarted", false)) CarOverlay.stoppedByDriver(this);
        CarOverlay.stoppingAuto = false;
        if (btnWin != null) { try { wm.removeView(btnWin); } catch (Exception ignored) { } btnWin = null; }
        if (web != null) {
            try { wm.removeView(web); } catch (Exception ignored) { }
            web.destroy();
            web = null;
        }
        refreshTile();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    // What the overlay page can use: live engine data, its edit state, and stopping itself.
    class Bridge {
        @JavascriptInterface public String info() {
            JSONObject o = new JSONObject();
            try { o.put("version", BuildConfig.VERSION_NAME); o.put("versionCode", BuildConfig.VERSION_CODE); o.put("obd", true); o.put("overlay", true); } catch (Exception ignored) { }
            return o.toString();
        }
        @JavascriptInterface public String obdState() { return ObdLink.shared(OverlayService.this).state(); }
        @JavascriptInterface public void obdWatch(String keys) { ObdLink.shared(OverlayService.this).watch(keys); }
        @JavascriptInterface public void obdResetPeak() { ObdLink.shared(OverlayService.this).resetPeak(); }
        @JavascriptInterface public void obdConnect(String address, String name) { ObdLink.shared(OverlayService.this).connect(address, name); }
        @JavascriptInterface public String nowPlaying() { return media == null ? "{}" : media.snapshot(); }
        @JavascriptInterface public void control(String action) { web.post(() -> { if (media != null) media.control(action); }); }
        @JavascriptInterface public boolean overlayEditing() { return editing; }
        @JavascriptInterface public void overlayEdit(boolean on) { setEditing(on); }
        @JavascriptInterface public void overlayStop() { web.post(OverlayService.this::stopSelf); }
        @JavascriptInterface public void keepScreenOn(boolean on) { }
    }
}
