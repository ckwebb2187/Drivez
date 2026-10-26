package app.drivez;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

// Shows the Kaido Maps web app full screen and adds what a web page can't do on its own:
// reading what's playing on the phone and controlling it.
public class MainActivity extends Activity {
    private static final int REQ_LOCATION = 1, REQ_FILE = 2, REQ_BLUETOOTH = 3, REQ_MIC = 4;
    private static final String SITE = BuildConfig.SITE;
    private static final String HOST = Uri.parse(SITE).getHost();

    private WebView web;
    private MediaWatcher media;
    private CarBluetooth bt;
    private CarAuto auto;
    private String pendingGeoOrigin;
    private GeolocationPermissions.Callback pendingGeo;
    private ValueCallback<Uri[]> pendingFiles;
    private PermissionRequest pendingMic;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setGeolocationEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUserAgentString(s.getUserAgentString() + " DrivezAndroid/" + BuildConfig.VERSION_NAME);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

        media = new MediaWatcher(this, json -> runOnUiThread(() ->
            web.evaluateJavascript("window.dispatchEvent(new CustomEvent('drivez-media',{detail:" + json + "}))", null)));
        bt = new CarBluetooth(this, json -> runOnUiThread(() ->
            web.evaluateJavascript("window.dispatchEvent(new CustomEvent('drivez-bt',{detail:" + json + "}))", null)));
        bt.start();
        auto = new CarAuto(this, json -> runOnUiThread(() ->
            web.evaluateJavascript("window.dispatchEvent(new CustomEvent('drivez-auto',{detail:" + json + "}))", null)));
        auto.start();
        web.addJavascriptInterface(new Bridge(), "DrivezNative");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                return handleUrl(req.getUrl());
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {
                if (hasLocation()) { cb.invoke(origin, true, true); return; }
                pendingGeoOrigin = origin;
                pendingGeo = cb;
                requestPermissions(new String[]{ Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }, REQ_LOCATION);
            }

