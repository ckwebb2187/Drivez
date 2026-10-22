import { useEffect, useRef, useState } from 'react';

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

export default function MapAtmosphere({ theme, pos, active = true, lite = false, weatherFx = true }) {
  const canvas = useRef(null);
  const wx = useLocalWeather(pos, weatherFx && !lite);
  const wk = weatherFx ? weatherKind(wx?.weather_code, wx?.cloud_cover) : null;
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const run = active && !lite && !reduce;
  const [flash, setFlash] = useState(false);

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
    const PETALS = { kawaii: '255,170,205', sakura: '255,182,206', lavender: '190,160,235', rose: '232,165,152', sakuranight: '255,150,190', zen: '120,150,80' };
    if (PETALS[theme]) add(theme === 'rose' ? 10 : 22, (init) => ({ t: 'petal', c: PETALS[theme], x: rnd(0, w), y: init ? rnd(0, h) : -10, v: rnd(0.5, 1.2), r: rnd(3, 6), ph: rnd(0, 6), rot: rnd(0, 6) }));
    const SPARKS = { kawaii: 10, y2k: 18, harajuku: 14, galaxy: 45 };
    if (SPARKS[theme]) add(SPARKS[theme], () => ({ t: 'spark', x: rnd(0, w), y: rnd(0, h), ph: rnd(0, 6), s: theme === 'galaxy' ? 0.5 : 1 }));
    if (theme === 'matrix') add(26, (init) => ({ t: 'code', x: Math.floor(rnd(0, w / 14)) * 14, y: init ? rnd(-h, h) : rnd(-300, 0), v: rnd(2, 5), len: Math.floor(rnd(6, 18)) }));
    if (theme === 'vapor' || theme === 'galaxy') add(5, () => ({ t: 'trail', x: rnd(0, w), y: rnd(0.55, 1) * h, v: rnd(2, 5), len: rnd(40, 90), hue: theme === 'vapor' ? (Math.random() < 0.5 ? '255,113,206' : '1,205,254') : (Math.random() < 0.5 ? '124,77,255' : '58,209,255') }));
    if (theme === 'wasteland') add(55, (init) => ({ t: 'dust', x: init ? rnd(0, w) : -5, y: rnd(0, h), v: rnd(0.4, 1.4), r: rnd(0.8, 2) }));
    if (theme === 'tokyo' || theme === 'cyberpunk') add(6, () => ({ t: 'trail', x: rnd(0, w), y: rnd(0.55, 1) * h, v: rnd(2, 5), len: rnd(40, 90), hue: theme === 'tokyo' ? (Math.random() < 0.5 ? '255,45,149' : '0,229,255') : (Math.random() < 0.5 ? '176,38,255' : '0,255,213') }));

    let raf, lastT = 0, frame = 0;
    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      if (now - lastT < 33) return; // ~30 fps is plenty for an overlay
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
          rg.addColorStop(0, `rgba(${['kawaii', 'sakura', 'y2k', 'lavender', 'harajuku', 'zen', 'minimal'].includes(theme) ? '255,255,255' : '20,24,32'},${a})`); rg.addColorStop(1, 'rgba(0,0,0,0)');
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
        } else if (p.t === 'trail') {
          p.y -= p.v; if (p.y < h * 0.45) { p.y = h + rnd(0, 200); p.x = rnd(0, w); }
          const lg = g.createLinearGradient(p.x, p.y, p.x, p.y + p.len);
          lg.addColorStop(0, `rgba(${p.hue},0.5)`); lg.addColorStop(1, `rgba(${p.hue},0)`);
          g.strokeStyle = lg; g.lineWidth = 2; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x, p.y + p.len); g.stroke();
        }
      }
    };
    raf = requestAnimationFrame(draw);

    // Lightning flashes in a storm.
    let flashT;
    if (wk === 'storm') {
      const strike = () => { setFlash(true); setTimeout(() => setFlash(false), 120); flashT = setTimeout(strike, rnd(6000, 15000)); };
      flashT = setTimeout(strike, rnd(3000, 8000));
    }
    return () => { cancelAnimationFrame(raf); clearTimeout(flashT); window.removeEventListener('resize', size); };
  }, [run, theme, wk]);

  if (lite) return null;
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 1 }} aria-hidden="true">
      {/* Theme mood that doesn't need animation frames */}
      {theme === 'tokyo' && <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 70% at 50% 110%, rgba(255,45,149,0.18), transparent 60%), radial-gradient(90% 50% at 50% -10%, rgba(0,229,255,0.12), transparent 60%)' }} />}
      {theme === 'cyberpunk' && <div className="absolute inset-0 dz-scanlines" />}
      {theme === 'dystopian' && <>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(120,120,110,0.35), rgba(60,60,55,0.05) 45%, rgba(40,40,38,0.25))' }} />
        {run && <><div className="dz-searchlight" style={{ left: '15%' }} /><div className="dz-searchlight" style={{ left: '75%', animationDelay: '-4s' }} /></>}
      </>}
      {theme === 'wasteland' && <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(196,140,70,0.35), rgba(120,90,50,0.08) 50%, rgba(80,60,30,0.2))', mixBlendMode: 'multiply' }} />}
      {theme === 'rose' && <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 70% at 50% 110%, rgba(255,79,163,0.22), transparent 60%), radial-gradient(90% 50% at 50% -10%, rgba(232,165,152,0.15), transparent 60%)' }} />}
      {theme === 'vapor' && <div className="absolute inset-0" style={{ background: 'linear-gradient(0deg, rgba(255,113,206,0.28), rgba(185,103,255,0.08) 35%, transparent 60%), radial-gradient(60% 40% at 50% -5%, rgba(1,205,254,0.18), transparent 70%)' }} />}
      {theme === 'galaxy' && <div className="absolute inset-0" style={{ background: 'radial-gradient(70% 45% at 20% 10%, rgba(124,77,255,0.25), transparent 70%), radial-gradient(60% 40% at 85% 25%, rgba(58,209,255,0.15), transparent 70%)' }} />}
      {['sakura', 'lavender', 'y2k', 'harajuku'].includes(theme) && <div className="absolute inset-0" style={{ background: `radial-gradient(80% 50% at 50% -10%, ${{ sakura: 'rgba(255,182,206,0.35)', lavender: 'rgba(190,160,235,0.3)', y2k: 'rgba(255,95,200,0.3)', harajuku: 'rgba(255,225,77,0.3)' }[theme]}, transparent 70%)` }} />}
      {theme === 'matrix' && <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 70% at 50% 110%, rgba(57,255,106,0.12), transparent 60%)' }} />}
      {theme === 'zen' && <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(235,240,225,0.45), rgba(235,240,225,0.05) 45%, transparent)' }} />}
      {theme === 'minimal' && <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(215,216,214,0.5), rgba(215,216,214,0.05) 50%)' }} />}
      {theme === 'sakuranight' && <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 70% at 50% 110%, rgba(255,79,126,0.2), transparent 60%)' }} />}
      {theme === 'kawaii' && <div className="absolute inset-0" style={{ background: 'radial-gradient(80% 50% at 50% -10%, rgba(255,182,220,0.35), transparent 70%)' }} />}
      {wk === 'fog' && <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(200,205,215,0.55), rgba(200,205,215,0.15) 55%, rgba(200,205,215,0.3))' }} />}
      {run && <canvas ref={canvas} className="absolute inset-0 w-full h-full" />}
      {flash && <div className="absolute inset-0 bg-white/40" />}
    </div>
  );
}
