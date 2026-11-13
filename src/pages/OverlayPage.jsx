// Waze Overlay Mode (Android app): this page floats over Waze in a see-through window.
// Display-only by default (every tap goes to Waze). "Edit layout" from the notification lets you
// drag the widgets; positions are saved separately for portrait and landscape.
import { useEffect, useRef, useState } from 'react';
import EngineBubbles from '@/components/EngineBubbles';
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
    const p = prefs;
    if (!p.device || !nat()?.obdConnect) return;
    try {
      const st = JSON.parse(nat().obdState()).status;
      if (st !== 'live' && st !== 'connecting') nat().obdConnect(p.device.address, p.device.name);
    } catch { /* ignore */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const moving = (mph || 0) > 5;
  const overlay = { editing: editing && !moving, orient };
  const done = () => { try { nat().overlayEdit(false); } catch { setEditing(false); } };
  const stop = () => { try { nat().overlayStop(); } catch { /* ignore */ } };

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ background: editing ? 'rgba(0,0,0,0.25)' : 'transparent' }}>
      {prefs.ovlSpeed !== false && <SpeedWidget mph={mph} orient={orient} editing={overlay.editing} prefs={prefs} />}
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

// Big speed readout. Draggable only in Edit layout while parked.
function SpeedWidget({ mph, orient, editing, prefs }) {
  const at = prefs.ovlPos?.[orient]?.speed || { x: 0.74, y: orient === 'land' ? 0.7 : 0.8 };
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
    setObdPrefs((p) => ({ ovlPos: { ...p.ovlPos, [orient]: { ...(p.ovlPos?.[orient] || {}), speed: { x, y } } } }));
  };
  const d = drag.current;
  const left = d?.cx != null ? d.cx : at.x * window.innerWidth;
  const top = d?.cy != null ? d.cy : at.y * window.innerHeight;
  return (
    <div ref={el} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; }}
      className={`absolute z-10 touch-none select-none rounded-2xl px-3 py-1.5 text-white ${editing ? 'pointer-events-auto ring-2 ring-sky-400' : 'pointer-events-none'}`}
      style={{ left, top, background: 'rgba(8,9,11,0.8)', border: '1px solid rgba(255,255,255,0.15)' }}>
      <div className="text-[34px] font-bold font-mono tabular-nums leading-none">{mph == null ? '--' : spd(mph)}</div>
      <div className="text-[10px] font-bold tracking-wider text-center" style={{ color: '#9aa0a8' }}>{speedUnit().toUpperCase()}</div>
    </div>
  );
}
