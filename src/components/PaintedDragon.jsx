import { useEffect, useRef } from 'react';

// A painted dragon that swims through the sky like an eel. The head and claws are cut from
// Utagawa Kuniyoshi's "Dragon and Waves" (c. 1830, public domain); the long body is a woodblock-
// style scale strip (inked scales, cream belly, curling red flame ribbons) wrapped along a spine
// that follows the flight path and ripples tail-ward. Recolored per theme in the shader.
const FLIGHT = {
  dragon: { path: 'orbit', speed: 0.55, size: 1 },
  fujidragon: { path: 'orbit', speed: 0.5, size: 1 },
  peonydragon: { path: 'orbit', speed: 0.55, size: 0.95 },
  moondragon: { path: 'orbit', speed: 0.45, size: 0.85, segs: 54 },
  seiryu: { path: 'wave', speed: 0.9, size: 0.9, segs: 50 },
  azuredragon: { path: 'wave', speed: 1.1, size: 0.85, segs: 50 },
  sumidragon: { path: 'drift', speed: 0.45, size: 1.05 },
  goldwave: { path: 'rise', speed: 0.6, size: 1.05 },
  goldstorm: { path: 'stalk', speed: 0.5, size: 1.15, segs: 38 },
  redgold: { path: 'eight', speed: 0.6, size: 1 },
};

const VS = `attribute vec2 p; attribute vec2 uv; uniform vec2 res; varying vec2 v;
void main(){ v = uv; gl_Position = vec4(p.x / res.x * 2.0 - 1.0, 1.0 - p.y / res.y * 2.0, 0.0, 1.0); }`;
const FS = `precision mediump float;
uniform sampler2D img; uniform float tint, alpha; uniform vec3 cBody, cHi, cAcc; varying vec2 v;
void main(){
  vec4 c = texture2D(img, v);
  if (tint > 0.5 && c.a > 0.01) {
    vec3 rgb = c.rgb / c.a;
    float lum = dot(rgb, vec3(0.3, 0.59, 0.11));
    float fl = clamp((rgb.r - rgb.g) * 5.0 - 0.45, 0.0, 1.0);
    vec3 body = mix(cBody * 0.18, cBody, smoothstep(0.12, 0.6, lum));
    body = mix(body, cHi, smoothstep(0.62, 0.92, lum));
    vec3 acc = mix(cAcc * 0.35, cAcc, smoothstep(0.15, 0.55, lum));
    c = vec4(mix(body, acc, fl) * c.a, c.a);
  }
  gl_FragColor = c * alpha;
}`;
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const load = (src) => new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = src; });

