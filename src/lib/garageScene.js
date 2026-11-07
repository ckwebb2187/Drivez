// Painters for the 3D garage: floors, walls, graffiti, and the lighting moods. Each draws on a 2D
// canvas that becomes a texture, so the looks cost nothing extra once the garage is built.

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const shade = (h, k) => `#${hex(h).map((v) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0')).join('')}`;
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------- floors
// Returns surface settings for the material: roughness, metalness, repeat, glow (emissive LED lines).
export function drawFloor(g, W, H, type, c1, c2) {
  const out = { rough: 0.6, metal: 0.08, repeat: 4, glow: false };
  g.fillStyle = c1; g.fillRect(0, 0, W, H);
  switch (type) {
    case 'resin': {
      for (let i = 0; i < 3000; i++) { g.fillStyle = [shade(c1, 1.6), shade(c1, 0.6), '#ffffff', c2][i % 4]; g.globalAlpha = rnd(0.3, 0.9); g.fillRect(rnd(0, W), rnd(0, H), rnd(1, 4), rnd(1, 4)); }
      g.globalAlpha = 1; Object.assign(out, { rough: 0.18, metal: 0.15, repeat: 3 }); break;
    }
    case 'concrete': {
      for (let i = 0; i < 6000; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)'; g.fillRect(rnd(0, W), rnd(0, H), 2, 2); }
      g.strokeStyle = shade(c1, 0.55); g.lineWidth = 2; g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
      Object.assign(out, { rough: 0.85, repeat: 3 }); break;
    }
    case 'polished': {
      for (let i = 0; i < 40; i++) { const r = rnd(20, 90); const gr = g.createRadialGradient(rnd(0, W), rnd(0, H), 0, rnd(0, W), rnd(0, H), r); gr.addColorStop(0, `${shade(c1, rnd(0.85, 1.15))}88`); gr.addColorStop(1, 'transparent'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
      Object.assign(out, { rough: 0.22, metal: 0.05, repeat: 2 }); break;
    }
    case 'checker': {
      const n = 8, s = W / n;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { g.fillStyle = (x + y) % 2 ? c2 : c1; g.fillRect(x * s, y * s, s, s); }
      Object.assign(out, { rough: 0.35, repeat: 3 }); break;
    }
    case 'racedeck': {
      const n = 4, s = W / n;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const c = (x + y) % 2 ? c2 : c1; g.fillStyle = c; g.fillRect(x * s + 2, y * s + 2, s - 4, s - 4);
        g.fillStyle = shade(c, 0.6); for (let i = 1; i < 6; i++) for (let j = 1; j < 6; j++) g.fillRect(x * s + i * s / 6 - 3, y * s + j * s / 6 - 3, 6, 6); // perforations
        g.fillStyle = shade(c, 1.25); g.fillRect(x * s + 2, y * s + 2, s - 4, 4);
        g.fillStyle = shade(c, 0.7); for (let k = 0; k < 4; k++) g.fillRect(x * s + s * (k + 0.5) / 4 - 4, y * s + s - 6, 8, 6); // interlock tabs
      }
      Object.assign(out, { rough: 0.45, repeat: 4 }); break;
    }
    case 'diamond': {
      g.fillStyle = shade(c1, 1.3);
      for (let y = 0; y < H; y += 32) for (let x = (y / 32) % 2 ? 16 : 0; x < W; x += 32) { g.save(); g.translate(x + 8, y + 8); g.rotate(Math.PI / 4 * ((x / 32 + y / 32) % 2 ? 1 : -1)); g.fillRect(-12, -3, 24, 6); g.restore(); }
      Object.assign(out, { rough: 0.32, metal: 0.85, repeat: 4 }); break;
    }
    case 'rubber': {
      g.fillStyle = shade(c1, 1.35); for (let y = 12; y < H; y += 24) for (let x = 12; x < W; x += 24) { g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill(); }
      Object.assign(out, { rough: 0.95, repeat: 5 }); break;
    }
    case 'carbon': {
      for (let y = 0; y < H; y += 16) for (let x = 0; x < W; x += 16) { const gr = g.createLinearGradient(x, y, x + 16, y + 16); const k = ((x + y) / 16) % 2; gr.addColorStop(0, shade(c1, k ? 1.6 : 0.8)); gr.addColorStop(1, shade(c1, k ? 0.8 : 1.6)); g.fillStyle = gr; g.fillRect(x, y, 16, 16); }
      Object.assign(out, { rough: 0.25, metal: 0.4, repeat: 6 }); break;
    }
    case 'hex': {
      const r = 32, w = r * Math.sqrt(3);
      g.lineWidth = 4; g.strokeStyle = shade(c1, 0.5);
      for (let y = 0, row = 0; y < H + r; y += r * 1.5, row++) for (let x = row % 2 ? w / 2 : 0; x < W + w; x += w) {
        g.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; g.lineTo(x + r * Math.cos(a), y + r * Math.sin(a)); } g.closePath();
        g.fillStyle = shade(c1, rnd(0.9, 1.2)); g.fill(); g.stroke();
      }
      Object.assign(out, { rough: 0.4, repeat: 4 }); break;
    }
    case 'wood': {
      for (let y = 0; y < H; y += 32) { g.fillStyle = shade('#7a4e2a', rnd(0.75, 1.15)); g.fillRect(0, y, W, 30); g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(0, y + rnd(3, 27)); g.bezierCurveTo(W / 3, y + rnd(3, 27), W * 2 / 3, y + rnd(3, 27), W, y + rnd(3, 27)); g.stroke(); } g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(rnd(0, W), y, 2, 30); }
      Object.assign(out, { rough: 0.55, repeat: 3 }); break;
    }
    case 'led': {
      g.fillStyle = '#05060a'; g.fillRect(0, 0, W, H);
      g.strokeStyle = c1 === '#15161c' ? '#00e5ff' : c1; g.lineWidth = 3; g.shadowColor = g.strokeStyle; g.shadowBlur = 10;
      for (let i = 0; i <= W; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, H); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(W, i); g.stroke(); }
      Object.assign(out, { rough: 0.3, metal: 0.3, repeat: 4, glow: true }); break;
    }
    default: { // epoxy
      g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 2;
      for (let i = 0; i <= W; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, H); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(W, i); g.stroke(); }
      Object.assign(out, { rough: 0.4, metal: 0.12, repeat: 4 });
    }
  }
  return out;
}

