import { useEffect, useRef, useState } from 'react';

// Hokusai's Great Wave, brought to life without repainting it: a tiny WebGL shader only nudges
// where each pixel of the real print is read from. The crest leans and settles, the swells roll,
// and the foam "claws" shimmer, while every line and color stays the woodblock's own.
const VS = 'attribute vec2 p; varying vec2 v; void main(){ v = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }';
const FS = `precision mediump float;
uniform sampler2D img; uniform float t; varying vec2 v;
void main(){
  vec2 uv = v;
  float h = 1.0 - uv.y;                                   // height above the bottom of the print
  float crest = smoothstep(0.3, 0.95, h) * (1.0 - smoothstep(0.08, 0.32, abs(uv.x - 0.36)));
  float surge = sin(t * 0.55) * 0.5 + sin(t * 0.23) * 0.5;  // slow, uneven breathing of the big wave
  vec2 d = vec2(-0.016 * surge * crest * h, 0.006 * surge * crest);
  float swell = 0.35 + 0.65 * smoothstep(0.0, 0.5, h);
  d.x += sin(uv.y * 16.0 - t * 1.1 + uv.x * 4.0) * 0.0022 * swell;   // swells rolling through
  d.y += sin(uv.x * 11.0 - t * 0.9) * 0.0035 * (1.0 - crest);
  vec4 base = texture2D(img, uv);
  float foam = smoothstep(0.62, 0.84, dot(base.rgb, vec3(0.3, 0.59, 0.11))) * base.a;
  d += foam * vec2(sin(uv.y * 70.0 + t * 2.6), cos(uv.x * 64.0 + t * 2.2)) * 0.0014;  // foam shimmer
  gl_FragColor = texture2D(img, uv + d);
}`;

export default function WaveCanvas({ src, className, style, animate = true, fps = 30 }) {
  const ref = useRef(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const c = ref.current;
    const gl = c && c.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) { setFailed(true); return undefined; }
    const sh = (type, code) => { const s = gl.createShader(type); gl.shaderSource(s, code); gl.compileShader(s); return s; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { setFailed(true); return undefined; }
    gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p');
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const tLoc = gl.getUniformLocation(pr, 't');
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
  }, [src, animate, fps]);
  if (failed) return <img src={src} alt="" className={className} style={style} />;
  return <canvas ref={ref} className={className} style={style} aria-hidden="true" />;
}
