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
@keyframes dzTrace{from{offset-distance:0%}to{offset-distance:100%}}
@keyframes dzMarch{to{stroke-dashoffset:-100}}
@keyframes dzLattice{to{transform:translate(18px,31.5px)}}
@keyframes dzCharge{0%{transform:translateY(480%);opacity:0}20%{opacity:1}100%{transform:translateY(-120%);opacity:0}}
.dz-b .a-trace{animation:dzTrace 3.6s linear infinite}
.dz-b .a-march{animation:dzMarch 2.4s linear infinite}
.dz-b .a-march-slow{animation:dzMarch 6s linear infinite}
.dz-b .a-lattice{animation:dzLattice 6s linear infinite}
.dz-b .a-charge{animation:dzCharge 1.8s ease-in infinite}
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
    case 'tracer': case 'stream': case 'lattice': case 'charge':
      return <ShapeFx fx={fx} col={col} col2={col2} w={size} h={size} def={SHAPE_DEF.circle} calm={calm} />;
    default:
      return null;
  }
}

const GLOW_MULT = [0.5, 1, 1.6, 2.4];
const hex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

// ---------------------------------------------------------------- shapes
// Outlines as points in a viewBox (100x100, the bar is 180x64). The point order is the
// direction the progress glow travels around the edge (starts bottom-left, goes clockwise).
const CIRCLE_PTS = Array.from({ length: 36 }, (_, i) => { const a = (135 + i * 10) * Math.PI / 180; return [50 + 46 * Math.cos(a), 50 + 46 * Math.sin(a)]; });
const SHAPE_DEF = {
  circle: { vb: [100, 100], pts: CIRCLE_PTS },
  hex: { vb: [100, 100], pts: [[27, 94], [4, 50], [27, 6], [73, 6], [96, 50], [73, 94]] },
  octagon: { vb: [100, 100], pts: [[31, 96], [4, 69], [4, 31], [31, 4], [69, 4], [96, 31], [96, 69], [69, 96]] },
  diamond: { vb: [100, 100], pts: [[50, 97], [3, 50], [50, 3], [97, 50]], text: 0.8 },
  cyber: { vb: [100, 100], pts: [[16, 96], [4, 84], [4, 16], [16, 4], [84, 4], [96, 16], [96, 84], [84, 96]] },
  shield: { vb: [100, 100], pts: [[50, 97], [12, 76], [6, 18], [50, 4], [94, 18], [88, 76]] },
  bar: { vb: [180, 64], pts: [[12, 60], [4, 52], [4, 12], [12, 4], [168, 4], [176, 12], [176, 52], [168, 60]], bar: true },
};
const shapeDims = (shape, s) => (shape === 'bar' ? { w: Math.round(s * 1.9), h: Math.round(s * 0.66) } : { w: s, h: s });
const pathOf = (pts, sx = 1, sy = 1) => `M${pts.map(([x, y]) => `${(x * sx).toFixed(1)} ${(y * sy).toFixed(1)}`).join(' L')} Z`;
const shrink = (pts, [cx, cy], k) => pts.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
const clipOf = (pts, [W, H]) => `polygon(${pts.map(([x, y]) => `${(x / W * 100).toFixed(1)}% ${(y / H * 100).toFixed(1)}%`).join(',')})`;
const latticeUrl = (col) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='24' height='42' viewBox='0 0 24 42'><path d='M12 0 L24 7 L24 21 L12 28 L0 21 L0 7 Z M12 28 L12 42' fill='none' stroke='${col}' stroke-width='1'/></svg>`)}")`;

