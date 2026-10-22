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

function glowTexture(color) {
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

export function buildCar({ body = '#1f5ad6', glow = null } = {}) {
  const car = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: body, metalness: 0.55, roughness: 0.32 });
  const glass = new THREE.MeshStandardMaterial({ color: '#0d1118', metalness: 0.2, roughness: 0.08 });
  const black = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.7 });
  const carbon = new THREE.MeshStandardMaterial({ color: '#1b1b1f', metalness: 0.4, roughness: 0.45 });

  // Lower body, cabin (glass), roof.
  car.add(slab(carShape(LEN, WID), 0.62, 0.28, paint));
  const cabin = slab(carShape(2.35, 1.56, 0.25, 0.15), 0.42, 0.95, glass, 0.04);
  cabin.position.z = 0.25;
  car.add(cabin);
  const roof = slab(carShape(1.55, 1.36, 0.12, 0.12), 0.05, 1.4, paint, 0.03);
  roof.position.z = 0.3;
  car.add(roof);
  // Hood scoop.
  const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.42), paint);
  scoop.position.set(0, 0.98, -1.35);
  car.add(scoop);
  // Rear wing.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.05, 0.3), carbon);
  wing.position.set(0, 1.28, 2.05);
  car.add(wing);
  for (const x of [-0.6, 0.6]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 0.1), carbon);
    post.position.set(x, 1.1, 2.05);
    car.add(post);
  }
  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 18);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const [x, z] of [[-0.86, -1.38], [0.86, -1.38], [-0.86, 1.4], [0.86, 1.4]]) {
    const w = new THREE.Mesh(wheelGeo, black);
    w.position.set(x, 0.34, z);
    car.add(w);
  }
  // Lights.
  const head = new THREE.MeshBasicMaterial({ color: '#fff6d8' });
  const tail = new THREE.MeshBasicMaterial({ color: '#ff2a2a' });
  for (const x of [-0.62, 0.62]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.06), head);
    h.position.set(x, 0.72, -LEN / 2 + 0.02);
    car.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.09, 0.06), tail);
    t.position.set(x, 0.75, LEN / 2 - 0.02);
    car.add(t);
  }

  // Underglow: a soft pool of light on the road, plus a light that tints the car's sides.
  if (glow) {
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(WID * 2.1, LEN * 1.55),
      new THREE.MeshBasicMaterial({ map: glowTexture(glow), transparent: true, depthWrite: false, opacity: 0.9 })
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.03;
    car.add(pool);
    const lamp = new THREE.PointLight(glow, 6, 4.5, 1.6);
    lamp.position.set(0, 0.15, 0);
    car.add(lamp);
  }
  return car;
}

// ---------- WRX STI (2015-2017 "VA") body, to real proportions ----------
// Length 4.6 m, width 1.8 m, height 1.48 m, wheelbase 2.65 m. Front is -Z.
const WRX = { L: 4.6, ground: 0.2, axleF: 0.205, axleR: 0.78 };
const smooth = (a, b, t) => { const x = Math.min(1, Math.max(0, (t - a) / (b - a))); return x * x * (3 - 2 * x); };
const lerp = (a, b, k) => a + (b - a) * k;
const bump = (t, c, w) => Math.exp(-(((t - c) / w) ** 2));

// Roof/hood/trunk height along the car (t: 0 = front bumper, 1 = rear bumper).
function wrxTop(t) {
  const keys = [[0, 0.66], [0.035, 0.84], [0.09, 0.93], [0.3, 1.0], [0.36, 1.18], [0.45, 1.44], [0.62, 1.45], [0.7, 1.36], [0.8, 1.08], [0.84, 1.06], [0.97, 1.03], [0.985, 1.0], [1, 0.95]];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) { const [t0, h0] = keys[i - 1], [t1, h1] = keys[i]; return lerp(h0, h1, smooth(0, 1, (t - t0) / (t1 - t0))); }
  }
  return 0.95;
}
function wrxHalfWidth(t, maxHalf) {
  let w = 0.9 * smooth(-0.02, 0.07, t) + 0.74 * (1 - smooth(-0.02, 0.07, t));   // tapered nose
  w = lerp(w, 0.85, smooth(0.95, 1, t));                                          // rounded tail corners
  w += 0.03 * bump(t, WRX.axleF, 0.06) + 0.035 * bump(t, WRX.axleR, 0.06);        // fender flares
  return Math.min(w, maxHalf);
}
function wrxRoofHalf(t, hw) {
  const g = smooth(0.3, 0.42, t) * (1 - smooth(0.7, 0.82, t)); // 1 inside the greenhouse
  return lerp(hw - 0.07, 0.6, g);
}

