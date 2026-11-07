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
@keyframes dzSonar{0%{transform:scale(.55);opacity:0}30%{opacity:.8}100%{transform:scale(1.25);opacity:0}}
@keyframes dzHeart{0%,100%{opacity:.3;transform:scale(1)}12%{opacity:1;transform:scale(1.05)}24%{opacity:.45;transform:scale(1)}36%{opacity:.9;transform:scale(1.035)}55%{opacity:.3}}
@keyframes dzGlitch{0%,90%,100%{transform:translate(0,0)}91%{transform:translate(2px,-1px)}93%{transform:translate(-2px,1px)}95%{transform:translate(1px,1px)}}
@keyframes dzTwinkle{0%,100%{opacity:.15}50%{opacity:1}}
@keyframes dzShine{0%,70%{transform:translateX(-120%) skewX(-15deg)}100%{transform:translateX(320%) skewX(-15deg)}}
@keyframes dzFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
@keyframes dzTip{0%,100%{opacity:.6}50%{opacity:1}}
@keyframes dzShift{0%,49%{opacity:1}50%,100%{opacity:0}}
@keyframes dzPop{0%{transform:scale(1.18)}100%{transform:scale(1)}}
@keyframes dzBlink{0%,100%{opacity:.2}50%{opacity:1}}
.dz-b .a-comet,.dz-b .a-plasma{animation:dzSpin 3.2s linear infinite}
.dz-b .a-plasma{animation-duration:5s}
.dz-b .a-aurora{animation:dzSpin 12s linear infinite}
.dz-b .a-circuit{animation:dzSpinBack 16s linear infinite}
.dz-b .a-blink{animation:dzBlink 1.4s ease-in-out infinite}
.dz-b .a-sonar{animation:dzSonar 3s ease-out infinite}
.dz-b .a-sonar2{animation:dzSonar 3s ease-out 1s infinite}
.dz-b .a-sonar3{animation:dzSonar 3s ease-out 2s infinite}
.dz-b .a-heart{animation:dzHeart 1.6s ease-in-out infinite}
.dz-b .a-glitch{animation:dzGlitch 4s steps(1) infinite}
.dz-b .a-twinkle{animation:dzTwinkle 2.2s ease-in-out infinite}
.dz-b .a-shine{animation:dzShine 5s ease-in-out infinite}
.dz-b .a-float{animation:dzFloat 4s ease-in-out infinite}
.dz-b .a-tip{animation:dzTip 1.2s ease-in-out infinite}
.dz-b .a-shift{animation:dzShift .25s steps(1) infinite}
.dz-b .a-pop{animation:dzPop .35s ease-out}
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

