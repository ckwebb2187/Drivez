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

    private static String page;
    /** Shows the background page that ships inside the app (instant, no download), reading its data from the bridge. */
    static void loadPage(Context c, WebView w, String mode) {
        if (page == null) {
            try (InputStream in = c.getAssets().open("tv.html")) {
                java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
                byte[] buf = new byte[16384]; int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                page = out.toString("UTF-8");
            } catch (Exception e) { page = "<body style='background:#0D1412'></body>"; }
        }
        w.loadDataWithBaseURL(pageUrl(c, mode), page, "text/html", "UTF-8", null);
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
