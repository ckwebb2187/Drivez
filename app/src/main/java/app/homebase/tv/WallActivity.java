package app.homebase.tv;

import android.app.Activity;
import android.os.Bundle;
import android.view.KeyEvent;
import android.webkit.CookieManager;
import android.webkit.WebView;

/**
 * The full Home Base wall, used only when the Home Base TV app isn't installed. It needs a one-time Claude sign-in
 * on the TV.
 */
public class WallActivity extends Activity {
    private WebView web;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        web = new WebView(this);
        Hb.setUpWebView(web);
        web.setBackgroundColor(0xFF0D1412);
        web.getSettings().setUserAgentString(web.getSettings().getUserAgentString() + " HomeBaseTV/2.0");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        setContentView(web);
        web.loadUrl(Hb.WALL);
    }

    @Override public boolean onKeyDown(int code, KeyEvent e) {
        if (code == KeyEvent.KEYCODE_BACK && web.canGoBack()) { web.goBack(); return true; }
        return super.onKeyDown(code, e);
    }

    @Override protected void onPause() { super.onPause(); web.onPause(); CookieManager.getInstance().flush(); }
    @Override protected void onResume() { super.onResume(); web.onResume(); }
    @Override protected void onDestroy() { if (web != null) web.destroy(); super.onDestroy(); }
}
