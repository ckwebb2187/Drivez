package app.homebase.tv;

import android.animation.ValueAnimator;
import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.MediaPlayer;

/**
 * Quiet zen music for the home screen: calm recorded tracks that ship inside the app, played one after another and
 * faded in and out. Played by the app itself (not the page), so it carries on smoothly behind the screensaver.
 * Music: "Meditation Impromptu 01", "02", "03" and "Healing" by Kevin MacLeod (incompetech.com),
 * licensed under Creative Commons: By Attribution 4.0 (creativecommons.org/licenses/by/4.0/).
 */
final class Zen {
    private static final String[] TRACKS = { "zen/zen1.m4a", "zen/zen4.m4a", "zen/zen2.m4a", "zen/zen3.m4a" };
    /** How loud, on top of the TV's own volume: kept very low so it sits in the background. */
    static final float VOLUME = 0.18f;

    private final Context c;
    private MediaPlayer mp;
    private int track = (int) (System.currentTimeMillis() / 60000 % TRACKS.length);
    private float vol;
    private ValueAnimator fade;
    private boolean wanted;

    Zen(Context c) { this.c = c.getApplicationContext(); }

    void play() {
        wanted = true;
        if (mp == null) open();
        else if (!mp.isPlaying()) { try { mp.start(); } catch (Exception e) { release(); open(); } }
        fadeTo(VOLUME, 2500, false);
    }

    void pause() { wanted = false; if (mp != null) fadeTo(0f, 1200, true); }

    void release() { wanted = false; if (fade != null) fade.cancel(); if (mp != null) { try { mp.release(); } catch (Exception e) { /* gone */ } mp = null; } }

    private void open() {
        try {
            MediaPlayer m = new MediaPlayer();
            try (AssetFileDescriptor fd = c.getAssets().openFd(TRACKS[track % TRACKS.length])) {
                m.setDataSource(fd.getFileDescriptor(), fd.getStartOffset(), fd.getLength());
            }
            m.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
            m.setOnCompletionListener(done -> {
                if (done != mp) return;
                done.release(); mp = null; track++;
                if (wanted) open();
            });
            m.prepare();
            m.setVolume(vol, vol);
            m.start();
            mp = m;
        } catch (Exception e) { mp = null; }
    }

    private void fadeTo(float to, long ms, boolean thenPause) {
        if (fade != null) fade.cancel();
        fade = ValueAnimator.ofFloat(vol, to);
        fade.setDuration(ms);
        fade.addUpdateListener(a -> { vol = (float) a.getAnimatedValue(); if (mp != null) try { mp.setVolume(vol, vol); } catch (Exception e) { /* gone */ } });
        if (thenPause) fade.addListener(new android.animation.AnimatorListenerAdapter() {
            @Override public void onAnimationEnd(android.animation.Animator a) { if (!wanted && mp != null) try { mp.pause(); } catch (Exception e) { /* gone */ } }
        });
        fade.start();
    }
}