// ---------------------------------------------------------------- walls
export function drawWall(g, W, H, style, base, accent) {
  g.fillStyle = shade(base, 0.85); g.fillRect(0, 0, W, H);
  switch (style) {
    case 'concrete':
      for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.06})`; g.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
      g.strokeStyle = shade(base, 0.6); g.lineWidth = 2; for (let x = 0; x <= W; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
      return { rough: 0.9 };
    case 'panel':
      for (let x = 0; x < W; x += 64) { const gr = g.createLinearGradient(x, 0, x + 64, 0); gr.addColorStop(0, shade(base, 1.15)); gr.addColorStop(0.5, shade(base, 0.95)); gr.addColorStop(1, shade(base, 0.75)); g.fillStyle = gr; g.fillRect(x, 0, 62, H); }
      g.fillStyle = shade(base, 0.5); for (let x = 8; x < W; x += 64) for (let y = 12; y < H; y += 60) g.fillRect(x, y, 3, 3);
      return { rough: 0.5, metal: 0.5 };
    case 'wood':
      for (let x = 0; x < W; x += 40) { g.fillStyle = shade(base === '#23242b' ? '#6b4426' : base, rnd(0.8, 1.15)); g.fillRect(x, 0, 38, H); g.strokeStyle = 'rgba(0,0,0,.2)'; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(x + rnd(4, 34), 0); g.lineTo(x + rnd(4, 34), H); g.stroke(); } }
      return { rough: 0.75 };
    case 'tile':
      g.fillStyle = shade(base, 0.6); g.fillRect(0, 0, W, H);
      for (let y = 0; y < H; y += 20) for (let x = (y / 20) % 2 ? -20 : 0; x < W; x += 40) { g.fillStyle = shade(base, rnd(1.05, 1.2)); g.fillRect(x + 1.5, y + 1.5, 37, 17); }
      return { rough: 0.25 };
    case 'carbon':
      for (let y = 0; y < H; y += 12) for (let x = 0; x < W; x += 12) { const k = ((x + y) / 12) % 2; g.fillStyle = shade(base, k ? 1.5 : 0.7); g.fillRect(x, y, 12, 12); }
      return { rough: 0.3, metal: 0.4 };
    case 'corrugated':
      for (let x = 0; x < W; x += 16) { const gr = g.createLinearGradient(x, 0, x + 16, 0); gr.addColorStop(0, shade(base, 0.7)); gr.addColorStop(0.5, shade(base, 1.35)); gr.addColorStop(1, shade(base, 0.7)); g.fillStyle = gr; g.fillRect(x, 0, 16, H); }
      return { rough: 0.45, metal: 0.6 };
    case 'hex': {
      const r = 22, w = r * Math.sqrt(3);
      for (let y = 0, row = 0; y < H + r; y += r * 1.5, row++) for (let x = row % 2 ? w / 2 : 0; x < W + w; x += w) {
        g.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; g.lineTo(x + (r - 2) * Math.cos(a), y + (r - 2) * Math.sin(a)); } g.closePath();
        g.fillStyle = shade(base, rnd(0.95, 1.25)); g.fill();
      }
      return { rough: 0.5, metal: 0.3 };
    }
    case 'stripe':
      g.fillStyle = shade(base, 1.0); g.fillRect(0, 0, W, H);
      g.fillStyle = '#ffffff'; g.fillRect(0, H * 0.55, W, 10); g.fillStyle = accent; g.fillRect(0, H * 0.55 + 16, W, 18); g.fillStyle = '#ffffff'; g.fillRect(0, H * 0.55 + 40, W, 6);
      return { rough: 0.6 };
    case 'led':
      g.fillStyle = '#07080c'; g.fillRect(0, 0, W, H);
      for (let x = 0; x < W; x += 64) for (let y = 0; y < H; y += 64) { const gr = g.createRadialGradient(x + 32, y + 32, 2, x + 32, y + 32, 30); gr.addColorStop(0, `${accent}66`); gr.addColorStop(1, 'transparent'); g.fillStyle = gr; g.fillRect(x + 2, y + 2, 60, 60); g.strokeStyle = `${accent}55`; g.strokeRect(x + 3, y + 3, 58, 58); }
      return { rough: 0.3, glow: true };
    default: // brick
      for (let y = 0; y < H; y += 24) for (let x = (y / 24) % 2 ? -32 : 0; x < W; x += 64) { g.fillStyle = shade(base, 0.95 + Math.random() * 0.15); g.fillRect(x + 2, y + 2, 60, 20); }
      return { rough: 0.9 };
  }
}

// ---------------------------------------------------------------- graffiti
export function drawGraffiti(g, W, H, style, text = 'KAIDO') {
  const pal = ['#ff2d95', '#00e5ff', '#7cff3c', '#ffd400', '#a855ff', '#ff6a13'];
  const pick = () => pal[Math.floor(Math.random() * pal.length)];
  const word = (text || 'KAIDO').slice(0, 10).toUpperCase();
  g.clearRect(0, 0, W, H);
  const spray = (x, y, r, col) => { for (let i = 0; i < 500; i++) { const a = Math.random() * Math.PI * 2, d = Math.random() * r; g.fillStyle = col; g.globalAlpha = Math.random() * 0.5; g.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, 3, 3); } g.globalAlpha = 1; };
  const drips = (x, w, y, col, n = 9) => { g.fillStyle = col; for (let i = 0; i < n; i++) g.fillRect(x + (Math.random() - 0.5) * w, y, 6, 30 + Math.random() * 90); };
  const tag = (x, y, col = pick(), lw = 7) => { g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); for (let i = 0; i < 9; i++) g.quadraticCurveTo(x + i * 22 + Math.random() * 30, y - 50 + Math.random() * 100, x + (i + 1) * 26, y + (Math.random() - 0.5) * 40); g.stroke(); };
  const fill = (t, x, y, size, rot, font, stroke = true) => {
    g.save(); g.translate(x, y); g.rotate(rot);
    g.font = `900 ${size}px ${font}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const c1 = pick(), c2 = pick();
    if (stroke) { g.lineJoin = 'round'; g.lineWidth = size * 0.22; g.strokeStyle = '#0a0a0a'; g.strokeText(t, 0, 0); g.lineWidth = size * 0.1; g.strokeStyle = '#ffffff'; g.strokeText(t, 0, 0); }
    const gr = g.createLinearGradient(0, -size / 2, 0, size / 2); gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr; g.fillText(t, 0, 0);
    g.restore(); return c2;
  };
  switch (style) {
    case 'wild': {
      spray(400, 470, 180, pick()); spray(1650, 420, 190, pick());
      const c = fill(word, 400, 470, 180, -0.12, 'Impact, "Arial Black", sans-serif'); drips(400, 600, 530, c);
      // arrows and spikes
      for (let i = 0; i < 6; i++) { g.save(); g.translate(rnd(150, 700), rnd(330, 620)); g.rotate(rnd(-1, 1)); g.fillStyle = pick(); g.beginPath(); g.moveTo(0, 0); g.lineTo(80, -14); g.lineTo(70, -34); g.lineTo(120, 0); g.lineTo(70, 34); g.lineTo(80, 14); g.closePath(); g.fill(); g.restore(); }
      fill('BOOST', 1650, 420, 150, 0.1, 'Impact, sans-serif'); tag(900, 600); tag(1150, 140); break;
    }
    case 'stencil': {
      const col = '#f2f2f2';
      g.fillStyle = col; g.font = '900 170px "Courier New", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(word, 420, 470); g.font = '900 120px "Courier New", monospace'; g.fillText('NO RULES', 1650, 440);
      for (let i = 0; i < 4; i++) { g.fillStyle = '#d0021b'; g.fillRect(1460 + i * 90, 540, 60, 12); }
      spray(420, 470, 160, 'rgba(255,255,255,0.4)'); break;
    }
    case 'neon': {
      g.lineCap = 'round'; g.lineJoin = 'round';
      [[word, 420, 470, '#ff2d95'], ['夜', 1650, 430, '#00e5ff']].forEach(([t, x, y, c]) => {
        g.font = `900 ${t.length > 2 ? 190 : 300}px "Brush Script MT", cursive`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.shadowColor = c; g.shadowBlur = 40; g.strokeStyle = c; g.lineWidth = 10; g.strokeText(t, x, y); g.shadowBlur = 0; g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.strokeText(t, x, y);
      });
      g.shadowBlur = 0; tag(900, 620, '#7cff3c', 5); break;
    }
    case 'kanji': {
      g.fillStyle = '#0a0a0a'; g.font = '900 300px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('街道', 420, 460);
      g.fillStyle = '#d0021b'; g.beginPath(); g.arc(1650, 420, 150, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#f2f2f2'; g.font = '900 120px serif'; g.fillText('走り屋', 1650, 430);
      spray(420, 460, 200, 'rgba(0,0,0,0.5)'); break;
    }
    case 'throwie': {
      for (let i = 0; i < 6; i++) {
        const x = 220 + i * 300 + rnd(-40, 40), y = i % 2 ? 210 : 500;
        g.save(); g.translate(x, y); g.rotate(rnd(-0.15, 0.15));
        g.font = '900 120px "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        const t = i % 2 ? word.slice(0, 4) : word.slice(0, 3);
        g.lineJoin = 'round'; g.lineWidth = 26; g.strokeStyle = '#0a0a0a'; g.strokeText(t, 0, 0); g.fillStyle = i % 3 ? '#f2f2f2' : pick(); g.fillText(t, 0, 0); g.lineWidth = 5; g.strokeStyle = pick(); g.strokeText(t, 0, 0);
        g.restore();
      }
      break;
    }
    default: { // bubble
      spray(250, 470, 150, pick()); spray(1800, 430, 170, pick()); spray(1020, 600, 120, pick());
      const c = fill(word, 360, 470, 190, -0.08, '"Arial Black", Impact, sans-serif'); drips(360, 600, 540, c);
      const c2 = fill('BOOST', 1700, 440, 160, 0.06, '"Arial Black", Impact, sans-serif'); drips(1700, 500, 510, c2);
      tag(820, 600); tag(1150, 140); tag(120, 150); tag(1500, 640);
    }
  }
}

