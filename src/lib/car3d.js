// A 3D car for the driving map (MapLibre custom layer + three.js), with an
// optional neon underglow on the road. Sized to stay readable at any zoom,
// like the cars in Waze. Colors come from your car (or your uploaded picture).
import * as THREE from 'three';
import maplibregl from 'maplibre-gl';

const LEN = 4.6, WID = 1.86; // meters (a WRX-sized sedan)

function carShape(len, wid, noseTaper = 0.18, tailTaper = 0.08) {
  // Top-down outline; front is -Y in shape space (becomes -Z = forward after rotating).
  const s = new THREE.Shape();
  const hl = len / 2, hw = wid / 2, r = 0.32;
  s.moveTo(-hw + noseTaper, -hl);
  s.lineTo(hw - noseTaper, -hl);
  s.quadraticCurveTo(hw, -hl, hw, -hl + r + noseTaper);
  s.lineTo(hw, hl - r);
  s.quadraticCurveTo(hw, hl, hw - r - tailTaper, hl);
  s.lineTo(-hw + r + tailTaper, hl);
  s.quadraticCurveTo(-hw, hl, -hw, hl - r);
  s.lineTo(-hw, -hl + r + noseTaper);
  s.quadraticCurveTo(-hw, -hl, -hw + noseTaper, -hl);
  return s;
}

function slab(shape, height, y0, mat, bevel = 0.06) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 });
  g.rotateX(-Math.PI / 2); // extrude upward; shape's -Y (front) -> -Z
  const m = new THREE.Mesh(g, mat);
  m.position.y = y0;
  return m;
}

function glowTexture(color = '#ffffff') {
  // Soft round pool of light (the plane it's on is stretched to the car's shape).
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const n = parseInt(color.slice(1), 16);
  const rgb = `${n >> 16},${(n >> 8) & 255},${n & 255}`;
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, `rgba(${rgb},1)`);
  grd.addColorStop(0.5, `rgba(${rgb},0.85)`);
  grd.addColorStop(0.75, `rgba(${rgb},0.35)`);
  grd.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Wheel face picture: rim style drawn on a canvas (tire, rim, spokes, center cap).
