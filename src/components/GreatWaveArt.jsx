import { useEffect, useRef } from 'react';

// Our own animated wave in the shape and colors of the classic woodblock "Great Wave":
// a big curling crest with flowing blue bands, cream foam claws, falling spray, a small
// distant Fuji, and swells rolling underneath. Drawn on a 1000 x 560 box, scaled to fit.
const DARK = '#1b365d', MID = '#3e6c9a', LIGHT = '#8fb3c8', FOAM = '#f1ead6';
const BW = 1000, BH = 560;

const bez = (p0, p1, p2, p3, u) => {
  const a = 1 - u;
  return [a * a * a * p0[0] + 3 * a * a * u * p1[0] + 3 * a * u * u * p2[0] + u * u * u * p3[0],
    a * a * a * p0[1] + 3 * a * a * u * p1[1] + 3 * a * u * u * p2[1] + u * u * u * p3[1]];
};

// The wave's outline for this moment (s = surge, -1..1).
function waveShape(s) {
  const k = s * 14, j = s * 7;
  return {
    back: [[0, 300], [40, 200], [150, 90], [300, 80]],
    top: [[300, 80], [390 + k, 70 - j], [470 + k, 108 - j], [500 + k, 170 - j]],
    lip: [[500 + k, 170 - j], [522 + k, 216 - j], [500 + k, 252 - j], [455 + k * 0.8, 240 - j]],
    curl: [[455 + k * 0.8, 240 - j], [420 + k * 0.5, 232], [395, 205], [410 + k * 0.3, 180]],
    face: [[410 + k * 0.3, 180], [360, 192], [330, 262], [360, 330]],
    base: [[360, 330], [390, 400], [470, 440], [560, 470]],
  };
}
const curveTo = (g, c) => g.bezierCurveTo(c[1][0], c[1][1], c[2][0], c[2][1], c[3][0], c[3][1]);
function tracePath(g, w) {
  g.beginPath(); g.moveTo(0, BH); g.lineTo(...w.back[0]);
  [w.back, w.top, w.lip, w.curl, w.face, w.base].forEach((c) => curveTo(g, c));
  g.lineTo(560, BH); g.closePath();
}

