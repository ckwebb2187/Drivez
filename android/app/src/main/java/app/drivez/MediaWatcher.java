package app.drivez;

import android.content.ComponentName;
import android.content.Context;
import android.graphics.Bitmap;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Base64;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.util.List;

// Watches the phone's media sessions and reports the current song to the web app.
public class MediaWatcher {
    public interface Listener { void onChange(String json); }

    static final String[] PREFERRED = { "re.muwmix.yumaplayer", "re.muwmix.yumaplayer.canary", "re.muwmix.yumaplayer.debug" };

    private final Context ctx;
    private final Listener listener;
    private final Handler main = new Handler(Looper.getMainLooper());
    private MediaSessionManager msm;
    private MediaController current;
    private String artKey = null, artData = null;
    private boolean started = false;

    private final MediaSessionManager.OnActiveSessionsChangedListener sessionsListener = this::pick;
    private final MediaController.Callback callback = new MediaController.Callback() {
        @Override public void onMetadataChanged(MediaMetadata metadata) { report(); }
        @Override public void onPlaybackStateChanged(PlaybackState state) { report(); }
        @Override public void onSessionDestroyed() { pick(null); }
    };

    public MediaWatcher(Context ctx, Listener listener) {
        this.ctx = ctx.getApplicationContext();
        this.listener = listener;
    }

    ComponentName component() { return new ComponentName(ctx, MediaListenerService.class); }

    public boolean hasAccess() {
        String enabled = Settings.Secure.getString(ctx.getContentResolver(), "enabled_notification_listeners");
        return enabled != null && enabled.contains(ctx.getPackageName());
    }

    public void start() {
        if (started || !hasAccess()) { report(); return; }
        try {
            msm = (MediaSessionManager) ctx.getSystemService(Context.MEDIA_SESSION_SERVICE);
            msm.addOnActiveSessionsChangedListener(sessionsListener, component(), main);
            started = true;
            pick(null);
        } catch (SecurityException e) {
            started = false;
            report();
        }
    }

    public void stop() {
        if (msm != null && started) {
            try { msm.removeOnActiveSessionsChangedListener(sessionsListener); } catch (Exception ignored) { }
        }
        if (current != null) current.unregisterCallback(callback);
        current = null;
        started = false;
    }

    // Prefer YumaPlayer, then whatever is playing, then the most recent session.
    private void pick(List<MediaController> list) {
        if (msm == null) return;
        try {
            if (list == null) list = msm.getActiveSessions(component());
        } catch (SecurityException e) { list = null; }
        MediaController best = null;
        if (list != null) {
            for (String pkg : PREFERRED) for (MediaController c : list) if (best == null && pkg.equals(c.getPackageName())) best = c;
            if (best == null) for (MediaController c : list) {
                PlaybackState s = c.getPlaybackState();
                if (best == null && s != null && s.getState() == PlaybackState.STATE_PLAYING) best = c;
            }
            if (best == null && !list.isEmpty()) best = list.get(0);
        }
        if (current != null && (best == null || !current.getSessionToken().equals(best.getSessionToken()))) {
            current.unregisterCallback(callback);
            current = null;
        }
        if (best != null && current == null) {
            current = best;
            current.registerCallback(callback, main);
        }
        report();
    }

    public String snapshot() {
        JSONObject o = new JSONObject();
        try {
            o.put("native", true);
            o.put("access", hasAccess());
            MediaController c = current;
            if (c != null) {
                MediaMetadata m = c.getMetadata();
                PlaybackState s = c.getPlaybackState();
                o.put("app", c.getPackageName());
                o.put("playing", s != null && s.getState() == PlaybackState.STATE_PLAYING);
                if (m != null) {
                    String title = m.getString(MediaMetadata.METADATA_KEY_TITLE);
                    String artist = m.getString(MediaMetadata.METADATA_KEY_ARTIST);
                    if (artist == null) artist = m.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST);
                    o.put("title", title == null ? "" : title);
                    o.put("artist", artist == null ? "" : artist);
                    o.put("album", m.getString(MediaMetadata.METADATA_KEY_ALBUM));
                    o.put("duration", m.getLong(MediaMetadata.METADATA_KEY_DURATION));
                    String key = title + "|" + artist;
                    if (!key.equals(artKey)) { artKey = key; artData = art(m); }
                    if (artData != null) o.put("art", artData);
                }
            }
        } catch (Exception ignored) { }
        return o.toString();
    }

    private void report() { listener.onChange(snapshot()); }

    private static String art(MediaMetadata m) {
        Bitmap b = m.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART);
        if (b == null) b = m.getBitmap(MediaMetadata.METADATA_KEY_ART);
        if (b == null) b = m.getBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON);
        if (b == null) return null;
        try {
            int max = 300;
            if (b.getWidth() > max || b.getHeight() > max) {
                float k = Math.min((float) max / b.getWidth(), (float) max / b.getHeight());
                b = Bitmap.createScaledBitmap(b, Math.max(1, Math.round(b.getWidth() * k)), Math.max(1, Math.round(b.getHeight() * k)), true);
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            b.compress(Bitmap.CompressFormat.JPEG, 85, out);
            return "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
        } catch (Exception e) {
            return null;
        }
    }

    public void control(String action) {
        MediaController c = current;
        if (c == null) return;
        MediaController.TransportControls t = c.getTransportControls();
        PlaybackState s = c.getPlaybackState();
        boolean playing = s != null && s.getState() == PlaybackState.STATE_PLAYING;
        switch (action) {
            case "play": t.play(); break;
            case "pause": t.pause(); break;
            case "toggle": if (playing) t.pause(); else t.play(); break;
            case "next": t.skipToNext(); break;
            case "previous": t.skipToPrevious(); break;
            default: break;
        }
    }
}