// Mix two #rrggbb colors (t 0..1).
function mix(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

// Animated layers around/inside a bubble, drawn in the theme's colors.
function Fx({ fx, col, col2, size, calm }) {
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
    case 'comet':
      return (
        <div className="absolute -inset-[3px] rounded-full a-orbit" style={{ background: `conic-gradient(from 0deg, transparent 0deg 250deg, ${col}00 250deg, ${col}cc 350deg, #fff 358deg, transparent 360deg)`, WebkitMask: 'radial-gradient(circle, transparent 62%, #000 64%)', mask: 'radial-gradient(circle, transparent 62%, #000 64%)' }} />
      );
    case 'radar':
      return <div className="absolute inset-[3%] rounded-full a-radar opacity-60" style={{ background: `conic-gradient(from 0deg, transparent 0deg 290deg, ${col}00 290deg, ${col}88 358deg, transparent 360deg)` }} />;
    case 'ripple':
      return <>{ring('a-ripple')}{ring('a-ripple2')}</>;
    case 'sonar':
      return <>{ring('a-sonar', { border: `1px solid ${col}` })}{ring('a-sonar2', { border: `1px solid ${col}` })}{ring('a-sonar3', { border: `1px solid ${col}` })}</>;
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
    case 'plasma':
      return (
        <div className="absolute -inset-[2px] rounded-full a-plasma opacity-90" style={{ background: `conic-gradient(${col}, ${col2}, ${col}00, ${col}, ${col2}, ${col}00, ${col})`, WebkitMask: 'radial-gradient(circle, transparent 64%, #000 66%)', mask: 'radial-gradient(circle, transparent 64%, #000 66%)' }} />
      );
    case 'aurora':
      return (
        <div className="absolute -inset-2 rounded-full a-aurora opacity-70" style={{ background: `conic-gradient(${col}aa, ${col2}66, #ffffff22, ${col}aa, ${col2}66, ${col}aa)`, WebkitMask: 'radial-gradient(circle, transparent 55%, #000 70%, transparent 78%)', mask: 'radial-gradient(circle, transparent 55%, #000 70%, transparent 78%)' }} />
      );
    case 'circuit':
      return (
        <>
          <svg viewBox="0 0 100 100" className="absolute inset-0 a-circuit"><circle cx="50" cy="50" r="47.5" fill="none" stroke={col} strokeWidth="2" strokeDasharray="1.5 3.5 8 3.5" strokeOpacity=".8" /></svg>
          <svg viewBox="0 0 100 100" className="absolute inset-0 a-blink"><circle cx="50" cy="3" r="1.6" fill="#fff" /><circle cx="97" cy="50" r="1.6" fill={col} /><circle cx="3" cy="50" r="1.6" fill={col} /></svg>
        </>
      );
    case 'heartbeat':
      return <div className="absolute -inset-1 rounded-full a-heart" style={{ boxShadow: `0 0 ${Math.round(size / 3)}px ${col}, 0 0 4px ${col}` }} />;
    case 'starfield':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 pointer-events-none">
          {[[22, 30], [74, 26], [30, 72], [70, 74], [50, 14], [86, 52], [14, 52], [58, 88]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i % 3 ? 0.9 : 1.3} fill={i % 2 ? '#fff' : col} className="a-twinkle" style={{ animationDelay: `${(i * 0.37) % 2.2}s` }} />
          ))}
        </svg>
      );
    case 'glitch':
      return (
        <>
          <div className="absolute inset-0 rounded-full a-glitch" style={{ border: `1.5px solid ${col}`, boxShadow: `2px 0 0 #ff2bd6aa, -2px 0 0 #2bf0ffaa` }} />
          <div className="absolute inset-[4%] rounded-full opacity-20" style={{ background: `repeating-linear-gradient(0deg, ${col} 0 1px, transparent 1px 3px)` }} />
        </>
      );
    default:
      return null;
  }
}

const GLOW_MULT = [0.5, 1, 1.6, 2.4];
const hex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