// Lofted body with the picture projected from above (so the paint, scoop, sunroof and windows line up).
function wrxBodyGeometry(PW, PL, maxHalf) {
  const N = 64, ring = [];
  const pos = [], uv = [], idx = [];
  const L = WRX.L;
  for (let i = 0; i <= N; i++) {
    const t = i / N, z = -L / 2 + t * L;
    const top = wrxTop(t), hw = wrxHalfWidth(t, maxHalf);
    const greenhouse = top > 1.06;
    const belt = greenhouse ? 0.99 : top - 0.05;
    const tw = greenhouse ? wrxRoofHalf(t, hw) : hw - 0.07;
    const hwb = hw - 0.07, y0 = WRX.ground;
    const pts = [
      [-hwb, y0], [-hw, 0.42], [-hw, belt - 0.07], [-(hw - 0.025), belt],
      [-tw, top - 0.035], [-(tw - 0.06), top], [tw - 0.06, top], [tw, top - 0.035],
      [hw - 0.025, belt], [hw, belt - 0.07], [hw, 0.42], [hwb, y0],
    ];
    ring.push(pts.length);
    for (const [x, y] of pts) {
      pos.push(x, y, z);
      uv.push(x / PW + 0.5, 1 - (z + PL / 2) / PL);
    }
  }
  const M = ring[0];
  // Three parts: top (picture), side glass (greenhouse), painted sides/bottom.
  const topIdx = [], glassIdx = [], sideIdx = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
    const a = i * M + j, b = i * M + ((j + 1) % M), c = (i + 1) * M + j, d = (i + 1) * M + ((j + 1) % M);
    const tMid = (i + 0.5) / N;
    const inGreenhouse = wrxTop(tMid) > 1.1 && tMid > 0.33 && tMid < 0.8;
    const list = (j >= 4 && j <= 6) ? topIdx : (j === 3 || j === 7) ? (inGreenhouse ? glassIdx : topIdx) : sideIdx;
    list.push(a, c, b, b, c, d);
  }
  idx.push(...topIdx, ...glassIdx, ...sideIdx);
  const groups = [[0, topIdx.length, 0], [topIdx.length, glassIdx.length, 1], [topIdx.length + glassIdx.length, sideIdx.length, 2]];
  // Front and rear faces.
  for (const [i, flip] of [[0, false], [N, true]]) {
    const base = pos.length / 3;
    let cx = 0, cy = 0;
    for (let j = 0; j < M; j++) { cx += pos[(i * M + j) * 3]; cy += pos[(i * M + j) * 3 + 1]; }
    const z = pos[i * M * 3 + 2];
    pos.push(cx / M, cy / M, z); uv.push(0.5, flip ? 0.0 : 1.0);
    for (let j = 0; j < M; j++) {
      const a = i * M + j, b = i * M + ((j + 1) % M);
      if (flip) idx.push(base, a, b); else idx.push(base, b, a);
    }
  }
  const capStart = groups[2][0] + groups[2][1];
  groups.push([capStart, idx.length - capStart, 2]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  for (const [start, count, mat] of groups) g.addGroup(start, count, mat);
  g.computeVertexNormals();
  return g;
}

