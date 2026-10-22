import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Settings2, ExternalLink, Loader2, Play, Pause, SkipBack, SkipForward, ShieldCheck } from 'lucide-react';

// Waze-style music shortcut for YumaPlayer (github.com/MuwMx/YumaPlayer).
// Tapping it shows a small pop-up with the song that's playing. Song info comes
// from ListenBrainz, which YumaPlayer can update (Settings → ListenBrainz scrobbling).
// "Open YumaPlayer" switches to the app on Android.
const PACKAGE = 're.muwmix.yumaplayer';
// Chrome only opens app screens that accept web links, so we use YumaPlayer's own
// "yumaplayer://together" link. Without session details it simply opens the app.
const INTENT = `intent://together#Intent;scheme=yumaplayer;package=${PACKAGE};end`;
const LB_KEY = 'dz_listenbrainz_user';

const readUser = () => { try { return localStorage.getItem(LB_KEY) || ''; } catch { return ''; } };
const artCache = new Map();

async function findArt(track) {
  const key = `${track.artist}|${track.title}`;
  if (artCache.has(key)) return artCache.get(key);
  let url = null;
  try {
    const q = encodeURIComponent(`${track.artist} ${track.title}`);
    const d = await (await fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=1`)).json();
    url = d.results?.[0]?.artworkUrl100?.replace('100x100bb', '300x300bb') || null;
  } catch { /* no art */ }
  artCache.set(key, url);
  return url;
}

// What's playing right now for a ListenBrainz user, refreshed every `every` ms.
// If nothing is "playing now" (it can lag or expire), show the last song from the past 20 minutes.
const LB = 'https://api.listenbrainz.org/1/user/';
function useNowPlaying(user, every) {
  const [track, setTrack] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  useEffect(() => {
    if (!user) { setTrack(null); setError(''); setHint(''); return; }
    let alive = true;
    const load = async () => {
      setLoading(true);
      try {
        const u = encodeURIComponent(user);
        const r = await fetch(`${LB}${u}/playing-now`);
        if (r.status === 404) { if (alive) { setError(`ListenBrainz has no user "${user}". Check the spelling in ⚙.`); setTrack(null); } return; }
        const d = await r.json();
        let m = d.payload?.listens?.[0]?.track_metadata;
        let recent = false;
        if (!m) {
          const last = (await (await fetch(`${LB}${u}/listens?count=1`)).json()).payload?.listens?.[0];
          if (last && Date.now() / 1000 - last.listened_at < 20 * 60) { m = last.track_metadata; recent = true; }
          // Explain what ListenBrainz has (or hasn't) received, so it's clear which setup step is missing.
          if (alive && !m) {
            if (!last) setHint('ListenBrainz hasn’t received any songs from you yet. In YumaPlayer, check that ListenBrainz scrobbling is ON and the token is pasted (step 3), then skip to the next song.');
            else {
              const mins = Math.round((Date.now() / 1000 - last.listened_at) / 60);
              const ago = mins < 60 ? `${mins} min` : mins < 2880 ? `${Math.round(mins / 60)} h` : `${Math.round(mins / 1440)} days`;
              setHint(`Last song ListenBrainz got: “${last.track_metadata?.track_name}” ${ago} ago. If YumaPlayer is playing now, re-check the token in YumaPlayer and skip to the next song.`);
            }
          }
        }
        if (alive) setError('');
        if (alive && m) setHint('');
        if (!m) { if (alive) setTrack(null); return; }
        const t = { title: m.track_name, artist: m.artist_name, album: m.release_name, recent };
        t.art = await findArt(t);
        if (alive) setTrack(t);
      } catch { /* keep last */ } finally { if (alive) setLoading(false); }
    };
    load();
    const id = setInterval(load, every);
    return () => { alive = false; clearInterval(id); };
  }, [user, every]);
  return { track, loading, error, hint };
}

function Bars() {
  return (
    <span className="absolute -top-0.5 -right-0.5 flex items-end gap-[2px] h-3.5 px-1 py-0.5 rounded-full bg-[#ff8fd0]">
      {[0, 1, 2].map((i) => <span key={i} className="w-[2px] bg-white rounded-full dz-eq" style={{ animationDelay: `${i * 0.18}s` }} />)}
    </span>
  );
}

// Inside the Drivez Android app, the phone itself tells us what's playing and
// lets us control it, so no ListenBrainz setup is needed.
const nativeApi = () => (typeof window !== 'undefined' ? window.DrivezNative : null);

function useNativeMedia() {
  const read = () => { try { return JSON.parse(nativeApi().nowPlaying()); } catch { return null; } };
  const [media, setMedia] = useState(read);
  const [art, setArt] = useState(null);
  useEffect(() => {
    const on = (e) => setMedia(e.detail);
    window.addEventListener('drivez-media', on);
    const again = () => { if (document.visibilityState === 'visible') setMedia(read()); };
    document.addEventListener('visibilitychange', again);
    return () => { window.removeEventListener('drivez-media', on); document.removeEventListener('visibilitychange', again); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Some apps don't share album art; look it up instead.
  useEffect(() => {
    setArt(null);
    if (media?.title && !media.art) findArt({ title: media.title, artist: media.artist }).then(setArt);
  }, [media?.title, media?.artist, media?.art]);
  const track = media?.title ? { title: media.title, artist: media.artist, art: media.art || art, playing: media.playing, app: media.app } : null;
  return { access: !!media?.access, track };
}

function NativeMusicButton({ size }) {
  const [open, setOpen] = useState(false);
  const { access, track } = useNativeMedia();
  const ctl = (a) => { try { nativeApi().control(a); } catch { /* ignore */ } };
  const openApp = () => { try { if (!nativeApi().openApp(PACKAGE)) window.location.href = INTENT; } catch { window.location.href = INTENT; } };
  const fromYuma = !track || (track.app || '').startsWith(PACKAGE);

  return (
    <>
      <button onClick={() => setOpen(!open)} aria-label="Music"
        className="relative rounded-full p-[2.5px] shadow-xl active:scale-95 transition-transform"
        style={{ width: size, height: size, background: 'conic-gradient(from 200deg, #7cc8ff, #c39bff, #ff8fd0, #7cc8ff)' }}>
        <span className="flex items-center justify-center w-full h-full rounded-full overflow-hidden" style={{ background: 'radial-gradient(circle at 35% 30%, #2a2a3d, #0e0e16 70%)' }}>
          {track?.art ? <img src={track.art} alt="" className="w-full h-full object-cover" /> : <img src="/yuma.png" alt="" className="w-[62%] h-[62%] object-contain" />}
        </span>
        {track?.playing && <Bars />}
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[1500]" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}
            className="absolute left-3 right-3 bottom-[96px] mx-auto max-w-md rounded-2xl border border-white/10 shadow-2xl overflow-hidden dz-pop-in"
            style={{ background: 'linear-gradient(135deg, rgba(36,30,58,0.97), rgba(20,20,32,0.97))', backdropFilter: 'blur(16px)' }}>
            <div className="flex items-center gap-3 p-3">
              <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#7cc8ff,#c39bff,#ff8fd0)' }}>
                {track?.art ? <img src={track.art} alt="" className="w-full h-full object-cover" /> : <img src="/yuma.png" alt="" className="w-8 h-8 object-contain brightness-200" />}
              </div>
              <div className="flex-1 min-w-0">
                {!access ? (
                  <>
                    <div className="text-sm font-bold text-white">Show what’s playing</div>
                    <div className="text-xs text-white/60">One-time permission needed</div>
                  </>
                ) : track ? (
                  <>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-[#ff8fd0]">{track.playing ? 'Now playing' : 'Paused'}{fromYuma ? ' · YumaPlayer' : ''}</div>
                    <div className="text-sm font-bold text-white truncate">{track.title}</div>
                    <div className="text-xs text-white/60 truncate">{track.artist}</div>
                  </>
                ) : (
                  <>
                    <div className="text-sm font-bold text-white">YumaPlayer</div>
                    <div className="text-xs text-white/60">Nothing playing. Open YumaPlayer and play a song.</div>
                  </>
                )}
              </div>
              <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0" aria-label="Close">
                <X className="w-4 h-4 text-white/80" />
              </button>
            </div>

            {!access ? (
              <div className="px-3 pb-3">
                <p className="text-[11px] text-white/70 leading-snug mb-2">
                  Tap below, find <b>Kaido Maps</b> in the list and turn it on. Android calls this “notification access”. Kaido Maps only uses it to read the song and the play/pause/skip controls.
                </p>
                <p className="text-[11px] text-white/50 leading-snug mb-2">
                  If Android says it’s a <b>restricted setting</b>: tap <b>App info</b> below, then the <b>⋮</b> menu (top right) → <b>Allow restricted settings</b>, then try again.
                </p>
                <div className="flex gap-2">
                  <button onClick={() => nativeApi().openMediaAccessSettings()} className="flex-1 h-10 rounded-xl text-sm font-bold text-[#140f24] flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg,#7cc8ff,#c39bff,#ff8fd0)' }}>
                    <ShieldCheck className="w-4 h-4" /> Allow access
                  </button>
                  <button onClick={() => nativeApi().openAppSettings()} className="px-4 h-10 rounded-xl text-xs font-semibold text-white bg-white/10">App info</button>
                </div>
              </div>
            ) : (
              <div className="px-3 pb-3">
                {track && (
                  <div className="flex items-center justify-center gap-6 mb-3">
                    <button onClick={() => ctl('previous')} className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center active:scale-95" aria-label="Previous song"><SkipBack className="w-5 h-5 text-white fill-white" /></button>
                    <button onClick={() => ctl('toggle')} className="w-14 h-14 rounded-full flex items-center justify-center active:scale-95" style={{ background: 'linear-gradient(135deg,#7cc8ff,#c39bff,#ff8fd0)' }} aria-label={track.playing ? 'Pause' : 'Play'}>
                      {track.playing ? <Pause className="w-6 h-6 text-[#140f24] fill-[#140f24]" /> : <Play className="w-6 h-6 text-[#140f24] fill-[#140f24] ml-0.5" />}
                    </button>
                    <button onClick={() => ctl('next')} className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center active:scale-95" aria-label="Next song"><SkipForward className="w-5 h-5 text-white fill-white" /></button>
                  </div>
                )}
                <button onClick={openApp} className="w-full h-10 rounded-xl text-sm font-bold text-white bg-white/10 flex items-center justify-center gap-2">
                  <ExternalLink className="w-4 h-4" /> Open YumaPlayer
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export default function MusicButton({ size = 52 }) {
  if (nativeApi()) return <NativeMusicButton size={size} />;
  return <WebMusicButton size={size} />;
}

function WebMusicButton({ size }) {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState(readUser);
  const [setup, setSetup] = useState(false);
  const [draft, setDraft] = useState(user);
  const { track, loading, error, hint } = useNowPlaying(user, open ? 10000 : 45000);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const cardRef = useRef(null);

  const saveUser = async () => {
    const u = draft.trim();
    setSaveError('');
    if (u) {
      setSaving(true);
      try {
        const r = await fetch(`${LB}${encodeURIComponent(u)}/listen-count`);
        if (r.status === 404) { setSaveError(`No ListenBrainz user named "${u}".`); return; }
      } catch { /* offline: save anyway */ } finally { setSaving(false); }
    }
    try { localStorage.setItem(LB_KEY, u); } catch { /* ignore */ }
    setUser(u);
    setSetup(false);
  };
  // Open the setup steps straight away the first time, so it's clear what's needed.
  const toggle = () => { if (!open && !user) { setDraft(''); setSetup(true); } setOpen(!open); };
  const openApp = () => { window.location.href = INTENT; };

  return (
    <>
      <button
        onClick={toggle}
        aria-label="Music"
        className="relative rounded-full p-[2.5px] shadow-xl active:scale-95 transition-transform"
        style={{ width: size, height: size, background: 'conic-gradient(from 200deg, #7cc8ff, #c39bff, #ff8fd0, #7cc8ff)' }}
      >
        <span className="flex items-center justify-center w-full h-full rounded-full overflow-hidden" style={{ background: 'radial-gradient(circle at 35% 30%, #2a2a3d, #0e0e16 70%)' }}>
          {track?.art ? <img src={track.art} alt="" className="w-full h-full object-cover" /> : <img src="/yuma.png" alt="" className="w-[62%] h-[62%] object-contain" />}
        </span>
        {track && <Bars />}
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[1500]" onClick={() => setOpen(false)}>
          <div
            ref={cardRef}
            onClick={(e) => e.stopPropagation()}
            className="absolute left-3 right-3 bottom-[96px] mx-auto max-w-md rounded-2xl border border-white/10 shadow-2xl overflow-hidden dz-pop-in"
            style={{ background: 'linear-gradient(135deg, rgba(36,30,58,0.97), rgba(20,20,32,0.97))', backdropFilter: 'blur(16px)' }}
          >
            <div className="flex items-center gap-3 p-3">
              <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#7cc8ff,#c39bff,#ff8fd0)' }}>
                {track?.art ? <img src={track.art} alt="" className="w-full h-full object-cover" /> : <img src="/yuma.png" alt="" className="w-8 h-8 object-contain brightness-200" />}
              </div>
              <div className="flex-1 min-w-0">
                {setup ? null : track ? (
                  <>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-[#ff8fd0]">{track.recent ? 'Last played' : 'Now playing'} · YumaPlayer</div>
                    <div className="text-sm font-bold text-white truncate">{track.title}</div>
                    <div className="text-xs text-white/60 truncate">{track.artist}</div>
                  </>
                ) : (
                  <>
                    <div className="text-sm font-bold text-white">YumaPlayer</div>
                    <div className="text-xs text-white/60 truncate">
                      {error || (loading ? 'Checking what’s playing…' : user ? 'Nothing playing. Play a song in YumaPlayer.' : 'Show your song here. Tap ⚙')}
                    </div>
                  </>
                )}
                {setup && <div className="text-xs font-semibold text-white">Show the song that’s playing</div>}
              </div>
              {loading && !setup && <Loader2 className="w-4 h-4 text-white/50 animate-spin shrink-0" />}
              <button onClick={() => { setDraft(user); setSetup((s) => !s); }} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0" aria-label="Music settings">
                <Settings2 className="w-4 h-4 text-white/80" />
              </button>
              <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0" aria-label="Close">
                <X className="w-4 h-4 text-white/80" />
              </button>
            </div>

            {!setup && !track && user && hint && (
              <p className="px-3 -mt-1 pb-2 text-[11px] text-white/60 leading-snug">{hint}</p>
            )}
            {setup ? (
              <div className="px-3 pb-3">
                <ol className="text-[11px] text-white/70 mb-2 leading-snug list-decimal pl-4 space-y-1">
                  <li>Make a free account at <a href="https://listenbrainz.org/login/" target="_blank" rel="noreferrer" className="text-[#7cc8ff] underline">listenbrainz.org</a>.</li>
                  <li>Open <a href="https://listenbrainz.org/settings/" target="_blank" rel="noreferrer" className="text-[#7cc8ff] underline">ListenBrainz settings</a> and copy your <b>User token</b>.</li>
                  <li>In YumaPlayer: Settings → Integrations → turn on <b>ListenBrainz scrobbling</b> → <b>Set ListenBrainz token</b> → paste it.</li>
                  <li>Type your ListenBrainz <b>username</b> below (not the token).</li>
                </ol>
                <div className="flex gap-2">
                  <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="ListenBrainz username" autoCapitalize="none" autoCorrect="off"
                    className="flex-1 min-w-0 bg-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none border border-white/10 focus:border-[#c39bff]" />
                  <button onClick={saveUser} disabled={saving} className="px-4 rounded-xl text-sm font-bold text-[#140f24] disabled:opacity-60" style={{ background: 'linear-gradient(135deg,#7cc8ff,#ff8fd0)' }}>{saving ? '…' : 'Save'}</button>
                </div>
                {saveError && <p className="text-[11px] text-[#ff8f8f] mt-1.5">{saveError}</p>}
              </div>
            ) : (
              <div className="px-3 pb-3">
                <button onClick={openApp} className="w-full h-10 rounded-xl text-sm font-bold text-[#140f24] flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg,#7cc8ff,#c39bff,#ff8fd0)' }}>
                  <ExternalLink className="w-4 h-4" /> Open YumaPlayer
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
