import { lazy, Suspense, useEffect, useRef, useState } from 'react';

import { themeDragon } from '@/lib/mapTheme';

const WaveCanvas = lazy(() => import('@/components/WaveCanvas'));

// Animated layer over the drive map: real local weather (rain, snow, fog, clouds)
// plus each theme's mood (petals, dust, smog, scanlines, searchlights).
// Never blocks touches, and stops when hidden or in battery saver.

// Current weather where you are, from Open-Meteo (free, no key). Re-checked every 15 min.
function useLocalWeather(pos, enabled) {
  const [wx, setWx] = useState(null);
  const last = useRef({ at: 0, lat: null, lng: null });
  useEffect(() => {
    if (!enabled || !pos) return;
    const [lat, lng] = pos;
    const L = last.current;
    const moved = L.lat == null || Math.abs(L.lat - lat) + Math.abs(L.lng - lng) > 0.1;
    if (!moved && Date.now() - L.at < 15 * 60000) return;
    last.current = { at: Date.now(), lat, lng };
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}&current=weather_code,cloud_cover,wind_speed_10m,is_day`)
      .then((r) => r.json()).then((d) => d.current && setWx(d.current)).catch(() => {});
  }, [enabled, pos && Math.round(pos[0] * 20), pos && Math.round(pos[1] * 20)]); // eslint-disable-line react-hooks/exhaustive-deps
  return wx;
}

export function weatherKind(code, cloud) {
  if (code == null) return null;
  if (code >= 95) return 'storm';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return code >= 63 && code !== 80 ? 'heavyrain' : 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code === 45 || code === 48) return 'fog';
  if (code === 3 || cloud > 70) return 'clouds';
  return null;
}

const rnd = (a, b) => a + Math.random() * (b - a);

export default function MapAtmosphere({ theme, pos, active = true, lite = false, weatherFx = true, night = false, driving = false }) {
  const canvas = useRef(null);
  const wx = useLocalWeather(pos, weatherFx && !lite);
  const wk = weatherFx ? weatherKind(wx?.weather_code, wx?.cloud_cover) : null;
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const run = active && !lite && !reduce;
  const [flash, setFlash] = useState(false);
  const dragon = themeDragon(theme);

  useEffect(() => {
    if (!run) return undefined;
    const c = canvas.current;
    const g = c.getContext('2d');
    let w = 0, h = 0;
    const size = () => { const r = c.getBoundingClientRect(); w = c.width = Math.round(r.width); h = c.height = Math.round(r.height); };
    size();
    window.addEventListener('resize', size);

    const parts = [];
    const add = (n, make) => { for (let i = 0; i < n; i++) parts.push(make(true)); };
    const rain = (heavy) => (init) => ({ t: 'rain', x: rnd(0, w), y: init ? rnd(0, h) : rnd(-60, 0), v: rnd(heavy ? 16 : 11, heavy ? 24 : 17), len: rnd(10, heavy ? 26 : 18) });
    if (wk === 'rain' || wk === 'heavyrain' || wk === 'storm') add(wk === 'rain' ? 70 : 140, rain(wk !== 'rain'));
    if (wk === 'snow') add(70, (init) => ({ t: 'snow', x: rnd(0, w), y: init ? rnd(0, h) : -5, v: rnd(0.6, 1.6), r: rnd(1.2, 2.8), ph: rnd(0, 6) }));
    if (wk === 'clouds' || wk === 'fog' || wk === 'storm') add(4, () => ({ t: 'cloud', x: rnd(-0.3, 1) * w, y: rnd(0.05, 0.9) * h, r: rnd(0.35, 0.6) * Math.max(w, h), v: rnd(0.08, 0.2) }));
    const PETALS = { kawaii: '255,170,205', sakura: '255,182,206', lavender: '190,160,235', rose: '232,165,152', sakuranight: '255,150,190', leaf: '110,190,80', zen: '120,150,80', samurai: '170,28,40' };
    if (PETALS[theme]) add(theme === 'rose' || theme === 'samurai' ? 10 : 22, (init) => ({ t: 'petal', c: PETALS[theme], x: rnd(0, w), y: init ? rnd(0, h) : -10, v: rnd(0.5, 1.2), r: rnd(3, 6), ph: rnd(0, 6), rot: rnd(0, 6) }));
    const SPARKS = { kawaii: 10, y2k: 18, harajuku: 14, galaxy: 45, thunder: 16, psychic: 22, xmas: 8 };
    if (SPARKS[theme]) add(SPARKS[theme], () => ({ t: 'spark', x: rnd(0, w), y: rnd(0, h), ph: rnd(0, 6), s: theme === 'galaxy' ? 0.5 : 1 }));
    if (theme === 'matrix') add(26, (init) => ({ t: 'code', x: Math.floor(rnd(0, w / 14)) * 14, y: init ? rnd(-h, h) : rnd(-300, 0), v: rnd(2, 5), len: Math.floor(rnd(6, 18)) }));
    if (theme === 'vapor' || theme === 'galaxy') add(5, () => ({ t: 'trail', x: rnd(0, w), y: rnd(0.55, 1) * h, v: rnd(2, 5), len: rnd(40, 90), hue: theme === 'vapor' ? (Math.random() < 0.5 ? '255,113,206' : '1,205,254') : (Math.random() < 0.5 ? '124,77,255' : '58,209,255') }));
    if (theme === 'wasteland') add(55, (init) => ({ t: 'dust', x: init ? rnd(0, w) : -5, y: rnd(0, h), v: rnd(0.4, 1.4), r: rnd(0.8, 2) }));
    const LIGHTS = { bayshore: ['255,154,60', '223,234,255'], daikoku: ['255,59,48', '255,255,255'], shuto: ['255,179,71', '255,255,255'] };
    if (LIGHTS[theme]) add(5, () => ({ t: 'trail', x: rnd(0, w), y: rnd(0.55, 1) * h, v: rnd(2, 5), len: rnd(40, 90), hue: LIGHTS[theme][Math.random() < 0.5 ? 0 : 1] }));
    if (theme === 'tougedawn' || theme === 'daikoku' || theme === 'ghost') add(3, () => ({ t: 'mist', x: rnd(-0.3, 1) * w, y: rnd(0.3, 0.9) * h, r: rnd(0.4, 0.6) * Math.max(w, h), v: rnd(0.1, 0.22) }));
    const TRAILS = { heat: ['255,46,136', '122,60,255'], carbon: ['255,122,0', '220,225,235'], underground: ['124,255,60', '0,179,255'] };
    if (TRAILS[theme]) add(6, () => ({ t: 'trail', x: rnd(0, w), y: rnd(0.55, 1) * h, v: rnd(2, 5), len: rnd(40, 90), hue: TRAILS[theme][Math.random() < 0.5 ? 0 : 1] }));
    if (theme === 'underground' && !wk) add(35, rain(false));
    // Snow themes: real six-armed snowflakes; Snow Day has two snowmen peeking in from the sides.
    if (theme === 'snowday' || theme === 'xmas') add(theme === 'snowday' ? 40 : 26, (init) => ({ t: 'flake', x: rnd(0, w), y: init ? rnd(0, h) : -10, v: rnd(0.5, 1.3), r: rnd(3, 7), ph: rnd(0, 6), rot: rnd(0, 6) }));
    if (theme === 'snowday') { parts.push({ t: 'snowman', side: 0, ph: 0 }); parts.push({ t: 'snowman', side: 1, ph: 3 }); }
    if (theme === 'xmas') parts.push({ t: 'lights' });
    if (theme === 'tide') parts.push({ t: 'swell' });
    if (theme === 'tide') add(14, (init) => ({ t: 'bubble', x: rnd(0, w), y: init ? rnd(0, h) : h + 10, v: rnd(0.4, 1.1), r: rnd(2, 6), ph: rnd(0, 6) }));
    if (dragon || theme === 'ember') add(theme === 'ember' ? 40 : 22, (init) => ({ t: 'ember', x: rnd(0, w), y: init ? rnd(0, h) : h + 5, v: rnd(0.5, 1.6), r: rnd(0.8, 2.4), ph: rnd(0, 6), hue: Math.round(rnd(110, 200)) }));
    if (theme === 'ghost') add(5, (init) => ({ t: 'ghost', x: rnd(0.05, 0.95) * w, y: init ? rnd(0.2, 1) * h : h + 30, v: rnd(0.25, 0.6), r: rnd(10, 18), ph: rnd(0, 6) }));
    if (theme === 'tokyo' || theme === 'cyberpunk') add(6, () => ({ t: 'trail', x: rnd(0, w), y: rnd(0.55, 1) * h, v: rnd(2, 5), len: rnd(40, 90), hue: theme === 'tokyo' ? (Math.random() < 0.5 ? '255,45,149' : '0,229,255') : (Math.random() < 0.5 ? '176,38,255' : '0,255,213') }));

    if (theme === 'samurai') add(2, () => ({ t: 'slash', x: rnd(0.1, 0.9) * w, y: rnd(0.1, 0.8) * h, len: rnd(60, 120), a: 0, ph: rnd(0, 300) }));

    let raf, lastT = 0, frame = 0;
    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      if (now - lastT < 50) return; // ~20 fps is plenty for an overlay (saves battery)
      lastT = now; frame++;
      g.clearRect(0, 0, w, h);
      for (const p of parts) {
        if (p.t === 'rain') {
          p.y += p.v; p.x -= p.v * 0.18;
          if (p.y > h) Object.assign(p, rain(wk !== 'rain')(false));
          g.strokeStyle = 'rgba(190,210,255,0.35)'; g.lineWidth = 1.2;
          g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + p.len * 0.18, p.y - p.len); g.stroke();
        } else if (p.t === 'snow') {
          p.y += p.v; p.x += Math.sin(frame / 30 + p.ph) * 0.5;
          if (p.y > h) { p.y = -5; p.x = rnd(0, w); }
          g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill();
        } else if (p.t === 'cloud') {
          p.x += p.v; if (p.x - p.r > w) p.x = -p.r;
          const rg = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
          const a = wk === 'fog' ? 0.22 : 0.14;
          rg.addColorStop(0, `rgba(${!night && ['kawaii', 'sakura', 'y2k', 'lavender', 'harajuku', 'zen', 'minimal'].includes(theme) ? '255,255,255' : '20,24,32'},${a})`); rg.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = rg; g.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
        } else if (p.t === 'petal') {
          p.y += p.v; p.x += Math.sin(frame / 25 + p.ph) * 0.8; p.rot += 0.03;
          if (p.y > h + 10) { p.y = -10; p.x = rnd(0, w); }
          g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
          g.fillStyle = `rgba(${p.c || '255,170,205'},0.85)`; g.beginPath(); g.ellipse(0, 0, p.r, p.r * 0.6, 0, 0, 7); g.fill(); g.restore();
        } else if (p.t === 'spark') {
          const a = Math.max(0, Math.sin(frame / 12 + p.ph));
          if (a < 0.05) { p.x = rnd(0, w); p.y = rnd(0, h); }
          g.fillStyle = `rgba(255,255,255,${a * 0.9})`;
          const k = p.s || 1;
          g.fillRect(p.x - 0.5, p.y - 5 * a * k, 1, 10 * a * k); g.fillRect(p.x - 5 * a * k, p.y - 0.5, 10 * a * k, 1);
        } else if (p.t === 'dust') {
          p.x += p.v; p.y += Math.sin(frame / 40 + p.x / 50) * 0.3;
          if (p.x > w + 5) { p.x = -5; p.y = rnd(0, h); }
          g.fillStyle = 'rgba(214,180,130,0.45)'; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill();
        } else if (p.t === 'code') {
          p.y += p.v; if (p.y - p.len * 14 > h) { p.y = rnd(-200, 0); p.x = Math.floor(rnd(0, w / 14)) * 14; }
          g.font = '12px monospace';
          for (let i = 0; i < p.len; i++) {
            const a = i === 0 ? 0.9 : 0.5 * (1 - i / p.len);
            g.fillStyle = i === 0 ? `rgba(200,255,215,${a})` : `rgba(57,255,106,${a})`;
            g.fillText(String.fromCharCode(0x30a0 + ((p.x + i * 7 + Math.floor(p.y / 14)) % 96)), p.x, p.y - i * 14);
          }
        } else if (p.t === 'mist') {
          p.x += p.v; if (p.x - p.r > w) p.x = -p.r;
          const mg = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
          mg.addColorStop(0, theme === 'daikoku' ? 'rgba(255,190,110,0.07)' : theme === 'ghost' ? 'rgba(138,92,214,0.14)' : 'rgba(255,255,255,0.13)'); mg.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = mg; g.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
        } else if (p.t === 'slash') {
          const k = ((frame + p.ph) % 300) / 300; const a = k < 0.12 ? k / 0.12 : k < 0.3 ? 1 - (k - 0.12) / 0.18 : 0;
          if (k > 0.97) { p.x = rnd(0.1, 0.9) * w; p.y = rnd(0.1, 0.8) * h; }
          if (a > 0) { g.strokeStyle = `rgba(217,207,184,${a * 0.5})`; g.lineWidth = 1.5; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + p.len * 0.8 * Math.min(1, k * 8), p.y - p.len * 0.5 * Math.min(1, k * 8)); g.stroke(); }
        } else if (p.t === 'trail') {
          p.y -= p.v; if (p.y < h * 0.45) { p.y = h + rnd(0, 200); p.x = rnd(0, w); }
          const lg = g.createLinearGradient(p.x, p.y, p.x, p.y + p.len);
          lg.addColorStop(0, `rgba(${p.hue},0.5)`); lg.addColorStop(1, `rgba(${p.hue},0)`);
          g.strokeStyle = lg; g.lineWidth = 2; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x, p.y + p.len); g.stroke();
        } else if (p.t === 'flake') {
          p.y += p.v; p.x += Math.sin(frame / 40 + p.ph) * 0.4; p.rot += 0.01;
          if (p.y > h + 10) { p.y = -10; p.x = rnd(0, w); }
          g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
          g.strokeStyle = theme === 'snowday' && !night ? 'rgba(90,150,210,0.75)' : 'rgba(255,255,255,0.85)'; g.lineWidth = 1.2; g.beginPath();
          for (let i = 0; i < 6; i++) { g.rotate(Math.PI / 3); g.moveTo(0, 0); g.lineTo(0, -p.r); g.moveTo(0, -p.r * 0.55); g.lineTo(p.r * 0.28, -p.r * 0.8); g.moveTo(0, -p.r * 0.55); g.lineTo(-p.r * 0.28, -p.r * 0.8); }
          g.stroke(); g.restore();
        } else if (p.t === 'snowman') {
          const peek = (Math.sin(frame / 140 + p.ph) + 1) / 2; // slides in, waves, slides back out
          const x = p.side ? w + 16 - peek * 34 : -16 + peek * 34, y = h * 0.58, s = 0.9;
          g.save(); g.translate(x, y); g.rotate((p.side ? -1 : 1) * Math.sin(frame / 25) * 0.06);
          g.fillStyle = 'rgba(255,255,255,0.95)'; g.strokeStyle = 'rgba(120,160,200,0.9)'; g.lineWidth = 1.5;
          [[0, 0, 16], [0, -24, 12], [0, -43, 9]].forEach(([cx, cy, cr]) => { g.beginPath(); g.arc(cx * s, cy * s, cr * s, 0, 7); g.fill(); g.stroke(); });
          g.fillStyle = '#1a1a1a'; g.beginPath(); g.arc(-3 * s, -45 * s, 1.4, 0, 7); g.arc(3 * s, -45 * s, 1.4, 0, 7); g.fill();
          g.fillStyle = '#ff7a3d'; g.beginPath(); g.moveTo(0, -42 * s); g.lineTo((p.side ? -9 : 9) * s, -41 * s); g.lineTo(0, -40 * s); g.fill();
          g.fillStyle = '#d92b2b'; g.fillRect(-10 * s, -35 * s, 20 * s, 4 * s);
          g.fillStyle = '#1a1a1a'; [-30, -24, -18].forEach((cy) => { g.beginPath(); g.arc(0, cy * s, 1.3, 0, 7); g.fill(); });
          g.restore();
        } else if (p.t === 'lights') {
          // A string of bulbs swagging across the top, each twinkling on its own beat.
          const sag = (x) => 14 + 26 * (1 - ((x - w / 2) / (w / 2)) ** 2);
          g.strokeStyle = 'rgba(15,35,20,0.9)'; g.lineWidth = 1.5; g.beginPath();
          for (let x = 0; x <= w; x += 12) (x ? g.lineTo(x, sag(x)) : g.moveTo(x, sag(x)));
          g.stroke();
          const cols = ['255,60,60', '255,200,70', '70,220,110', '80,160,255'];
          for (let i = 0, x = 12; x < w; x += 30, i++) {
            const a = 0.45 + 0.55 * Math.max(0, Math.sin(frame / 9 + i * 1.7)), y = sag(x) + 6, c = cols[i % 4];
            const rg = g.createRadialGradient(x, y, 0, x, y, 11); rg.addColorStop(0, `rgba(${c},${a * 0.7})`); rg.addColorStop(1, `rgba(${c},0)`);
            g.fillStyle = rg; g.fillRect(x - 11, y - 11, 22, 22);
            g.fillStyle = `rgba(${c},${0.5 + a * 0.5})`; g.beginPath(); g.ellipse(x, y, 3, 4.5, 0, 0, 7); g.fill();
          }
        } else if (p.t === 'swell') {
          // Layered woodblock-style waves along the bottom with foam on the crests.
          const cols = ['rgba(8,50,90,0.45)', 'rgba(14,74,128,0.4)', 'rgba(47,164,255,0.25)'];
          for (let L = 0; L < 3; L++) {
            const A = 10 + L * 5, base = h * (0.8 + L * 0.06), sp = 0.02 + L * 0.008;
            const y = (x) => base - A * Math.sin(x / (90 + L * 30) + frame * sp + L) - A * 0.35 * Math.sin(x / 33 - frame * sp * 1.7);
            g.fillStyle = cols[L]; g.beginPath(); g.moveTo(0, h);
            for (let x = 0; x <= w + 12; x += 12) g.lineTo(x, y(x));
            g.lineTo(w, h); g.closePath(); g.fill();
            g.strokeStyle = 'rgba(200,240,255,0.45)'; g.lineWidth = 2; g.beginPath();
            for (let x = 0; x <= w + 12; x += 12) (x ? g.lineTo(x, y(x)) : g.moveTo(x, y(x)));
            g.stroke();
          }
        } else if (p.t === 'bubble') {
          p.y -= p.v; p.x += Math.sin(frame / 30 + p.ph) * 0.4;
          if (p.y < -10) { p.y = h + 10; p.x = rnd(0, w); }
          g.strokeStyle = 'rgba(180,235,255,0.5)'; g.lineWidth = 1; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.stroke();
          g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.25, 0, 7); g.fill();
        } else if (p.t === 'ember') {
          p.y -= p.v; p.x += Math.sin(frame / 20 + p.ph) * 0.5;
          if (p.y < -5) { p.y = h + 5; p.x = rnd(0, w); }
          const a = 0.4 + 0.5 * Math.abs(Math.sin(frame / 6 + p.ph));
          g.fillStyle = `rgba(255,${p.hue},40,${a})`; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill();
        } else if (p.t === 'ghost') {
          // Little floating ghosts with red eyes and a cheeky grin, drifting up and fading.
          p.y -= p.v; const sx = p.x + Math.sin(frame / 35 + p.ph) * 14;
          if (p.y < -40) { p.y = h + 30; p.x = rnd(0.05, 0.95) * w; }
          const life = Math.min(1, (h + 30 - p.y) / 120, (p.y + 40) / 160);
          const r = p.r, y = p.y;
          g.globalAlpha = 0.75 * life;
          g.fillStyle = 'rgba(122,78,200,0.85)'; g.beginPath();
          g.arc(sx, y, r, Math.PI, 0); g.lineTo(sx + r, y + r * 1.1);
          for (let k = 0; k < 4; k++) { const x0 = sx + r - (k + 0.5) * (r / 2); g.quadraticCurveTo(x0, y + r * (k % 2 ? 1.5 : 0.8) + Math.sin(frame / 8 + k) * 2, sx + r - (k + 1) * (r / 2), y + r * 1.1); }
          g.closePath(); g.fill();
          g.fillStyle = '#ff3b5c'; g.beginPath(); g.ellipse(sx - r * 0.38, y - r * 0.15, r * 0.2, r * 0.13, 0.4, 0, 7); g.ellipse(sx + r * 0.38, y - r * 0.15, r * 0.2, r * 0.13, -0.4, 0, 7); g.fill();
          g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1.2; g.beginPath(); g.arc(sx, y + r * 0.15, r * 0.45, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
          g.globalAlpha = 1;
        }
      }
    };
    raf = requestAnimationFrame(draw);

    // Lightning flashes in a storm.
    let flashT;
    if (wk === 'storm' || theme === 'thunder') {
      const strike = () => { setFlash(true); setTimeout(() => setFlash(false), 120); flashT = setTimeout(strike, rnd(6000, 15000)); };
      flashT = setTimeout(strike, rnd(3000, 8000));
    }
    return () => { cancelAnimationFrame(raf); clearTimeout(flashT); window.removeEventListener('resize', size); };
  }, [run, theme, wk, night]);

  if (lite) return null;
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 1 }} aria-hidden="true">
      {/* Theme mood that doesn't need animation frames */}
      {theme === 'tokyo' && <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 70% at 50% 110%, rgba(255,45,149,0.18), transparent 60%), radial-gradient(90% 50% at 50% -10%, rgba(0,229,255,0.12), transparent 60%)' }} />}
      {theme === 'bayshore' && <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 60% at 50% 110%, rgba(255,154,60,0.18), transparent 60%), radial-gradient(80% 40% at 50% 100%, rgba(223,234,255,0.10), transparent 70%)' }} />}
      {theme === 'daikoku' && <div className="absolute inset-0" style={{ background: 'radial-gradient(100% 60% at 50% 105%, rgba(255,176,64,0.2), transparent 65%), linear-gradient(180deg, transparent 50%, rgba(255,59,48,0.06))' }} />}
      {theme === 'shuto' && <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(255,179,71,0.10), transparent 25%), radial-gradient(100% 50% at 50% 110%, rgba(31,191,107,0.12), transparent 60%)' }} />}
      {theme === 'tougedawn' && night && <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(20,40,90,0.35), rgba(10,20,50,0.1) 45%, rgba(255,181,144,0.10)), radial-gradient(110% 55% at 50% 112%, rgba(255,200,140,0.30), transparent 62%)' }} />}
      {theme === 'tougedawn' && !night && <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(255,181,144,0.38), rgba(143,180,217,0.18) 35%, rgba(200,215,225,0.18) 70%, rgba(220,230,235,0.28))' }} />}
      {theme === 'cyberpunk' && <div className="absolute inset-0 dz-scanlines" />}
      {theme === 'dystopian' && <>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(120,120,110,0.35), rgba(60,60,55,0.05) 45%, rgba(40,40,38,0.25))' }} />
        {run && <><div className="dz-searchlight" style={{ left: '15%' }} /><div className="dz-searchlight" style={{ left: '75%', animationDelay: '-4s' }} /></>}
      </>}
      {theme === 'wasteland' && <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(196,140,70,0.35), rgba(120,90,50,0.08) 50%, rgba(80,60,30,0.2))', mixBlendMode: 'multiply' }} />}
      {theme === 'rose' && <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 70% at 50% 110%, rgba(255,79,163,0.22), transparent 60%), radial-gradient(90% 50% at 50% -10%, rgba(232,165,152,0.15), transparent 60%)' }} />}
      {theme === 'vapor' && <div className="absolute inset-0" style={{ background: 'linear-gradient(0deg, rgba(255,113,206,0.28), rgba(185,103,255,0.08) 35%, transparent 60%), radial-gradient(60% 40% at 50% -5%, rgba(1,205,254,0.18), transparent 70%)' }} />}
      {theme === 'galaxy' && <div className="absolute inset-0" style={{ background: 'radial-gradient(70% 45% at 20% 10%, rgba(124,77,255,0.25), transparent 70%), radial-gradient(60% 40% at 85% 25%, rgba(58,209,255,0.15), transparent 70%)' }} />}
      {['sakura', 'lavender', 'y2k', 'harajuku'].includes(theme) && <div className="absolute inset-0" style={{ background: night ? `radial-gradient(90% 50% at 50% -10%, ${{ sakura: 'rgba(120,150,255,0.22)', lavender: 'rgba(200,215,255,0.20)', y2k: 'rgba(255,47,179,0.22)', harajuku: 'rgba(255,92,138,0.22)' }[theme]}, transparent 70%), radial-gradient(100% 45% at 50% 112%, ${{ sakura: 'rgba(243,166,192,0.18)', lavender: 'rgba(165,139,217,0.2)', y2k: 'rgba(192,192,192,0.14)', harajuku: 'rgba(77,212,255,0.2)' }[theme]}, transparent 65%)` : `radial-gradient(80% 50% at 50% -10%, ${{ sakura: 'rgba(255,182,206,0.35)', lavender: 'rgba(190,160,235,0.3)', y2k: 'rgba(255,95,200,0.3)', harajuku: 'rgba(255,225,77,0.3)' }[theme]}, transparent 70%)` }} />}
      {theme === 'matrix' && <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 70% at 50% 110%, rgba(57,255,106,0.12), transparent 60%)' }} />}
      {theme === 'zen' && <div className="absolute inset-0" style={{ background: night ? 'radial-gradient(90% 55% at 50% 108%, rgba(255,184,77,0.24), transparent 65%), linear-gradient(180deg, rgba(10,25,20,0.35), transparent 50%)' : 'linear-gradient(180deg, rgba(235,240,225,0.45), rgba(235,240,225,0.05) 45%, transparent)' }} />}
      {theme === 'risingsun' && <>
        <div className="absolute inset-0" style={{ background: 'radial-gradient(60% 35% at 50% 100%, rgba(192,23,43,0.28), transparent 70%)' }} />
        <div className="absolute dz-rays" style={{ width: '220vmax', height: '220vmax', left: '50%', top: 'calc(114% - 35vmin)', marginLeft: '-110vmax', marginTop: '-110vmax', background: 'repeating-conic-gradient(rgba(186,24,42,0.30) 0 11.25deg, rgba(0,0,0,0.10) 11.25deg 22.5deg)', WebkitMaskImage: 'radial-gradient(circle 85vmax at 50% 50%, #000 12%, transparent 100%)', maskImage: 'radial-gradient(circle 85vmax at 50% 50%, #000 12%, transparent 100%)', animation: run ? undefined : 'none' }} />
        <div className="absolute" style={{ left: '50%', bottom: '-14%', width: '70vmin', height: '70vmin', transform: 'translateX(-50%)', borderRadius: '50%', background: 'radial-gradient(circle, rgba(170,16,34,0.55) 0 60%, rgba(150,12,28,0.22) 70%, transparent 100%)' }} />
      </>}
      {theme === 'samurai' && <div className="absolute inset-0" style={{ background: 'radial-gradient(90% 55% at 50% -10%, rgba(217,207,184,0.10), transparent 70%), radial-gradient(100% 50% at 50% 110%, rgba(179,32,44,0.14), transparent 60%)' }} />}
      {theme === 'minimal' && <div className="absolute inset-0" style={{ background: night ? 'radial-gradient(100% 45% at 50% 112%, rgba(242,155,48,0.16), transparent 65%)' : 'linear-gradient(180deg, rgba(215,216,214,0.5), rgba(215,216,214,0.05) 50%)' }} />}
      {theme === 'sakuranight' && <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 70% at 50% 110%, rgba(255,79,126,0.2), transparent 60%)' }} />}
      {theme === 'kawaii' && <div className="absolute inset-0" style={{ background: night ? 'radial-gradient(90% 50% at 50% -10%, rgba(185,163,255,0.22), transparent 70%), radial-gradient(100% 45% at 50% 112%, rgba(255,140,198,0.2), transparent 65%)' : 'radial-gradient(80% 50% at 50% -10%, rgba(255,182,220,0.35), transparent 70%)' }} />}
      {(theme === 'greatwave' || theme === 'crimsonwave') && <>
        {theme === 'crimsonwave' && <div className="absolute" style={{ right: '-12vmin', top: '14%', width: '78vmin', height: '78vmin', borderRadius: '50%', background: 'radial-gradient(circle, rgba(214,52,36,0.92) 0 66%, rgba(214,52,36,0.3) 68.5%, transparent 71%)', opacity: driving ? 0.45 : 0.9, transition: 'opacity 1.5s' }} />}
        <div className="absolute inset-0" style={{ background: theme === 'crimsonwave' ? 'radial-gradient(120% 60% at 50% 115%, rgba(224,65,46,0.14), transparent 60%)' : night ? 'radial-gradient(110% 60% at 50% -10%, rgba(232,217,176,0.10), transparent 65%)' : 'radial-gradient(130% 80% at 50% 40%, transparent 55%, rgba(170,150,110,0.28))' }} />
        {/* Hokusai's Great Wave (1831, public domain), cut out of its paper sky. Fades back while you drive so the roads stay clear. */}
        <Suspense fallback={null}>
          <WaveCanvas src="/great-wave.webp" animate={run} fps={driving ? 15 : 30} className={`dz-bigwave${run ? '' : ' dz-still'}`} style={{ opacity: driving ? 0.38 : night || theme === 'crimsonwave' ? 0.88 : 0.95 }} />
        </Suspense>
      </>}
      {dragon && <>
        <div className="absolute inset-0" style={{ background: theme === 'dragon' ? 'radial-gradient(90% 50% at 50% -10%, rgba(212,160,23,0.12), transparent 70%), radial-gradient(100% 50% at 50% 112%, rgba(179,32,44,0.16), transparent 60%)' : `radial-gradient(90% 50% at 50% -10%, ${dragon.accent}22, transparent 70%), radial-gradient(100% 50% at 50% 112%, ${dragon.accent2}29, transparent 60%)` }} />
        {(dragon.sun || dragon.moon) && <div className="absolute" style={{ left: '18vw', top: '120px', width: '46vmin', height: '46vmin', borderRadius: '50%', background: dragon.moon ? `radial-gradient(circle at 42% 40%, #fff7da 0, ${dragon.moon} 45%, ${dragon.moon}dd 64%, ${dragon.moon}55 67%, transparent 72%)` : `radial-gradient(circle, ${dragon.sun}d9 0 66%, ${dragon.sun}4d 68.5%, transparent 71%)`, boxShadow: dragon.moon ? `0 0 60px ${dragon.moon}55` : undefined, opacity: driving ? 0.35 : 0.88, transition: 'opacity 1.5s' }} />}
        {/* The dragon from Utagawa Kuniyoshi's "Dragon and Waves" (c. 1827-31, public domain), cut out, animated and recolored per theme. Fades back while you drive. */}
        <Suspense fallback={null}>
          <WaveCanvas src="/dragon-waves.webp" fx="dragon" tint={dragon.dragon || null} animate={run} fps={driving ? 15 : 30} className={`dz-dragon${run ? '' : ' dz-still'}`} style={{ opacity: driving ? 0.35 : 0.95 }} />
        </Suspense>
      </>}
      {theme === 'xmas' && <div className="absolute inset-0" style={{ background: 'radial-gradient(100% 50% at 50% 112%, rgba(217,43,43,0.16), transparent 62%), radial-gradient(80% 40% at 50% -5%, rgba(242,193,78,0.12), transparent 70%)' }} />}
      {theme === 'snowday' && <div className="absolute inset-0" style={{ background: night ? 'radial-gradient(90% 50% at 50% -10%, rgba(143,208,255,0.18), transparent 70%)' : 'linear-gradient(180deg, rgba(255,255,255,0.45), rgba(230,240,250,0.05) 45%, rgba(220,235,248,0.3))' }} />}
      {theme === 'heat' && <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 70% at 50% 110%, rgba(255,46,136,0.22), transparent 60%), radial-gradient(90% 50% at 50% -10%, rgba(122,60,255,0.18), transparent 60%)' }} />}
      {theme === 'carbon' && <div className="absolute inset-0" style={{ background: 'radial-gradient(110% 55% at 50% 112%, rgba(255,122,0,0.16), transparent 60%), repeating-linear-gradient(45deg, rgba(255,255,255,0.025) 0 3px, transparent 3px 6px), repeating-linear-gradient(-45deg, rgba(0,0,0,0.12) 0 3px, transparent 3px 6px)' }} />}
      {theme === 'underground' && <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 60% at 50% 112%, rgba(124,255,60,0.14), transparent 60%), radial-gradient(90% 50% at 50% -10%, rgba(0,179,255,0.14), transparent 65%)' }} />}
      {theme === 'ghost' && <div className="absolute inset-0" style={{ background: 'radial-gradient(110% 60% at 50% 112%, rgba(138,92,214,0.24), transparent 62%), radial-gradient(70% 40% at 50% -5%, rgba(255,59,92,0.08), transparent 70%)' }} />}
      {theme === 'thunder' && <div className="absolute inset-0" style={{ background: 'radial-gradient(90% 50% at 50% -10%, rgba(255,212,0,0.14), transparent 70%)' }} />}
      {theme === 'ember' && <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 60% at 50% 112%, rgba(255,90,31,0.25), transparent 62%)' }} />}
      {theme === 'tide' && <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(124,232,255,0.08), transparent 40%, rgba(47,164,255,0.14))' }} />}
      {theme === 'leaf' && <div className="absolute inset-0" style={{ background: night ? 'radial-gradient(100% 45% at 50% 112%, rgba(108,201,90,0.16), transparent 65%)' : 'radial-gradient(80% 50% at 50% -10%, rgba(255,240,170,0.3), transparent 70%)' }} />}
      {theme === 'psychic' && <div className="absolute inset-0" style={{ background: 'radial-gradient(100% 55% at 50% 112%, rgba(255,90,209,0.2), transparent 62%), radial-gradient(80% 45% at 50% -8%, rgba(195,139,255,0.18), transparent 70%)' }} />}
      {wk === 'fog' && <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(200,205,215,0.55), rgba(200,205,215,0.15) 55%, rgba(200,205,215,0.3))' }} />}
      {run && <canvas ref={canvas} className="absolute inset-0 w-full h-full" />}
      {flash && <div className="absolute inset-0" style={{ background: theme === 'thunder' && wk !== 'storm' ? 'rgba(255,236,140,0.3)' : 'rgba(255,255,255,0.4)' }} />}
    </div>
  );
}
