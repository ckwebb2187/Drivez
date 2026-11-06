import { useEffect, useRef, useState } from 'react';
import { speedStyle } from '@/lib/mapTheme';
import { METRICS, BUBBLE_THEMES, SIZES, WARN, HOT, fxFor, useObd, useObdPrefs, setObdPrefs, obdWatch, display, level, fraction, resetPeak } from '@/lib/obd';

// Floating engine gauges over the drive map (ported from the WRX Logger "map bubbles").
// Drag to place them while stopped; they stay put (and ignore taps) while the car is moving.
// Tap the boost bubble (stopped) to reset the peak marker.
// Battery: every animation is CSS transform/opacity only (no per-frame JS, no blur filters),
// values re-render only when they change, and everything stops in battery saver or when hidden.
const R = 38;
const C = 2 * Math.PI * R;

const CSS = `
@keyframes dzBreathe{0%,100%{opacity:.35}50%{opacity:.9}}
@keyframes dzSpin{to{transform:rotate(360deg)}}
@keyframes dzSpinBack{to{transform:rotate(-360deg)}}
@keyframes dzRipple{0%{transform:scale(1);opacity:.7}100%{transform:scale(1.4);opacity:0}}
@keyframes dzScan{0%{transform:translateY(-100%)}100%{transform:translateY(100%)}}
@keyframes dzHoloFlick{0%,92%,100%{opacity:1}93%{opacity:.55}95%{opacity:.95}96%{opacity:.6}}
@keyframes dzHot{0%,100%{opacity:.4}50%{opacity:1}}
@keyframes dzVGlow{0%,100%{opacity:.18}50%{opacity:.55}}
@keyframes dzFlash{0%{opacity:1;transform:scale(1.08)}100%{opacity:0;transform:scale(1)}}
@keyframes dzFlicker{0%,88%,100%{opacity:1}89%{opacity:.4}90%{opacity:1}92%{opacity:.6}93%{opacity:1}}
@keyframes dzIdle{0%,100%{opacity:.25}50%{opacity:.6}}
.dz-b [class*="a-"]{transform-origin:center;transform-box:fill-box}
.dz-b .a-breathe{animation:dzBreathe 3.2s ease-in-out infinite}
.dz-b .a-orbit{animation:dzSpin 4.5s linear infinite}
.dz-b .a-radar{animation:dzSpin 3s linear infinite}
.dz-b .a-ripple{animation:dzRipple 2.6s ease-out infinite}
.dz-b .a-ripple2{animation:dzRipple 2.6s ease-out 1.3s infinite}
.dz-b .a-scan{animation:dzScan 2.8s linear infinite}
.dz-b .a-holo{animation:dzHoloFlick 6s steps(1) infinite}
.dz-b .a-reactor{animation:dzSpin 9s linear infinite}
.dz-b .a-reactor2{animation:dzSpinBack 14s linear infinite}
.dz-b .a-hot{animation:dzHot .9s ease-in-out infinite}
.dz-b .a-vglow{animation:dzVGlow 2.4s ease-in-out infinite}
.dz-b .a-flash{animation:dzFlash .5s ease-out forwards}
.dz-b .a-flicker{animation:dzFlicker 5s steps(1) infinite}
.dz-b .a-idle{animation:dzSpin 6s linear infinite}
.dz-b .a-idle2{animation:dzIdle 2.4s ease-in-out infinite}
.dz-calm *,.dz-paused *{animation-play-state:paused!important}
@media (prefers-reduced-motion:reduce){.dz-b *{animation:none!important}}
`;

function colors(prefs, themeKey) {
  const t = BUBBLE_THEMES.find((x) => x.id === prefs.theme);
  if (t && t.accent) return t;
  const st = speedStyle(themeKey);
  const accent = st.glow || (themeKey === 'standard' ? '#4c8bf5' : st.ring);
  return { accent, bg: st.bg, track: st.ring, text: st.text, label: st.sub };
}

