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
    private TileTheme theme = new TileTheme();
    /** Which tile is being made, so the stickers take turns and neighbors never match. */
    private int tileN;
    /** True while the screensaver is opening over the home screen, so the music keeps playing behind it. */
    private boolean toSaver;
    private Zen zen;
    /** Behind the screensaver the music stops when the box is allowed to sleep (after two hours, like the screensaver). */
    private final Runnable zenSleep = () -> { if (zen != null) zen.pause(); };
    private final Runnable idle = () -> { toSaver = true; startActivity(new Intent(this, SaverActivity.class)); };

    /** One tile: an app, the Home Base wall, or Settings. */
    private static final class Tile {
        final String key, name; final Drawable art; final boolean banner; final Runnable open;
        Tile(String key, String name, Drawable art, boolean banner, Runnable open) { this.key = key; this.name = name; this.art = art; this.banner = banner; this.open = open; }
    }

    /** The app row's look, sent by the page whenever Home Base's theme changes: its colors and a few of its stickers. */
    private static final class TileTheme {
        int main = Color.rgb(29, 91, 74), accent = Color.rgb(109, 194, 164), gold = Color.rgb(240, 180, 60);
        final List<android.graphics.Bitmap> stickers = new ArrayList<>();
        String json = "";
        static TileTheme parse(String json) {
            TileTheme t = new TileTheme();
            try {
                org.json.JSONObject o = new org.json.JSONObject(json);
                t.main = Color.parseColor(o.getString("main")); t.accent = Color.parseColor(o.getString("accent")); t.gold = Color.parseColor(o.getString("gold"));
                org.json.JSONArray a = o.optJSONArray("stickers");
                for (int i = 0; a != null && i < a.length(); i++) {
                    byte[] b = android.util.Base64.decode(a.getString(i), android.util.Base64.DEFAULT);
                    android.graphics.Bitmap bm = android.graphics.BitmapFactory.decodeByteArray(b, 0, b.length);
                    if (bm != null) t.stickers.add(bm);
                }
                t.json = json;
            } catch (Exception e) { /* keep the defaults */ }
            return t;
        }
    }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        DisplayMetrics dm = getResources().getDisplayMetrics();
        int W = dm.widthPixels, H = dm.heightPixels;
        tileW = Math.round(W * 0.145f); tileH = Math.round(tileW * 9f / 16f);

        String saved = Hb.prefs(this).getString("tileTheme", "");
        if (!saved.isEmpty()) theme = TileTheme.parse(saved);

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
            @JavascriptInterface public void theme(final String json) {
                if (json == null || json.length() > 2000000) return;
                final TileTheme t = TileTheme.parse(json);   // decoded here, off the screen's thread
                ui.post(() -> {
                    if (t.json.isEmpty() || t.json.equals(theme.json)) return;
                    theme = t; Hb.prefs(HomeActivity.this).edit().putString("tileTheme", t.json).apply();
                    buildRow();
                });
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
        toSaver = false;
        ui.removeCallbacks(zenSleep);
        if (zen == null) zen = new Zen(this);
        zen.play();
        web.onResume();
        // The app row is only rebuilt when apps are installed or removed (or the first time), so Home is instant.
        if (rowDirty || row.getChildCount() == 0) { rowDirty = false; buildRow(); }
        resetIdle();
    }

    @Override protected void onPause() {
        super.onPause();
        ui.removeCallbacks(idle);
        if (toSaver) { ui.postDelayed(zenSleep, 2 * 60 * 60 * 1000L); return; }   // the music plays on behind the screensaver
        if (zen != null) zen.pause();   // quiet when another app opens
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
        tileN = 0;
        for (Tile t : tiles) {
            View v = tileView(t);
            tileN++;
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
            final boolean isBanner = banner != null;
            Drawable art = isBanner ? banner : appIcon(r, pm);
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
        // Themed tile: the app's own banner filling the whole tile (or its icon on its own color when it has no
        // banner), with every pixel recolored into Home Base's theme, so it looks like the app's native tile in the
        // theme's colors. In holiday themes one of the theme's stickers sits in the corner.
        v.setBackgroundColor(Color.TRANSPARENT);
        v.setClipToOutline(true);
        v.setOutlineProvider(new ViewOutlineProvider() {
            @Override public void getOutline(View view, Outline o) { o.setRoundRect(0, 0, view.getWidth(), view.getHeight(), r); }
        });
        ImageView img = new ImageView(this);
        img.setScaleType(ImageView.ScaleType.FIT_XY);
        img.setImageBitmap(themedArt(t));
        v.addView(img, new FrameLayout.LayoutParams(-1, -1));
        if (!theme.stickers.isEmpty()) {
            int h = Math.abs(t.key.hashCode());
            ImageView st = new ImageView(this);
            st.setImageBitmap(theme.stickers.get(tileN % theme.stickers.size()));
            st.setScaleType(ImageView.ScaleType.FIT_CENTER);
            st.setRotation((h / 7 % 25) - 12);
            int ss = Math.round(tileH * 0.36f);
            FrameLayout.LayoutParams stp = new FrameLayout.LayoutParams(ss, ss, Gravity.TOP | Gravity.END);
            stp.topMargin = Math.round(tileH * 0.03f); stp.rightMargin = Math.round(tileH * 0.03f);
            v.addView(st, stp);
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

    /**
     * The tile picture: the app's banner (or its icon centered on its own main color) drawn at tile size, then every
     * pixel's brightness mapped onto the theme's colors: darkest to a deep shade of the theme, the middle to the theme's
     * main color, the brightest to a warm cream touched with the highlight color. Each tile's brightness is stretched
     * first, so logos stay crisp against their background.
     */
    private android.graphics.Bitmap themedArt(Tile t) {
        int w = Math.max(16, tileW), h = Math.max(9, tileH);
        android.graphics.Bitmap bm = android.graphics.Bitmap.createBitmap(w, h, android.graphics.Bitmap.Config.ARGB_8888);
        android.graphics.Canvas c = new android.graphics.Canvas(bm);
        try {
            if (t.banner) {
                c.drawColor(Color.BLACK);
                t.art.setBounds(0, 0, w, h); t.art.draw(c);
            } else {
                c.drawColor(averageColor(t.art));
                int s = Math.round(h * 0.62f), x = (w - s) / 2, y = (h - s) / 2;
                t.art.setBounds(x, y, x + s, y + s); t.art.draw(c);
            }
        } catch (Exception e) { c.drawColor(Color.DKGRAY); }
        int[] px = new int[w * h];
        bm.getPixels(px, 0, w, 0, 0, w, h);
        int lo = 255, hi = 0;
        int[] hist = new int[256];
        for (int p : px) { int l = lum(p); hist[l]++; }
        int n = px.length, acc = 0;
        for (int l = 0; l < 256; l++) { acc += hist[l]; if (acc > n * 0.01) { lo = l; break; } }
        acc = 0;
        for (int l = 255; l >= 0; l--) { acc += hist[l]; if (acc > n * 0.01) { hi = l; break; } }
        if (hi - lo < 40) { int m = (hi + lo) / 2; lo = Math.max(0, m - 60); hi = Math.min(255, m + 60); }
        int dark = mix(theme.main, Color.BLACK, 0.72f), mid = theme.main, light = mix(Color.rgb(255, 248, 236), theme.gold, 0.18f);
        int[] lut = new int[256];
        for (int l = 0; l < 256; l++) {
            float f = Math.max(0f, Math.min(1f, (l - lo) / (float) (hi - lo)));
            lut[l] = f < 0.55f ? mix(dark, mid, f / 0.55f) : mix(mid, light, (f - 0.55f) / 0.45f);
        }
        for (int k = 0; k < n; k++) px[k] = lut[lum(px[k])] | 0xFF000000;
        bm.setPixels(px, 0, w, 0, 0, w, h);
        return bm;
    }
    private static int lum(int p) { return (((p >> 16) & 255) * 54 + ((p >> 8) & 255) * 183 + (p & 255) * 19) >> 8; }
    /** The icon's average color, so an icon-only app gets a tile in its own color before it's recolored. */
    private static int averageColor(Drawable d) {
        try {
            android.graphics.Bitmap b = android.graphics.Bitmap.createBitmap(24, 24, android.graphics.Bitmap.Config.ARGB_8888);
            d.setBounds(0, 0, 24, 24); d.draw(new android.graphics.Canvas(b));
            long R = 0, G = 0, B = 0, N = 0;
            for (int y = 0; y < 24; y++) for (int x = 0; x < 24; x++) { int p = b.getPixel(x, y); if ((p >>> 24) < 128) continue; R += (p >> 16) & 255; G += (p >> 8) & 255; B += p & 255; N++; }
            return N == 0 ? Color.DKGRAY : Color.rgb((int) (R / N), (int) (G / N), (int) (B / N));
        } catch (Exception e) { return Color.DKGRAY; }
    }

    /** The app's icon at the sharpest size it has (TV apps often give a small one by default). */
    private Drawable appIcon(ResolveInfo r, PackageManager pm) {
        try {
            int res = r.getIconResource();
            if (res != 0) {
                Drawable d = pm.getResourcesForApplication(r.activityInfo.applicationInfo).getDrawableForDensity(res, DisplayMetrics.DENSITY_XXXHIGH, null);
                if (d != null) return d;
            }
        } catch (Exception e) { /* fall through */ }
        return r.loadIcon(pm);
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
        if (zen != null) zen.release();
        ui.removeCallbacksAndMessages(null);
        try { unregisterReceiver(appsChanged); } catch (Exception e) { /* not registered */ }
        if (web != null) { ((ViewGroup) web.getParent()).removeView(web); web.destroy(); }
        super.onDestroy();
    }
}