// 2015-2017 WRX STI tail lights: wraparound clusters (quarter panel -> corner -> trunk lid)
// with the C-shaped LED outline inside each lens.
function wrxTailLights(hwRear) {
  const group = new THREE.Group();
  const lens = new THREE.MeshStandardMaterial({ color: '#5a0608', emissive: '#7a0000', emissiveIntensity: 0.6, metalness: 0.2, roughness: 0.25 });
  const led = new THREE.MeshBasicMaterial({ color: '#ff3030' });
  const zRear = WRX.L / 2 + 0.006;
  for (const side of [-1, 1]) {
    // Rear-facing part: tall at the outer corner, narrowing and rising as it runs onto the trunk lid.
    const sh = new THREE.Shape();
    const xo = hwRear - 0.02, xi = 0.33;
    sh.moveTo(xi, 0.955);
    sh.lineTo(xi + 0.05, 1.005);
    sh.lineTo(xo - 0.05, 1.0);
    sh.quadraticCurveTo(xo, 0.995, xo, 0.95);
    sh.lineTo(xo - 0.01, 0.83);
    sh.quadraticCurveTo(xo - 0.05, 0.8, xo - 0.12, 0.815);
    sh.lineTo(xi + 0.16, 0.9);
    sh.lineTo(xi + 0.02, 0.925);
    sh.lineTo(xi, 0.955);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: false });
    const m = new THREE.Mesh(g, lens);
    m.scale.x = side;
    m.position.z = zRear - 0.012;
    group.add(m);
    // C-shaped LED signature, opening toward the middle of the car.
    const cx = side * (xo - 0.17), cy = 0.915;
    const pts = [];
    for (let k = 0; k <= 24; k++) {
      const a = (-0.62 + (k / 24) * 1.24) * Math.PI; // ~220 degrees of a ring
      pts.push(new THREE.Vector3(cx + side * Math.cos(a) * 0.13, cy + Math.sin(a) * 0.055, zRear + 0.012));
    }
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.009, 6, false), led);
    group.add(tube);
    // Wrap onto the rear quarter panel.
    const ws = new THREE.Shape();
    ws.moveTo(0, 0.83); ws.lineTo(0.22, 0.86); ws.lineTo(0.26, 0.97); ws.lineTo(0.02, 0.99); ws.lineTo(0, 0.83);
    const wg = new THREE.ExtrudeGeometry(ws, { depth: 0.012, bevelEnabled: false });
    const wrap = new THREE.Mesh(wg, lens);
    wrap.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    wrap.position.set(side * (hwRear + 0.004 + (side > 0 ? 0 : 0.012)), 0, zRear - 0.004);
    if (side < 0) { wrap.rotation.y = Math.PI / 2; wrap.position.x = -(hwRear + 0.016); wrap.position.z = zRear - 0.004; }
    group.add(wrap);
  }
  // Third brake light on the wing, quad exhaust tips under the bumper.
  const pipeMat = new THREE.MeshStandardMaterial({ color: '#b9bcc2', metalness: 0.9, roughness: 0.25 });
  for (const x of [-0.62, -0.47, 0.47, 0.62]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.12, 14), pipeMat);
    p.rotation.x = Math.PI / 2;
    p.position.set(x, 0.3, WRX.L / 2 + 0.02);
    group.add(p);
  }
  return group;
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

