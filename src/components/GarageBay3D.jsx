import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { CAR_MODELS } from '@/lib/carModels';
import { WALL_COLORS, MOD_BRANDS, MAKE_STYLE, FLOOR_COLORS, CAR_TYPES } from '@/lib/garageLook';
import { drawFloor, drawWall, drawGraffiti, LIGHT_MOODS } from '@/lib/garageScene';

// The garage showroom: your car on a lift, a neon social wall, and shop props you can tap
// (tool chest = mods & service, engine stand = specs, QR board = window sticker, wall = socials).
// `look` is the same object CarPreview3D takes; `accent` tints the neon.

function canvasTex(THREE, w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

const SOCIAL_SIGNS = [
  { key: 'facebook', label: 'f', color: '#1877f2', font: '900 150px Arial' },
  { key: 'x', label: '𝕏', color: '#ffffff', font: '900 130px Arial' },
  { key: 'youtube', label: '▶', color: '#ff0033', font: '900 120px Arial' },
  { key: 'instagram', label: 'IG', color: '#e1306c', font: '900 110px Arial' },
  { key: 'tiktok', label: '♪', color: '#25f4ee', font: '900 130px Arial' },
];

// `garage` = { wall, color, graffiti, makeBanner, mods } from garageLook; `make` names the car brand banner.
export default function GarageBay3D({ look, accent = '#00e5ff', socials = {}, qrUrl, height = 320, onProp, make = '', carModel = '', garage = {} }) {
  const box = useRef(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const tapRef = useRef(onProp);
  tapRef.current = onProp;
  const key = JSON.stringify([look, accent, socials, qrUrl, make, carModel, garage]);

  useEffect(() => {
    let alive = true, raf = 0, renderer, cleanup = () => {};
    setLoading(true); setFailed(false);
    (async () => {
      try {
        const THREE = await import('three');
        const car3d = await import('@/lib/car3d');
        if (!alive || !box.current) return;
        const w = box.current.clientWidth, h = height;
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        renderer.setSize(w, h);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        // Filmic tone mapping keeps bright lights from blowing out (less glare).
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 0.95;
        box.current.appendChild(renderer.domElement);
        const fx = garage.fx || {};
        const mood = LIGHT_MOODS[garage.light] || LIGHT_MOODS.shop;
        const B = [0.65, 1, 1.4][garage.bright ?? 1] ?? 1;
        const glow = garage.neon || accent;
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(mood.bg);
        scene.fog = fx.haze ? new THREE.FogExp2(mood.bg, 0.045) : new THREE.Fog(mood.bg, 14, 26);
        const camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 100);

        // Lighting mood: soft fill, a key on the car, ceiling strips, and spots washing the back wall.
        scene.add(new THREE.HemisphereLight(mood.hemi[0], mood.hemi[1], mood.hemi[2] * B));
        const key = new THREE.DirectionalLight(mood.key[0], mood.key[1] * B); key.position.set(3, 7, 7); scene.add(key);
        const rim = new THREE.DirectionalLight(mood.rim[0], mood.rim[1] * B); rim.position.set(-5, 4, -6); scene.add(rim);
        const neon = new THREE.PointLight(glow, mood.neon, 6, 1.8); neon.position.set(0, 0.35, 0); scene.add(neon);
        const shop = new THREE.PointLight(mood.strip, 6 * B, 12, 1.5); shop.position.set(0, 5.2, 1.5); scene.add(shop);
        for (const x of [-4.5, 0, 4.5]) {
          const spot = new THREE.SpotLight(mood.spot[0], mood.spot[1] * B, 9, 0.62, 0.85, 1.6);
          spot.position.set(x, 5.7, -2.0); spot.target.position.set(x, 2.2, -4.2);
          scene.add(spot); scene.add(spot.target);
        }
        if (mood.carSpot) { const cs = new THREE.SpotLight('#ffffff', mood.carSpot * B, 14, 0.42, 0.5, 1.4); cs.position.set(0, 7.5, 1.5); cs.target.position.set(0, 0.6, -0.4); scene.add(cs); scene.add(cs.target); }
        const stripMat = new THREE.MeshBasicMaterial({ color: mood.strip });
        for (const x of [-3.2, 0, 3.2]) { const strip = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, 0.18), stripMat); strip.position.set(x, 5.95, -0.6); scene.add(strip); }
        // Shadows (optional): the key light casts onto the floor.
        if (garage.shadows && garage.shadows !== 'off') {
          renderer.shadowMap.enabled = true;
          renderer.shadowMap.type = garage.shadows === 'soft' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
          key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
          Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 25 }); key.shadow.bias = -0.0005;
          if (garage.shadows === 'soft') key.shadow.radius = 4;
        }
        // Light sweep: a moving spotlight across the car.
        let sweep = null;
        if (fx.sweep) { sweep = new THREE.SpotLight('#ffffff', 40 * B, 14, 0.25, 0.4, 1.3); sweep.position.set(0, 6.5, 3); sweep.target.position.set(0, 0.6, -0.4); scene.add(sweep); scene.add(sweep.target); }

        // Floor (12 kinds, two colors for patterned ones).
        const fc = (id, d) => (FLOOR_COLORS.find((c) => c.id === id) || FLOOR_COLORS.find((c) => c.id === d)).hex;
        let floorOpts = {};
        const floorTex = canvasTex(THREE, 512, 512, (g, W, H) => { floorOpts = drawFloor(g, W, H, garage.floor || 'epoxy', fc(garage.floorColor, 'black'), fc(garage.floorColor2, 'gray')); });
        floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(floorOpts.repeat, floorOpts.repeat);
        const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: floorOpts.rough, metalness: floorOpts.metal });
        if (floorOpts.glow) { floorMat.emissiveMap = floorTex; floorMat.emissive = new THREE.Color('#ffffff'); floorMat.emissiveIntensity = 0.6; }
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(18, 14), floorMat);
        floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

        // Back wall (10 styles, any color).
        const base = /^#[0-9a-f]{6}$/i.test(garage.customWall || '') ? garage.customWall : (WALL_COLORS.find((c) => c.id === garage.color) || WALL_COLORS[0]).hex;
        let wallOpts = {};
        const wallTex = canvasTex(THREE, 512, 256, (g, W, H) => { wallOpts = drawWall(g, W, H, garage.wall || 'brick', base, glow); });
        wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.repeat.set(garage.wall === 'stripe' ? 1 : 3, garage.wall === 'stripe' ? 1 : 2);
        const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: wallOpts.rough ?? 0.9, metalness: wallOpts.metal ?? 0 });
        if (wallOpts.glow) { wallMat.emissiveMap = wallTex; wallMat.emissive = new THREE.Color('#ffffff'); wallMat.emissiveIntensity = 0.5; }
        const back = new THREE.Mesh(new THREE.PlaneGeometry(18, 6), wallMat); back.position.set(0, 3, -4.2); back.receiveShadow = true; scene.add(back);

        // Graffiti (6 styles, your own word).
        if (garage.graffiti && garage.graffiti !== 'off') {
          const graf = canvasTex(THREE, 2048, 683, (g, W, H) => drawGraffiti(g, W, H, garage.graffiti, garage.grafText));
          const gm = new THREE.Mesh(new THREE.PlaneGeometry(18, 6), new THREE.MeshStandardMaterial({ map: graf, transparent: true, roughness: 0.85 }));
          gm.position.set(0, 3, -4.19); scene.add(gm);
        }

        // Lift platform with a neon edge, posts and arms.
        const plat = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.3, 2.9), new THREE.MeshStandardMaterial({ color: '#1d1f26', metalness: 0.7, roughness: 0.35 }));
        plat.position.y = 0.15; scene.add(plat);
        const edge = new THREE.Mesh(new THREE.BoxGeometry(5.7, 0.05, 3.0), new THREE.MeshBasicMaterial({ color: glow }));
        edge.position.y = 0.04; scene.add(edge);
        const postMat = new THREE.MeshStandardMaterial({ color: '#3b3f4a', metalness: 0.6, roughness: 0.4 });
        const armMat = new THREE.MeshStandardMaterial({ color: '#e0b11a', metalness: 0.3, roughness: 0.5 });
        for (const x of [-3.3, 3.3]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.4, 0.28), postMat); post.position.set(x, 1.7, -1.1); scene.add(post);
          const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.18), armMat); arm.position.set(x * 0.85, 0.36, -1.1); scene.add(arm);
        }

        // Neon social wall: signs light up when that account is linked.
        const clickables = [];
        SOCIAL_SIGNS.forEach((sgn, i) => {
          const on = !!socials[sgn.key];
          const tex = canvasTex(THREE, 256, 256, (g, W, H) => {
            g.fillStyle = '#0d0e12'; g.fillRect(0, 0, W, H);
            g.shadowColor = sgn.color; g.shadowBlur = on ? 40 : 0;
            g.strokeStyle = on ? sgn.color : '#3a3c44'; g.lineWidth = 10;
            g.strokeRect(18, 18, W - 36, H - 36);
            g.fillStyle = on ? sgn.color : '#3a3c44'; g.font = sgn.font; g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillText(sgn.label, W / 2, H / 2 + 6);
          });
          const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), new THREE.MeshBasicMaterial({ map: tex }));
          sign.position.set(-2.5 + i * 1.25, 3.3, -4.15);
          sign.userData.prop = 'social';
          scene.add(sign); clickables.push(sign);
        });

        // Shop banner over the wall.
        const banner = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 0.7), new THREE.MeshBasicMaterial({ map: canvasTex(THREE, 512, 80, (g, W, H) => {
          g.fillStyle = '#0d0e12'; g.fillRect(0, 0, W, H);
          g.shadowColor = accent; g.shadowBlur = 24; g.fillStyle = accent;
          g.font = '900 54px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('KAIDO GARAGE', W / 2, H / 2 + 2);
        }) }));
        banner.position.set(0, 4.45, -4.15); scene.add(banner);

        // Car-brand banner (text in brand colors, no logos) and mod-brand pennants.
        const hang = (w, h, x, y, draw) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: canvasTex(THREE, Math.round(w * 160), Math.round(h * 160), draw), roughness: 0.8, side: THREE.DoubleSide })); m.position.set(x, y, -4.12); scene.add(m); return m; };
        if (garage.makeBanner !== false && make) {
          const ms = MAKE_STYLE[make.toLowerCase()] || { bg: '#111318', fg: '#ffffff', stripe: accent };
          hang(2.3, 0.7, -3.55, 4.45, (g, W, H) => {
            g.fillStyle = ms.bg; g.fillRect(0, 0, W, H);
            g.fillStyle = ms.stripe; g.fillRect(0, H - 14, W, 8); g.fillRect(0, 6, W, 4);
            g.fillStyle = ms.fg; g.font = `900 ${Math.round(H * 0.48)}px "Arial Black", Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillText(make.toUpperCase(), W / 2, H * 0.44);
            if (carModel) { g.font = `700 ${Math.round(H * 0.16)}px Arial`; g.fillStyle = ms.stripe; g.fillText(`${carModel.toUpperCase()} · RACE TEAM`, W / 2, H * 0.78); }
          });
        }
        const mods = [...(garage.types || []).map((id) => CAR_TYPES.find((b) => b.id === id)), ...(garage.mods || []).map((id) => MOD_BRANDS.find((b) => b.id === id))].filter(Boolean).slice(0, 8);
        // Car-type and mod banners hang in a row up near the ceiling, centered (narrower when there are many).
        const gap = 0.12, bw = Math.min(1.5, (10.6 - gap * (mods.length - 1)) / Math.max(1, mods.length)), row = mods.length * bw + (mods.length - 1) * gap;
        mods.forEach((b, i) => {
          hang(bw, 0.46, -row / 2 + bw / 2 + i * (bw + gap), 5.3, (g, W, H) => {
            g.fillStyle = b.bg; g.fillRect(0, 0, W, H);
            g.fillStyle = b.fg; g.font = `900 ${Math.min(H * 0.6, (W * 0.86) / (b.name.length * 0.66))}px "Arial Black", Arial, sans-serif`;
            g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(b.name, W / 2, H / 2 + 2);
            g.strokeStyle = b.fg; g.globalAlpha = 0.35; g.lineWidth = 4; g.strokeRect(5, 5, W - 10, H - 10); g.globalAlpha = 1;
          });
        });
        if (garage.flags) {
          hang(2.3, 0.7, 3.55, 4.45, (g, W, H) => {
            const n = 16, s2 = H / 4;
            for (let y = 0; y < 4; y++) for (let x = 0; x < n * 2; x++) { g.fillStyle = (x + y) % 2 ? '#0a0a0a' : '#f2f2f2'; g.fillRect(x * s2, y * s2, s2, s2); }
            g.fillStyle = 'rgba(0,0,0,.25)'; for (let x = 0; x < W; x += 40) g.fillRect(x, 0, 6, H);
          });
        }

        // Tool chest (left): sticker-bombed cabinet -> mods & service.
        const chestTex = canvasTex(THREE, 256, 256, (g, W, H) => {
          g.fillStyle = '#b3121f'; g.fillRect(0, 0, W, H);
          g.fillStyle = '#1a1a1a'; for (let y = 30; y < H; y += 46) g.fillRect(14, y, W - 28, 30);
          g.fillStyle = '#d9d9d9'; for (let y = 42; y < H; y += 46) g.fillRect(W / 2 - 30, y, 60, 6);
          const st = [['COBB', '#fff', '#111'], ['IAG', '#111', '#ffd400'], ['GSC', '#fff', '#0055ff'], ['RSD', '#fff', '#ff6b00']];
          st.forEach(([t, fg, bg], i) => { g.save(); g.translate(40 + (i % 2) * 120, 50 + Math.floor(i / 2) * 120); g.rotate((i % 2 ? 0.2 : -0.15)); g.fillStyle = bg; g.fillRect(-34, -16, 68, 32); g.fillStyle = fg; g.font = '900 22px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, 0, 1); g.restore(); });
        });
        const chest = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.5, 0.7), [
          new THREE.MeshStandardMaterial({ color: '#8f0e19' }), new THREE.MeshStandardMaterial({ color: '#8f0e19' }),
          new THREE.MeshStandardMaterial({ color: '#2a2a2a' }), new THREE.MeshStandardMaterial({ color: '#2a2a2a' }),
          new THREE.MeshStandardMaterial({ map: chestTex, roughness: 0.6 }), new THREE.MeshStandardMaterial({ color: '#8f0e19' }),
        ]);
        chest.position.set(-5.2, 0.75, -2.6); chest.rotation.y = 0.35; chest.userData.prop = 'chest';
        scene.add(chest); clickables.push(chest);

        // Engine on a stand (right) -> specs.
        const engine = new THREE.Group();
        const block = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.8), new THREE.MeshStandardMaterial({ color: '#8e9198', metalness: 0.7, roughness: 0.35 }));
        block.position.y = 1.2; engine.add(block);
        const cover = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.12, 0.85), new THREE.MeshStandardMaterial({ color: '#c1121f', metalness: 0.4, roughness: 0.4 }));
        cover.position.y = 1.6; engine.add(cover);
        const standMat = new THREE.MeshStandardMaterial({ color: '#c96d12' });
        const stand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, 0.12), standMat); stand.position.y = 0.5; engine.add(stand);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.12), standMat); foot.position.y = 0.04; engine.add(foot);
        engine.position.set(5.0, 0, -2.4); engine.userData.prop = 'engine';
        engine.traverse((o) => { o.userData.prop = 'engine'; });
        scene.add(engine); clickables.push(engine);

        // QR signboard (wall, right) -> window sticker.
        if (qrUrl) {
          const QRCode = (await import('qrcode')).default;
          const qrCanvas = await QRCode.toCanvas(document.createElement('canvas'), qrUrl, { margin: 1, width: 220, color: { dark: '#0b0c10', light: '#ffffff' } });
          const qrTex = canvasTex(THREE, 300, 360, (g, W, H) => {
            g.fillStyle = '#0d0e12'; g.fillRect(0, 0, W, H);
            g.shadowColor = accent; g.shadowBlur = 26; g.strokeStyle = accent; g.lineWidth = 10; g.strokeRect(12, 12, W - 24, H - 24);
            g.shadowBlur = 0; g.drawImage(qrCanvas, 40, 36, 220, 220);
            g.fillStyle = '#fff'; g.font = '900 34px system-ui'; g.textAlign = 'center'; g.fillText('SCAN MY BUILD', W / 2, 310);
          });
          const qr = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.5), new THREE.MeshBasicMaterial({ map: qrTex }));
          qr.position.set(4.6, 2.7, -4.12); qr.userData.prop = 'qr';
          scene.add(qr); clickables.push(qr);
        }

        // Tire stack (left back).
        const tireMat = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.9 });
        for (let i = 0; i < 4; i++) {
          const t = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.16, 10, 24), tireMat);
          t.rotation.x = Math.PI / 2; t.position.set(-3.9, 0.17 + i * 0.32, -3.4); scene.add(t);
        }

        // The car.
        let car;
        const model = look.display === 'model' && look.model3d && CAR_MODELS[look.model3d];
        if (model) car = await car3d.buildModelCar({ url: model.url, paint: look.modelPaint || null, glow: look.glow || null, frontAxis: model.frontAxis, paintMaterials: model.paintMaterials, style: look.style || {} });
        else if (look.display === 'picture' && look.image) { const pic = await car3d.prepareCarPicture(look.image); car = car3d.buildPictureCar({ ...pic, style: look.style || {}, glow: look.glow !== undefined ? look.glow : pic.glow }); }
        else car = car3d.buildCar({ body: look.paint, glow: look.glow || null, shape: look.shape, wheels: look.wheels, wheelColor: look.wheelColor, scoop: look.scoop, wing: look.wing, style: look.style || {} });
        if (!alive) return;
        car.position.y = 0.3;
        car.rotation.y = Math.PI - 0.5; // nose toward the camera
        // No road headlight beams indoors (they'd shine straight into the camera as glare).
        car.traverse((o) => { if (o.isMesh && o.material?.blending === THREE.AdditiveBlending && o.geometry?.parameters?.height === 6) o.visible = false; });
        if (renderer.shadowMap.enabled) car.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        scene.add(car);

        // Animated extras (mix and match). Skipped in battery saver.
        const extras = [];
        const pts = (n, size, color, spread) => {
          const geo = new THREE.BufferGeometry(); const arr = new Float32Array(n * 3);
          for (let k = 0; k < n; k++) { arr[k * 3] = (Math.random() - 0.5) * spread[0]; arr[k * 3 + 1] = Math.random() * spread[1]; arr[k * 3 + 2] = (Math.random() - 0.5) * spread[2]; }
          geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
          const p = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
          scene.add(p); return p;
        };
        const dust = fx.dust ? pts(260, 0.05, '#fff6e0', [14, 6, 9]) : null;
        const sparks = fx.sparks ? pts(60, 0.08, '#ffb340', [0.6, 0.6, 0.6]) : null;
        if (sparks) sparks.position.set(-4.6, 1.6, -2.3);
        let scanner = null;
        if (fx.scanner) {
          scanner = new THREE.Group();
          scanner.add(new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.2), new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
          for (const y of [-1.1, 1.1]) { const line = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 3.4), new THREE.MeshBasicMaterial({ color: '#ffffff' })); line.position.y = y; line.rotation.y = Math.PI / 2; scanner.add(line); }
          scanner.children[0].rotation.y = Math.PI / 2; scanner.position.set(0, 1.2, -0.4); scene.add(scanner);
        }
        extras.push(dust, sparks, scanner);
        const strips = [];
        scene.traverse((o) => { if (o.isMesh && o.material === stripMat) strips.push(o); });

        // Drag to look around; tap a prop to open it.
        let angle = 0.35, drag = null, moved = false, idleAt = 0;
        const el = renderer.domElement;
        el.style.touchAction = 'pan-y';
        const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
        const down = (e) => { drag = { x: e.clientX, a: angle }; moved = false; };
        const move = (e) => { if (drag) { if (Math.abs(e.clientX - drag.x) > 6) moved = true; const lim = fx.orbit ? 1.35 : 0.9; angle = Math.max(-lim, Math.min(lim, drag.a - (e.clientX - drag.x) * 0.006)); idleAt = performance.now(); } };
        const up = (e) => {
          if (drag && !moved) {
            const r = el.getBoundingClientRect();
            ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
            ray.setFromCamera(ptr, camera);
            const hit = ray.intersectObjects(clickables, true)[0];
            let o = hit?.object; while (o && !o.userData.prop) o = o.parent;
            if (o?.userData.prop) tapRef.current?.(o.userData.prop);
            else if (hit) tapRef.current?.('car');
            else {
              const carHit = ray.intersectObject(car, true)[0];
              if (carHit) tapRef.current?.('car');
            }
          }
          drag = null; idleAt = performance.now();
        };
        el.addEventListener('pointerdown', down); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
        // Bloom glow, unless battery saver is on.
        let lite = false;
        try { const lk = JSON.parse(localStorage.getItem('dz-map-look') || '{}'); lite = lk.saver === 'on' || (lk.saver !== 'off' && navigator.deviceMemory && navigator.deviceMemory <= 2); } catch { /* default */ }
        const post = lite ? { render: () => renderer.render(scene, camera), setSize: () => {}, dispose: () => {} } : await car3d.makeBloom(renderer, scene, camera, w, h, { strength: 0.22, radius: 0.25, threshold: 0.88 });
        if (!alive) return;
        const onResize = () => { const nw = box.current?.clientWidth || w; renderer.setSize(nw, h); post.setSize(nw, h); camera.aspect = nw / h; camera.updateProjectionMatrix(); };
        window.addEventListener('resize', onResize);
        cleanup = () => { el.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('resize', onResize); };

        setLoading(false);
        const tick = (t) => {
          raf = requestAnimationFrame(tick);
          const idle = !drag && t - idleAt > 2500;
          const calm = lite; // battery saver: no extra animation
          if (idle) angle = fx.orbit && !calm ? 1.25 * Math.sin(t / 7000) : 0.35 * Math.sin(t / 6000); // orbit = wide sweep (the back wall stays behind the car)
          neon.intensity = mood.neon * (fx.pulse && !calm ? 0.55 + 0.9 * (0.5 + 0.5 * Math.sin(t / 380)) : 0.92 + 0.08 * Math.sin(t / 700));
          if (fx.pulse && !calm) edge.material.color.set(glow).multiplyScalar(0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t / 380)));
          if (fx.rainbow && !calm) { const hue = (t / 4000) % 1; neon.color.setHSL(hue, 1, 0.55); edge.material.color.setHSL(hue, 1, 0.55); }
          if (fx.turntable && !calm) car.rotation.y = Math.PI - 0.5 + t / 5000;
          if (sweep && !calm) { sweep.position.x = Math.sin(t / 1600) * 5; sweep.target.position.x = Math.sin(t / 1600) * 1.5; }
          if (fx.flicker && !calm) { const on = Math.sin(t / 97) + Math.sin(t / 53) > -1.6; stripMat.color.set(on ? mood.strip : '#222222'); shop.intensity = (on ? 6 : 1) * B; }
          if (dust && !calm) { dust.rotation.y = t / 40000; dust.position.y = Math.sin(t / 3000) * 0.15; }
          if (sparks && !calm) { const ph = (t % 1400) / 1400; sparks.visible = ph < 0.35; sparks.scale.setScalar(0.4 + ph * 3); sparks.material.opacity = 1 - ph * 2.5; }
          if (scanner && !calm) scanner.position.x = Math.sin(t / 1100) * 2.8;
          const r = fx.orbit ? 11 : 10.5;
          camera.position.set(Math.sin(angle) * r, 3.6, Math.cos(angle) * r + 1);
          camera.lookAt(0, 1.2, -0.8);
          car.userData.tick?.(t);
          post.render();
        };
        raf = requestAnimationFrame(tick);
      } catch (e) {
        console.warn('Garage failed', e);
        if (alive) { setFailed(true); setLoading(false); }
      }
    })();
    return () => { alive = false; cancelAnimationFrame(raf); cleanup(); if (renderer) { renderer.dispose(); renderer.domElement.remove(); } };
  }, [key, height]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={box} className="relative w-full rounded-2xl overflow-hidden bg-[#0b0c10]" style={{ height }}>
      {loading && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-white/50" /></div>}
      {failed && <div className="absolute inset-0 flex items-center justify-center text-xs text-white/60">The 3D garage isn't available on this device</div>}
    </div>
  );
}
