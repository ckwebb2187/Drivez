import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Settings2, ExternalLink, Loader2 } from 'lucide-react';

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
function useNowPlaying(user, every) {
  const [track, setTrack] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!user) { setTrack(null); return; }
    let alive = true;
    const load = async () => {
      setLoading(true);
      try {
        const d = await (await fetch(`https://api.listenbrainz.org/1/user/${encodeURIComponent(user)}/playing-now`)).json();
        const m = d.payload?.listens?.[0]?.track_metadata;
        if (!m) { if (alive) setTrack(null); return; }
        const t = { title: m.track_name, artist: m.artist_name, album: m.release_name };
        t.art = await findArt(t);
        if (alive) setTrack(t);
      } catch { /* keep last */ } finally { if (alive) setLoading(false); }
    };
    load();
    const id = setInterval(load, every);
    return () => { alive = false; clearInterval(id); };
  }, [user, every]);
  return { track, loading };
}

function Bars() {
  return (
    <span className="absolute -top-0.5 -right-0.5 flex items-end gap-[2px] h-3.5 px-1 py-0.5 rounded-full bg-[#ff8fd0]">
      {[0, 1, 2].map((i) => <span key={i} className="w-[2px] bg-white rounded-full dz-eq" style={{ animationDelay: `${i * 0.18}s` }} />)}
    </span>
  );
}

export default function MusicButton({ size = 52 }) {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState(readUser);
  const [setup, setSetup] = useState(false);
  const [draft, setDraft] = useState(user);
  const { track, loading } = useNowPlaying(user, open ? 10000 : 45000);
  const cardRef = useRef(null);

  const saveUser = () => {
    const u = draft.trim();
    try { localStorage.setItem(LB_KEY, u); } catch { /* ignore */ }
    setUser(u);
    setSetup(false);
  };
  const openApp = () => { window.location.href = INTENT; };

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
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
                    <div className="text-[10px] font-bold uppercase tracking-wide text-[#ff8fd0]">Now playing · YumaPlayer</div>
                    <div className="text-sm font-bold text-white truncate">{track.title}</div>
                    <div className="text-xs text-white/60 truncate">{track.artist}</div>
                  </>
                ) : (
                  <>
                    <div className="text-sm font-bold text-white">YumaPlayer</div>
                    <div className="text-xs text-white/60 truncate">
                      {loading ? 'Checking what’s playing…' : user ? 'Nothing playing right now' : 'Show your song here — tap ⚙'}
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

            {setup ? (
              <div className="px-3 pb-3">
                <p className="text-[11px] text-white/60 mb-2 leading-snug">
                  In YumaPlayer: Settings → ListenBrainz scrobbling → turn it on and set your token. Then enter your ListenBrainz username here.
                </p>
                <div className="flex gap-2">
                  <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="ListenBrainz username" autoCapitalize="none" autoCorrect="off"
                    className="flex-1 min-w-0 bg-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none border border-white/10 focus:border-[#c39bff]" />
                  <button onClick={saveUser} className="px-4 rounded-xl text-sm font-bold text-[#140f24]" style={{ background: 'linear-gradient(135deg,#7cc8ff,#ff8fd0)' }}>Save</button>
                </div>
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
