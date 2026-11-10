import { useEffect, useRef } from 'react';

// Living dragons for the dragon themes: a long serpent body that flies a path and slithers,
// with scales, belly plates, spines, clawed legs, a flowing mane, whiskers, horns, glowing eyes
// and a jaw that opens in a slow roar. Each theme has its own dragon (colors, horns, build,
// spines and flight). Some coil around their sun / moon, some chase a flaming pearl.
const STYLES = {
  dragon: { body: '#8e9196', dark: '#33353a', belly: '#e9dfc6', mane: '#d2452f', eye: '#ffd23a', horn: 'antler', segs: 78, thick: 15, path: 'orbit', speed: 0.9, spines: 'flame' },
  fujidragon: { body: '#2f6f68', dark: '#12302c', belly: '#e7d9b0', mane: '#d2452f', eye: '#ffcf3a', horn: 'antler', segs: 86, thick: 14, path: 'orbit', speed: 0.8, spines: 'flame' },
  seiryu: { body: '#3f8fd6', dark: '#163a63', belly: '#ffcf6a', mane: '#ff7a2f', eye: '#ffe14d', horn: 'swept', segs: 96, thick: 12, path: 'wave', speed: 1.2, spines: 'fin', pearl: '#ffd27a' },
  sumidragon: { body: '#4a453c', dark: '#16140f', belly: '#d8cdb2', mane: '#26221b', eye: '#c9a24a', horn: 'antler', segs: 84, thick: 15, path: 'drift', speed: 0.55, spines: 'spike', ink: true },
  goldwave: { body: '#d39a35', dark: '#5e3a0b', belly: '#ffe6a8', mane: '#c8322a', eye: '#ff3b2f', horn: 'ram', segs: 70, thick: 18, path: 'rise', speed: 1, spines: 'flame', pearl: '#7fe0ff' },
  moondragon: { body: '#2fb8b0', dark: '#0d4642', belly: '#f2e6c0', mane: '#e07a3a', eye: '#fff0a8', horn: 'swept', segs: 104, thick: 12, path: 'orbit', speed: 0.7, spines: 'fin' },
  peonydragon: { body: '#2f7a3a', dark: '#103516', belly: '#e9e0b0', mane: '#e8536a', eye: '#ffd23a', horn: 'antler', segs: 84, thick: 15, path: 'orbit', speed: 0.85, spines: 'flame' },
  goldstorm: { body: '#c8902f', dark: '#432a06', belly: '#ffe2a0', mane: '#c8641e', eye: '#ff2a1a', horn: 'ram', segs: 66, thick: 20, path: 'stalk', speed: 0.6, spines: 'spike' },
  azuredragon: { body: '#2a55d8', dark: '#0c1c55', belly: '#cfe0ff', mane: '#d83a2a', eye: '#ff4a3a', horn: 'swept', segs: 92, thick: 13, path: 'wave', speed: 1.35, spines: 'fin', pearl: '#ff8a6a' },
  redgold: { body: '#d9a441', dark: '#5e3606', belly: '#fff0c0', mane: '#ffcf6a', eye: '#ffffff', horn: 'antler', segs: 88, thick: 14, path: 'eight', speed: 1, spines: 'flame', pearl: '#ffe9a8' },
};
const HORN = '#efe2c0';

