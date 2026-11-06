import { useEffect, useRef, useState } from 'react';
import { speedStyle } from '@/lib/mapTheme';
import { METRICS, BUBBLE_THEMES, SIZES, WARN, HOT, useObd, useObdPrefs, setObdPrefs, display, level, fraction, resetPeak } from '@/lib/obd';

// Floating engine gauges over the drive map (ported from the WRX Logger "map bubbles").
// Drag to place them while stopped; they stay put (and ignore taps) while the car is moving.
// Tap the boost bubble (stopped) to reset the peak marker.
const R = 38;
const C = 2 * Math.PI * R;

function colors(prefs, themeKey) {
  const t = BUBBLE_THEMES.find((x) => x.id === prefs.theme);
  if (t && t.accent) return t;
  const st = speedStyle(themeKey);
  const accent = st.glow || (themeKey === 'standard' ? '#4c8bf5' : st.ring);
  return { accent, bg: st.bg, track: st.ring, text: st.text, label: st.sub };
}

function Bubble({ m, v, peak, size, c, opacity, calm }) {
  const lv = level(m, v);
  const col = lv === 2 ? HOT : lv === 1 ? WARN : c.accent;
  const f = fraction(m, v);
  const d = display(m, v);
  const alpha = Math.round(255 * opacity / 100).toString(16).padStart(2, '0');
  const pk = m.id === 'boost' && peak != null ? (135 + 270 * fraction(m, peak)) * Math.PI / 180 : null;
  return (
    <div className={`rounded-full ${lv === 2 && !calm ? 'dz-hot-pulse' : ''}`}
      style={{ width: size, height: size, '--glow': col, boxShadow: `0 0 ${Math.round(size / 5)}px ${col}66, 0 6px 16px rgba(0,0,0,.45)` }}>
      <svg viewBox="0 0 100 100" width={size} height={size} aria-label={`${m.label} ${d.text} ${d.unit}`}>
        <circle cx="50" cy="50" r="47" fill={`${c.bg}${alpha}`} stroke={`${col}55`} strokeWidth="1.2" />
        <circle cx="50" cy="50" r={R} fill="none" stroke={c.track} strokeOpacity="0.5" strokeWidth="7" strokeLinecap="round"
          strokeDasharray={`${C * 0.75} ${C}`} transform="rotate(135 50 50)" />
        {f > 0.002 && (
          <circle cx="50" cy="50" r={R} fill="none" stroke={col} strokeWidth="7" strokeLinecap="round"
            strokeDasharray={`${C * 0.75 * f} ${C}`} transform="rotate(135 50 50)"
            style={{ filter: `drop-shadow(0 0 4px ${col}) drop-shadow(0 0 9px ${col}aa)`, transition: calm ? undefined : 'stroke-dasharray .15s linear' }} />
        )}
        {pk != null && <circle cx={50 + R * Math.cos(pk)} cy={50 + R * Math.sin(pk)} r="3.2" fill={c.text} style={{ filter: `drop-shadow(0 0 3px ${c.text})` }} />}
        <text x="50" y="35" textAnchor="middle" fontSize="10.5" fontWeight="600" letterSpacing="1.2" fill={c.label}>{m.label.toUpperCase()}</text>
        <text x="50" y="60" textAnchor="middle" fontSize={d.text.length > 4 ? 22 : 29} fontWeight="800" className="speed-font"
          fill={lv ? col : c.text} style={lv ? { filter: `drop-shadow(0 0 4px ${col})` } : undefined}>{d.text}</text>
        <text x="50" y="77" textAnchor="middle" fontSize="9.5" fill={c.label}>{d.unit}</text>
      </svg>
    </div>
  );
}

export default function EngineBubbles({ themeKey, moving = false, calm = false }) {
  const prefs = useObdPrefs();
  const s = useObd(true);
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

  const live = s.status === 'live' || s.status === 'demo';
  const shown = METRICS.filter((m) => prefs.metrics[m.id]);
  const c = colors(prefs, themeKey);
  const base = SIZES[prefs.size] || SIZES[1];
  const locked = prefs.locked || moving; // nothing to tap or drag while the car is moving

  const posOf = (m, i, size) => {
    const p = prefs.pos[m.id];
    if (p && dim.w) return { x: p.x * dim.w, y: p.y * dim.h };
    // Default: a column down the left side (the boost bubble is bigger).
    const above = shown.slice(0, i).reduce((h, x) => h + (x.big ? Math.round(base * 1.25) : base) + 10, 0);
    return { x: 10, y: dim.h * 0.2 + above };
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

  if (!live || !shown.length) return <div ref={box} className="absolute inset-0 pointer-events-none" />;
  return (
    <div ref={box} className="absolute inset-0 pointer-events-none z-[5]">
      <style>{'@keyframes dzHotPulse{0%,100%{box-shadow:0 0 10px var(--glow),0 6px 16px rgba(0,0,0,.45)}50%{box-shadow:0 0 28px var(--glow),0 0 8px var(--glow),0 6px 16px rgba(0,0,0,.45)}}.dz-hot-pulse{animation:dzHotPulse .9s ease-in-out infinite}@media (prefers-reduced-motion:reduce){.dz-hot-pulse{animation:none}}'}</style>
      {dim.w > 0 && shown.map((m, i) => {
        const size = m.big ? Math.round(base * 1.25) : base;
        const p = posOf(m, i, size);
        const d = drag.current?.id === m.id && drag.current.moved ? { x: drag.current.cx, y: drag.current.cy } : p;
        return (
          <div key={m.id} className={`absolute touch-none select-none ${locked ? 'pointer-events-none' : 'pointer-events-auto cursor-grab'}`}
            style={{ left: d.x, top: d.y }}
            onPointerDown={(e) => down(e, m, p.x, p.y)} onPointerMove={move} onPointerUp={() => up(m, size)} onPointerCancel={() => { drag.current = null; }}>
            <Bubble m={m} v={s.values?.[m.id]} peak={s.peakBoost} size={size} c={c} opacity={prefs.opacity} calm={calm} />
          </div>
        );
      })}
    </div>
  );
}