// Animations that work on any shape: drawn along the outline or clipped inside it.
function ShapeFx({ fx, col, col2, w, h, def, calm }) {
  if (calm || fx === 'none') return null;
  const { vb, pts } = def;
  const d = pathOf(pts);
  const px = pathOf(pts, w / vb[0], h / vb[1]);
  const clip = clipOf(pts, vb);
  const outline = (cls, props = {}, key) => (
    <svg key={key} viewBox={`0 0 ${vb[0]} ${vb[1]}`} width={w} height={h} className={`absolute inset-0 overflow-visible ${cls}`}>
      <path d={d} fill="none" stroke={col} strokeLinejoin="round" {...props} />
    </svg>
  );
  const inside = (children) => <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ clipPath: clip }}>{children}</div>;
  const dot = (i, sz, op) => (
    <div key={i} className="absolute left-0 top-0 rounded-full a-trace" style={{ width: sz, height: sz, offsetPath: `path('${px}')`, offsetRotate: '0deg', animationDelay: `${-i * 0.07}s`, opacity: op, background: i ? col : '#fff', boxShadow: `0 0 ${sz + 4}px ${sz / 2}px ${col}` }} />
  );
  switch (fx) {
    case 'breathe': return outline('a-breathe', { strokeWidth: 8, strokeOpacity: 0.5 });
    case 'heartbeat': return outline('a-heart', { strokeWidth: 7, strokeOpacity: 0.6 });
    case 'ripple': return <>{outline('a-ripple', { strokeWidth: 1.6 }, 1)}{outline('a-ripple2', { strokeWidth: 1.6 }, 2)}</>;
    case 'sonar': return <>{outline('a-sonar', { strokeWidth: 1 }, 1)}{outline('a-sonar2', { strokeWidth: 1 }, 2)}{outline('a-sonar3', { strokeWidth: 1 }, 3)}</>;
    case 'orbit': case 'tracer': return dot(0, 6, 1);
    case 'comet': return <>{[0, 1, 2, 3, 4, 5].map((i) => dot(i, 7 - i, 1 - i * 0.15))}</>;
    case 'reactor': case 'circuit': case 'stream':
      return outline('', { pathLength: 100, strokeWidth: fx === 'stream' ? 2.4 : 1.6, strokeDasharray: fx === 'circuit' ? '1 2 5 2' : '6 6', strokeOpacity: 0.85, className: fx === 'reactor' ? 'a-march-slow' : 'a-march' });
    case 'radar': return inside(<div className="absolute -inset-1/4 a-radar opacity-60" style={{ background: `conic-gradient(from 0deg, transparent 0deg 290deg, ${col}88 358deg, transparent 360deg)` }} />);
    case 'plasma': case 'aurora':
      return inside(<div className={`absolute -inset-1/4 ${fx === 'plasma' ? 'a-plasma' : 'a-aurora'} opacity-60`} style={{ background: `conic-gradient(${col}, ${col2}55, transparent, ${col}, ${col2}55, transparent, ${col})` }} />);
    case 'holo':
      return inside(<div className="absolute inset-0 a-holo"><div className="absolute inset-0 opacity-25" style={{ background: `repeating-linear-gradient(0deg, ${col}55 0 1px, transparent 1px 4px)` }} /><div className="absolute inset-x-0 h-1/3 a-scan" style={{ background: `linear-gradient(180deg, transparent, ${col}55, transparent)` }} /></div>);
    case 'starfield':
      return inside(<svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">{[[22, 30], [74, 26], [30, 72], [70, 74], [50, 14], [86, 52], [14, 52], [58, 88]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i % 3 ? 0.9 : 1.3} fill={i % 2 ? '#fff' : col} className="a-twinkle" style={{ animationDelay: `${(i * 0.37) % 2.2}s` }} />)}</svg>);
    case 'glitch':
      return <>{outline('a-glitch', { strokeWidth: 2, style: { filter: 'none' } })}{inside(<div className="absolute inset-0 opacity-20" style={{ background: `repeating-linear-gradient(0deg, ${col} 0 1px, transparent 1px 3px)` }} />)}</>;
    case 'lattice':
      return inside(<div className="absolute -inset-[30%] a-lattice opacity-35" style={{ backgroundImage: latticeUrl(col), backgroundSize: '18px 31.5px' }} />);
    case 'charge':
      return inside(<>{[0, 1, 2].map((i) => <div key={i} className="absolute inset-x-0 h-[22%] a-charge" style={{ animationDelay: `${i * 0.6}s`, background: `linear-gradient(0deg, transparent, ${col}66, transparent)` }} />)}</>);
    default: return null;
  }
}