            // Microphone for "Ask Gemini" (voice questions): ask Android once, then let the page record.
            @Override
            public void onPermissionRequest(final PermissionRequest req) {
                runOnUiThread(() -> {
                    boolean wantsMic = false;
                    for (String r : req.getResources()) if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) wantsMic = true;
                    if (!wantsMic || !HOST.equals(req.getOrigin().getHost())) { req.deny(); return; }
                    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                        req.grant(new String[]{ PermissionRequest.RESOURCE_AUDIO_CAPTURE });
                    } else {
                        pendingMic = req;
                        requestPermissions(new String[]{ Manifest.permission.RECORD_AUDIO }, REQ_MIC);
                    }
                });
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (pendingFiles != null) pendingFiles.onReceiveValue(null);
                pendingFiles = cb;
                try {
                    Intent pick = params.createIntent();
                    pick.addCategory(Intent.CATEGORY_OPENABLE);
                    if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                    startActivityForResult(Intent.createChooser(pick, "Choose"), REQ_FILE);
                    return true;
                } catch (ActivityNotFoundException e) {
                    pendingFiles = null;
                    return false;
                }
            }
        });

        // Downloads (like a new version of this app) open in the browser, which can save and install them.
        web.setDownloadListener((url, userAgent, contentDisposition, mimeType, length) -> {
            try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception ignored) { }
        });

        if (saved != null) web.restoreState(saved);
        else web.loadUrl(SITE + "/");
        if (!hasLocation()) requestPermissions(new String[]{ Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }, REQ_LOCATION);
    }

    private boolean hasLocation() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    // Drivez pages and sign-in pages stay inside the app; app links open their app; other links open the browser.
    private boolean handleUrl(Uri uri) {
        String scheme = uri.getScheme() == null ? "" : uri.getScheme();
        String host = uri.getHost() == null ? "" : uri.getHost();
        if (scheme.equals("intent")) {
            try {
                Intent i = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                if (i.getPackage() != null) {
                    Intent launch = getPackageManager().getLaunchIntentForPackage(i.getPackage());
                    if (launch != null) { startActivity(launch); return true; }
                }
                startActivity(i);
            } catch (Exception ignored) { }
            return true;
        }
        if ((scheme.equals("http") || scheme.equals("https")) &&
            (host.equals(HOST) || host.endsWith("discord.com") || host.endsWith("accounts.google.com") || host.endsWith("facebook.com"))) {
            return false;
        }
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) { }
        return true;
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        if (code == REQ_LOCATION && pendingGeo != null) {
            pendingGeo.invoke(pendingGeoOrigin, hasLocation(), true);
            pendingGeo = null;
        }
        if (code == REQ_LOCATION && hasLocation()) web.reload();
        if (code == REQ_MIC && pendingMic != null) {
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) pendingMic.grant(new String[]{ PermissionRequest.RESOURCE_AUDIO_CAPTURE });
            else pendingMic.deny();
            pendingMic = null;
        }
        if (code == REQ_BLUETOOTH) {
            bt.start();
            final String json = bt.status();
            web.evaluateJavascript("window.dispatchEvent(new CustomEvent('drivez-bt',{detail:" + json + "}))", null);
        }
    }

    @Override
    protected void onActivityResult(int code, int result, Intent data) {
        if (code == REQ_FILE && pendingFiles != null) {
            Uri[] uris = null;
            if (result == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    uris = new Uri[data.getClipData().getItemCount()];
                    for (int i = 0; i < uris.length; i++) uris[i] = data.getClipData().getItemAt(i).getUri();
                } else if (data.getData() != null) {
                    uris = new Uri[]{ data.getData() };
                }
            }
            pendingFiles.onReceiveValue(uris);
            pendingFiles = null;
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        media.start(); // picks up notification access if it was just granted
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        media.stop();
        bt.stop();
        auto.stop();
        super.onDestroy();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    // Called from the web app as window.DrivezNative.*
    class Bridge {
        @JavascriptInterface public String info() {
            JSONObject o = new JSONObject();
            try {
                o.put("version", BuildConfig.VERSION_NAME);
                o.put("versionCode", BuildConfig.VERSION_CODE);
                o.put("mediaAccess", media.hasAccess());
                o.put("bluetooth", true);
                o.put("androidAuto", true);
            } catch (Exception ignored) { }
            return o.toString();
        }

        @JavascriptInterface public String nowPlaying() { return media.snapshot(); }

        // Car Bluetooth: which devices are paired / connected right now.
        @JavascriptInterface public String bluetoothStatus() { return bt.status(); }

        // Android Auto: is the phone connected to a car screen right now?
        @JavascriptInterface public String androidAutoStatus() { return auto.status(); }

        @JavascriptInterface public void requestBluetooth() {
            runOnUiThread(() -> {
                if (bt.hasPermission()) { bt.start(); web.evaluateJavascript("window.dispatchEvent(new CustomEvent('drivez-bt',{detail:" + bt.status() + "}))", null); }
                else if (android.os.Build.VERSION.SDK_INT >= 31) requestPermissions(new String[]{ Manifest.permission.BLUETOOTH_CONNECT }, REQ_BLUETOOTH);
            });
        }

        @JavascriptInterface public void control(String action) {
            runOnUiThread(() -> media.control(action));
        }

        @JavascriptInterface public void openMediaAccessSettings() {
            runOnUiThread(() -> {
                try {
                    startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS));
                } catch (Exception e) {
                    startActivity(new Intent(Settings.ACTION_SETTINGS));
                }
            });
        }

        @JavascriptInterface public void openAppSettings() {
            runOnUiThread(() -> startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()))));
        }

        @JavascriptInterface public boolean openApp(String pkg) {
            Intent launch = getPackageManager().getLaunchIntentForPackage(pkg);
            if (launch == null) launch = getPackageManager().getLaunchIntentForPackage(pkg + ".canary");
            if (launch == null) return false;
            final Intent go = launch;
            runOnUiThread(() -> startActivity(go));
            return true;
        }

        @JavascriptInterface public void keepScreenOn(boolean on) {
            runOnUiThread(() -> {
                if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }
    }
}
