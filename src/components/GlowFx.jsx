import { useEffect, useRef, useState } from 'react';

// Shared futuristic glow animations (engine gauges and other parts of the app).
// Battery: CSS transform/opacity/offset animations only, no blur filters, no per-frame JS.
export const FX_CSS = `
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

// ---------------------------------------------------------------- shapes
// Outlines as points in a viewBox (100x100, the bar is 180x64). The point order is the
// direction the progress glow travels around the edge (starts bottom-left, goes clockwise).
const CIRCLE_PTS = Array.from({ length: 36 }, (_, i) => { const a = (135 + i * 10) * Math.PI / 180; return [50 + 46 * Math.cos(a), 50 + 46 * Math.sin(a)]; });
export const SHAPE_DEF = {
  circle: { vb: [100, 100], pts: CIRCLE_PTS },
  hex: { vb: [100, 100], pts: [[27, 94], [4, 50], [27, 6], [73, 6], [96, 50], [73, 94]] },
  octagon: { vb: [100, 100], pts: [[31, 96], [4, 69], [4, 31], [31, 4], [69, 4], [96, 31], [96, 69], [69, 96]] },
  diamond: { vb: [100, 100], pts: [[50, 97], [3, 50], [50, 3], [97, 50]], text: 0.8 },
  cyber: { vb: [100, 100], pts: [[16, 96], [4, 84], [4, 16], [16, 4], [84, 4], [96, 16], [96, 84], [84, 96]] },
  shield: { vb: [100, 100], pts: [[50, 97], [12, 76], [6, 18], [50, 4], [94, 18], [88, 76]] },
  bar: { vb: [180, 64], pts: [[12, 60], [4, 52], [4, 12], [12, 4], [168, 4], [176, 12], [176, 52], [168, 60]], bar: true },
};
export const shapeDims = (shape, s) => (shape === 'bar' ? { w: Math.round(s * 1.9), h: Math.round(s * 0.66) } : { w: s, h: s });
export const pathOf = (pts, sx = 1, sy = 1) => `M${pts.map(([x, y]) => `${(x * sx).toFixed(1)} ${(y * sy).toFixed(1)}`).join(' L')} Z`;
export const shrink = (pts, [cx, cy], k) => pts.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
export const clipOf = (pts, [W, H]) => `polygon(${pts.map(([x, y]) => `${(x / W * 100).toFixed(1)}% ${(y / H * 100).toFixed(1)}%`).join(',')})`;
const latticeUrl = (col) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='24' height='42' viewBox='0 0 24 42'><path d='M12 0 L24 7 L24 21 L12 28 L0 21 L0 7 Z M12 28 L12 42' fill='none' stroke='${col}' stroke-width='1'/></svg>`)}")`;

// Animations that work on any shape: drawn along the outline or clipped inside it.
export function ShapeFx({ fx, col, col2, w, h, def, calm }) {
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


// Rounded rectangle outline as points, going clockwise from the bottom-left corner.
function roundRect(w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  const pts = [];
  const arc = (cx, cy, a0) => { for (let k = 0; k <= 4; k++) { const a = (a0 + k * 22.5) * Math.PI / 180; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
  arc(r, h - r, 90); arc(r, r, 180); arc(w - r, r, 270); arc(w - r, h - r, 0);
  return pts;
}

// Drop-in glow animation layer for any element (give the parent position: relative).
// shape: 'circle' or 'rect' (with radius). fx: list of animation ids. Pass calm to switch off (battery saver).
export default function FxLayer({ shape = 'circle', radius = 16, fx = [], col = '#4c8bf5', col2 = '#ffffff', calm = false, inset = 0 }) {
  const ref = useRef(null);
  const [dim, setDim] = useState(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setDim({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const list = fx.filter((f) => f && f !== 'none');
  const def = !dim ? null : shape === 'circle' ? SHAPE_DEF.circle : { vb: [dim.w, dim.h], pts: roundRect(dim.w, dim.h, radius) };
  return (
    <div ref={ref} className="absolute pointer-events-none dz-b" style={{ inset }} aria-hidden="true">
      <style>{FX_CSS}</style>
      {def && !calm && list.map((f) => <ShapeFx key={f} fx={f} col={col} col2={col2} w={dim.w} h={dim.h} def={def} calm={calm} />)}
    </div>
  );
}
