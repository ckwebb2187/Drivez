import { useEffect, useRef, useState } from 'react';

// Hokusai's Great Wave, brought to life without repainting it: a tiny WebGL shader only nudges
// where each pixel of the real print is read from. The crest leans and settles, the swells roll,
// and the foam "claws" shimmer, while every line and color stays the woodblock's own.
const VS = 'attribute vec2 p; varying vec2 v; void main(){ v = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }';
// Kuniyoshi's dragon (cut out of "Dragon and Waves"): a slow serpentine ripple runs down the body,
// the dangling claw swings, and the red flames lick upward. Same pixels, only moved.
const DRAGON_FS = `precision mediump float;
uniform sampler2D img; uniform float t; uniform float tint; uniform vec3 cBody, cHi, cAcc; varying vec2 v;
void main(){
  vec2 uv = v;
  vec2 d = vec2(sin(uv.y * 7.0 - t * 2.0) * 0.016 * (0.35 + 0.65 * uv.y), sin(uv.x * 6.0 - t * 1.4) * 0.009);
  d.x += sin(t * 1.2) * 0.022 * smoothstep(0.55, 1.0, uv.y) * (1.0 - uv.x);   // the hanging claw swings
  vec4 base = texture2D(img, uv);
  float flame = clamp((base.r - base.g) * 4.0 - 0.6, 0.0, 1.0) * base.a;
  d += flame * vec2(sin(uv.y * 34.0 + t * 5.0) * 0.009, -abs(sin(uv.x * 22.0 + t * 3.8)) * 0.011);
  vec4 c = texture2D(img, uv + d);
  if (tint > 0.5 && c.a > 0.01) {
    // Recolor for the dragon themes: ink lines stay dark, scales take the body color, highlights
    // the light color, and the red flames / belly the accent color.
    vec3 rgb = c.rgb / c.a;
    float lum = dot(rgb, vec3(0.3, 0.59, 0.11));
    float fl = clamp((rgb.r - rgb.g) * 5.0 - 0.45, 0.0, 1.0);
    vec3 body = mix(cBody * 0.18, cBody, smoothstep(0.12, 0.6, lum));
    body = mix(body, cHi, smoothstep(0.6, 0.92, lum));
    vec3 acc = mix(cAcc * 0.35, cAcc, smoothstep(0.15, 0.55, lum));
    c = vec4(mix(body, acc, fl) * c.a, c.a);
  }
  gl_FragColor = c;
}`;
const FS = `precision mediump float;
uniform sampler2D img; uniform float t; varying vec2 v;
void main(){
  // Water flows as moving light through the blue,
  // following the curl of the crest up top and rolling sideways through the swells below.
  // Real motion: the crest leans forward and settles, the swells roll, the claws shimmer.
  float h = 1.0 - v.y;
  float crestM = smoothstep(0.3, 0.95, h) * (1.0 - smoothstep(0.08, 0.34, abs(v.x - 0.36)));
  float surge = sin(t * 0.7) * 0.6 + sin(t * 0.29) * 0.4;
  vec2 d = vec2(-0.022 * surge * crestM * h, 0.008 * surge * crestM);
  d.x += sin(v.y * 14.0 - t * 1.6 + v.x * 4.0) * 0.004 * (0.3 + 0.7 * smoothstep(0.0, 0.5, h));
  d.y += sin(v.x * 10.0 - t * 1.2) * 0.006 * (1.0 - crestM);
  vec4 c = texture2D(img, v + d);
  if (c.a < 0.01) { gl_FragColor = c; return; }
  vec3 rgb = c.rgb / c.a;
  float lum = dot(rgb, vec3(0.3, 0.59, 0.11));
  float water = clamp((rgb.b - rgb.r) * 3.5, 0.0, 1.0);
  vec2 q = (v - vec2(0.40, 0.40)) * vec2(1.8, 1.0);
  float curl = sin(atan(q.y, q.x) * 3.0 + length(q) * 16.0 - t * 2.2);
  float roll = sin(v.x * 20.0 - v.y * 7.0 - t * 2.0 + sin(v.y * 9.0 + t * 0.4));
  float crestZone = 1.0 - smoothstep(0.55, 0.75, v.y);
  float flow = mix(smoothstep(0.4, 1.0, roll), smoothstep(0.4, 1.0, curl), crestZone);
  rgb += water * flow * vec3(0.26, 0.32, 0.36);
  float foam = smoothstep(0.62, 0.84, lum);
  rgb += foam * 0.09 * sin(t * 3.2 + v.x * 45.0 + v.y * 33.0);
  gl_FragColor = vec4(clamp(rgb, 0.0, 1.0) * c.a, c.a);
}`;

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

export default function WaveCanvas({ src, className, style, animate = true, fps = 30, fx = 'wave', tint = null }) {
  const tintKey = tint ? `${tint.body}${tint.hi}${tint.accent}` : '';
  const ref = useRef(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const c = ref.current;
    const gl = c && c.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) { setFailed(true); return undefined; }
    const sh = (type, code) => { const s = gl.createShader(type); gl.shaderSource(s, code); gl.compileShader(s); return s; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fx === 'dragon' ? DRAGON_FS : FS)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { setFailed(true); return undefined; }
    gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p');
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const tLoc = gl.getUniformLocation(pr, 't');
    if (fx === 'dragon') {
      gl.uniform1f(gl.getUniformLocation(pr, 'tint'), tint ? 1 : 0);
      if (tint) {
        gl.uniform3fv(gl.getUniformLocation(pr, 'cBody'), rgb(tint.body));
        gl.uniform3fv(gl.getUniformLocation(pr, 'cHi'), rgb(tint.hi));
        gl.uniform3fv(gl.getUniformLocation(pr, 'cAcc'), rgb(tint.accent));
      }
    }
    let raf = 0, ready = false, last = 0, alive = true;
    const size = () => {
      const r = c.getBoundingClientRect(), k = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.max(1, Math.round(r.width * k)); c.height = Math.max(1, Math.round(r.height * k));
      gl.viewport(0, 0, c.width, c.height);
    };
    const draw = (now) => { gl.uniform1f(tLoc, now / 1000); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); };
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 1000 / fps - 2) return; // capped frame rate to spare the battery
      last = now; draw(now);
    };
    const img = new Image();
    img.onload = () => {
      if (!alive) return;
      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      c.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
      size(); ready = true;
      if (animate) raf = requestAnimationFrame(loop); else draw(0);
    };
    img.onerror = () => setFailed(true);
    img.src = src;
    const onResize = () => { if (ready) { size(); if (!animate) draw(0); } };
    window.addEventListener('resize', onResize);
    return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); gl.getExtension('WEBGL_lose_context')?.loseContext(); };
  }, [src, animate, fps, fx, tintKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (failed) return <img src={src} alt="" className={className} style={style} />;
  return <canvas ref={ref} className={className} style={style} aria-hidden="true" />;
}