// Animated layers around/inside a bubble, drawn in the theme's color.
function Fx({ fx, col, size, calm }) {
  if (calm || fx === 'none') return null;
  const ring = (cls, extra = {}) => <div className={`absolute inset-0 rounded-full ${cls}`} style={{ border: `1.5px solid ${col}`, ...extra }} />;
  switch (fx) {
    case 'breathe':
      return <div className="absolute -inset-1 rounded-full a-breathe" style={{ boxShadow: `0 0 ${Math.round(size / 4)}px ${col}, inset 0 0 ${Math.round(size / 8)}px ${col}55` }} />;
    case 'orbit':
      return (
        <div className="absolute inset-0 a-orbit">
          <div className="absolute left-1/2 -translate-x-1/2 rounded-full" style={{ top: 1, width: 5, height: 5, background: '#fff', boxShadow: `0 0 6px 2px ${col}, 0 0 14px 4px ${col}88` }} />
        </div>
      );
    case 'radar':
      return <div className="absolute inset-[3%] rounded-full a-radar opacity-60" style={{ background: `conic-gradient(from 0deg, transparent 0deg 290deg, ${col}00 290deg, ${col}88 358deg, transparent 360deg)` }} />;
    case 'ripple':
      return <>{ring('a-ripple')}{ring('a-ripple2')}</>;
    case 'holo':
      return (
        <div className="absolute inset-[3%] rounded-full overflow-hidden pointer-events-none a-holo">
          <div className="absolute inset-0 opacity-25" style={{ background: `repeating-linear-gradient(0deg, ${col}55 0 1px, transparent 1px 4px)` }} />
          <div className="absolute inset-x-0 h-1/3 a-scan" style={{ background: `linear-gradient(180deg, transparent, ${col}55, transparent)` }} />
        </div>
      );
    case 'reactor':
      return (
        <>
          <svg viewBox="0 0 100 100" className="absolute inset-0 a-reactor"><circle cx="50" cy="50" r="46" fill="none" stroke={col} strokeOpacity=".7" strokeWidth="1.4" strokeDasharray="5 9" /></svg>
          <svg viewBox="0 0 100 100" className="absolute inset-0 a-reactor2"><circle cx="50" cy="50" r="27" fill="none" stroke={col} strokeOpacity=".35" strokeWidth="1" strokeDasharray="2 6" /></svg>
        </>
      );
    default:
      return null;
  }
}

function Bubble({ m, v, peak, size, c, opacity, fx, valueFx, calm, live }) {
  const lv = level(m, v);
  const col = lv === 2 ? HOT : lv === 1 ? WARN : c.accent;
  const f = fraction(m, v);
  const d = display(m, v);
  const alpha = Math.round(255 * opacity / 100).toString(16).padStart(2, '0');
  const pk = m.id === 'boost' && peak != null ? (135 + 270 * fraction(m, peak)) * Math.PI / 180 : null;
  // Flash only on a real jump (4% of the range), not every tiny wiggle.
  const prev = useRef(v);
  const [flashN, setFlashN] = useState(0);
  useEffect(() => {
    if (valueFx === 'flash' && v != null && prev.current != null && Math.abs(v - prev.current) > (m.max - m.min) * 0.04) setFlashN((n) => n + 1);
    if (v != null && (prev.current == null || Math.abs(v - prev.current) > (m.max - m.min) * 0.04)) prev.current = v;
  }, [v, valueFx, m.max, m.min]);
  const big = d.text.length > 4 ? 21 : 26;
  return (
    <div className={`relative rounded-full ${live ? '' : 'opacity-80'}`} style={{ width: size, height: size }}>
      {/* Static outer glow (painted once). */}
      <div className="absolute inset-0 rounded-full" style={{ boxShadow: `0 0 ${Math.round(size / 5)}px ${col}55, 0 6px 16px rgba(0,0,0,.45)` }} />
      {lv === 2 && !calm && <div className="absolute -inset-1 rounded-full a-hot" style={{ boxShadow: `0 0 ${Math.round(size / 3)}px ${HOT}, 0 0 ${Math.round(size / 8)}px ${HOT}` }} />}
      {live && <Fx fx={fx} col={col} size={size} calm={calm} />}
      <svg viewBox="0 0 100 100" width={size} height={size} className="relative" aria-label={`${m.label} ${d.text} ${d.unit}`}>
        <circle cx="50" cy="50" r="47" fill={`${c.bg}${alpha}`} stroke={`${col}55`} strokeWidth="1.2" />
        <circle cx="50" cy="50" r={R} fill="none" stroke={c.track} strokeOpacity="0.5" strokeWidth="7" strokeLinecap="round"
          strokeDasharray={`${C * 0.75} ${C}`} transform="rotate(135 50 50)" />
        {!live && (
          <g className="a-idle"><circle cx="50" cy="50" r="47" fill="none" stroke="none" /><circle cx="50" cy="50" r={R} fill="none" stroke={c.accent} strokeOpacity=".55" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${C * 0.12} ${C}`} className="a-idle2" /></g>
        )}
        {live && f > 0.002 && (
          <g style={{ transition: calm ? undefined : 'opacity .2s' }}>
            {/* Cheap glow: wide faint strokes under the arc instead of a blur filter. */}
            <circle cx="50" cy="50" r={R} fill="none" stroke={col} strokeOpacity=".14" strokeWidth="15" strokeLinecap="round" strokeDasharray={`${C * 0.75 * f} ${C}`} transform="rotate(135 50 50)" />
            <circle cx="50" cy="50" r={R} fill="none" stroke={col} strokeOpacity=".28" strokeWidth="10.5" strokeLinecap="round" strokeDasharray={`${C * 0.75 * f} ${C}`} transform="rotate(135 50 50)" />
            <circle cx="50" cy="50" r={R} fill="none" stroke={col} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${C * 0.75 * f} ${C}`} transform="rotate(135 50 50)"
              style={{ transition: calm ? undefined : 'stroke-dasharray .25s linear' }} />
          </g>
        )}
        {pk != null && live && <circle cx={50 + R * Math.cos(pk)} cy={50 + R * Math.sin(pk)} r="3.2" fill={c.text} stroke={col} strokeWidth="1.5" />}
        <text x="50" y="35" textAnchor="middle" fontSize="10.5" fontWeight="600" letterSpacing="1.2" fill={c.label}>{m.label.toUpperCase()}</text>
        {valueFx === 'glow' && live && (
          <text x="50" y="60" textAnchor="middle" fontSize={big} fontWeight="800" className={`speed-font ${calm ? '' : 'a-vglow'}`} fill="none" stroke={col} strokeWidth="5" strokeOpacity=".9" strokeLinejoin="round" opacity=".3">{d.text}</text>
        )}
        <text x="50" y="60" textAnchor="middle" fontSize={big} fontWeight="800" className={`speed-font ${valueFx === 'flicker' && live && !calm ? 'a-flicker' : ''}`} fill={lv ? col : c.text}>{d.text}</text>
        {valueFx === 'flash' && flashN > 0 && !calm && (
          <text key={flashN} x="50" y="60" textAnchor="middle" fontSize={big} fontWeight="800" className="speed-font a-flash" fill={col}>{d.text}</text>
        )}
        <text x="50" y="77" textAnchor="middle" fontSize="9.5" fill={c.label}>{live ? d.unit : 'no signal'}</text>
      </svg>
    </div>
  );
}

