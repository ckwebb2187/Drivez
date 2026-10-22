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

// Your own WRX: the uploaded top-down picture becomes the top of a 3D body,
// with matching side panels, wheels, and the underglow on the road.
export function buildPictureCar({ picture, aspect, body = '#1f5ad6', glow = null }) {
  const car = new THREE.Group();
  const len = LEN, wid = LEN * aspect;
  const paint = new THREE.MeshStandardMaterial({ color: body, metalness: 0.5, roughness: 0.35 });
  const black = new THREE.MeshStandardMaterial({ color: '#0e0e10', roughness: 0.7 });

  // Body sides: a slightly inset, well-rounded slab so the picture's own outline defines the shape.
  const inset = 0.94;
  const sideShape = carShape(len * inset, wid * inset, wid * 0.16, wid * 0.08);
  car.add(slab(sideShape, 0.78, 0.3, paint, 0.08));
  // Darker sill along the bottom.
  car.add(slab(carShape(len * 0.9, wid * 0.9, wid * 0.14, wid * 0.06), 0.14, 0.24, black, 0.02));

  // The picture on top.
  const tex = new THREE.CanvasTexture(picture);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const top = new THREE.Mesh(
    new THREE.PlaneGeometry(wid, len),
    new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.5, metalness: 0.35, roughness: 0.4 })
  );
  top.rotation.x = -Math.PI / 2; // lie flat; picture's top (front) points to -Z
  top.position.y = 1.17;
  car.add(top);

  // Tail lights on the back and headlights on the front of the body.
  const tailMat = new THREE.MeshBasicMaterial({ color: '#ff1e1e' });
  const headMat = new THREE.MeshBasicMaterial({ color: '#fff4d6' });
  for (const side of [-1, 1]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.26, 0.12, 0.05), tailMat);
    t.position.set(side * wid * 0.29, 0.92, (len * inset) / 2 + 0.07);
    car.add(t);
    const h = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.22, 0.1, 0.05), headMat);
    h.position.set(side * wid * 0.27, 0.86, -(len * inset) / 2 - 0.07);
    car.add(h);
  }

  // Wheels peeking out at the corners.
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 20);
  wheelGeo.rotateZ(Math.PI / 2);
  const wx = wid / 2 - 0.12, wz = len * 0.31;
  for (const [x, z] of [[-wx, -wz], [wx, -wz], [-wx, wz], [wx, wz]]) {
    const w = new THREE.Mesh(wheelGeo, black);
    w.position.set(x, 0.36, z);
    car.add(w);
  }

  if (glow) {
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(wid * 2.6, len * 1.6),
      new THREE.MeshBasicMaterial({ map: glowTexture(glow), transparent: true, depthWrite: false, opacity: 0.9 })
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
  return {
    picture: car,
    aspect: car.width / car.height,
    body: bn ? hex(br, bg, bb, bn) : null,
    glow: gn > 200 ? hex(gr, gg, gb, gn) : null,
  };
}