function drawWave(g, t, spray) {
  const s = Math.sin(t * 0.55) * 0.6 + Math.sin(t * 0.23) * 0.4;
  const w = waveShape(s);
  // Body.
  tracePath(g, w); g.fillStyle = DARK; g.fill();
  // Flowing bands: copies of the outer contour, stepped inward, with dashes sliding along them.
  g.save(); tracePath(g, w); g.clip();
  g.lineCap = 'round';
  for (let i = 1; i <= 16; i++) {
    const dx = i * 9, dy = i * 13;
    g.beginPath(); g.moveTo(w.back[0][0] + dx - 30, w.back[0][1] + dy);
    [w.back, w.top, w.lip].forEach((c) => g.bezierCurveTo(c[1][0] + dx, c[1][1] + dy, c[2][0] + dx, c[2][1] + dy, c[3][0] + dx, c[3][1] + dy));
    g.strokeStyle = i % 4 === 0 ? FOAM : i % 2 ? LIGHT : MID;
    g.globalAlpha = i % 4 === 0 ? 0.55 : 0.8;
    g.lineWidth = i % 4 === 0 ? 3 : 8 + (i % 3) * 2;
    g.setLineDash([150 + (i % 4) * 40, 34 + (i % 3) * 14]);
    g.lineDashOffset = -t * (38 + i * 2.5);
    g.stroke();
  }
  g.setLineDash([]); g.globalAlpha = 1; g.restore();
  // Cream foam crown along the top and over the lip, outlined like a woodblock.
  g.lineCap = 'round'; g.lineJoin = 'round';
  const crown = () => { g.beginPath(); g.moveTo(...bez(...w.back, 0.6)); for (let u = 0.65; u <= 1.001; u += 0.05) g.lineTo(...bez(...w.back, u)); curveTo(g, w.top); curveTo(g, w.lip); };
  crown(); g.strokeStyle = DARK; g.lineWidth = 30; g.stroke();
  crown(); g.strokeStyle = FOAM; g.lineWidth = 23; g.stroke();
  // Foam claws: little branching fingers reaching out off the crest, each curling on its own beat.
  for (let i = 0; i < 18; i++) {
    const u = i / 17, seg = u < 0.62 ? w.top : w.lip, uu = u < 0.62 ? 0.25 + u * 1.2 : (u - 0.62) * 2.6;
    const [x, y] = bez(...seg, Math.min(uu, 1)), [x2, y2] = bez(...seg, Math.min(uu + 0.02, 1.0001));
    let tx = x2 - x, ty = y2 - y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const nx = ty, ny = -tx; // outward from the wave body
    const wig = Math.sin(t * 2.1 + i * 0.8);
    for (let f = 0; f < 4; f++) {
      const reach = 10 + f * 9 + wig * 3, side = (f - 1.5) * 5 + wig * 2;
      const cx = x + nx * reach + tx * side, cy = y + ny * reach + ty * side, rr = 7.5 - f * 1.4;
      g.beginPath(); g.arc(cx, cy, rr, 0, 7); g.fillStyle = FOAM; g.fill(); g.strokeStyle = DARK; g.lineWidth = 1.6; g.stroke();
    }
  }
  g.fillStyle = FOAM;
  // Spray falling off the curl.
  if (spray) {
    if (Math.random() < 0.6) { const [x, y] = bez(...w.lip, Math.random()); spray.push({ x, y, vx: 0.4 + Math.random() * 1.6, vy: -0.6 - Math.random(), r: 1.6 + Math.random() * 2.6, life: 1 }); }
    for (let i = spray.length - 1; i >= 0; i--) {
      const p = spray[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.06; p.life -= 0.012;
      if (p.life <= 0) { spray.splice(i, 1); continue; }
      g.globalAlpha = Math.min(1, p.life * 1.5); g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
  }
}

function drawSwells(g, t) {
  for (let L = 0; L < 3; L++) {
    const base = 430 + L * 45, A = 16 + L * 6, sp = 0.6 + L * 0.25;
    const y = (x) => base - A * Math.sin(x / (95 + L * 25) + t * sp + L * 2) - A * 0.3 * Math.sin(x / 37 - t * sp * 1.6);
    g.beginPath(); g.moveTo(0, BH);
    for (let x = 0; x <= BW; x += 10) g.lineTo(x, y(x));
    g.lineTo(BW, BH); g.closePath();
    g.fillStyle = [MID, DARK, '#24476f'][L]; g.fill();
    g.save(); g.clip();
    for (let b = 1; b <= 3; b++) { // flowing light streaks inside each swell
      g.beginPath();
      for (let x = 0; x <= BW; x += 10) (x ? g.lineTo(x, y(x) + b * 11) : g.moveTo(x, y(x) + b * 11));
      g.strokeStyle = b === 2 ? LIGHT : MID; g.globalAlpha = 0.7; g.lineWidth = 5;
      g.setLineDash([50, 30]); g.lineDashOffset = -t * (30 + b * 8 + L * 10); g.stroke();
    }
    g.setLineDash([]); g.globalAlpha = 1; g.restore();
    g.strokeStyle = FOAM; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath();
    for (let x = 0; x <= BW; x += 10) (x ? g.lineTo(x, y(x)) : g.moveTo(x, y(x)));
    g.stroke();
  }
}

function drawFuji(g) {
  g.fillStyle = DARK; g.beginPath(); g.moveTo(660, 430); g.lineTo(720, 382); g.lineTo(780, 430); g.closePath(); g.fill();
  g.fillStyle = FOAM; g.beginPath(); g.moveTo(703, 396); g.lineTo(720, 382); g.lineTo(737, 396); g.lineTo(728, 400); g.lineTo(720, 394); g.lineTo(711, 401); g.closePath(); g.fill();
}

export default function GreatWaveArt({ className, style, animate = true, fps = 30 }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; const g = c?.getContext('2d');
    if (!g) return undefined;
    const spray = [];
    let raf = 0, last = 0;
    const size = () => {
      const r = c.getBoundingClientRect(), k = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.max(1, Math.round(r.width * k)); c.height = Math.max(1, Math.round(r.height * k));
    };
    const draw = (now) => {
      const t = now / 1000;
      g.setTransform(c.width / BW, 0, 0, c.height / BH, 0, 0);
      g.clearRect(0, 0, BW, BH);
      drawFuji(g);
      g.save(); g.translate(650, 300); g.scale(0.36, 0.36); drawWave(g, t + 2.1, null); g.restore();
      drawWave(g, t, animate ? spray : null);
      drawSwells(g, t);
    };
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 1000 / fps - 2) return; // capped frame rate to spare the battery
      last = now; draw(now);
    };
    size();
    if (animate) raf = requestAnimationFrame(loop); else draw(0);
    const onResize = () => { size(); if (!animate) draw(0); };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, [animate, fps]);
  return <canvas ref={ref} className={className} style={{ aspectRatio: `${BW} / ${BH}`, ...style }} aria-hidden="true" />;
}
