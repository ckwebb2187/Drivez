// Animations for the Waze overlay: petals, leaves, snow, raindrops on the glass, Matrix code and more,
// in your own colors (or your map theme's). One light canvas at ~20 fps; it never takes a tap.
import { useEffect, useRef } from 'react';
import { speedStyle } from '@/lib/mapTheme';

// Your picked colors, or your map theme's.
export const overlayColors = (prefs, theme) => {
  if (prefs.ovlColors?.length) return prefs.ovlColors;
  const s = speedStyle(theme);
  return [s.ring, s.sub || s.ring, s.glow || s.ring].map(hex6);
};
// Any '#abc' / '#aabbcc' -> '#aabbcc' (color pickers need the long form).
export const hex6 = (c) => { const m = String(c || '').match(/^#([0-9a-f]{3}|[0-9a-f]{6})/i); if (!m) return '#ffffff'; const v = m[1]; return `#${v.length === 3 ? v.split('').map((x) => x + x).join('') : v}`.toLowerCase(); };

export const OVERLAY_FX = [
  { id: 'petals', title: 'Cherry petals' }, { id: 'leaves', title: 'Leaves' }, { id: 'snow', title: 'Snowflakes' },
  { id: 'droplets', title: 'Raindrops on glass' }, { id: 'rain', title: 'Rain' }, { id: 'matrix', title: 'Matrix code' },
  { id: 'fireflies', title: 'Fireflies' }, { id: 'embers', title: 'Embers' }, { id: 'bubbles', title: 'Bubbles' },
  { id: 'stars', title: 'Twinkling stars' },
];
export const FX_COLOR_SETS = [
  { id: 'sakura', cols: ['#ffb6ce', '#ff8fb8', '#fff0f5'] }, { id: 'autumn', cols: ['#e8742a', '#c93a1d', '#f2b134'] },
  { id: 'neon', cols: ['#ff2e88', '#00e5ff', '#b026ff'] }, { id: 'matrix', cols: ['#39ff6a', '#00b34a', '#c8ffd7'] },
  { id: 'ice', cols: ['#ffffff', '#9fd8ff', '#5aa9ff'] }, { id: 'gold', cols: ['#ffd27a', '#ff9a3c', '#fff3c4'] },
  { id: 'ocean', cols: ['#2fa4ff', '#7ce8ff', '#1b5fd1'] }, { id: 'ghost', cols: ['#8a5cd6', '#ff3b5c', '#d9c8ff'] },
];
const AMOUNT = [0.5, 1, 1.7]; // light, medium, lots
const rgb = (hx) => { const c = hex6(hx).replace('#', ''); return [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) || 0).join(','); };
const rnd = (a, b) => a + Math.random() * (b - a);

export default function OverlayFx({ fx = [], colors = [], amount = 1 }) {
  const canvas = useRef(null);
  const key = `${fx.join(',')}|${colors.join(',')}|${amount}`;
  useEffect(() => {
    if (!fx.length) return undefined;
    const c = canvas.current, g = c.getContext('2d');
    let w = 0, h = 0;
    const size = () => { w = c.width = c.clientWidth; h = c.height = c.clientHeight; };
    size(); window.addEventListener('resize', size);
    const cols = (colors.length ? colors : ['#ffffff']).map(rgb);
    const pick = () => cols[Math.floor(Math.random() * cols.length)];
    const k = AMOUNT[amount] ?? 1;
    const parts = [];
    const add = (n, make) => { for (let i = 0; i < Math.round(n * k); i++) parts.push(make(true)); };
    const has = (id) => fx.includes(id);
    if (has('petals')) add(16, (i) => ({ t: 'petal', c: pick(), x: rnd(0, w), y: i ? rnd(0, h) : -10, v: rnd(0.5, 1.2), r: rnd(3, 6), ph: rnd(0, 6), rot: rnd(0, 6) }));
    if (has('leaves')) add(12, (i) => ({ t: 'leaf', c: pick(), x: rnd(0, w), y: i ? rnd(0, h) : -12, v: rnd(0.6, 1.4), r: rnd(6, 10), ph: rnd(0, 6), rot: rnd(0, 6), spin: rnd(-0.05, 0.05) }));
    if (has('snow')) add(26, (i) => ({ t: 'flake', c: pick(), x: rnd(0, w), y: i ? rnd(0, h) : -10, v: rnd(0.5, 1.3), r: rnd(3, 6), ph: rnd(0, 6), rot: rnd(0, 6) }));
    if (has('droplets')) add(22, () => ({ t: 'drop', c: pick(), x: rnd(0, w), y: rnd(0, h), r: rnd(2, 6), v: 0, wait: rnd(0, 400) }));
    if (has('rain')) add(50, (i) => ({ t: 'rain', c: pick(), x: rnd(0, w), y: i ? rnd(0, h) : rnd(-60, 0), v: rnd(11, 17), len: rnd(10, 18) }));
    if (has('matrix')) add(22, (i) => ({ t: 'code', c: pick(), x: Math.floor(rnd(0, w / 14)) * 14, y: i ? rnd(-h, h) : rnd(-300, 0), v: rnd(2, 5), len: Math.floor(rnd(6, 18)) }));
    if (has('fireflies')) add(14, () => ({ t: 'firefly', c: pick(), x: rnd(0, w), y: rnd(0, h), vx: rnd(-0.4, 0.4), vy: rnd(-0.3, 0.3), ph: rnd(0, 6) }));
    if (has('embers')) add(22, (i) => ({ t: 'ember', c: pick(), x: rnd(0, w), y: i ? rnd(0, h) : h + 5, v: rnd(0.5, 1.6), r: rnd(0.8, 2.4), ph: rnd(0, 6) }));
    if (has('bubbles')) add(12, (i) => ({ t: 'bubble', c: pick(), x: rnd(0, w), y: i ? rnd(0, h) : h + 10, v: rnd(0.4, 1.1), r: rnd(3, 7), ph: rnd(0, 6) }));
    if (has('stars')) add(26, () => ({ t: 'star', c: pick(), x: rnd(0, w), y: rnd(0, h), ph: rnd(0, 6) }));

    let raf, last = 0, frame = 0;
    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 50 || document.hidden) return; // ~20 fps saves battery
      last = now; frame++;
      g.clearRect(0, 0, w, h);
      for (const p of parts) {
        if (p.t === 'petal') {
          p.y += p.v; p.x += Math.sin(frame / 25 + p.ph) * 0.8; p.rot += 0.03;
          if (p.y > h + 10) { p.y = -10; p.x = rnd(0, w); }
          g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
          g.fillStyle = `rgba(${p.c},0.85)`; g.beginPath(); g.ellipse(0, 0, p.r, p.r * 0.6, 0, 0, 7); g.fill(); g.restore();
        } else if (p.t === 'leaf') {
          p.y += p.v; p.x += Math.sin(frame / 30 + p.ph) * 1.1; p.rot += p.spin + Math.sin(frame / 40 + p.ph) * 0.02;
          if (p.y > h + 12) { p.y = -12; p.x = rnd(0, w); }
          g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
          g.fillStyle = `rgba(${p.c},0.85)`; g.beginPath();
          g.moveTo(0, -p.r); g.quadraticCurveTo(p.r * 0.7, 0, 0, p.r); g.quadraticCurveTo(-p.r * 0.7, 0, 0, -p.r); g.fill();
          g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(0, -p.r * 0.8); g.lineTo(0, p.r * 1.25); g.stroke();
          g.restore();
        } else if (p.t === 'flake') {
          p.y += p.v; p.x += Math.sin(frame / 40 + p.ph) * 0.4; p.rot += 0.01;
          if (p.y > h + 10) { p.y = -10; p.x = rnd(0, w); }
          g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.strokeStyle = `rgba(${p.c},0.85)`; g.lineWidth = 1.2; g.beginPath();
          for (let i = 0; i < 6; i++) { g.rotate(Math.PI / 3); g.moveTo(0, 0); g.lineTo(0, -p.r); g.moveTo(0, -p.r * 0.55); g.lineTo(p.r * 0.28, -p.r * 0.8); g.moveTo(0, -p.r * 0.55); g.lineTo(-p.r * 0.28, -p.r * 0.8); }
          g.stroke(); g.restore();
        } else if (p.t === 'drop') {
          // A bead of water on the glass: sits a while, then slides down leaving a short trail.
          if (p.wait > 0) p.wait--; else { p.v = Math.min(4, p.v + 0.08); p.y += p.v; }
          if (p.y > h + 10) Object.assign(p, { x: rnd(0, w), y: rnd(-10, h * 0.6), v: 0, wait: rnd(60, 400), r: rnd(2, 6) });
          if (p.v > 0.5) { g.strokeStyle = `rgba(${p.c},0.22)`; g.lineWidth = p.r * 0.6; g.beginPath(); g.moveTo(p.x, p.y - p.v * 8); g.lineTo(p.x, p.y); g.stroke(); }
          const rg = g.createRadialGradient(p.x - p.r * 0.3, p.y - p.r * 0.3, 0, p.x, p.y, p.r);
          rg.addColorStop(0, 'rgba(255,255,255,0.75)'); rg.addColorStop(0.45, `rgba(${p.c},0.35)`); rg.addColorStop(1, `rgba(${p.c},0.7)`);
          g.fillStyle = rg; g.beginPath(); g.ellipse(p.x, p.y, p.r * 0.85, p.r, 0, 0, 7); g.fill();
        } else if (p.t === 'rain') {
          p.y += p.v; p.x -= p.v * 0.18;
          if (p.y > h) { p.y = rnd(-60, 0); p.x = rnd(0, w + 40); }
          g.strokeStyle = `rgba(${p.c},0.4)`; g.lineWidth = 1.2; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + p.len * 0.18, p.y - p.len); g.stroke();
        } else if (p.t === 'code') {
          p.y += p.v; if (p.y - p.len * 14 > h) { p.y = rnd(-200, 0); p.x = Math.floor(rnd(0, w / 14)) * 14; }
          g.font = '12px monospace';
          for (let i = 0; i < p.len; i++) {
            const a = i === 0 ? 0.9 : 0.55 * (1 - i / p.len);
            g.fillStyle = i === 0 ? `rgba(255,255,255,${a})` : `rgba(${p.c},${a})`;
            g.fillText(String.fromCharCode(0x30a0 + ((p.x + i * 7 + Math.floor(p.y / 14)) % 96)), p.x, p.y - i * 14);
          }
        } else if (p.t === 'firefly') {
          p.x += p.vx + Math.sin(frame / 40 + p.ph) * 0.4; p.y += p.vy + Math.cos(frame / 47 + p.ph) * 0.3;
          if (p.x < -10) p.x = w + 10; if (p.x > w + 10) p.x = -10; if (p.y < -10) p.y = h + 10; if (p.y > h + 10) p.y = -10;
          const a = 0.25 + 0.75 * Math.max(0, Math.sin(frame / 18 + p.ph));
          const rg = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, 9); rg.addColorStop(0, `rgba(${p.c},${a})`); rg.addColorStop(1, `rgba(${p.c},0)`);
          g.fillStyle = rg; g.fillRect(p.x - 9, p.y - 9, 18, 18);
        } else if (p.t === 'ember') {
          p.y -= p.v; p.x += Math.sin(frame / 20 + p.ph) * 0.5;
          if (p.y < -5) { p.y = h + 5; p.x = rnd(0, w); }
          g.fillStyle = `rgba(${p.c},${0.4 + 0.5 * Math.abs(Math.sin(frame / 6 + p.ph))})`; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill();
        } else if (p.t === 'bubble') {
          p.y -= p.v; p.x += Math.sin(frame / 30 + p.ph) * 0.4;
          if (p.y < -10) { p.y = h + 10; p.x = rnd(0, w); }
          g.strokeStyle = `rgba(${p.c},0.6)`; g.lineWidth = 1; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.stroke();
          g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.25, 0, 7); g.fill();
        } else if (p.t === 'star') {
          const a = Math.max(0, Math.sin(frame / 12 + p.ph));
          if (a < 0.05) { p.x = rnd(0, w); p.y = rnd(0, h); }
          g.fillStyle = `rgba(${p.c},${a * 0.9})`;
          g.fillRect(p.x - 0.5, p.y - 4 * a, 1, 8 * a); g.fillRect(p.x - 4 * a, p.y - 0.5, 8 * a, 1);
        }
      }
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', size); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!fx.length) return null;
  return <canvas ref={canvas} className="absolute inset-0 w-full h-full pointer-events-none" />;
}
