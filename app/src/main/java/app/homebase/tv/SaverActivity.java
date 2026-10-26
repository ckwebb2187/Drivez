package app.homebase.tv;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.webkit.WebView;

/**
 * The Home Base screensaver, started by the home screen after a few idle minutes. Any button wakes it. After two hours
 * it lets the TV box go to sleep as usual.
 */
public class SaverActivity extends Activity {
    private static final long SLEEP_AFTER_MS = 2 * 60 * 60 * 1000L;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private WebView web;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        web = new WebView(this);
        Hb.setUpWebView(web);
        web.setBackgroundColor(0xFF0D1412);
        web.setFocusable(false);
        setContentView(web);
        Hb.loadPage(this, web, "saver");
        ui.postDelayed(() -> getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON), SLEEP_AFTER_MS);
    }

    @Override public boolean dispatchKeyEvent(KeyEvent e) {
        if (e.getAction() == KeyEvent.ACTION_UP) finish();
        return true;   // the button that wakes it doesn't also do something on the home screen
    }

    @Override protected void onPause() { super.onPause(); finish(); }

    @Override protected void onDestroy() {
        ui.removeCallbacksAndMessages(null);
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
