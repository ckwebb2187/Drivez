package app.homebase.tv;

import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.app.Activity;
import android.content.ComponentName;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Color;
import android.graphics.Outline;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.DisplayMetrics;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewOutlineProvider;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextClock;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * The TV's home screen: Home Base's clean background (clock, weather, what's up next, the holiday theme) with one
 * row of apps along the bottom. After a few idle minutes it switches to the Home Base screensaver.
 */
public class HomeActivity extends Activity {
    private static final long IDLE_MS = 5 * 60 * 1000L;
    private static final Set<String> HIDE = new HashSet<>(Arrays.asList(
            "com.google.android.apps.tv.launcherx", "com.google.android.tvlauncher", "com.google.android.leanbacklauncher",
            "com.google.android.tungsten.setupwraith", "com.android.tv.settings"));

    private final Handler ui = new Handler(Looper.getMainLooper());
    private FrameLayout root;
    private View fallback;
    private WebView web;
    private LinearLayout row;
    private HorizontalScrollView scroller;
    private TextView label;
    private int tileW, tileH;
    private String loadedFor = "";
    private boolean rowDirty = true;
    private final android.content.BroadcastReceiver appsChanged = new android.content.BroadcastReceiver() {
        @Override public void onReceive(android.content.Context c, Intent i) { rowDirty = true; if (hasWindowFocus()) { rowDirty = false; buildRow(); } }
    };
    /** The theme's colors, sent by the page, for the glow around the focused app. */
    private int glow = Color.rgb(109, 194, 164), glow2 = Color.rgb(240, 180, 60);
    private final List<Runnable> restyle = new ArrayList<>();
    private final Runnable idle = () -> startActivity(new Intent(this, SaverActivity.class));

    /** One tile: an app, the Home Base wall, or Settings. */
    private static final class Tile {
        final String key, name; final Drawable art; final boolean banner; final Runnable open;
        Tile(String key, String name, Drawable art, boolean banner, Runnable open) { this.key = key; this.name = name; this.art = art; this.banner = banner; this.open = open; }
    }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        DisplayMetrics dm = getResources().getDisplayMetrics();
        int W = dm.widthPixels, H = dm.heightPixels;
        tileW = Math.round(W * 0.145f); tileH = Math.round(tileW * 9f / 16f);

        root = new FrameLayout(this);
        root.setClipChildren(false);
        root.setBackgroundColor(Color.rgb(13, 20, 18));

        // Shown until the page is ready (or if it can't load): a plain gradient and a clock.
        FrameLayout fb = new FrameLayout(this);
        GradientDrawable g = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{Color.rgb(24, 52, 44), Color.rgb(12, 18, 16)});
        fb.setBackground(g);
        TextClock clock = new TextClock(this);
        clock.setFormat12Hour("h:mm");
        clock.setTextColor(Color.rgb(238, 242, 239));
        clock.setTypeface(Typeface.create("sans-serif-medium", Typeface.BOLD));
        clock.setTextSize(TypedValue.COMPLEX_UNIT_PX, H * 0.16f);
        FrameLayout.LayoutParams cp = new FrameLayout.LayoutParams(-2, -2, Gravity.TOP | Gravity.START);
        cp.leftMargin = Math.round(W * 0.055f); cp.topMargin = Math.round(H * 0.05f);
        fb.addView(clock, cp);
        fallback = fb;
        root.addView(fb, new FrameLayout.LayoutParams(-1, -1));

        web = new WebView(this);
        Hb.setUpWebView(web);
        web.setFocusable(false);
        web.setFocusableInTouchMode(false);
        web.addJavascriptInterface(new Object() {
            @JavascriptInterface public void look(String accent, String gold) {
                try { final int a = Color.parseColor(accent), g = Color.parseColor(gold); ui.post(() -> { glow = a; glow2 = g; for (Runnable r : restyle) r.run(); label.setShadowLayer(18, 0, 0, Color.argb(200, Color.red(a), Color.green(a), Color.blue(a))); }); } catch (Exception e) { /* keep the last colors */ }
            }
            @JavascriptInterface public void ready() { ui.post(() -> fallback.animate().alpha(0f).setDuration(400).withEndAction(() -> fallback.setVisibility(View.GONE)).start()); }
        }, "HomeBaseTVApp");
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));

        // The app row and the name of the focused app under it.
        scroller = new HorizontalScrollView(this);
        scroller.setHorizontalScrollBarEnabled(false);
        scroller.setClipToPadding(false);
        scroller.setClipChildren(false);
        scroller.setFillViewport(false);
        scroller.setSmoothScrollingEnabled(true);
        int pad = Math.round(W * 0.055f);
        scroller.setPadding(pad, Math.round(tileH * 0.12f), pad, Math.round(tileH * 0.12f));
        row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setClipChildren(false);
        row.setClipToPadding(false);
        scroller.addView(row, new FrameLayout.LayoutParams(-2, -2));
        FrameLayout.LayoutParams sp = new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM);
        sp.bottomMargin = Math.round(H * 0.075f);
        root.addView(scroller, sp);

        label = new TextView(this);
        label.setTextColor(Color.argb(230, 238, 242, 239));
        label.setTextSize(TypedValue.COMPLEX_UNIT_PX, H * 0.026f);
        label.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        label.setShadowLayer(8, 0, 2, Color.argb(160, 0, 0, 0));
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.START);
        lp.leftMargin = pad; lp.bottomMargin = Math.round(H * 0.03f);
        root.addView(label, lp);

        setContentView(root);
        android.content.IntentFilter pf = new android.content.IntentFilter();
        pf.addAction(Intent.ACTION_PACKAGE_ADDED); pf.addAction(Intent.ACTION_PACKAGE_REMOVED); pf.addAction(Intent.ACTION_PACKAGE_CHANGED); pf.addAction(Intent.ACTION_PACKAGE_REPLACED);
        pf.addDataScheme("package");
        registerReceiver(appsChanged, pf);
    }

    @Override protected void onResume() {
        super.onResume();
        if (Hb.code(this).isEmpty()) { startActivity(new Intent(this, PairActivity.class)); return; }
        String want = Hb.pageUrl(this, "home");
        if (!want.equals(loadedFor)) { loadedFor = want; fallback.setVisibility(View.VISIBLE); fallback.setAlpha(1f); Hb.loadPage(this, web, "home"); }
        else web.evaluateJavascript("window.hbRefresh && hbRefresh()", null);
        web.onResume();
        web.evaluateJavascript("window.hbMusic && hbMusic(true)", null);
        // The app row is only rebuilt when apps are installed or removed (or the first time), so Home is instant.
        if (rowDirty || row.getChildCount() == 0) { rowDirty = false; buildRow(); }
        resetIdle();
    }

    @Override protected void onPause() {
        super.onPause();
        ui.removeCallbacks(idle);
        web.evaluateJavascript("window.hbMusic && hbMusic(false)", null);   // quiet when another app or the screensaver opens
        web.onPause();
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // Pressing Home while already here jumps back to the first app.
        if (row.getChildCount() > 0) { row.getChildAt(0).requestFocus(); scroller.smoothScrollTo(0, 0); }
    }

    @Override public boolean dispatchKeyEvent(KeyEvent e) {
        resetIdle();
        if (e.getKeyCode() == KeyEvent.KEYCODE_BACK) return true;   // it's the home screen: nothing to go back to
        return super.dispatchKeyEvent(e);
    }

    private void resetIdle() { ui.removeCallbacks(idle); ui.postDelayed(idle, IDLE_MS); }

    // ---------- the app row ----------

    private void buildRow() {
        String focusedKey = null;
        View f = row.getFocusedChild();
        if (f != null && f.getTag() instanceof String) focusedKey = (String) f.getTag();
        List<Tile> tiles = tiles();
        row.removeAllViews();
        restyle.clear();
        int gap = Math.round(tileW * 0.09f);
        View first = null, refocus = null;
        for (Tile t : tiles) {
            View v = tileView(t);
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(tileW, tileH);
            p.rightMargin = gap;
            row.addView(v, p);
            if (first == null) first = v;
            if (t.key.equals(focusedKey)) refocus = v;
        }
        View target = refocus != null ? refocus : first;
        if (target != null) target.requestFocus();
    }

    private List<Tile> tiles() {
        PackageManager pm = getPackageManager();
        List<Tile> apps = new ArrayList<>();
        Intent q = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LEANBACK_LAUNCHER);
        Intent hb = Hb.homeBaseApp(this);
        String hbPkg = hb != null && hb.getComponent() != null ? hb.getComponent().getPackageName() : (hb != null ? hb.getPackage() : null);
        Set<String> seen = new HashSet<>();
        for (ResolveInfo r : pm.queryIntentActivities(q, 0)) {
            final String pkg = r.activityInfo.packageName;
            if (pkg.equals(getPackageName()) || HIDE.contains(pkg) || pkg.equals(hbPkg) || !seen.add(pkg)) continue;
            Drawable banner = r.activityInfo.loadBanner(pm);
            if (banner == null) banner = r.activityInfo.applicationInfo.loadBanner(pm);
            boolean isBanner = banner != null;
            Drawable art = isBanner ? banner : r.loadIcon(pm);
            final ComponentName cn = new ComponentName(pkg, r.activityInfo.name);
            apps.add(new Tile(pkg, String.valueOf(r.loadLabel(pm)), art, isBanner, () -> {
                Intent i = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LEANBACK_LAUNCHER).setComponent(cn).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try { startActivity(i); } catch (Exception e) { Toast.makeText(this, "That app wouldn't open.", Toast.LENGTH_SHORT).show(); }
            }));
        }
        // Apps moved to the front come first (in that order), then the rest A to Z.
        final List<String> order = new ArrayList<>(Arrays.asList(Hb.prefs(this).getString("order", "").split(",")));
        Collections.sort(apps, (a, b) -> {
            int ia = order.indexOf(a.key), ib = order.indexOf(b.key);
            if (ia >= 0 || ib >= 0) return ia < 0 ? 1 : ib < 0 ? -1 : ia - ib;
            return a.name.toLowerCase(Locale.US).compareTo(b.name.toLowerCase(Locale.US));
        });
        List<Tile> out = new ArrayList<>();
        out.add(new Tile("homebase", "Home Base", getDrawable(R.drawable.banner), true, () -> Hb.openWall(this)));
        out.addAll(apps);
        out.add(new Tile("settings", "Settings  ·  hold OK for Home Base settings", getDrawable(android.R.drawable.ic_menu_preferences), false, () -> {
            try { startActivity(new Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception e) { Toast.makeText(this, "Settings wouldn't open.", Toast.LENGTH_SHORT).show(); }
        }));
        return out;
    }

    private View tileView(final Tile t) {
        final float r = tileH * 0.12f;
        FrameLayout v = new FrameLayout(this);
        v.setTag(t.key);
        v.setFocusable(true);
        v.setClickable(true);
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(r);
        bg.setColor(t.banner ? Color.rgb(28, 36, 33) : Color.rgb(40, 52, 48));
        v.setBackground(bg);
        v.setClipToOutline(true);
        v.setOutlineProvider(new ViewOutlineProvider() {
            @Override public void getOutline(View view, Outline o) { o.setRoundRect(0, 0, view.getWidth(), view.getHeight(), r); }
        });
        ImageView img = new ImageView(this);
        img.setImageDrawable(t.art);
        if (t.banner) {
            img.setScaleType(ImageView.ScaleType.CENTER_CROP);
            v.addView(img, new FrameLayout.LayoutParams(-1, -1));
        } else {
            img.setScaleType(ImageView.ScaleType.FIT_CENTER);
            if (t.key.equals("settings")) img.setColorFilter(Color.rgb(238, 242, 239));
            int s = Math.round(tileH * 0.46f);
            FrameLayout.LayoutParams ip = new FrameLayout.LayoutParams(s, s, Gravity.CENTER_HORIZONTAL | Gravity.TOP);
            ip.topMargin = Math.round(tileH * 0.12f);
            v.addView(img, ip);
            TextView name = new TextView(this);
            name.setText(t.key.equals("settings") ? "Settings" : t.name);
            name.setTextColor(Color.rgb(238, 242, 239));
            name.setTextSize(TypedValue.COMPLEX_UNIT_PX, tileH * 0.13f);
            name.setSingleLine(true);
            name.setGravity(Gravity.CENTER);
            FrameLayout.LayoutParams np = new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM);
            np.bottomMargin = Math.round(tileH * 0.08f);
            v.addView(name, np);
        }
        // Focus glow drawn on top: a bright ring in the theme's color with a soft wash inside it, plus a colored
        // shadow (Android 9 and up) so the tile seems to light up. It breathes gently while it's selected.
        final View ring = new View(this);
        final GradientDrawable rd = new GradientDrawable();
        rd.setCornerRadius(r);
        ring.setBackground(rd);
        ring.setVisibility(View.INVISIBLE);
        v.addView(ring, new FrameLayout.LayoutParams(-1, -1));
        final int stroke = Math.max(3, Math.round(tileH * 0.035f));
        Runnable style = () -> {
            int edge = mix(glow, Color.WHITE, 0.45f);
            rd.setStroke(stroke, edge);
            rd.setColor(Color.argb(38, Color.red(glow), Color.green(glow), Color.blue(glow)));
            if (Build.VERSION.SDK_INT >= 28) { v.setOutlineSpotShadowColor(glow); v.setOutlineAmbientShadowColor(glow2); }
        };
        // A soft halo of the theme's color spreading out behind the selected tile (outside it, so it sits in a holder).
        final FrameLayout holder = new FrameLayout(this);
        holder.setTag(t.key);
        holder.setClipChildren(false);
        holder.setClipToPadding(false);
        final int hs = Math.round(tileW * 1.75f);
        final View halo = new View(this);
        final GradientDrawable hd = new GradientDrawable();
        hd.setShape(GradientDrawable.OVAL);
        hd.setGradientType(GradientDrawable.RADIAL_GRADIENT);
        hd.setGradientRadius(hs / 2f);
        halo.setBackground(hd);
        halo.setScaleY(0.62f);
        halo.setAlpha(0f);
        holder.addView(halo, new FrameLayout.LayoutParams(hs, hs, Gravity.CENTER));
        holder.addView(v, new FrameLayout.LayoutParams(-1, -1));

        Runnable haloStyle = () -> { int hc = mix(glow, Color.WHITE, 0.2f); hd.setColors(new int[]{ Color.argb(210, Color.red(hc), Color.green(hc), Color.blue(hc)),
                Color.argb(80, Color.red(glow), Color.green(glow), Color.blue(glow)), Color.TRANSPARENT }); };
        style.run();
        haloStyle.run();
        restyle.add(style);
        restyle.add(haloStyle);
        final ObjectAnimator breathe = ObjectAnimator.ofFloat(ring, "alpha", 1f, 0.55f);
        breathe.setDuration(1400);
        breathe.setRepeatCount(ValueAnimator.INFINITE);
        breathe.setRepeatMode(ValueAnimator.REVERSE);
        final ObjectAnimator haloBreathe = ObjectAnimator.ofFloat(halo, "alpha", 1f, 0.6f);
        haloBreathe.setDuration(1400);
        haloBreathe.setRepeatCount(ValueAnimator.INFINITE);
        haloBreathe.setRepeatMode(ValueAnimator.REVERSE);

        v.setOnFocusChangeListener((view, has) -> {
            ring.setVisibility(has ? View.VISIBLE : View.INVISIBLE);
            if (has) breathe.start(); else { breathe.cancel(); ring.setAlpha(1f); }
            haloBreathe.cancel();
            if (has) halo.animate().alpha(1f).setDuration(220).withEndAction(haloBreathe::start).start();
            else halo.animate().alpha(0f).setDuration(160).start();
            view.animate().scaleX(has ? 1.12f : 1f).scaleY(has ? 1.12f : 1f).translationZ(has ? 36f : 0f).setDuration(160).start();
            if (has) label.setText(t.name);
        });
        v.setOnClickListener(view -> t.open.run());
        v.setOnLongClickListener(view -> {
            if (t.key.equals("settings")) { startActivity(new Intent(this, PairActivity.class)); return true; }
            if (t.key.equals("homebase")) return false;
            moveToFront(t.key);
            Toast.makeText(this, t.name + " moved to the front", Toast.LENGTH_SHORT).show();
            return true;
        });
        return holder;
    }

    private static int mix(int a, int b, float t) {
        return Color.rgb(Math.round(Color.red(a) + (Color.red(b) - Color.red(a)) * t), Math.round(Color.green(a) + (Color.green(b) - Color.green(a)) * t), Math.round(Color.blue(a) + (Color.blue(b) - Color.blue(a)) * t));
    }

    /** Hold OK on an app to move it right after Home Base. */
    private void moveToFront(String key) {
        SharedPreferences p = Hb.prefs(this);
        List<String> order = new ArrayList<>(Arrays.asList(p.getString("order", "").split(",")));
        order.remove(key); order.remove("");
        order.add(0, key);
        StringBuilder sb = new StringBuilder();
        for (String s : order) { if (sb.length() > 0) sb.append(','); sb.append(s); }
        p.edit().putString("order", sb.toString()).apply();
        buildRow();
        if (row.getChildCount() > 1) row.getChildAt(1).requestFocus();
        scroller.smoothScrollTo(0, 0);
    }

    @Override protected void onDestroy() {
        ui.removeCallbacksAndMessages(null);
        try { unregisterReceiver(appsChanged); } catch (Exception e) { /* not registered */ }
        if (web != null) { ((ViewGroup) web.getParent()).removeView(web); web.destroy(); }
        super.onDestroy();
    }
}