function wheelTexture(style = 'stock', color = '#c9ced6') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const R = 64;
  g.fillStyle = '#141414'; g.beginPath(); g.arc(R, R, 63, 0, 7); g.fill(); // tire
  const rim = style === 'dish' ? 44 : 50;
  g.fillStyle = style === 'dish' ? '#d9dde3' : color; g.beginPath(); g.arc(R, R, rim + 2, 0, 7); g.fill(); // lip
  g.fillStyle = '#0c0c0e'; g.beginPath(); g.arc(R, R, rim - 2, 0, 7); g.fill(); // gaps between spokes
  g.strokeStyle = color; g.fillStyle = color; g.lineCap = 'round';
  const spokes = (n, w, inner = 10, outer = rim - 2) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      g.lineWidth = w;
      g.beginPath(); g.moveTo(R + Math.cos(a) * inner, R + Math.sin(a) * inner); g.lineTo(R + Math.cos(a) * outer, R + Math.sin(a) * outer); g.stroke();
    }
  };
  if (style === 'te37') spokes(6, 13);
  else if (style === 'six') spokes(6, 7);
  else if (style === 'multi') spokes(10, 4);
  else if (style === 'dish') spokes(5, 7, 8, rim - 4);
  else if (style === 'mesh') {
    spokes(10, 3);
    g.lineWidth = 2;
    for (let i = 0; i < 10; i++) { // cross-lacing
      const a = (i / 10) * Math.PI * 2, b = a + Math.PI / 5;
      g.beginPath(); g.moveTo(R + Math.cos(a) * 18, R + Math.sin(a) * 18); g.lineTo(R + Math.cos(b) * (rim - 4), R + Math.sin(b) * (rim - 4)); g.stroke();
      g.beginPath(); g.moveTo(R + Math.cos(b) * 18, R + Math.sin(b) * 18); g.lineTo(R + Math.cos(a) * (rim - 4), R + Math.sin(a) * (rim - 4)); g.stroke();
    }
  } else { spokes(5, 9); } // stock: simple 5-spoke
  g.fillStyle = '#222'; g.beginPath(); g.arc(R, R, 9, 0, 7); g.fill(); // center cap
  g.fillStyle = color; g.beginPath(); g.arc(R, R, 5, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Proportions per body shape (meters). z is along the car: negative = front.
const SHAPE_DIMS = {
  sedan: { len: 4.6, wid: 1.86, bodyH: 0.62, y0: 0.28, cabin: { len: 2.35, wid: 1.56, z: 0.25, h: 0.42, nose: 0.25, tail: 0.15 }, roofZ: 0.3, wheelZ: [-1.38, 1.4], wheelR: 0.34 },
  hatch: { len: 4.25, wid: 1.8, bodyH: 0.62, y0: 0.28, cabin: { len: 2.55, wid: 1.54, z: 0.5, h: 0.46, nose: 0.28, tail: 0.04 }, roofZ: 0.6, wheelZ: [-1.3, 1.3], wheelR: 0.33 },
  coupe: { len: 4.5, wid: 1.86, bodyH: 0.55, y0: 0.26, cabin: { len: 1.95, wid: 1.48, z: 0.4, h: 0.36, nose: 0.35, tail: 0.3 }, roofZ: 0.45, wheelZ: [-1.38, 1.38], wheelR: 0.34 },
  suv: { len: 4.75, wid: 1.92, bodyH: 0.85, y0: 0.4, cabin: { len: 3.0, wid: 1.66, z: 0.45, h: 0.55, nose: 0.25, tail: 0.04 }, roofZ: 0.5, wheelZ: [-1.48, 1.5], wheelR: 0.4 },
  truck: { len: 5.4, wid: 1.98, bodyH: 0.85, y0: 0.42, cabin: { len: 1.85, wid: 1.72, z: -0.45, h: 0.58, nose: 0.2, tail: 0.04 }, roofZ: -0.42, wheelZ: [-1.75, 1.75], wheelR: 0.42 },
};


// ---------- Looks: paint finish, lights, decals, underglow animation ----------
export const FINISHES = [
  { key: 'metallic', label: 'Metallic' },
  { key: 'gloss', label: 'Gloss' },
  { key: 'matte', label: 'Matte' },
  { key: 'pearl', label: 'Pearl' },
  { key: 'chrome', label: 'Chrome' },
];
export const LIGHTS = [
  { key: 'stock', label: 'Stock' },
  { key: 'led', label: 'LED' },
  { key: 'halo', label: 'Halo rings' },
  { key: 'yellow', label: 'JDM yellow' },
];
export const DECALS = [
  { key: 'none', label: 'None' },
  { key: 'stripes', label: 'Racing stripes' },
  { key: 'rising', label: 'Rising sun' },
  { key: 'number', label: 'Race number' },
  { key: 'checker', label: 'Checkers' },
  { key: 'flames', label: 'Flames' },
  { key: 'sakura', label: 'Sakura' },
];
export const PULSES = [
  { key: 'off', label: 'Steady' },
  { key: 'breathe', label: 'Breathe' },
  { key: 'strobe', label: 'Strobe' },
  { key: 'rainbow', label: 'Rainbow' },
];
const LIGHT_COLOR = { stock: '#fff6d8', led: '#e8f6ff', halo: '#e8f6ff', yellow: '#ffd23a' };

// Paint material for a finish. Plain standard material: the map draws the car without
// reflections to bounce off, so clearcoat-style materials come out black there.
export function paintMaterial(color, finish = 'metallic') {
  const c = new THREE.Color(color);
  const f = {
    metallic: { metalness: 0.55, roughness: 0.32 },
    gloss: { metalness: 0.2, roughness: 0.18 },
    matte: { metalness: 0.0, roughness: 0.9 },
    pearl: { metalness: 0.35, roughness: 0.25, emissive: c.clone().offsetHSL(0.12, 0, 0).multiplyScalar(0.12) },
    chrome: { metalness: 0.7, roughness: 0.15, color: c.clone().lerp(new THREE.Color('#ffffff'), 0.3) },
  }[finish] || { metalness: 0.55, roughness: 0.32 };
  return new THREE.MeshStandardMaterial({ color: c, ...f });
}
function refinish(m, finish) {
  if (!finish || !('metalness' in m)) return;
  const f = { metallic: [0.6, 0.3], gloss: [0.2, 0.18], matte: [0, 0.9], pearl: [0.35, 0.25], chrome: [0.7, 0.15] }[finish];
  if (f) { m.metalness = f[0]; m.roughness = f[1]; }
}

// Decal artwork drawn top-down (front of the car at the top of the canvas).
function decalTexture(kind, color, text, len, wid, part) {
  const W = 128, H = Math.round(128 * len / wid);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = color; g.strokeStyle = color;
  if (kind === 'stripes') {
    g.fillRect(W * 0.36, 0, W * 0.11, H); g.fillRect(W * 0.53, 0, W * 0.11, H);
  } else if (kind === 'checker' && part === 'body') {
    const s = W / 8;
    for (let y = 0; y < 2; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2 === 0) g.fillRect(x * s, H * 0.06 + y * s, s, s);
  } else if (kind === 'rising' && part === 'body') {
    const cx = W / 2, cy = H * 0.3;
    for (let i = 0; i < 16; i += 2) {
      const a0 = (i / 16) * Math.PI * 2, a1 = ((i + 1) / 16) * Math.PI * 2;
      g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, W, a0, a1); g.closePath(); g.globalAlpha = 0.75; g.fill();
    }
    g.globalAlpha = 1; g.beginPath(); g.arc(cx, cy, W * 0.16, 0, 7); g.fill();
    g.globalCompositeOperation = 'destination-in'; g.fillRect(W * 0.12, 0, W * 0.76, H * 0.36); // hood only
  } else if (kind === 'number') {
    const cy = part === 'roof' ? H / 2 : H * 0.17;
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(W / 2, cy, W * 0.24, 0, 7); g.fill();
    g.fillStyle = color === '#ffffff' ? '#111' : color;
    g.font = `900 ${W * 0.26}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(text || '86').slice(0, 3), W / 2, cy + 2);
  } else if (kind === 'flames' && part === 'body') {
    for (const [x, s] of [[0.3, 1], [0.5, 1.25], [0.7, 1]]) {
      g.beginPath(); g.moveTo(W * (x - 0.09), 0);
      g.quadraticCurveTo(W * (x - 0.12), H * 0.2 * s, W * x, H * 0.3 * s);
      g.quadraticCurveTo(W * (x + 0.12), H * 0.2 * s, W * (x + 0.09), 0); g.fill();
    }
  } else if (kind === 'sakura') {
    let seed = part === 'roof' ? 7 : 3; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < (part === 'roof' ? 6 : 12); i++) {
      const x = W * (0.12 + rnd() * 0.76), y = H * (0.05 + rnd() * 0.9), r = W * (0.04 + rnd() * 0.04);
      for (let k = 0; k < 5; k++) { const a = k * 1.2566 + rnd(); g.beginPath(); g.ellipse(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.8, r * 0.5, a, 0, 7); g.fill(); }
    }
  } else return null;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function decalPlane(tex, len, wid, y, z = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(wid, len), new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.rotation.x = -Math.PI / 2; m.position.set(0, y, z);
  return m;
}

// Underglow pool + lamp, with optional animation (breathe / strobe / rainbow) via car.userData.tick.
function addGlow(car, { tex, w, l, color, pulse = 'off', lampPower = 6, y = 0.03, order = 0 }) {
  const mat = new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, depthWrite: false, opacity: 0.92 });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(w, l), mat);
  pool.rotation.x = -Math.PI / 2; pool.position.y = y; pool.renderOrder = order;
  car.add(pool);
  const lamp = new THREE.PointLight(color, lampPower, 4.5, 1.6);
  lamp.position.set(0, 0.15, 0);
  car.add(lamp);
  if (pulse && pulse !== 'off') {
    const base = new THREE.Color(color);
    car.userData.tick = (t) => {
      let k = 1;
      if (pulse === 'breathe') k = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t / 450));
      else if (pulse === 'strobe') k = Math.floor(t / 140) % 2 ? 1 : 0.15;
      else if (pulse === 'rainbow') { const c = new THREE.Color().setHSL((t / 4000) % 1, 1, 0.55); mat.color.copy(c); lamp.color.copy(c); }
      if (pulse !== 'rainbow') { mat.color.copy(base); }
      mat.opacity = 0.92 * k; lamp.intensity = lampPower * k;
    };
  }
  return pool;
}

// ---------- Route-responsive effects (the map car reacts to the drive) ----------
// Turn signals blink before each turn on your route, brake lights glow when you slow down,
// a warning glow pulses when a hazard is ahead, and headlights / underglow brighten with speed.
function attachDriveFx(car) {
  if (car.userData.fx) return car.userData.fx;
  // Size from the solid body only (the glow pools on the road are much bigger than the car).
  const box = new THREE.Box3();
  car.updateMatrixWorld(true);
  car.traverse((o) => { if (o.isMesh && o.material && !o.material.transparent) box.expandByObject(o); });
  if (box.isEmpty()) box.setFromObject(car);
  const zF = box.min.z, zR = box.max.z, xL = box.min.x, xR = box.max.x;
  const pool = (color, w, l, x, z, y = 0.06) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), new THREE.MeshBasicMaterial({ map: glowTexture(), color, transparent: true, depthWrite: false, opacity: 0, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.renderOrder = 4; car.add(m); return m;
  };
  const blink = { left: [pool('#ffb300', 1.3, 1.3, xL, zF + 0.2), pool('#ffb300', 1.3, 1.3, xL, zR - 0.2)], right: [pool('#ffb300', 1.3, 1.3, xR, zF + 0.2), pool('#ffb300', 1.3, 1.3, xR, zR - 0.2)] };
  const brake = pool('#ff1a1a', (xR - xL) * 1.3, 1.8, 0, zR + 0.5);
  const warn = pool('#ff3b30', (xR - xL) * 2.6, (zR - zF) * 1.7, 0, (zF + zR) / 2, 0.035);
  const beams = car.children.filter((c) => c.isGroup && c.children.some((m) => m.material?.blending === THREE.AdditiveBlending && m.geometry?.parameters?.height === 6));
  const fx = (st, t) => {
    const on = Math.floor(t / 380) % 2 === 0;
    for (const side of ['left', 'right']) for (const m of blink[side]) m.material.opacity = st.turn === side && on ? 0.95 : 0;
    brake.material.opacity += ((st.braking ? 0.85 : 0) - brake.material.opacity) * 0.25;
    warn.material.opacity = st.alert ? 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t / 220)) : 0;
    const k = Math.min(1, (st.speed || 0) / 70);
    for (const g of beams) for (const m of g.children) if (m.material) m.material.opacity = 0.35 + 0.45 * k;
  };
  car.userData.fx = fx;
  return fx;
}

// A stylized 3D car: body shape, paint, wheels, optional hood scoop / wing, and underglow.

// Headlight beams: two soft cones of light on the road ahead (front is -Z).
function headBeams(front, tint = '255,246,214') {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 256, 0, 0);
  grd.addColorStop(0, `rgba(${tint},0.7)`); grd.addColorStop(0.5, `rgba(${tint},0.2)`); grd.addColorStop(1, `rgba(${tint},0)`);
  g.fillStyle = grd;
  g.beginPath(); g.moveTo(56, 256); g.lineTo(72, 256); g.lineTo(128, 0); g.lineTo(0, 0); g.closePath(); g.fill();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 });
  const grp = new THREE.Group();
  for (const x of [-0.55, 0.55]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 6), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.05, front - 3);
    grp.add(m);
  }
  return grp;
}

export function buildCar({ body = '#1f5ad6', glow = null, shape = 'sedan', wheels = 'stock', wheelColor = '#c9ced6', scoop = false, wing = false, style = {} } = {}) {
  const d = SHAPE_DIMS[shape] || SHAPE_DIMS.sedan;
  const car = new THREE.Group();
  const paint = paintMaterial(body, style.finish);
  const glass = new THREE.MeshStandardMaterial({ color: '#0d1118', metalness: 0.2, roughness: 0.08 });
  const black = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.7 });
  const carbon = new THREE.MeshStandardMaterial({ color: '#1b1b1f', metalness: 0.4, roughness: 0.45 });

  // Lower body, cabin (glass), roof.
  car.add(slab(carShape(d.len, d.wid), d.bodyH, d.y0, paint));
  const top = d.y0 + d.bodyH + 0.05;
  const cabin = slab(carShape(d.cabin.len, d.cabin.wid, d.cabin.nose, d.cabin.tail), d.cabin.h, top, glass, 0.04);
  cabin.position.z = d.cabin.z;
  car.add(cabin);
  const roof = slab(carShape(d.cabin.len * 0.7, d.cabin.wid * 0.88, 0.12, 0.12), 0.05, top + d.cabin.h - 0.02, paint, 0.03);
  roof.position.z = d.roofZ;
  car.add(roof);
  if (style.decal && style.decal !== 'none') {
    const dc = style.decalColor || '#ffffff';
    const bt = decalTexture(style.decal, dc, style.decalText, d.len, d.wid, 'body');
    if (bt) car.add(decalPlane(bt, d.len * 0.97, d.wid * 0.9, top + 0.025));
    const rl = d.cabin.len * 0.7, rw = d.cabin.wid * 0.88;
    const rt = decalTexture(style.decal, dc, style.decalText, rl, rw, 'roof');
    if (rt) car.add(decalPlane(rt, rl * 0.92, rw * 0.85, top + d.cabin.h + 0.07, d.roofZ));
  }
  // Pickup bed: open box behind the cab.
  if (shape === 'truck') {
    const bedLen = 1.95, z = d.len / 2 - bedLen / 2 - 0.12;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(d.wid - 0.2, 0.04, bedLen), black);
    floor.position.set(0, top - 0.02, z); car.add(floor);
    for (const x of [-(d.wid / 2 - 0.12), d.wid / 2 - 0.12]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, bedLen), paint);
      side.position.set(x, top + 0.14, z); car.add(side);
    }
    const gate = new THREE.Mesh(new THREE.BoxGeometry(d.wid - 0.2, 0.32, 0.08), paint);
    gate.position.set(0, top + 0.14, d.len / 2 - 0.16); car.add(gate);
  }
  if (scoop) {
    const sc = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.42), paint);
    sc.position.set(0, top + 0.02, -d.len / 2 + 0.95);
    car.add(sc);
  }
  if (wing) {
    const wz = d.len / 2 - 0.3;
    const w = new THREE.Mesh(new THREE.BoxGeometry(d.wid * 0.94, 0.05, 0.3), carbon);
    w.position.set(0, top + 0.3, wz);
    car.add(w);
    for (const x of [-0.6, 0.6]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.1), carbon);
      post.position.set(x, top + 0.14, wz);
      car.add(post);
    }
  }
  // Wheels: black tire with the rim drawn on the outer face.
  const r = d.wheelR;
  const tireGeo = new THREE.CylinderGeometry(r, r, 0.26, 24);
  tireGeo.rotateZ(Math.PI / 2);
  const rimMat = new THREE.MeshStandardMaterial({ map: wheelTexture(wheels, wheelColor), metalness: 0.6, roughness: 0.35 });
  const faceGeo = new THREE.CircleGeometry(r * 0.98, 24);
  const wx = d.wid / 2 - 0.07;
  for (const z of d.wheelZ) for (const side of [-1, 1]) {
    const tire = new THREE.Mesh(tireGeo, black);
    tire.position.set(side * wx, r, z);
    car.add(tire);
    const face = new THREE.Mesh(faceGeo, rimMat);
    face.rotation.y = side * Math.PI / 2;
    face.position.set(side * (wx + 0.135), r, z);
    car.add(face);
  }
  // Lights.
  const lightKind = style.lights || 'stock';
  const head = new THREE.MeshBasicMaterial({ color: LIGHT_COLOR[lightKind] || '#fff6d8' });
  const tail = new THREE.MeshBasicMaterial({ color: '#ff2a2a' });
  const ly = d.y0 + d.bodyH * 0.72;
  for (const x of [-d.wid * 0.33, d.wid * 0.33]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.36, lightKind === 'led' ? 0.05 : 0.08, 0.06), head);
    h.position.set(x, ly, -d.len / 2 + 0.02);
    car.add(h);
    if (lightKind === 'halo') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.022, 6, 20), head);
      ring.position.set(x, ly, -d.len / 2 - 0.02);
      car.add(ring);
    }
    if (style.lashes) {
      const lash = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 6, 16, Math.PI), black);
      lash.position.set(x, ly + 0.02, -d.len / 2 - 0.01);
      car.add(lash);
    }
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.09, 0.06), tail);
    t.position.set(x, ly + 0.03, d.len / 2 - 0.02);
    car.add(t);
  }

  // Underglow: a soft pool of light on the road, plus a light that tints the car's sides.
  if (glow) addGlow(car, { tex: glowTexture(), w: d.wid * 2.1, l: d.len * 1.5, color: glow, pulse: style.pulse });
  car.add(headBeams(-d.len / 2, lightKind === 'yellow' ? '255,214,90' : lightKind === 'stock' ? '255,246,214' : '225,240,255'));
  return car;
}

// Soft underglow that follows the car's outline (from the car's own silhouette).
function glowFromMask(mask, color, pad) {
  const w = mask.width, h = mask.height;
  const c = document.createElement('canvas');
  c.width = Math.round(w * pad); c.height = Math.round(h * pad);
  const g = c.getContext('2d');
  const tint = document.createElement('canvas');
  tint.width = w; tint.height = h;
  const tg = tint.getContext('2d');
  tg.drawImage(mask, 0, 0);
  tg.globalCompositeOperation = 'source-in';
  tg.fillStyle = color;
  tg.fillRect(0, 0, w, h);
  const blur = Math.round(Math.max(w, h) * 0.045);
  const ox = (c.width - w) / 2, oy = (c.height - h) / 2;
  g.filter = `blur(${blur}px)`;
  for (let k = 0; k < 3; k++) g.drawImage(tint, ox - w * 0.04, oy - h * 0.025, w * 1.08, h * 1.05); // a bit wider than the car
  g.filter = `blur(${Math.round(blur / 2.5)}px)`;
  g.drawImage(tint, ox, oy, w, h); // brighter rim right under the edges
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Your own car picture lying on the road (like Waze's car icons): the exact picture,
// lifted a little over a soft shadow, with the underglow traced from its outline.
export function buildPictureCar({ picture, aspect, glow = null, style = {} }) {
  const car = new THREE.Group();
  const PL = LEN, PW = LEN * aspect;

  // Soft shadow so the car looks like it sits on the road.
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(PW * 1.25, PL * 1.12),
    new THREE.MeshBasicMaterial({ map: glowFromMask(picture, '#000000', 1.25), transparent: true, opacity: 0.55, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0.12, 0.02, 0.18);
  shadow.renderOrder = 1;
  car.add(shadow);

  if (glow) addGlow(car, { tex: glowFromMask(picture, '#ffffff', 1.5), w: PW * 1.5, l: PL * 1.5, color: glow, pulse: style.pulse, y: 0.04, order: 2, lampPower: 0 });

  // The picture itself, unlit so its colors stay exactly as drawn.
  const tex = new THREE.CanvasTexture(picture);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const top = new THREE.Mesh(
    new THREE.PlaneGeometry(PW, PL),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.4, depthWrite: false })
  );
  top.rotation.x = -Math.PI / 2; // front of the picture points forward (-Z)
  top.position.y = 0.6;
  top.renderOrder = 3;
  car.add(top);
  return car;
}

// MapLibre custom layer that draws the car at getPose() = { lngLat:[lng,lat], bearing } each frame.
export function car3dLayer({ id = 'dz-car3d', colors, getPose, screenLength = 115, isActive = () => true, getDrive = null }) {
  let renderer, scene, camera, map, car, pulseT = null;
  return {
    id,
    type: 'custom',
    renderingMode: '3d',
    onAdd(m, gl) {
      map = m;
      camera = new THREE.Camera();
      scene = new THREE.Scene();
      scene.add(new THREE.AmbientLight('#ffffff', 1.1));
      const sun = new THREE.DirectionalLight('#ffffff', 2.2);
      sun.position.set(-3, 8, -4);
      scene.add(sun);
      const fill = new THREE.DirectionalLight('#9fb4ff', 0.8);
      fill.position.set(4, 3, 5);
      scene.add(fill);
      if (colors?.modelUrl) {
        // Real 3D model: show the picture version until it has loaded.
        if (colors.picture) { car = buildPictureCar(colors); scene.add(car); }
        buildModelCar({ url: colors.modelUrl, paint: colors.paint, glow: colors.glow, picture: colors.picture, frontAxis: colors.frontAxis, paintMaterials: colors.paintMaterials, style: colors.style || {} })
          .then((m) => { if (car) scene.remove(car); car = m; scene.add(m); map.triggerRepaint(); })
          .catch((e) => console.warn('Car model failed to load', e));
      } else {
        car = colors?.picture && !colors?.shape ? buildPictureCar(colors) : buildCar(colors || {});
        scene.add(car);
      }
      renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
    },
    render(gl, args) {
      const pose = getPose();
      if (!pose || !car) return;
      const merc = maplibregl.MercatorCoordinate.fromLngLat(pose.lngLat, 0);
      // Keep the car about `screenLength` px long whatever the zoom (like Waze).
      const mpp = (78271.517 * Math.cos((pose.lngLat[1] * Math.PI) / 180)) / 2 ** map.getZoom();
      const exaggerate = Math.max(1, (screenLength * mpp) / LEN);
      const s = merc.meterInMercatorCoordinateUnits() * exaggerate;
      const m = new THREE.Matrix4().fromArray(args.defaultProjectionData?.mainMatrix || args.modelViewProjectionMatrix);
      const l = new THREE.Matrix4()
        .makeTranslation(merc.x, merc.y, merc.z)
        .scale(new THREE.Vector3(s, -s, s))
        .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
        .multiply(new THREE.Matrix4().makeRotationY((-pose.bearing * Math.PI) / 180));
      camera.projectionMatrix = m.multiply(l);
      renderer.resetState();
      // Your car is always drawn on top: 3D buildings must never hide it (it's drawn
      // bigger than life so it stays readable, which makes it poke into nearby buildings).
      renderer.clearDepth();
      renderer.render(scene, camera);
      // Animated underglow: keep redrawing (about 30 times a second).
      const st = getDrive?.();
      const fxOn = !!st && (st.turn || st.braking || st.alert);
      if (st) attachDriveFx(car)(st, performance.now());
      if ((car.userData.tick || fxOn) && isActive()) {
        car.userData.tick?.(performance.now());
        if (!pulseT) pulseT = setTimeout(() => { pulseT = null; map.triggerRepaint(); }, 33);
      }
    },
    onRemove() { clearTimeout(pulseT); renderer?.dispose(); },
  };
}

// From an uploaded top-down picture (front facing up): the car on its own (glow removed),
// its paint color and its underglow color.
export async function prepareCarPicture(src) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const im = g.getImageData(0, 0, W, H);
  const d = im.data;
  const sat = (i) => Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);

  // Glow = see-through colored pixels; car = solid pixels.
  let gr = 0, gg = 0, gb = 0, gn = 0, br = 0, bg = 0, bb = 0, bn = 0;
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, a = d[i + 3];
    if (a >= 248) {
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (y > H * 0.12 && y < H * 0.3 && x > W * 0.3 && x < W * 0.7 && sat(i) > 50) { br += d[i]; bg += d[i + 1]; bb += d[i + 2]; bn++; }
    } else {
      if (a > 40 && sat(i) > 60) { gr += d[i]; gg += d[i + 1]; gb += d[i + 2]; gn++; }
      d[i + 3] = 0; // drop the glow from the car's top picture
    }
  }
  if (maxX < 0) throw new Error('No car found in the picture');
  g.putImageData(im, 0, 0);
  const car = document.createElement('canvas');
  car.width = maxX - minX + 1; car.height = maxY - minY + 1;
  car.getContext('2d').drawImage(c, minX, minY, car.width, car.height, 0, 0, car.width, car.height);
  const hex = (r, g2, b, n) => `#${[r, g2, b].map((v) => Math.round(v / n).toString(16).padStart(2, '0')).join('')}`;
  // Texture for the 3D body: the picture over its own paint color (so no see-through gaps).
  const texture = document.createElement('canvas');
  texture.width = car.width; texture.height = car.height;
  const tx = texture.getContext('2d');
  tx.fillStyle = bn ? hex(br, bg, bb, bn) : '#1f5ad6';
  tx.fillRect(0, 0, car.width, car.height);
  tx.drawImage(car, 0, 0);
  return {
    texture,
    picture: car,
    aspect: car.width / car.height,
    body: bn ? hex(br, bg, bb, bn) : null,
    glow: gn > 200 ? hex(gr, gg, gb, gn) : null,
  };
}

// ---------- Real 3D model (.glb) ----------
// Loads a car model, centers it, makes it LEN long facing forward (-Z), repaints
// the body, and adds the underglow (shaped from the car picture when there is one).
export async function buildModelCar({ url, paint = null, glow = null, picture = null, aspect = 0.42, frontAxis = '-z', paintMaterials = null, style = {} }) {
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/libs/meshopt_decoder.module.js'),
  ]);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);
  const model = gltf.scene;

  // Face forward: rotate so the model's front points to -Z.
  const turn = { '-z': 0, '+z': Math.PI, '+x': Math.PI / 2, '-x': -Math.PI / 2 }[frontAxis] || 0;
  model.rotation.y = turn;
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const k = LEN / Math.max(size.x, size.z);
  const holder = new THREE.Group();
  model.position.sub(box.getCenter(new THREE.Vector3())).setY(-box.min.y); // centered, wheels on the road
  holder.add(model);
  holder.scale.setScalar(k);

  // Repaint the body (materials whose names look like paint).
  if (paint || style.finish) {
    const isPaint = paintMaterials
      ? (m) => paintMaterials.includes(m.name)
      : (m) => /paint|body|carpaint|car_paint|exterior/i.test(m.name || '');
    model.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (m && isPaint(m) && m.color) { if (paint) m.color.set(paint); refinish(m, style.finish || (paint ? 'metallic' : null)); }
      }
    });
  }

  const car = new THREE.Group();
  car.add(holder);
  if (glow) {
    const PL = LEN * 1.02, PW = LEN * (picture ? picture.width / picture.height : aspect);
    const tex = picture ? glowFromMask(picture, '#ffffff', 1.5) : glowTexture();
    addGlow(car, { tex, w: PW * 1.5, l: PL * 1.5, color: glow, pulse: style.pulse, y: 0.04, order: 1, lampPower: 10 });
  }
  const lk = style.lights || 'stock';
  car.add(headBeams(-LEN / 2, lk === 'yellow' ? '255,214,90' : lk === 'stock' ? '255,246,214' : '225,240,255'));
  return car;
}

// ---------- Bloom (post-processing glow) for the garage scenes ----------
// Bright things (underglow, neon, lights, screens) bleed light like a camera lens.
// Returns { render(), setSize(w, h) } — falls back to a plain render if anything fails.
export async function makeBloom(renderer, scene, camera, w, h, { strength = 0.55, radius = 0.4, threshold = 0.65 } = {}) {
  try {
    const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
      import('three/examples/jsm/postprocessing/EffectComposer.js'),
      import('three/examples/jsm/postprocessing/RenderPass.js'),
      import('three/examples/jsm/postprocessing/UnrealBloomPass.js'),
      import('three/examples/jsm/postprocessing/OutputPass.js'),
    ]);
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), strength, radius, threshold);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    composer.setSize(w, h);
    return { render: () => composer.render(), setSize: (nw, nh) => { composer.setSize(nw, nh); bloom.setSize(nw, nh); }, dispose: () => composer.dispose?.() };
  } catch {
    return { render: () => renderer.render(scene, camera), setSize: () => {}, dispose: () => {} };
  }
}