// ---------------------------------------------------------------- lighting moods
// hemi: [sky, ground, intensity], key/rim: [color, intensity], spot: wall-wash spots, strip: ceiling strip color,
// neon: under-car glow, bg: background/fog, carSpot: a hard spotlight on the car.
export const LIGHT_MOODS = {
  shop: { hemi: ['#d8e0ff', '#18181d', 0.55], key: ['#fff6ea', 1.5], rim: ['#9fb6ff', 0.6], spot: ['#ffeedd', 22], strip: '#fff4e2', neon: 6, bg: '#0b0c10' },
  showroom: { hemi: ['#ffffff', '#30303a', 0.95], key: ['#ffffff', 2.1], rim: ['#ffffff', 0.9], spot: ['#ffffff', 28], strip: '#ffffff', neon: 3, bg: '#16171c' },
  neon: { hemi: ['#5a4cff', '#05050a', 0.35], key: ['#b6a8ff', 0.6], rim: ['#ff2bd6', 1.2], spot: ['#00e5ff', 18], strip: '#c7a8ff', neon: 12, bg: '#06060c' },
  sunset: { hemi: ['#ffb36b', '#1a0d06', 0.6], key: ['#ff9a4a', 1.6], rim: ['#ff4f7e', 0.8], spot: ['#ffb070', 20], strip: '#ffd2a1', neon: 5, bg: '#120806' },
  spotlight: { hemi: ['#8890a8', '#050507', 0.15], key: ['#ffffff', 0.3], rim: ['#6f7cff', 0.4], spot: ['#fff2e0', 8], strip: '#2a2a2a', neon: 3, bg: '#030305', carSpot: 60 },
  underground: { hemi: ['#7a3cff', '#060310', 0.4], key: ['#a98bff', 0.8], rim: ['#00ffd5', 1.0], spot: ['#8d5bff', 20], strip: '#b48cff', neon: 10, bg: '#07040e' },
  trackday: { hemi: ['#e8f2ff', '#3a3a3a', 1.1], key: ['#ffffff', 2.5], rim: ['#cfe3ff', 0.8], spot: ['#ffffff', 26], strip: '#ffffff', neon: 2, bg: '#1d2026' },
  cyber: { hemi: ['#2bf0ff', '#120018', 0.45], key: ['#ff2bd6', 1.0], rim: ['#2bf0ff', 1.2], spot: ['#ff2bd6', 20], strip: '#2bf0ff', neon: 10, bg: '#0a0012' },
  warm: { hemi: ['#ffd9a8', '#140c06', 0.5], key: ['#ffcf8f', 1.2], rim: ['#ffb070', 0.4], spot: ['#ffc98a', 18], strip: '#ffd7a0', neon: 4, bg: '#0d0905' },
  arctic: { hemi: ['#dff4ff', '#0a1420', 0.8], key: ['#e6f6ff', 1.8], rim: ['#7fd4ff', 0.9], spot: ['#d8f1ff', 24], strip: '#e8f8ff', neon: 5, bg: '#0a1018' },
};
