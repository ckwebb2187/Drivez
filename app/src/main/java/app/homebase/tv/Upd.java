package app.homebase.tv;

import android.app.PendingIntent;
import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * The Update button (Style → Update Home Base TV). It reads version.txt next to the app on GitHub; when that number is
 * higher than this app's, it downloads the new app and hands it to Android's installer, which asks once to confirm.
 * It also fetches the newest home-screen page from the bridge, so a page-only change shows after the next Home press.
 */
final class Upd {
    static final String BASE = "https://raw.githubusercontent.com/ckwebb2187/drivez/home-base-tv/";
    interface Say { void say(String msg); }
    private static volatile boolean busy;

    private Upd() {}

    static long versionCode(Context c) {
        try { android.content.pm.PackageInfo i = c.getPackageManager().getPackageInfo(c.getPackageName(), 0); return Build.VERSION.SDK_INT >= 28 ? i.getLongVersionCode() : i.versionCode; }
        catch (Exception e) { return 0; }
    }
    static String versionName(Context c) {
        try { return c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionName; } catch (Exception e) { return ""; }
    }

    static void check(final Activity a, final Say say) {
        if (busy) { say.say("Already checking…"); return; }
        busy = true;
        Hb.refreshPageNow(a);
        new Thread(() -> {
            try {
                say.say("Checking…");
                String v = get(BASE + "version.txt").trim();
                long latest = Long.parseLong(v.split("\\s+")[0]);
                if (latest <= versionCode(a)) { say.say("Up to date (" + versionName(a) + ")"); return; }
                if (Build.VERSION.SDK_INT >= 26 && !a.getPackageManager().canRequestPackageInstalls()) {
                    say.say("Allow Home Base to install updates, then press Update again");
                    a.runOnUiThread(() -> { try { a.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + a.getPackageName()))); } catch (Exception e) { /* not on this box */ } });
                    return;
                }
                say.say("Downloading the update…");
                PackageInstaller pi = a.getPackageManager().getPackageInstaller();
                PackageInstaller.SessionParams sp = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
                sp.setAppPackageName(a.getPackageName());
                int id = pi.createSession(sp);
                try (PackageInstaller.Session s = pi.openSession(id)) {
                    HttpURLConnection h = open(BASE + "HomeBaseTV.apk");
                    try (InputStream in = h.getInputStream(); OutputStream out = s.openWrite("HomeBaseTV.apk", 0, -1)) {
                        byte[] buf = new byte[65536]; int n;
                        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                        s.fsync(out);
                    } finally { h.disconnect(); }
                    Intent cb = new Intent(a, Done.class);
                    int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
                    s.commit(PendingIntent.getBroadcast(a, id, cb, flags).getIntentSender());
                }
                say.say("Installing… confirm on the screen");
            } catch (Exception e) {
                say.say("Couldn't update right now. Try again in a bit.");
            } finally { busy = false; }
        }, "hb-update").start();
    }

    private static HttpURLConnection open(String url) throws java.io.IOException {
        HttpURLConnection h = (HttpURLConnection) new URL(url + (url.contains("?") ? "&" : "?") + "t=" + System.currentTimeMillis()).openConnection();
        h.setConnectTimeout(10000); h.setReadTimeout(60000); h.setUseCaches(false);
        if (h.getResponseCode() != 200) throw new java.io.IOException("HTTP " + h.getResponseCode());
        return h;
    }
    private static String get(String url) throws java.io.IOException {
        HttpURLConnection h = open(url);
        try (InputStream in = h.getInputStream()) {
            java.io.ByteArrayOutputStream o = new java.io.ByteArrayOutputStream(); byte[] b = new byte[4096]; int n;
            while ((n = in.read(b)) > 0) o.write(b, 0, n);
            return o.toString("UTF-8");
        } finally { h.disconnect(); }
    }

    /** Android's installer reports back here; when it needs the person to confirm, it shows its confirm screen. */
    public static class Done extends BroadcastReceiver {
        @Override public void onReceive(Context c, Intent i) {
            int st = i.getIntExtra(PackageInstaller.EXTRA_STATUS, -999);
            if (st == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                Intent confirm = i.getParcelableExtra(Intent.EXTRA_INTENT);
                if (confirm != null) { confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); try { c.startActivity(confirm); } catch (Exception e) { /* gone */ } }
            } else if (st != PackageInstaller.STATUS_SUCCESS) {
                android.widget.Toast.makeText(c, "The update didn't install. Try again from Style.", android.widget.Toast.LENGTH_LONG).show();
            }
        }
    }
}
