package app.homebase.tv;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
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
        if (!homes.contains(pkg + "/" + cls) && !isStockHome(pkg, cls)) return;
        long now = System.currentTimeMillis();
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
