package app.homebase.tv;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Color;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Shared bits: the saved Home Base code, the page URLs, and the WebView setup. */
final class Hb {
    static final String BRIDGE = "https://home-bridge.webb-home.workers.dev";
    static final String WALL = "https://claude.ai/artifact/GEuKJGQQ1hA81nNhsMcJac";
    private static final Pattern CODE = Pattern.compile("(?:/w/)?([A-Za-z0-9_-]{16,64})(?:/|$)");

    private Hb() {}

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("hb", Context.MODE_PRIVATE); }

    static String code(Context c) { return prefs(c).getString("code", ""); }

    /** Pulls the code out of whatever was pasted: the code itself, or a whole Home Base wallpaper or TV link. */
    static String parseCode(String s) {
        if (s == null) return "";
        s = s.trim();
        if (s.equalsIgnoreCase("demo")) return "demo";
        int w = s.indexOf("/w/");
        if (w >= 0) s = s.substring(w + 3);
        Matcher m = CODE.matcher(s);
        return m.find() ? m.group(1) : "";
    }

    static String feedUrl(String code) { return BRIDGE + "/w/" + code + "/tv.json"; }

    /** Where the bundled page pretends to live, so it reads tv.json from the bridge as its own neighbor. */
    static String pageUrl(Context c, String mode) {
        return BRIDGE + "/w/" + code(c) + "/tv?mode=" + mode;
    }

    /**
     * Shows the background page right away from this device: the newest copy the bridge has sent before, or the copy
     * that ships inside the app. Then, in the background, it asks the bridge for a newer copy and keeps it for next time,
     * so the screen can change without reinstalling the app but never waits on the internet to appear.
     */
    static void loadPage(Context c, WebView w, String mode) {
        w.loadDataWithBaseURL(pageUrl(c, mode), page(c), "text/html", "UTF-8", null);
        refreshPage(c.getApplicationContext());
    }

    private static String page;
    private static long checkedAt;
    private static synchronized String page(Context c) {
        if (page != null) return page;
        java.io.File f = new java.io.File(c.getFilesDir(), "tv.html");
        if (f.isFile() && f.length() > 50000) {
            try (InputStream in = new java.io.FileInputStream(f)) { page = readAll(in); return page; } catch (Exception e) { /* use the bundled copy */ }
        }
        try (InputStream in = c.getAssets().open("tv.html")) { page = readAll(in); }
        catch (Exception e) { page = "<body style='background:#0D1412'></body>"; }
        return page;
    }
    private static String readAll(InputStream in) throws java.io.IOException {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        byte[] buf = new byte[16384]; int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        return out.toString("UTF-8");
    }
    /** At most every 6 hours: saves the bridge's copy of the page when it has one that differs (used from the next load). */
    private static void refreshPage(final Context c) {
        final String code = code(c);
        if (code.isEmpty() || code.equals("demo") || System.currentTimeMillis() - checkedAt < 6 * 3600 * 1000L) return;
        checkedAt = System.currentTimeMillis();
        new Thread(() -> {
            HttpURLConnection h = null;
            try {
                h = (HttpURLConnection) new URL(BRIDGE + "/w/" + code + "/tv").openConnection();
                h.setConnectTimeout(8000); h.setReadTimeout(15000);
                if (h.getResponseCode() != 200) return;
                String got;
                try (InputStream in = h.getInputStream()) { got = readAll(in); }
                if (got.length() < 50000 || !got.contains("id=\"wrap\"") || got.equals(page)) return;
                java.io.File tmp = new java.io.File(c.getFilesDir(), "tv.html.part");
                try (java.io.FileOutputStream out = new java.io.FileOutputStream(tmp)) { out.write(got.getBytes("UTF-8")); }
                if (tmp.renameTo(new java.io.File(c.getFilesDir(), "tv.html"))) synchronized (Hb.class) { page = got; }
            } catch (Exception e) { /* try again later */ }
            finally { if (h != null) h.disconnect(); }
        }, "hb-page").start();
    }

    /** Checks a code against the bridge. Returns "" when it works, otherwise what went wrong. Runs on a background thread. */
    static String testCode(String code) {
        if (code.isEmpty()) return "That doesn't look like a Home Base code.";
        if (code.equals("demo")) return "";   // sample data, to preview the screen
        HttpURLConnection h = null;
        try {
            h = (HttpURLConnection) new URL(feedUrl(code)).openConnection();
            h.setConnectTimeout(8000);
            h.setReadTimeout(8000);
            int st = h.getResponseCode();
            if (st == 200) { InputStream in = h.getInputStream(); in.close(); return ""; }
            return st == 404 ? "That code didn't work. Check it and try again." : "Home Base answered with an error (" + st + "). Try again in a minute.";
        } catch (Exception e) {
            return "Couldn't reach Home Base. Check the TV box's internet connection.";
        } finally { if (h != null) h.disconnect(); }
    }

    @SuppressLint("SetJavaScriptEnabled")
    static void setUpWebView(WebView w) {
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        w.setBackgroundColor(Color.TRANSPARENT);
        w.setWebChromeClient(new WebChromeClient());
        w.setWebViewClient(new WebViewClient());
        w.setVerticalScrollBarEnabled(false);
        w.setHorizontalScrollBarEnabled(false);
    }

    /** The existing Home Base TV app (the full wall), if it's installed. */
    static Intent homeBaseApp(Context c) {
        PackageManager pm = c.getPackageManager();
        Intent q = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LEANBACK_LAUNCHER);
        List<ResolveInfo> list = pm.queryIntentActivities(q, 0);
        for (ResolveInfo r : list) {
            String pkg = r.activityInfo.packageName;
            if (pkg.equals(c.getPackageName())) continue;
            String label = String.valueOf(r.loadLabel(pm)).toLowerCase(Locale.US);
            if (label.contains("home base") || label.contains("homebase")) {
                Intent i = pm.getLeanbackLaunchIntentForPackage(pkg);
                if (i != null) return i;
            }
        }
        return null;
    }

    /** Opens the full Home Base wall: the Home Base TV app when it's there, otherwise the wall in this app. */
    static void openWall(Context c) {
        Intent i = homeBaseApp(c);
        if (i == null) i = new Intent(c, WallActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { c.startActivity(i); } catch (Exception e) { c.startActivity(new Intent(c, WallActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
    }
}