export default function PaintedDragon({ theme, tint, animate = true, fps = 30, style }) {
  const ref = useRef(null);
  const tintKey = tint ? `${tint.body}${tint.hi}${tint.accent}` : '';
  useEffect(() => {
    const c = ref.current;
    const gl = c?.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: true });
    if (!gl) return undefined;
    const F = { segs: 46, ...(FLIGHT[theme] || FLIGHT.dragon) };
    let alive = true, raf = 0;
    const sh = (type, code) => { const s = gl.createShader(type); gl.shaderSource(s, code); gl.compileShader(s); return s; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return undefined;
    gl.useProgram(pr);
    const U = (n) => gl.getUniformLocation(pr, n);
    gl.uniform1f(U('tint'), tint ? 1 : 0);
    if (tint) { gl.uniform3fv(U('cBody'), rgb(tint.body)); gl.uniform3fv(U('cHi'), rgb(tint.hi)); gl.uniform3fv(U('cAcc'), rgb(tint.accent)); }
    gl.uniform1f(U('alpha'), 1);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const aP = gl.getAttribLocation(pr, 'p'), aU = gl.getAttribLocation(pr, 'uv');
    gl.enableVertexAttribArray(aP); gl.enableVertexAttribArray(aU);
    gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 16, 0); gl.vertexAttribPointer(aU, 2, gl.FLOAT, false, 16, 8);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const tex = (img, repeat) => {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      if (repeat) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
      else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return { t, w: img.naturalWidth, h: img.naturalHeight };
    };

    let w = 0, h = 0, k = 1, dpr = 1;
    const size = () => {
      const r = c.getBoundingClientRect(); dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      w = r.width; h = r.height; k = Math.min(w, h) / 390;
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      gl.viewport(0, 0, c.width, c.height); gl.uniform2f(U('res'), w, h);
    };
    size();

    // Flight path of the head.
    const path = (u) => {
      const m = Math.min(w, h), cx = w * 0.5, cy = h * 0.36;
      switch (F.path) {
        case 'orbit': { const r = 0.23 * m, ox = -0.14 * w + r + r * 0.9, oy = 120 + r; const a = u * 0.8; return [ox + r * 2.1 * Math.cos(a), oy + r * 1.3 * Math.sin(a) + r * 0.3]; }
        case 'wave': { const span = w + 760 * k; return [((u * 85 * k) % span) - 120 * k, cy + h * 0.12 * Math.sin(u * 1.1)]; }
        case 'drift': return [cx + w * 0.3 * Math.sin(u * 0.37) + w * 0.08 * Math.sin(u * 0.9), cy + h * 0.13 * Math.sin(u * 0.5)];
        case 'rise': return [cx + w * 0.3 * Math.sin(u * 0.8), cy + h * 0.16 * Math.cos(u * 0.4)];
        case 'stalk': return [cx + w * 0.22 * Math.sin(u * 0.5), cy + h * 0.08 + h * 0.06 * Math.sin(u * 1.0)];
        default: return [cx + w * 0.32 * Math.sin(u * 0.5), cy + h * 0.14 * Math.sin(u * 1.0)];
      }
    };
    const R = () => 22 * k * F.size;       // body half-thickness at its widest
    const SP = () => R() * 0.8;            // spacing between spine points
    const hist = [];
    let u = Math.random() * 30, last = 0, lastDraw = 0, face = 1;
    const prefill = () => { hist.length = 0; for (let i = 900; i >= 0; i--) hist.push(path(u - i * 0.01)); };
    prefill();

    const spine = (t) => {
      const out = [], sp = SP();
      let i = hist.length - 1, acc = 0, [px, py] = hist[i];
      out.push([px, py]);
      while (out.length < F.segs && i > 0) {
        const [x, y] = hist[i - 1]; const d = Math.hypot(x - px, y - py);
        if (acc + d >= sp) { const f = (sp - acc) / (d || 1); px += (x - px) * f; py += (y - py) * f; out.push([px, py]); acc = 0; }
        else { acc += d; px = x; py = y; i--; }
      }
      while (out.length < F.segs) { const a = out[out.length - 1], b = out[out.length - 2] || [a[0] - 1, a[1]]; out.push([a[0] + (a[0] - b[0]), a[1] + (a[1] - b[1])]); }
      const n = out.length;
      // Eel ripple: a wave travels from head to tail, growing toward the tail.
      const pts = out.map((p, j) => {
        const a = out[Math.min(j + 1, n - 1)], b = out[Math.max(j - 1, 0)];
        let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
        const s = j / (n - 1), off = Math.sin(j * 0.3 - t * 4.2 * F.speed) * R() * 1.1 * (0.15 + 0.85 * s);
        return [p[0] - ty * off, p[1] + tx * off];
      });
      // Smooth and recompute tangents.
      const sm = pts.map((p, j) => (j === 0 || j === n - 1 ? p : [(pts[j - 1][0] + 2 * p[0] + pts[j + 1][0]) / 4, (pts[j - 1][1] + 2 * p[1] + pts[j + 1][1]) / 4]));
      return sm.map((p, j) => {
        const a = sm[Math.min(j + 1, n - 1)], b = sm[Math.max(j - 1, 0)];
        let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
        return { x: p[0], y: p[1], tx, ty };
      });
    };
    const width = (s) => R() * (s < 0.08 ? 0.75 + s / 0.08 * 0.25 : Math.max(0.1, 1 - Math.max(0, s - 0.3) / 0.7 * 0.92));

    const draw = (arr, texObj, mode) => {
      gl.bindTexture(gl.TEXTURE_2D, texObj.t);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.DYNAMIC_DRAW);
      gl.drawArrays(mode, 0, arr.length / 4);
    };
    // A sprite quad: anchor (ax, ay in 0..1) placed at (x, y), rotated, scaled, optionally mirrored.
    const sprite = (T, x, y, ang, sw, ax, ay, mirror) => {
      const sh2 = sw * T.h / T.w, ca = Math.cos(ang), sa = Math.sin(ang);
      const corner = (cx, cy) => { const lx = (cx - ax) * sw * (mirror ? -1 : 1), ly = (cy - ay) * sh2; return [x + lx * ca - ly * sa, y + lx * sa + ly * ca, cx, cy]; };
      draw([...corner(0, 0), ...corner(1, 0), ...corner(0, 1), ...corner(1, 1)], T, gl.TRIANGLE_STRIP);
    };

    let T = null;
    const frame = (now) => {
      if (!T) return;
      const t = now / 1000, dt = last ? Math.min(0.1, t - last) : 0; last = t;
      u += dt * F.speed;
      const p = path(u), lp = hist[hist.length - 1];
      if (Math.hypot(p[0] - lp[0], p[1] - lp[1]) > 150 * k) prefill(); else hist.push(p);
      if (hist.length > 1400) hist.splice(0, hist.length - 1400);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      const sg = spine(t), n = sg.length, r0 = R();
      if (Math.abs(sg[0].tx) > 0.25) face = sg[0].tx > 0 ? 1 : -1;
      // Claws (behind the body), swinging as it swims.
      [[0.2, 0], [0.52, 1.7]].forEach(([s, ph]) => {
        const q = sg[Math.round(s * (n - 1))], wd = width(s);
        const bx = q.x + (-q.ty) * -wd * 0.6 * face, by = q.y + q.tx * -wd * 0.6 * face;
        const ang = Math.atan2(q.ty, q.tx) + (face > 0 ? 0 : Math.PI) + Math.sin(t * 3 * F.speed + ph) * 0.35;
        sprite(T.claw, bx, by, ang, r0 * 2.8, 0.12, 0.08, face < 0);
      });
      // Body: a ribbon along the spine; flames ride on top, belly below.
      const flameH = 1.125, tileW = 12.5 * r0, arr = [];
      let arc = 0;
      for (let j = 0; j < n; j++) {
        const q = sg[j], s = j / (n - 1), wd = width(s);
        if (j) arc += Math.hypot(q.x - sg[j - 1].x, q.y - sg[j - 1].y);
        const nx = -q.ty * face, ny = q.tx * face; // spine side
        const uu = arc / tileW;
        arr.push(q.x + nx * wd * (1 + flameH), q.y + ny * wd * (1 + flameH), uu, 0);
        arr.push(q.x - nx * wd, q.y - ny * wd, uu, 1);
      }
      draw(arr, T.scales, gl.TRIANGLE_STRIP);
      // Head, its neck tucked into the front of the body, mouth leading the way.
      const hq = sg[0], swim = Math.atan2(-hq.ty, -hq.tx); // direction of travel
      const neck = Math.atan2(-0.5 * T.head.h, (face > 0 ? -0.25 : 0.25) * T.head.w);
      const bob = Math.sin(t * 1.3) * 0.08;
      sprite(T.head, hq.x, hq.y, swim + Math.PI - neck + bob, r0 * 5, face > 0 ? 0.3 : 0.7, 0.12, face < 0);
    };
    const loop = (now) => { raf = requestAnimationFrame(loop); if (now - lastDraw < 1000 / fps - 2) return; lastDraw = now; frame(now); };
    Promise.all([load('/dragon-scales.webp'), load('/dragon-head.webp'), load('/dragon-claw.webp')]).then(([sc, hd, cl]) => {
      if (!alive) return;
      T = { scales: tex(sc, true), head: tex(hd, false), claw: tex(cl, false) };
      if (animate) raf = requestAnimationFrame(loop); else frame(performance.now());
    }).catch(() => {});
    const onResize = () => { size(); prefill(); };
    window.addEventListener('resize', onResize);
    return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); gl.getExtension('WEBGL_lose_context')?.loseContext(); };
  }, [theme, animate, fps, tintKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} className="absolute inset-0 w-full h-full" style={{ zIndex: 2, transition: 'opacity 1.5s', ...style }} aria-hidden="true" />;
}