export function buildPictureCar({ picture, texture, aspect, body = '#1f5ad6', glow = null }) {
  const car = new THREE.Group();
  const PL = WRX.L, PW = WRX.L * aspect;               // the picture's size in meters
  const maxHalf = Math.min(0.92, (PW / 2) * 0.9);       // leave the mirrors outside the body
  const map = new THREE.CanvasTexture(texture || picture);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const paint = new THREE.MeshStandardMaterial({ map, metalness: 0.45, roughness: 0.32, side: THREE.DoubleSide });
  const plain = new THREE.MeshStandardMaterial({ color: body, metalness: 0.5, roughness: 0.32, side: THREE.DoubleSide });
  const sideGlass = new THREE.MeshStandardMaterial({ color: '#0b0e14', metalness: 0.3, roughness: 0.08, side: THREE.DoubleSide });
  car.add(new THREE.Mesh(wrxBodyGeometry(PW, PL, maxHalf), [paint, sideGlass, plain]));

  const black = new THREE.MeshStandardMaterial({ color: '#0d0d10', roughness: 0.75 });
  const carbon = new THREE.MeshStandardMaterial({ color: '#17171b', metalness: 0.5, roughness: 0.4 });
  const rimMat = new THREE.MeshStandardMaterial({ color: '#2a2c31', metalness: 0.8, roughness: 0.3 });

  // Mirrors.
  for (const side of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.13), plain);
    m.position.set(side * (wrxHalfWidth(0.34, maxHalf) + 0.09), 1.02, -WRX.L / 2 + 0.34 * WRX.L);
    car.add(m);
  }
  // STI wing on two pedestals.
  const wingZ = WRX.L / 2 - 0.24;
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.045, 0.3), carbon);
  wing.position.set(0, 1.33, wingZ);
  wing.rotation.x = -0.08;
  car.add(wing);
  for (const x of [-0.58, 0.58]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.16), carbon);
    post.position.set(x, 1.17, wingZ + 0.02);
    car.add(post);
  }
  for (const x of [-0.81, 0.81]) { // end plates
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.34), carbon);
    plate.position.set(x, 1.33, wingZ);
    car.add(plate);
  }
  // Tail lights, exhaust.
  car.add(wrxTailLights(wrxHalfWidth(1, maxHalf)));
  // Front: hawk-eye headlights, hexagon grille, big lower intake.
  const zF = -WRX.L / 2 - 0.006;
  const flat = (shape, mat, z, sx = 1) => { const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat); m.scale.x = sx; m.position.z = z; m.rotation.y = Math.PI; m.scale.x *= -1; return m; };
  const lensMat = new THREE.MeshStandardMaterial({ color: '#c9d0d8', metalness: 0.9, roughness: 0.15, emissive: '#3a3f46', side: THREE.DoubleSide });
  const ledMat = new THREE.MeshBasicMaterial({ color: '#fffaf0', side: THREE.DoubleSide });
  const amber = new THREE.MeshBasicMaterial({ color: '#ffa31a', side: THREE.DoubleSide });
  const blackFlat = new THREE.MeshStandardMaterial({ color: '#0a0a0c', roughness: 0.6, side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    // Swept "hawk-eye" lens: low and pointed at the grille, wide and tall at the corner.
    const hs = new THREE.Shape();
    hs.moveTo(0.36, 0.7); hs.lineTo(0.5, 0.735); hs.lineTo(0.72, 0.76); hs.quadraticCurveTo(0.77, 0.77, 0.75, 0.82);
    hs.lineTo(0.56, 0.815); hs.lineTo(0.4, 0.765); hs.lineTo(0.36, 0.7);
    car.add(flat(hs, lensMat, zF, side));
    // LED "C" running light along the lower edge, amber marker at the corner.
    const ls = new THREE.Shape();
    ls.moveTo(0.4, 0.712); ls.lineTo(0.72, 0.765); ls.lineTo(0.72, 0.78); ls.lineTo(0.42, 0.728); ls.lineTo(0.4, 0.712);
    car.add(flat(ls, ledMat, zF - 0.002, side));
    const am = new THREE.Shape();
    am.moveTo(0.7, 0.785); am.lineTo(0.75, 0.79); am.lineTo(0.745, 0.815); am.lineTo(0.69, 0.81); am.lineTo(0.7, 0.785);
    car.add(flat(am, amber, zF - 0.002, side));
  }
  const grille = new THREE.Shape();
  grille.moveTo(-0.3, 0.6); grille.lineTo(0.3, 0.6); grille.lineTo(0.36, 0.69); grille.lineTo(0.3, 0.76); grille.lineTo(-0.3, 0.76); grille.lineTo(-0.36, 0.69); grille.lineTo(-0.3, 0.6);
  car.add(flat(grille, blackFlat, zF));
  const intake = new THREE.Shape();
  intake.moveTo(-0.62, 0.3); intake.lineTo(0.62, 0.3); intake.lineTo(0.55, 0.47); intake.lineTo(-0.55, 0.47); intake.lineTo(-0.62, 0.3);
  car.add(flat(intake, blackFlat, zF));

  // Rear: black diffuser (exhaust tips sit in it) and the plate recess on the trunk lid.
  const zR = WRX.L / 2 + 0.006;
  const diff = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.2), blackFlat);
  diff.position.set(0, 0.32, zR);
  car.add(diff);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.13), new THREE.MeshStandardMaterial({ color: '#e8e8e8', roughness: 0.6, side: THREE.DoubleSide }));
  plate.position.set(0, 0.86, zR + 0.001);
  car.add(plate);
  const plateRecess = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.18), blackFlat);
  plateRecess.position.set(0, 0.86, zR);
  car.add(plateRecess);

  // Wheels: black tire + dark gunmetal rim, sitting in the flares.
  const tireGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.25, 26); tireGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.23, 0.23, 0.02, 20); rimGeo.rotateZ(Math.PI / 2);
  for (const t of [WRX.axleF, WRX.axleR]) for (const side of [-1, 1]) {
    const x = side * (wrxHalfWidth(t, maxHalf) - 0.1), z = -WRX.L / 2 + t * WRX.L;
    const tire = new THREE.Mesh(tireGeo, black); tire.position.set(x, 0.33, z); car.add(tire);
    const rim = new THREE.Mesh(rimGeo, rimMat); rim.position.set(x + side * 0.126, 0.33, z); car.add(rim);
  }

  if (glow) {
    const pad = 1.5;
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(PW * pad, PL * pad),
      new THREE.MeshBasicMaterial({ map: glowFromMask(picture, glow, pad), transparent: true, depthWrite: false, opacity: 0.95 })
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.03;
    car.add(pool);
    const lamp = new THREE.PointLight(glow, 8, 5, 1.5);
    lamp.position.set(0, 0.12, 0);
    car.add(lamp);
  }
  return car;
}

// MapLibre custom layer that draws the car at getPose() = { lngLat:[lng,lat], bearing } each frame.
export function car3dLayer({ id = 'dz-car3d', colors, getPose, screenLength = 115 }) {
  let renderer, scene, camera, map, car;
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
      car = colors?.picture ? buildPictureCar(colors) : buildCar(colors);
      scene.add(car);
      renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
    },
    render(gl, args) {
      const pose = getPose();
      if (!pose) return;
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
      renderer.render(scene, camera);
    },
    onRemove() { renderer?.dispose(); },
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
