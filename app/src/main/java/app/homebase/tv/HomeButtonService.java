package app.homebase.tv;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.view.KeyEvent;
import android.view.accessibility.AccessibilityEvent;

import java.util.HashSet;
import java.util.Set;

/**
 * Google TV doesn't let you pick another home screen, so this watches for its home screen opening (the Home button,
 * or starting up) and opens the Home Base home screen instead. It only looks at which screen just opened.
 */
public class HomeButtonService extends AccessibilityService {
    private final Set<String> homes = new HashSet<>();
    private long lastJump;
    /** The last remote button pressed and when, so the ★, Settings and other Google TV buttons aren't undone. */
    private int lastKey; private long lastKeyAt;
    /** The app showing most recently, so ★ can open Style when the Home Base home screen is up. */
    private String front = "";

    @Override protected boolean onKeyEvent(KeyEvent e) {
        if (e.getAction() == KeyEvent.ACTION_DOWN) { lastKey = e.getKeyCode(); lastKeyAt = System.currentTimeMillis(); }
        // ★ on the Home Base home screen opens Style there (Google TV would otherwise take it).
        if (e.getKeyCode() == KeyEvent.KEYCODE_BOOKMARK && front.equals(getPackageName())) {
            if (e.getAction() == KeyEvent.ACTION_DOWN && e.getRepeatCount() == 0) {
                try { startActivity(new Intent(this, HomeActivity.class).putExtra("style", true).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)); } catch (Exception ignored) {}
            }
            return true;
        }
        return false;
    }

    @Override protected void onServiceConnected() {
        super.onServiceConnected();
        homes.clear();
        PackageManager pm = getPackageManager();
        Intent q = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
        for (ResolveInfo r : pm.queryIntentActivities(q, 0)) {
            if (!r.activityInfo.packageName.equals(getPackageName())) homes.add(r.activityInfo.packageName + "/" + r.activityInfo.name);
        }
    }

    @Override public void onAccessibilityEvent(AccessibilityEvent e) {
        if (e.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED || e.getPackageName() == null || e.getClassName() == null) return;
        String pkg = e.getPackageName().toString(), cls = e.getClassName().toString();
        if (!pkg.equals("com.android.systemui")) front = pkg;
        if (!homes.contains(pkg + "/" + cls) && !isStockHome(pkg, cls)) return;
        long now = System.currentTimeMillis();
        // Only the Home button (or Back out of an app, or the box starting up) brings Home Base back. A Google TV
        // button like Settings, ★ or Apps opens part of Google TV's own home screen on purpose, so it's left alone.
        if (now - lastKeyAt < 4000 && lastKey != KeyEvent.KEYCODE_HOME && lastKey != KeyEvent.KEYCODE_BACK) return;
        if (now - lastJump < 800) return;
        lastJump = now;
        Intent i = new Intent(this, HomeActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        try { startActivity(i); } catch (Exception ignored) {}
    }

    /** Google TV's and Android TV's own home screens. */
    private static boolean isStockHome(String pkg, String cls) {
        boolean launcher = pkg.equals("com.google.android.apps.tv.launcherx") || pkg.equals("com.google.android.tvlauncher") || pkg.equals("com.google.android.leanbacklauncher");
        return launcher && (cls.endsWith(".HomeActivity") || cls.endsWith(".MainActivity") || cls.endsWith(".LauncherActivity"));
    }

    @Override public void onInterrupt() {}
}