// A gauge in any non-round shape: the progress glow runs around its edge (or fills the bar).
function ShapeBubble({ shape, m, v, peak, best, size, c, opacity, fx, valueFx, glow = 1, ex = {}, shift = false, calm, live }) {
  const def = SHAPE_DEF[shape] || SHAPE_DEF.hex;
  const [W, H] = def.vb;
  const { w, h } = shapeDims(shape, size);
  const lv = level(m, v);
  const f = fraction(m, v);
  const col = lv === 2 ? HOT : lv === 1 ? WARN : ex.colorShift ? mix(c.accent, c.label.length === 7 ? c.label : '#ffffff', f * 0.85) : c.accent;
  const col2 = c.label.length === 7 ? c.label : '#ffffff';
  const d = display(m, v);
  const alpha = Math.round(255 * opacity / 100).toString(16).padStart(2, '0');
  const g = GLOW_MULT[glow] ?? 1;
  const react = ex.reactive && live ? 0.6 + f * 1.4 : 1;
  const body = pathOf(def.pts);
  const inner = pathOf(shrink(def.pts, [W / 2, H / 2], def.bar ? 1 : 0.86));
  const prev = useRef(v);
  const [flashN, setFlashN] = useState(0);
  useEffect(() => {
    const jump = v != null && prev.current != null && Math.abs(v - prev.current) > (m.max - m.min) * 0.04;
    if ((valueFx === 'flash' || valueFx === 'pulse') && jump) setFlashN((n) => n + 1);
    if (v != null && (prev.current == null || jump)) prev.current = v;
  }, [v, valueFx, m.max, m.min]);
  const tk = def.text || 1;
  const big = (d.text.length > 4 ? 21 : 26) * tk;
  // Text spots: centered for shapes, label/unit left + number right for the bar.
  const T = shape === 'diamond' ? { lx: 50, ly: 40, la: 'middle', vx: 50, vy: 60, va: 'middle', ux: 50, uy: 72, ua: 'middle', by: 88 } : def.bar ? { lx: 14, ly: 22, la: 'start', vx: 166, vy: 38, va: 'end', ux: 14, uy: 36, ua: 'start', by: 50 } : { lx: 50, ly: 35, la: 'middle', vx: 50, vy: 60, va: 'middle', ux: 50, uy: 77, ua: 'middle', by: 88 };
  const valueText = ({ key, ...props }) => <text key={key} x={T.vx} y={T.vy} textAnchor={T.va} fontSize={def.bar ? 28 : big} fontWeight="800" className="speed-font" {...props}>{d.text}</text>;
  const barW = 152 * f;
  return (
    <div className={`relative ${live ? '' : 'opacity-80'}`} style={{ width: w, height: h }}>
      {live && <ShapeFx fx={fx} col={col} col2={col2} w={w} h={h} def={def} calm={calm} />}
      <svg viewBox={`0 0 ${W} ${H}`} width={w} height={h} className="relative overflow-visible" aria-label={`${m.label} ${d.text} ${d.unit}`}>
        {/* Glow: wide faint strokes of the outline (no blur filters). */}
        <path d={body} fill="none" stroke={col} strokeOpacity={Math.min(0.35, 0.1 * g * react)} strokeWidth={14 * g * react} strokeLinejoin="round" />
        <path d={body} fill="none" stroke={col} strokeOpacity={Math.min(0.5, 0.18 * g * react)} strokeWidth={6 * g} strokeLinejoin="round" />
        {lv === 2 && !calm && <path d={body} fill="none" stroke={HOT} strokeWidth={10 * g} strokeOpacity=".7" strokeLinejoin="round" className="a-hot" />}
        {shift && !calm && <path d={body} fill="none" stroke={HOT} strokeWidth="5" strokeLinejoin="round" className="a-shift" />}
        {ex.halo && <path d={pathOf(shrink(def.pts, [W / 2, H / 2], 1.08))} fill="none" stroke={col} strokeOpacity=".45" strokeWidth="1" strokeLinejoin="round" />}
        <path d={body} fill={`${c.bg}${alpha}`} stroke={ex.neonRim ? col : `${col}55`} strokeWidth={ex.neonRim ? 2.2 : 1.2} strokeLinejoin="round" />
        {ex.innerGlow && <path d={inner} fill="none" stroke={col} strokeOpacity=".18" strokeWidth="10" strokeLinejoin="round" />}
        {!def.bar && (
          <>
            <path d={inner} fill="none" stroke={c.track} strokeOpacity=".5" strokeWidth="5" strokeLinejoin="round" pathLength="100" />
            {live && f > 0.002 && (
              <>
                <path d={inner} fill="none" stroke={col} strokeOpacity={Math.min(0.6, 0.25 * g * react)} strokeWidth={9 + 3 * g} strokeLinejoin="round" strokeLinecap="round" pathLength="100" strokeDasharray={`${f * 100} 100`} />
                <path d={inner} fill="none" stroke={col} strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" pathLength="100" strokeDasharray={`${f * 100} 100`} style={{ transition: calm ? undefined : 'stroke-dasharray .25s linear' }} />
                {glow >= 2 && <path d={inner} fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="1.4" strokeLinejoin="round" pathLength="100" strokeDasharray={`${f * 100} 100`} />}
              </>
            )}
            {!live && <path d={inner} fill="none" stroke={c.accent} strokeOpacity=".55" strokeWidth="3" pathLength="100" strokeDasharray="10 90" className="a-march" />}
          </>
        )}
        {def.bar && (
          <>
            <rect x="14" y="46" width="152" height="7" rx="3.5" fill={c.track} fillOpacity=".5" />
            {live && f > 0.002 && <>
              <rect x="14" y="44" width={barW} height="11" rx="5.5" fill={col} fillOpacity={Math.min(0.5, 0.2 * g * react)} />
              <rect x="14" y="46" width={barW} height="7" rx="3.5" fill={col} style={{ transition: calm ? undefined : 'width .25s linear' }} />
              {glow >= 2 && <rect x="14" y="49" width={barW} height="1.2" fill="#fff" fillOpacity=".6" />}
              {ex.tipSpark && <circle cx={14 + barW} cy="49.5" r="4" fill="#fff" className={calm ? '' : 'a-tip'} />}
            </>}
            {ex.ticks && Array.from({ length: 11 }, (_, i) => <line key={i} x1={14 + i * 15.2} y1="57" x2={14 + i * 15.2} y2={i % 5 ? 59 : 61} stroke={live && i / 10 <= f ? col : c.track} strokeWidth="1" />)}
            {!live && <rect x="14" y="46" width="40" height="7" rx="3.5" fill={c.accent} fillOpacity=".5" className="a-idle2" />}
          </>
        )}
        <text x={T.lx} y={T.ly} textAnchor={T.la} fontSize={10.5 * (def.bar ? 1.05 : tk)} fontWeight="600" letterSpacing="1.2" fill={c.label}>{m.label.toUpperCase()}</text>
        {valueFx === 'glow' && live && valueText({ fill: 'none', stroke: col, strokeWidth: 4 + g, strokeOpacity: 0.9, strokeLinejoin: 'round', opacity: 0.3, className: `speed-font ${calm ? '' : 'a-vglow'}` })}
        {valueFx === 'chroma' && live && <>{valueText({ x: T.vx - 1.2, fill: '#ff2bd6', opacity: 0.55 })}{valueText({ x: T.vx + 1.2, fill: '#2bf0ff', opacity: 0.55 })}</>}
        {valueFx === 'outline' && live
          ? <>{valueText({ fill: 'none', stroke: col, strokeWidth: 3 + g, opacity: 0.35, strokeLinejoin: 'round' })}{valueText({ fill: 'none', stroke: lv ? col : c.text, strokeWidth: 1.2 })}</>
          : valueText({ key: valueFx === 'pulse' ? flashN : 0, fill: lv ? col : c.text, className: `speed-font ${valueFx === 'flicker' && live && !calm ? 'a-flicker' : ''} ${valueFx === 'pulse' && flashN && !calm ? 'a-pop' : ''}` })}
        {valueFx === 'flash' && flashN > 0 && !calm && valueText({ key: flashN, fill: col, className: 'speed-font a-flash' })}
        <text x={T.ux} y={T.uy} textAnchor={T.ua} fontSize={9.5 * (def.bar ? 1 : tk)} fill={c.label}>{live ? d.unit : 'no signal'}</text>
        {ex.peaks && live && best != null && m.kind !== 'time' && !def.bar && shape !== 'diamond' && <text x="50" y={T.by} textAnchor="middle" fontSize="7" fill={c.label} opacity=".85">▲ {display(m, best).text}</text>}
        {ex.peaks && live && best != null && def.bar && <text x="44" y="36" textAnchor="start" fontSize="8" fill={c.label} opacity=".85">▲ {display(m, best).text}</text>}
        {m.id === 'boost' && peak != null && live && def.bar && <rect x={14 + 152 * fraction(m, peak) - 1} y="43" width="2" height="13" fill={c.text} />}
      </svg>
      {(ex.scanlines || ex.shine) && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ clipPath: clipOf(def.pts, def.vb) }}>
          {ex.scanlines && <div className="absolute inset-0 opacity-25" style={{ background: `repeating-linear-gradient(0deg, ${col}66 0 1px, transparent 1px 3px)` }} />}
          {ex.shine && !calm && <div className="absolute inset-y-0 w-1/3 a-shine" style={{ background: 'linear-gradient(100deg, transparent, rgba(255,255,255,.28), transparent)' }} />}
        </div>
      )}
    </div>
  );
}

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

  const shape = prefs.shape || 'circle';
  const sizeOf = (m) => (m.big ? Math.round(base * 1.25) : base);
  const posOf = (m, i) => {
    const p = prefs.pos[m.id];
    if (p && dim.w) return { x: p.x * dim.w, y: p.y * dim.h };
    // Default: columns down the left side (the boost bubble is bigger), wrapping when full.
    const top = dim.h * 0.2, room = Math.max(base, dim.h * 0.72);
    let x = 10, y = top;
    const hOf = (x2) => shapeDims(shape, sizeOf(x2)).h, colW = shapeDims(shape, Math.round(base * 1.25)).w;
    for (let k = 0; k < i; k++) { y += hOf(shown[k]) + 10; if (y + hOf(shown[k + 1] || m) > top + room) { y = top; x += colW + 10; } }
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
    const sd = shapeDims(shape, size);
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) { if (m.id === 'boost') resetPeak(); return; }
    const x = Math.max(0, Math.min(dim.w - sd.w, d.cx)), y = Math.max(0, Math.min(dim.h - sd.h, d.cy));
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
        const G = shape === 'circle' ? Bubble : ShapeBubble;
        const d = drag.current?.id === m.id && drag.current.moved ? { x: drag.current.cx, y: drag.current.cy } : p;
        return (
          <div key={m.id} className={`absolute touch-none select-none ${locked ? 'pointer-events-none' : 'pointer-events-auto cursor-grab'}`}
            style={{ left: d.x, top: d.y }}
            onPointerDown={(e) => down(e, m, p.x, p.y)} onPointerMove={move} onPointerUp={() => up(m, size)} onPointerCancel={() => { drag.current = null; }}>
            <div className={ex.float && !calm ? 'a-float' : ''} style={ex.float ? { animationDelay: `${(i * 0.53) % 4}s` } : undefined}>
              <G shape={shape} m={m} v={live ? s.values?.[m.id] : null} peak={s.peakBoost} best={best.current[m.id]} size={size} c={c} opacity={prefs.opacity}
                fx={fx} valueFx={prefs.valueFx} glow={prefs.glow ?? 1} ex={ex} shift={shift} calm={calm} live={live} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