export default function FlyingDragon({ theme, orb = null, animate = true, fps = 30, className, style }) {
  const ref = useRef(null);
  useEffect(() => {
    const S = STYLES[theme] || STYLES.dragon;
    const c = ref.current; const g = c?.getContext('2d');
    if (!g) return undefined;
    let w = 0, h = 0, k = 1, dpr = 1;
    const size = () => {
      const r = c.getBoundingClientRect(); dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = r.width; h = r.height; k = Math.min(w, h) / 390;
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    };
    size();
    // Where the sun / moon sits (matches the theme's disc) and its radius.
    const orbC = () => { const m = Math.min(w, h); return { x: 0.18 * w + 0.23 * m, y: 120 + 0.23 * m, r: 0.23 * m * 0.68 }; };
    // Flight path for the head: returns [x, y, z] (z < 0 = behind the sun / moon).
    const path = (u) => {
      const cx = w * 0.5, cy = h * 0.36;
      switch (S.path) {
        case 'orbit': { const o = orbC(); const a = u * 0.42; return [o.x + o.r * 1.75 * Math.cos(a) + Math.sin(u * 1.3) * 10 * k, o.y + o.r * 1.0 * Math.sin(a) + Math.sin(u * 0.9) * 14 * k, Math.sin(a)]; }
        case 'wave': { const span = w + 1400 * k; return [((u * 70 * k) % span) - 700 * k, cy + h * 0.13 * Math.sin(u * 0.9) + h * 0.04 * Math.sin(u * 2.1), 1]; }
        case 'drift': return [cx + w * 0.3 * Math.sin(u * 0.17) + w * 0.1 * Math.sin(u * 0.41), cy + h * 0.14 * Math.sin(u * 0.23), 1];
        case 'rise': return [cx + w * 0.32 * Math.sin(u * 0.5), cy + h * 0.18 * Math.cos(u * 0.25) + h * 0.03 * Math.sin(u * 1.7), 1];
        case 'stalk': return [cx + w * 0.22 * Math.sin(u * 0.33), cy + h * 0.08 + h * 0.07 * Math.sin(u * 0.66), 1];
        default: return [cx + w * 0.36 * Math.sin(u * 0.31), cy + h * 0.15 * Math.sin(u * 0.62), 1]; // figure eight
      }
    };
    const SP = 6.5 * k; // spacing between body segments
    const hist = [];
    const prefill = (u) => { hist.length = 0; for (let i = 600; i >= 0; i--) hist.push(path(u - i * 0.02 * S.speed)); };
    let u = 0, lastNow = 0, raf = 0, lastDraw = 0;
    prefill(u);

    // Body segment centers, walked back along the flight history at fixed spacing.
    const segments = (t) => {
      const out = []; let i = hist.length - 1, acc = 0;
      let px = hist[i][0], py = hist[i][1];
      out.push([px, py, hist[i][2]]);
      while (out.length < S.segs && i > 0) {
        const [x, y, z] = hist[i - 1]; const d = Math.hypot(x - px, y - py);
        if (acc + d >= SP) { const f = (SP - acc) / (d || 1); px += (x - px) * f; py += (y - py) * f; out.push([px, py, z]); acc = 0; }
        else { acc += d; px = x; py = y; i--; }
      }
      while (out.length < S.segs) out.push(out[out.length - 1].slice());
      // Slither: a wave running down the body, bigger toward the tail.
      const n = out.length;
      return out.map((p, j) => {
        const a = out[Math.min(j + 1, n - 1)], b = out[Math.max(j - 1, 0)];
        let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
        const s = j / (n - 1), off = Math.sin(j * 0.22 - t * 3.2 * S.speed) * S.thick * k * 0.7 * (0.2 + 0.8 * s);
        return { x: p[0] - ty * off, y: p[1] + tx * off, z: p[2], tx, ty };
      });
    };
    const radius = (s) => S.thick * k * (s < 0.06 ? 0.55 + s / 0.06 * 0.35 : s < 0.35 ? 0.9 + 0.1 * Math.sin(s * 9) : Math.max(0.12, 1 - (s - 0.35) / 0.65 * 0.9));

    const drawLeg = (seg, r, t, phase, far) => {
      const nx = -seg.ty, ny = seg.tx; // body normal (belly side = -n)
      const sw = Math.sin(t * 3 * S.speed + phase);
      const hip = [seg.x - nx * r * 0.6, seg.y - ny * r * 0.6];
      const knee = [hip[0] - nx * r * 1.3 + seg.tx * r * (0.6 + sw * 0.7), hip[1] - ny * r * 1.3 + seg.ty * r * (0.6 + sw * 0.7)];
      const foot = [knee[0] - nx * r * 0.9 - seg.tx * r * (0.4 - sw * 0.5), knee[1] - ny * r * 0.9 - seg.ty * r * (0.4 - sw * 0.5)];
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = S.dark; g.lineWidth = r * 0.95; g.beginPath(); g.moveTo(...hip); g.lineTo(...knee); g.lineTo(...foot); g.stroke();
      g.strokeStyle = far ? S.dark : S.body; g.lineWidth = r * 0.7; g.stroke();
      g.strokeStyle = HORN; g.lineWidth = 1.6 * k;
      for (let cl = -1.5; cl <= 1.5; cl++) { // claws
        const ang = Math.atan2(foot[1] - knee[1], foot[0] - knee[0]) + cl * 0.45;
        g.beginPath(); g.moveTo(...foot); g.quadraticCurveTo(foot[0] + Math.cos(ang) * r * 0.7, foot[1] + Math.sin(ang) * r * 0.7, foot[0] + Math.cos(ang + 0.6) * r * 0.9, foot[1] + Math.sin(ang + 0.6) * r * 0.9); g.stroke();
      }
    };

    const drawBody = (sg, t, pass) => {
      const n = sg.length;
      for (let i = n - 2; i >= 0; i--) {
        const a = sg[i], b = sg[i + 1];
        if (pass !== null && ((a.z < 0) !== (pass === 'back'))) continue;
        const ra = radius(i / (n - 1)), rb = radius((i + 1) / (n - 1));
        const anx = -a.ty, any = a.tx, bnx = -b.ty, bny = b.tx;
        // Legs (drawn just before their body segment).
        const s = i / (n - 1);
        if (Math.abs(s - 0.16) < 0.5 / n || Math.abs(s - 0.56) < 0.5 / n) drawLeg(a, ra, t, s * 9, false);
        // Back spines / fins / flames.
        if (i % 3 === 0 && i > 2) {
          const len = ra * (S.spines === 'fin' ? 1.0 : 1.1) + (S.spines === 'flame' ? Math.sin(t * 6 + i) * ra * 0.35 : 0);
          g.fillStyle = S.spines === 'spike' ? S.dark : S.mane; g.globalAlpha = S.spines === 'fin' ? 0.75 : 0.95;
          g.beginPath(); g.moveTo(a.x + anx * ra * 0.8, a.y + any * ra * 0.8);
          g.quadraticCurveTo(a.x + anx * (ra + len), a.y + any * (ra + len), a.x + anx * (ra + len * 0.9) + a.tx * ra * 0.9, a.y + any * (ra + len * 0.9) + a.ty * ra * 0.9);
          g.lineTo(b.x + bnx * rb * 0.8, b.y + bny * rb * 0.8); g.closePath(); g.fill(); g.globalAlpha = 1;
        }
        // Body segment.
        g.beginPath();
        g.moveTo(a.x + anx * ra, a.y + any * ra); g.lineTo(b.x + bnx * rb, b.y + bny * rb);
        g.lineTo(b.x - bnx * rb, b.y - bny * rb); g.lineTo(a.x - anx * ra, a.y - any * ra); g.closePath();
        g.fillStyle = S.body; g.fill();
        // Belly plates.
        g.beginPath();
        g.moveTo(a.x - anx * ra * 0.35, a.y - any * ra * 0.35); g.lineTo(b.x - bnx * rb * 0.35, b.y - bny * rb * 0.35);
        g.lineTo(b.x - bnx * rb * 0.95, b.y - bny * rb * 0.95); g.lineTo(a.x - anx * ra * 0.95, a.y - any * ra * 0.95); g.closePath();
        g.fillStyle = S.belly; g.fill();
        // Light along the spine.
        g.strokeStyle = '#ffffff'; g.globalAlpha = 0.18; g.lineWidth = ra * 0.35; g.beginPath(); g.moveTo(a.x + anx * ra * 0.5, a.y + any * ra * 0.5); g.lineTo(b.x + bnx * rb * 0.5, b.y + bny * rb * 0.5); g.stroke(); g.globalAlpha = 1;
        if (i % 2 === 0) { g.strokeStyle = S.dark; g.globalAlpha = 0.45; g.lineWidth = 1 * k; g.beginPath(); g.moveTo(a.x - anx * ra * 0.35, a.y - any * ra * 0.35); g.lineTo(a.x - anx * ra * 0.95, a.y - any * ra * 0.95); g.stroke(); g.globalAlpha = 1; }
        // Scales on the back.
        g.strokeStyle = S.dark; g.globalAlpha = 0.8; g.lineWidth = 1.2 * k;
        const ang = Math.atan2(a.ty, a.tx);
        for (let q = 0; q < 3; q++) {
          const f = -0.15 + q * 0.38 + (i % 2) * 0.19;
          g.beginPath(); g.arc(a.x + anx * ra * f, a.y + any * ra * f, ra * 0.24, ang - Math.PI / 2, ang + Math.PI / 2); g.stroke();
        }
        g.globalAlpha = 1;
        // Outline.
        g.strokeStyle = S.dark; g.lineWidth = 1.4 * k; g.beginPath();
        g.moveTo(a.x + anx * ra, a.y + any * ra); g.lineTo(b.x + bnx * rb, b.y + bny * rb);
        g.moveTo(a.x - anx * ra, a.y - any * ra); g.lineTo(b.x - bnx * rb, b.y - bny * rb); g.stroke();
      }
      // Flame tuft on the tail tip.
      if (pass === null || (sg[n - 1].z < 0) === (pass === 'back')) {
        const e = sg[n - 1], f = sg[n - 6];
        const ax = e.x - f.x, ay = e.y - f.y;
        g.strokeStyle = S.mane; g.lineCap = 'round';
        for (let q = -2; q <= 2; q++) {
          const a2 = Math.atan2(ay, ax) + q * 0.35 + Math.sin(t * 4 + q) * 0.15;
          g.lineWidth = (3 - Math.abs(q) * 0.6) * k; g.beginPath(); g.moveTo(e.x, e.y);
          g.quadraticCurveTo(e.x + Math.cos(a2) * 14 * k, e.y + Math.sin(a2) * 14 * k, e.x + Math.cos(a2 + 0.5) * 26 * k, e.y + Math.sin(a2 + 0.5) * 26 * k); g.stroke();
        }
      }
    };

    const drawHead = (sg, t) => {
      const hd = sg[0], H = S.thick * k * 2.6;
      const ang = Math.atan2(hd.ty, hd.tx);
      const roar = Math.max(0, Math.sin(t * 0.7) - 0.6) / 0.4; // jaw opens now and then
      const flip = Math.cos(ang) < 0 ? -1 : 1; // keep the head upright
      g.save(); g.translate(hd.x, hd.y); g.rotate(ang); g.scale(1, flip);
      g.lineJoin = 'round'; g.lineCap = 'round';
      // Mane streaming back.
      g.strokeStyle = S.mane;
      for (let m = 0; m < 9; m++) {
        const y0 = -H * 0.45 + m * H * 0.11, wv = Math.sin(t * 4 + m) * H * 0.18;
        g.lineWidth = (4.2 - m * 0.2) * k; g.globalAlpha = 0.9;
        g.beginPath(); g.moveTo(-H * 0.2, y0); g.bezierCurveTo(-H * 0.7, y0 - H * 0.3 + wv, -H * 1.1, y0 + wv, -H * (1.4 + (m % 3) * 0.15), y0 - H * 0.2 + wv * 1.4); g.stroke();
      }
      g.globalAlpha = 1;
      // Horns.
      const horn = (dy, shade) => {
        g.strokeStyle = shade; g.lineWidth = 3.4 * k; g.beginPath();
        if (S.horn === 'antler') {
          g.moveTo(-H * 0.05, -H * 0.42 + dy); g.quadraticCurveTo(-H * 0.5, -H * 0.9 + dy, -H * 1.15, -H * 1.0 + dy);
          g.moveTo(-H * 0.45, -H * 0.78 + dy); g.lineTo(-H * 0.4, -H * 1.15 + dy); g.moveTo(-H * 0.8, -H * 0.95 + dy); g.lineTo(-H * 0.85, -H * 1.3 + dy);
        } else if (S.horn === 'swept') {
          g.moveTo(-H * 0.05, -H * 0.4 + dy); g.bezierCurveTo(-H * 0.5, -H * 0.75 + dy, -H * 1.1, -H * 0.75 + dy, -H * 1.6, -H * 0.5 + dy);
        } else {
          g.moveTo(-H * 0.05, -H * 0.42 + dy); g.bezierCurveTo(-H * 0.5, -H * 1.1 + dy, -H * 1.05, -H * 0.6 + dy, -H * 0.7, -H * 0.3 + dy); g.quadraticCurveTo(-H * 0.5, -H * 0.15 + dy, -H * 0.55, -H * 0.45 + dy);
        }
        g.stroke();
      };
      horn(H * 0.12, S.dark); horn(0, HORN);
      // Lower jaw (rotates open on a roar).
      g.save(); g.translate(-H * 0.1, H * 0.12); g.rotate(roar * 0.42);
      g.fillStyle = '#5a0f12'; g.beginPath(); g.moveTo(0, -H * 0.05); g.lineTo(H * 1.0, -H * 0.02); g.lineTo(H * 0.95, H * 0.08); g.closePath(); g.fill();
      g.fillStyle = S.body; g.strokeStyle = S.dark; g.lineWidth = 1.4 * k;
      g.beginPath(); g.moveTo(-H * 0.1, 0); g.lineTo(H * 1.0, H * 0.04); g.quadraticCurveTo(H * 1.02, H * 0.2, H * 0.85, H * 0.22); g.quadraticCurveTo(H * 0.3, H * 0.34, -H * 0.15, H * 0.28); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#ffffff'; [0.25, 0.5, 0.75].forEach((f) => { g.beginPath(); g.moveTo(H * f, H * 0.04); g.lineTo(H * (f + 0.05), -H * 0.08); g.lineTo(H * (f + 0.1), H * 0.05); g.fill(); });
      g.restore();
      // Head and snout.
      g.fillStyle = S.body; g.strokeStyle = S.dark; g.lineWidth = 1.6 * k;
      g.beginPath(); g.moveTo(-H * 0.45, -H * 0.38);
      g.quadraticCurveTo(-H * 0.05, -H * 0.62, H * 0.35, -H * 0.42);
      g.quadraticCurveTo(H * 0.75, -H * 0.38, H * 1.05, -H * 0.2);
      g.quadraticCurveTo(H * 1.25, -H * 0.08, H * 1.12, H * 0.08);
      g.lineTo(H * 0.2, H * 0.14); g.quadraticCurveTo(-H * 0.3, H * 0.32, -H * 0.5, H * 0.1); g.closePath(); g.fill(); g.stroke();
      // Upper fangs, nostril, brow.
      g.fillStyle = '#ffffff'; [0.35, 0.7].forEach((f) => { g.beginPath(); g.moveTo(H * f, H * 0.12); g.lineTo(H * (f + 0.04), H * (0.26 + roar * 0.06)); g.lineTo(H * (f + 0.09), H * 0.12); g.fill(); });
      g.fillStyle = S.dark; g.beginPath(); g.ellipse(H * 1.0, -H * 0.12, H * 0.07, H * 0.04, 0.3, 0, 7); g.fill();
      g.lineWidth = 3 * k; g.beginPath(); g.moveTo(H * 0.05, -H * 0.42); g.quadraticCurveTo(H * 0.35, -H * 0.55, H * 0.6, -H * 0.36); g.stroke();
      // Glowing eye (brighter when it roars).
      const ex = H * 0.36, ey = -H * 0.27, glow = 0.45 + roar * 0.45 + Math.sin(t * 2) * 0.05;
      const eg = g.createRadialGradient(ex, ey, 0, ex, ey, H * 0.55); eg.addColorStop(0, S.eye); eg.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = glow; g.fillStyle = eg; g.beginPath(); g.arc(ex, ey, H * 0.55, 0, 7); g.fill(); g.globalAlpha = 1;
      g.fillStyle = S.eye; g.beginPath(); g.ellipse(ex, ey, H * 0.13, H * 0.09, -0.2, 0, 7); g.fill();
      g.fillStyle = '#111'; g.beginPath(); g.ellipse(ex + H * 0.02, ey, H * 0.03, H * 0.08, 0, 0, 7); g.fill();
      // Long whiskers trailing back.
      g.strokeStyle = S.ink ? S.dark : HORN; g.lineWidth = 1.8 * k;
      [-1, 1].forEach((sd) => {
        const wv = Math.sin(t * 2.2 + sd) * H * 0.4;
        g.beginPath(); g.moveTo(H * 1.0, -H * 0.05 * sd);
        g.bezierCurveTo(H * 1.6, sd * H * 0.4 + wv * 0.4, H * 0.6, sd * H * 1.1 + wv, -H * 0.9, sd * H * 1.3 + wv * 1.4); g.stroke();
      });
      g.restore();
    };

    const drawPearl = (sg, t) => {
      if (!S.pearl) return;
      const hd = sg[0], H = S.thick * k * 2.6;
      const px = hd.x + hd.tx * H * 2.4 + Math.sin(t * 1.7) * H * 0.3, py = hd.y + hd.ty * H * 2.4 + Math.cos(t * 1.3) * H * 0.3, pr = H * 0.42;
      for (let f = 0; f < 5; f++) { // flame wisps around the pearl
        const a = t * 1.5 + f * 1.26, fl = pr * (1.6 + Math.sin(t * 5 + f) * 0.3);
        g.fillStyle = S.mane; g.globalAlpha = 0.55; g.beginPath(); g.moveTo(px + Math.cos(a - 0.5) * pr, py + Math.sin(a - 0.5) * pr);
        g.quadraticCurveTo(px + Math.cos(a) * fl * 1.1, py + Math.sin(a) * fl * 1.1, px + Math.cos(a + 0.4) * fl, py + Math.sin(a + 0.4) * fl); g.lineTo(px, py); g.fill();
      }
      g.globalAlpha = 1;
      const rg = g.createRadialGradient(px - pr * 0.3, py - pr * 0.3, 0, px, py, pr * 2.2);
      rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.3, S.pearl); rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(px, py, pr * 2.2, 0, 7); g.fill();
    };

    const drawOrb = () => {
      if (!orb) return;
      const o = orbC();
      const R = o.r / 0.68;
      const rg = g.createRadialGradient(o.x - (orb.moon ? o.r * 0.2 : 0), o.y - (orb.moon ? o.r * 0.25 : 0), 0, o.x, o.y, R);
      if (orb.moon) { rg.addColorStop(0, '#fff7da'); rg.addColorStop(0.45, orb.moon); rg.addColorStop(0.64, orb.moon); rg.addColorStop(0.67, `${orb.moon}66`); rg.addColorStop(0.75, 'rgba(0,0,0,0)'); }
      else { rg.addColorStop(0, orb.sun); rg.addColorStop(0.66, orb.sun); rg.addColorStop(0.685, `${orb.sun}55`); rg.addColorStop(0.72, 'rgba(0,0,0,0)'); }
      g.globalAlpha = 0.9; g.fillStyle = rg; g.beginPath(); g.arc(o.x, o.y, R, 0, 7); g.fill(); g.globalAlpha = 1;
    };

    const frame = (now) => {
      const t = now / 1000;
      const dt = lastNow ? Math.min(0.1, t - lastNow) : 0; lastNow = t;
      u += dt * S.speed;
      const p = path(u), last = hist[hist.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 200 * k) prefill(u); else hist.push(p);
      if (hist.length > 900) hist.splice(0, hist.length - 900);
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
      // Slow push-in, like a camera drifting toward the dragon.
      const z = 1 + 0.04 * Math.sin(t * 0.13);
      g.translate(w / 2, h * 0.4); g.scale(z, z); g.translate(-w / 2, -h * 0.4);
      if (S.ink) g.globalAlpha = 0.9;
      const sg = segments(t);
      const split = S.path === 'orbit';
      const headBehind = split && sg[0].z < 0;
      if (split) drawBody(sg, t, 'back');
      if (headBehind) drawHead(sg, t);
      drawOrb();
      drawBody(sg, t, split ? 'front' : null);
      if (!headBehind) { drawPearl(sg, t); drawHead(sg, t); }
      g.globalAlpha = 1;
    };
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      if (now - lastDraw < 1000 / fps - 2) return;
      lastDraw = now; frame(now);
    };
    if (animate) raf = requestAnimationFrame(loop); else frame(performance.now());
    const onResize = () => { size(); prefill(u); if (!animate) frame(performance.now()); };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, [theme, animate, fps, orb?.sun, orb?.moon]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} className={className} style={style} aria-hidden="true" />;
}
