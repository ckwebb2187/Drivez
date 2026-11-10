import { useEffect, useRef } from 'react';
import WaveCanvas from '@/components/WaveCanvas';

// The painted dragon (Kuniyoshi's, cut out of "Dragon and Waves") flying around the screen.
// The shader keeps the painting alive (body ripple, swinging claw, licking flames, theme colors);
// this moves it along its own flight path, banking into turns, turning to face where it flies,
// and passing behind its sun / moon when it circles one.
const FLIGHT = {
  dragon: { path: 'orbit', speed: 0.5, size: 1 },
  fujidragon: { path: 'orbit', speed: 0.45, size: 1 },
  peonydragon: { path: 'orbit', speed: 0.5, size: 0.95 },
  moondragon: { path: 'orbit', speed: 0.4, size: 0.9 },
  seiryu: { path: 'wave', speed: 0.9, size: 0.9 },
  azuredragon: { path: 'wave', speed: 1.1, size: 0.85 },
  sumidragon: { path: 'drift', speed: 0.4, size: 1.05 },
  goldwave: { path: 'rise', speed: 0.6, size: 1 },
  goldstorm: { path: 'stalk', speed: 0.45, size: 1.15 },
  redgold: { path: 'eight', speed: 0.6, size: 1 },
};

export default function PaintedDragon({ theme, tint, animate = true, fps = 30, style }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const F = FLIGHT[theme] || FLIGHT.dragon;
    let raf = 0, last = 0, u = Math.random() * 20, prev = null, face = 1, tilt = 0;
    const pos = (u2) => {
      const w = window.innerWidth, h = window.innerHeight, m = Math.min(w, h);
      const cx = w * 0.5, cy = h * 0.38;
      switch (F.path) {
        case 'orbit': { const ox = 0.18 * w + 0.23 * m, oy = 120 + 0.23 * m, r = 0.23 * m; const a = u2 * 0.9; return [ox + r * 2.0 * Math.cos(a), oy + r * 1.25 * Math.sin(a) + r * 0.25, Math.sin(a)]; }
        case 'wave': { const span = w + 300; return [((u2 * 90) % span) - 150, cy + h * 0.12 * Math.sin(u2 * 1.2), 1]; }
        case 'drift': return [cx + w * 0.28 * Math.sin(u2 * 0.37) + w * 0.08 * Math.sin(u2 * 0.9), cy + h * 0.12 * Math.sin(u2 * 0.5), 1];
        case 'rise': return [cx + w * 0.28 * Math.sin(u2 * 0.8), cy + h * 0.16 * Math.cos(u2 * 0.4), 1];
        case 'stalk': return [cx + w * 0.2 * Math.sin(u2 * 0.5), cy + h * 0.06 + h * 0.06 * Math.sin(u2 * 1.0), 1];
        default: return [cx + w * 0.3 * Math.sin(u2 * 0.5), cy + h * 0.13 * Math.sin(u2 * 1.0), 1];
      }
    };
    const step = (now) => {
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0; last = now;
      u += dt * F.speed;
      const [x, y, z] = pos(u);
      if (prev) {
        const vx = x - prev[0], vy = y - prev[1];
        if (Math.abs(vx) > 0.3) face = vx > 0 ? 1 : -1; // turn to face the way it flies
        const want = Math.max(-0.35, Math.min(0.35, Math.atan2(vy, Math.abs(vx) + 0.001) * 0.8));
        tilt += (want - tilt) * 0.08; // bank into turns, smoothly
      }
      prev = [x, y];
      const wpx = el.offsetWidth, hpx = el.offsetHeight;
      const depth = F.path === 'orbit' ? 0.82 + 0.18 * (z + 1) / 2 : 1; // smaller when behind the sun / moon
      const sc = F.size * depth * (1 + 0.04 * Math.sin(now / 1000 * 0.6));
      el.style.transform = `translate3d(${x - wpx / 2}px, ${y - hpx / 2}px, 0) rotate(${tilt * face}rad) scale(${sc * face}, ${sc})`;
      el.style.zIndex = F.path === 'orbit' && z < 0 ? '0' : '2';
    };
    const loop = (now) => { raf = requestAnimationFrame(loop); if (now - (loop.t || 0) < 1000 / fps - 2) return; loop.t = now; step(now); };
    if (animate) raf = requestAnimationFrame(loop); else step(performance.now());
    return () => cancelAnimationFrame(raf);
  }, [theme, animate, fps]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={ref} className="dz-dragon" style={style}>
      <WaveCanvas src="/dragon-waves.webp" fx="dragon" tint={tint} animate={animate} fps={fps} className="absolute inset-0 w-full h-full" />
    </div>
  );
}