function Bubble({ m, v, peak, best, size, c, opacity, fx, valueFx, glow = 1, ex = {}, shift = false, calm, live }) {
  const lv = level(m, v);
  const f = fraction(m, v);
  const base = lv === 2 ? HOT : lv === 1 ? WARN : ex.colorShift ? mix(c.accent, c.label.length === 7 ? c.label : '#ffffff', f * 0.85) : c.accent;
  const col = base;
  const col2 = c.label.length === 7 ? c.label : '#ffffff';
  const d = display(m, v);
  const alpha = Math.round(255 * opacity / 100).toString(16).padStart(2, '0');
  const g = GLOW_MULT[glow] ?? 1;
  const react = ex.reactive && live ? 0.6 + f * 1.4 : 1;
  const pk = m.id === 'boost' && peak != null ? (135 + 270 * fraction(m, peak)) * Math.PI / 180 : null;
  const tip = (135 + 270 * f) * Math.PI / 180;
  // Flash/pop only on a real jump (4% of the range), not every tiny wiggle.
  const prev = useRef(v);
  const [flashN, setFlashN] = useState(0);
  useEffect(() => {
    const jump = v != null && prev.current != null && Math.abs(v - prev.current) > (m.max - m.min) * 0.04;
    if ((valueFx === 'flash' || valueFx === 'pulse') && jump) setFlashN((n) => n + 1);
    if (v != null && (prev.current == null || jump)) prev.current = v;
  }, [v, valueFx, m.max, m.min]);
  const big = d.text.length > 4 ? 21 : 26;
  const glowPx = Math.round((size / 5) * g * react);
  const showBest = ex.peaks && live && best != null && m.kind !== 'time';
  return (
    <div className={`relative rounded-full ${live ? '' : 'opacity-80'}`} style={{ width: size, height: size }}>
      {/* Static outer glow (painted once per change). */}
      <div className="absolute inset-0 rounded-full" style={{ boxShadow: `0 0 ${glowPx}px ${col}${hex2(85 * Math.min(2, g))}, 0 6px 16px rgba(0,0,0,.45)${ex.innerGlow ? `, inset 0 0 ${Math.round(size / 6 * g)}px ${col}66` : ''}` }} />
      {ex.halo && <div className="absolute -inset-[5px] rounded-full" style={{ border: `1px solid ${col}66`, boxShadow: `0 0 ${Math.round(size / 3 * g)}px ${col}44` }} />}
      {ex.neonRim && <div className="absolute -inset-[1px] rounded-full" style={{ border: `2px solid ${col}`, boxShadow: `0 0 ${Math.round(6 * g)}px ${col}, inset 0 0 ${Math.round(4 * g)}px ${col}88` }} />}
      {lv === 2 && !calm && <div className="absolute -inset-1 rounded-full a-hot" style={{ boxShadow: `0 0 ${Math.round(size / 3 * g)}px ${HOT}, 0 0 ${Math.round(size / 8)}px ${HOT}` }} />}
      {shift && !calm && <div className="absolute -inset-1 rounded-full a-shift" style={{ border: `3px solid ${HOT}`, boxShadow: `0 0 ${Math.round(size / 3)}px ${HOT}` }} />}
      {live && <Fx fx={fx} col={col} col2={col2} size={size} calm={calm} />}
      <svg viewBox="0 0 100 100" width={size} height={size} className="relative" aria-label={`${m.label} ${d.text} ${d.unit}`}>
        <circle cx="50" cy="50" r="47" fill={`${c.bg}${alpha}`} stroke={`${col}55`} strokeWidth="1.2" />
        {ex.ticks && Array.from({ length: 19 }, (_, i) => {
          const a = (135 + i * 15) * Math.PI / 180, r1 = i % 3 ? 44.5 : 43, r2 = 46;
          return <line key={i} x1={50 + r1 * Math.cos(a)} y1={50 + r1 * Math.sin(a)} x2={50 + r2 * Math.cos(a)} y2={50 + r2 * Math.sin(a)} stroke={live && i / 18 <= f ? col : c.track} strokeWidth={i % 3 ? 0.8 : 1.4} strokeOpacity=".9" />;
        })}
        <circle cx="50" cy="50" r={R} fill="none" stroke={c.track} strokeOpacity="0.5" strokeWidth="7" strokeLinecap="round"
          strokeDasharray={`${C * 0.75} ${C}`} transform="rotate(135 50 50)" />
        {!live && (
          <g className="a-idle"><circle cx="50" cy="50" r="47" fill="none" stroke="none" /><circle cx="50" cy="50" r={R} fill="none" stroke={c.accent} strokeOpacity=".55" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${C * 0.12} ${C}`} className="a-idle2" /></g>
        )}
        {live && f > 0.002 && (
          <g>
            {/* Cheap glow: wide faint strokes under the arc instead of a blur filter. */}
            <circle cx="50" cy="50" r={R} fill="none" stroke={col} strokeOpacity={Math.min(0.5, 0.14 * g * react)} strokeWidth={11 + 4 * g} strokeLinecap="round" strokeDasharray={`${C * 0.75 * f} ${C}`} transform="rotate(135 50 50)" />
            <circle cx="50" cy="50" r={R} fill="none" stroke={col} strokeOpacity={Math.min(0.7, 0.28 * g * react)} strokeWidth="10.5" strokeLinecap="round" strokeDasharray={`${C * 0.75 * f} ${C}`} transform="rotate(135 50 50)" />
            <circle cx="50" cy="50" r={R} fill="none" stroke={col} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${C * 0.75 * f} ${C}`} transform="rotate(135 50 50)"
              style={{ transition: calm ? undefined : 'stroke-dasharray .25s linear' }} />
            {glow >= 2 && <circle cx="50" cy="50" r={R} fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="1.6" strokeLinecap="round" strokeDasharray={`${C * 0.75 * f} ${C}`} transform="rotate(135 50 50)" />}
          </g>
        )}
        {ex.tipSpark && live && f > 0.01 && (
          <g className={calm ? '' : 'a-tip'}>
            <circle cx={50 + R * Math.cos(tip)} cy={50 + R * Math.sin(tip)} r="6" fill={col} fillOpacity=".35" />
            <circle cx={50 + R * Math.cos(tip)} cy={50 + R * Math.sin(tip)} r="2.6" fill="#fff" />
          </g>
        )}
        {pk != null && live && <circle cx={50 + R * Math.cos(pk)} cy={50 + R * Math.sin(pk)} r="3.2" fill={c.text} stroke={col} strokeWidth="1.5" />}
        <text x="50" y="35" textAnchor="middle" fontSize="10.5" fontWeight="600" letterSpacing="1.2" fill={c.label}>{m.label.toUpperCase()}</text>
        {valueFx === 'glow' && live && (
          <text x="50" y="60" textAnchor="middle" fontSize={big} fontWeight="800" className={`speed-font ${calm ? '' : 'a-vglow'}`} fill="none" stroke={col} strokeWidth={4 + g} strokeOpacity=".9" strokeLinejoin="round" opacity=".3">{d.text}</text>
        )}
        {valueFx === 'chroma' && live && (
          <>
            <text x="48.8" y="60" textAnchor="middle" fontSize={big} fontWeight="800" className="speed-font" fill="#ff2bd6" opacity=".55">{d.text}</text>
            <text x="51.2" y="60" textAnchor="middle" fontSize={big} fontWeight="800" className="speed-font" fill="#2bf0ff" opacity=".55">{d.text}</text>
          </>
        )}
        {valueFx === 'outline' && live ? (
          <>
            <text x="50" y="60" textAnchor="middle" fontSize={big} fontWeight="800" className="speed-font" fill="none" stroke={col} strokeWidth={3 + g} opacity=".35" strokeLinejoin="round">{d.text}</text>
            <text x="50" y="60" textAnchor="middle" fontSize={big} fontWeight="800" className="speed-font" fill="none" stroke={lv ? col : c.text} strokeWidth="1.2">{d.text}</text>
          </>
        ) : (
          <text key={valueFx === 'pulse' ? flashN : 0} x="50" y="60" textAnchor="middle" fontSize={big} fontWeight="800"
            className={`speed-font ${valueFx === 'flicker' && live && !calm ? 'a-flicker' : ''} ${valueFx === 'pulse' && flashN && !calm ? 'a-pop' : ''}`} fill={lv ? col : c.text}>{d.text}</text>
        )}
        {valueFx === 'flash' && flashN > 0 && !calm && (
          <text key={flashN} x="50" y="60" textAnchor="middle" fontSize={big} fontWeight="800" className="speed-font a-flash" fill={col}>{d.text}</text>
        )}
        <text x="50" y="77" textAnchor="middle" fontSize="9.5" fill={c.label}>{live ? d.unit : 'no signal'}</text>
        {showBest && <text x="50" y="88" textAnchor="middle" fontSize="7" fill={c.label} opacity=".85">▲ {display(m, best).text}</text>}
      </svg>
      {ex.scanlines && <div className="absolute inset-[4%] rounded-full pointer-events-none opacity-25" style={{ background: `repeating-linear-gradient(0deg, ${col}66 0 1px, transparent 1px 3px)` }} />}
      {ex.shine && !calm && (
        <div className="absolute inset-[3%] rounded-full overflow-hidden pointer-events-none">
          <div className="absolute inset-y-0 w-1/3 a-shine" style={{ background: 'linear-gradient(100deg, transparent, rgba(255,255,255,.28), transparent)' }} />
        </div>
      )}
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
  const ex = prefs.extras || {};
  // Highest value of each gauge this session (for the "show highest" extra).
  const best = useRef({});
  if (live && s.values) for (const [k, v] of Object.entries(s.values)) if (v != null && (best.current[k] == null || v > best.current[k])) best.current[k] = v;
  // Shift light: every bubble flashes red near redline.
  const rpmM = METRICS.find((x) => x.id === 'rpm');
  const shift = !!ex.shiftLight && live && (s.values?.rpm ?? 0) >= rpmM.warn;
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
            <div className={ex.float && !calm ? 'a-float' : ''} style={ex.float ? { animationDelay: `${(i * 0.53) % 4}s` } : undefined}>
              <Bubble m={m} v={live ? s.values?.[m.id] : null} peak={s.peakBoost} best={best.current[m.id]} size={size} c={c} opacity={prefs.opacity}
                fx={fx} valueFx={prefs.valueFx} glow={prefs.glow ?? 1} ex={ex} shift={shift} calm={calm} live={live} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
