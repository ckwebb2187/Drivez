// Waze Overlay Mode (Android app): this page floats over Waze in a see-through window.
// Display-only by default (every tap goes to Waze). "Edit layout" from the notification lets you
// drag the widgets; positions are saved separately for portrait and landscape.
import { useEffect, useRef, useState } from 'react';
import EngineBubbles from '@/components/EngineBubbles';
import OverlayFx, { overlayColors } from '@/components/OverlayFx';
import { useNativeMedia, tempoFor } from '@/components/MusicButton';
import { useMapLook, isLite } from '@/lib/mapTheme';
import { useObdPrefs, setObdPrefs } from '@/lib/obdPrefs';
import { spd, speedUnit, useUnits } from '@/lib/units';

const nat = () => window.DrivezNative;
const orientOf = () => (window.innerWidth > window.innerHeight ? 'land' : 'port');

export default function OverlayPage() {
  const [look] = useMapLook();
  const prefs = useObdPrefs();
  useUnits();
  const [editing, setEditing] = useState(() => { try { return !!nat()?.overlayEditing(); } catch { return false; } });
  const [orient, setOrient] = useState(orientOf);
  const [mph, setMph] = useState(null);

  useEffect(() => {
    const onEdit = (e) => setEditing(!!e.detail);
    const onSize = () => setOrient(orientOf());
    window.addEventListener('drivez-overlay-edit', onEdit);
    window.addEventListener('resize', onSize);
    return () => { window.removeEventListener('drivez-overlay-edit', onEdit); window.removeEventListener('resize', onSize); };
  }, []);

  // Speed from GPS (Waze already keeps GPS on, so this costs little).
  useEffect(() => {
    if (!navigator.geolocation) return undefined;
    const id = navigator.geolocation.watchPosition(
      (p) => setMph(p.coords.speed != null && p.coords.speed >= 0 ? p.coords.speed * 2.23694 : null),
      () => {}, { enableHighAccuracy: true, maximumAge: 1000 });
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // In the car with the overlay on: connect the adapter you used last if it isn't already.
  useEffect(() => {
    if (!prefs.device || !nat()?.obdConnect) return;
    try {
      const st = JSON.parse(nat().obdState()).status;
      if (st !== 'live' && st !== 'connecting') nat().obdConnect(prefs.device.address, prefs.device.name);
    } catch { /* ignore */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const moving = (mph || 0) > 5;
  const canEdit = editing && !moving;
  const overlay = { editing: canEdit, orient };
  const cols = overlayColors(prefs, look.theme);
  const done = () => { try { nat().overlayEdit(false); } catch { setEditing(false); } };
  const stop = () => { try { nat().overlayStop(); } catch { /* ignore */ } };

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ background: editing ? 'rgba(0,0,0,0.25)' : 'transparent' }}>
      <OverlayFx fx={prefs.ovlFx || []} colors={cols} amount={prefs.ovlFxAmount ?? 1} />
      {prefs.ovlSpeed !== false && (
        <Movable id="speed" orient={orient} editing={canEdit} prefs={prefs} def={{ x: 0.74, y: orient === 'land' ? 0.7 : 0.8 }}>
          <div className="rounded-2xl px-3 py-1.5 text-white" style={{ background: 'rgba(8,9,11,0.8)', border: '1px solid rgba(255,255,255,0.15)' }}>
            <div className="text-[34px] font-bold font-mono tabular-nums leading-none">{mph == null ? '--' : spd(mph)}</div>
            <div className="text-[10px] font-bold tracking-wider text-center" style={{ color: '#9aa0a8' }}>{speedUnit().toUpperCase()}</div>
          </div>
        </Movable>
      )}
      {prefs.ovlMusic !== false && <MusicWidget orient={orient} editing={canEdit} prefs={prefs} cols={cols} />}
      <EngineBubbles themeKey={look.theme} calm={isLite(look)} moving={moving} overlay={overlay} />
      {editing && (
        <div className="absolute left-1/2 -translate-x-1/2 top-3 z-20 flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold text-white shadow-xl"
          style={{ background: 'rgba(10,12,16,0.92)', border: '1px solid rgba(255,255,255,0.15)' }}>
          <span className="whitespace-nowrap">{moving ? 'Stop the car to move widgets' : 'Drag your widgets'}</span>
          <button onClick={done} className="rounded-full px-3 py-1 font-bold whitespace-nowrap" style={{ background: '#3b82f6' }}>Done</button>
          <button onClick={stop} className="rounded-full px-3 py-1 font-bold whitespace-nowrap" style={{ background: 'rgba(255,255,255,0.12)' }}>Stop overlay</button>
        </div>
      )}
    </div>
  );
}

// Now playing (Spotify or any music app): album art in a ring of bars that dance to the song,
// with a slow glow spinning around it, in your overlay colors.
function MusicWidget({ orient, editing, prefs, cols }) {
  const { track } = useNativeMedia();
  if (!track && !editing) return null;
  const playing = !!track?.playing;
  const beat = tempoFor(track?.title);
  const size = 64, n = 30, r = size / 2 + 4;
  const ring = `conic-gradient(from 0deg, ${[...cols, cols[0]].join(', ')})`;
  return (
    <Movable id="music" orient={orient} editing={editing} prefs={prefs} def={{ x: 0.66, y: orient === 'land' ? 0.18 : 0.4 }}>
      <div className="flex flex-col items-center" style={{ width: 150 }}>
        <div className="relative" style={{ width: size + 26, height: size + 26 }}>
          <div className={`absolute inset-0 rounded-full ${playing ? 'dz-ovl-spin' : ''}`} style={{ background: ring, filter: 'blur(10px)', opacity: playing ? 0.75 : 0.3 }} />
          <span className="absolute" style={{ left: '50%', top: '50%', width: 0, height: 0 }} aria-hidden="true">
            {Array.from({ length: n }, (_, i) => {
              const c = cols[i % cols.length];
              return (
                <span key={i} className="absolute left-0 top-0" style={{ transform: `rotate(${(360 / n) * i}deg) translateY(-${r}px)` }}>
                  <span className={`block w-[3px] h-[10px] -ml-[1.5px] -mt-[10px] rounded-full origin-bottom ${playing ? 'dz-ring-bar' : ''}`}
                    style={{ background: c, boxShadow: playing ? `0 0 6px ${c}` : 'none', opacity: playing ? 0.95 : 0.35, transform: playing ? undefined : 'scaleY(0.35)',
                      animationDuration: `${beat * (1 + ((i * 7) % 5) / 10)}s`, animationDelay: `${-((i * 37) % 23) / 23 * beat}s` }} />
                </span>
              );
            })}
          </span>
          <div className={`absolute rounded-full overflow-hidden ${playing ? 'dz-beat' : ''}`}
            style={{ left: 13, top: 13, width: size, height: size, padding: 2, background: ring, '--beat': `${beat}s` }}>
            <div className="w-full h-full rounded-full overflow-hidden" style={{ background: '#111' }}>
              {track?.art ? <img src={track.art} alt="" className={`w-full h-full object-cover ${playing ? 'dz-ovl-spin-slow' : ''}`} /> : <div className="w-full h-full flex items-center justify-center text-2xl">♪</div>}
            </div>
          </div>
        </div>
        <div className="mt-1 max-w-full rounded-full px-2.5 py-0.5 text-center" style={{ background: 'rgba(8,9,11,0.75)' }}>
          <div className="text-[11px] font-bold text-white truncate">{track?.title || 'Now playing'}</div>
          {track?.artist && <div className="text-[9px] truncate" style={{ color: '#b9bec6' }}>{track.artist}</div>}
        </div>
      </div>
      <style>{'.dz-ovl-spin{animation:dz-ovl-spin 6s linear infinite}.dz-ovl-spin-slow{animation:dz-ovl-spin 18s linear infinite}@keyframes dz-ovl-spin{to{transform:rotate(360deg)}}'}</style>
    </Movable>
  );
}

// A widget you can drag in Edit layout (while parked). Saved per orientation.
function Movable({ id, orient, editing, prefs, def, children }) {
  const at = prefs.ovlPos?.[orient]?.[id] || def;
  const drag = useRef(null);
  const [, bump] = useState(0);
  const el = useRef(null);
  const down = (e) => {
    if (!editing) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, x: at.x * window.innerWidth, y: at.y * window.innerHeight };
  };
  const move = (e) => {
    const d = drag.current; if (!d) return;
    d.cx = d.x + e.clientX - d.sx; d.cy = d.y + e.clientY - d.sy; bump((n) => n + 1);
  };
  const up = () => {
    const d = drag.current; drag.current = null;
    if (!d || d.cx == null) return;
    const w = el.current?.offsetWidth || 90, h = el.current?.offsetHeight || 60;
    const x = Math.max(0, Math.min(window.innerWidth - w, d.cx)) / window.innerWidth;
    const y = Math.max(0, Math.min(window.innerHeight - h, d.cy)) / window.innerHeight;
    setObdPrefs((p) => ({ ovlPos: { ...p.ovlPos, [orient]: { ...(p.ovlPos?.[orient] || {}), [id]: { x, y } } } }));
  };
  const d = drag.current;
  const left = d?.cx != null ? d.cx : at.x * window.innerWidth;
  const top = d?.cy != null ? d.cy : at.y * window.innerHeight;
  return (
    <div ref={el} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; }}
      className={`absolute z-10 touch-none select-none ${editing ? 'pointer-events-auto outline-dashed outline-2 outline-sky-400 rounded-2xl' : 'pointer-events-none'}`}
      style={{ left, top }}>
      {children}
    </div>
  );
}