const STATUS = { off: 'OBD not connected', none: 'OBD needs the Android app', connecting: 'OBD connecting…', error: 'OBD connection lost' };

export default function EngineBubbles({ themeKey, moving = false, calm = false }) {
  const prefs = useObdPrefs();
  const s = useObd(true, calm ? 500 : 250);
  const box = useRef(null);
  const [dim, setDim] = useState({ w: 0, h: 0 });
  const drag = useRef(null);
  const [, bump] = useState(0);

  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setDim({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const shown = METRICS.filter((m) => prefs.metrics[m.id]);
  const ids = shown.map((m) => m.id).join(',');
  useEffect(() => { obdWatch(ids ? ids.split(',') : []); }, [ids]); // the app reads only these

  const live = s.status === 'live' || s.status === 'demo';
  const c = colors(prefs, themeKey);
  const fx = fxFor(prefs.fx, themeKey);
  const base = SIZES[prefs.size] || SIZES[1];
  const locked = prefs.locked || moving; // nothing to tap or drag while the car is moving

  const sizeOf = (m) => (m.big ? Math.round(base * 1.25) : base);
  const posOf = (m, i) => {
    const p = prefs.pos[m.id];
    if (p && dim.w) return { x: p.x * dim.w, y: p.y * dim.h };
    // Default: columns down the left side (the boost bubble is bigger), wrapping when full.
    const top = dim.h * 0.2, room = Math.max(base, dim.h * 0.72);
    let x = 10, y = top;
    for (let k = 0; k < i; k++) { y += sizeOf(shown[k]) + 10; if (y + sizeOf(shown[k + 1] || m) > top + room) { y = top; x += base * 1.25 + 10; } }
    return { x, y };
  };

  const down = (e, m, x, y) => {
    if (locked) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: m.id, sx: e.clientX, sy: e.clientY, x, y, moved: false };
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    d.moved = true;
    d.cx = d.x + dx; d.cy = d.y + dy;
    bump((n) => n + 1);
  };
  const up = (m, size) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) { if (m.id === 'boost') resetPeak(); return; }
    const x = Math.max(0, Math.min(dim.w - size, d.cx)), y = Math.max(0, Math.min(dim.h - size, d.cy));
    setObdPrefs((p) => ({ pos: { ...p.pos, [m.id]: { x: x / dim.w, y: y / dim.h } } }));
  };

  if (!shown.length) return <div ref={box} className="absolute inset-0 pointer-events-none" />;
  const first = shown.length && dim.w ? posOf(shown[0], 0) : null;
  return (
    <div ref={box} className={`absolute inset-0 pointer-events-none z-[5] dz-b ${calm ? 'dz-calm' : ''}`}>
      <style>{CSS}</style>
      {!live && first && (
        <div className="absolute rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ left: first.x, top: Math.max(4, first.y - 22), background: `${c.bg}cc`, color: c.label, border: `1px solid ${c.accent}55` }}>
          {s.status === 'error' && s.message ? s.message : STATUS[s.status] || 'OBD not connected'}
        </div>
      )}
      {dim.w > 0 && shown.map((m, i) => {
        const size = sizeOf(m);
        const p = posOf(m, i);
        const d = drag.current?.id === m.id && drag.current.moved ? { x: drag.current.cx, y: drag.current.cy } : p;
        return (
          <div key={m.id} className={`absolute touch-none select-none ${locked ? 'pointer-events-none' : 'pointer-events-auto cursor-grab'}`}
            style={{ left: d.x, top: d.y }}
            onPointerDown={(e) => down(e, m, p.x, p.y)} onPointerMove={move} onPointerUp={() => up(m, size)} onPointerCancel={() => { drag.current = null; }}>
            <Bubble m={m} v={live ? s.values?.[m.id] : null} peak={s.peakBoost} size={size} c={c} opacity={prefs.opacity} fx={fx} valueFx={prefs.valueFx} calm={calm} live={live} />
          </div>
        );
      })}
    </div>
  );
}
