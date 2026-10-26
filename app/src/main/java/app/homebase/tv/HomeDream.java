package app.homebase.tv;

import android.service.dreams.DreamService;
import android.webkit.WebView;

/** Home Base as the TV box's own screensaver, for when another app is open and the box goes idle. */
public class HomeDream extends DreamService {
    private WebView web;

    @Override public void onAttachedToWindow() {
        super.onAttachedToWindow();
        setInteractive(false);
        setFullscreen(true);
        setScreenBright(true);
        if (Hb.code(this).isEmpty()) return;
        web = new WebView(this);
        Hb.setUpWebView(web);
        web.setBackgroundColor(0xFF0D1412);
        setContentView(web);
        Hb.loadPage(this, web, "saver");
    }

    @Override public void onDetachedFromWindow() {
        if (web != null) { web.destroy(); web = null; }
        super.onDetachedFromWindow();
    }
}
