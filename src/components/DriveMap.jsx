import { useCallback, useEffect, useRef, useState } from 'react';
import { applyTheme, animateWater, themeBase, useMapLook, isLite, routeColors } from '@/lib/mapTheme';
import MapAtmosphere from '@/components/MapAtmosphere';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { carMarkup } from '@/lib/cars';
import { REPORT_TYPES } from '@/lib/reports';
import { distM } from '@/lib/nav';
import { useWeatherTiles, useWeatherPrefs } from '@/components/Weather';
import { CAR_MODELS } from '@/lib/carModels';
import { useLiveTraffic, trafficTileUrl } from '@/lib/traffic';

// The 3D driving map, in the style of Waze / Google Maps navigation:
// heading-up, tilted, car in the lower third, smooth gliding between GPS fixes,
// zoom that follows your speed, and the route ahead in blue (driven part greyed out).
const STYLE_DAY = 'https://tiles.openfreemap.org/styles/liberty';
const STYLE_NIGHT = 'https://tiles.openfreemap.org/styles/dark';
export const isDaytime = (d = new Date()) => d.getHours() >= 7 && d.getHours() < 19;

const EMPTY = { type: 'FeatureCollection', features: [] };
const line = (coords) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} });
const toLngLat = ([lat, lng]) => [lng, lat];

function zoomForSpeed(mph) {
  if (mph < 20) return 17.4;
  if (mph < 35) return 16.9;
  if (mph < 50) return 16.3;
  if (mph < 65) return 15.8;
  return 15.3;
}
function bearingBetween(a, b) {
  const r = Math.PI / 180;
  const y = Math.sin((b[1] - a[1]) * r) * Math.cos(b[0] * r);
  const x = Math.cos(a[0] * r) * Math.sin(b[0] * r) - Math.sin(a[0] * r) * Math.cos(b[0] * r) * Math.cos((b[1] - a[1]) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}
const angleDiff = (a, b) => ((b - a + 540) % 360) - 180;

function carElement(car) {
  const el = document.createElement('div');
  el.style.cssText = 'width:64px;height:64px;display:flex;align-items:center;justify-content:center;pointer-events:none;filter:drop-shadow(0 6px 6px rgba(0,0,0,.45))';
  if (car) {
    el.style.width = el.style.height = car.image ? '100px' : '64px';
    el.innerHTML = carMarkup(car, 30, 60);
  } else {
    // Google-style navigation arrow
    el.innerHTML = `<svg width="46" height="46" viewBox="0 0 46 46"><circle cx="23" cy="23" r="21" fill="rgba(66,133,244,.18)"/><path d="M23 6 L36 37 L23 30 L10 37 Z" fill="#4285F4" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></svg>`;
  }
  return el;
}

function pinElement() {
  const el = document.createElement('div');
  el.innerHTML = '<svg width="34" height="46" viewBox="0 0 34 46"><path d="M17 45 C17 45 32 27 32 16 A15 15 0 1 0 2 16 C2 27 17 45 17 45 Z" fill="#EA4335" stroke="#fff" stroke-width="2.5"/><circle cx="17" cy="16" r="5.5" fill="#fff"/></svg>';
  return el;
}

function reportElement(type) {
  const t = REPORT_TYPES[type] || REPORT_TYPES.hazard;
  const el = document.createElement('div');
  el.style.cssText = `width:36px;height:36px;border-radius:50%;background:${t.color};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;font-size:18px`;
  el.textContent = t.emoji;
  el.title = t.label;
  return el;
}

// Wrapper: picks the world theme, redraws the map when it changes, and adds weather / theme effects on top.
export default function DriveMap(props) {
  const [look] = useMapLook();
  const lite = isLite(look);
  const base = themeBase(look.theme, isDaytime());
  // Phones can wipe graphics memory when you switch apps mid-drive. The map library can't bring
  // back our 3D car and extra layers after that, so rebuild the whole map fresh instead.
  const [gen, setGen] = useState(0);
  const rebuild = useCallback(() => setGen((g) => g + 1), []);
  return (
    <>
      <DriveMapInner key={`${look.theme}-${base}-${lite}-${gen}`} {...props} theme={look.theme} base={base} lite={lite} onGraphicsLost={rebuild} />
      <MapAtmosphere theme={look.theme} pos={props.pos} active={props.active !== false} lite={lite} weatherFx={look.weatherFx} />
    </>
  );
}

function DriveMapInner({
  pos, heading, speed = 0, car, driving, routeCoords, dest, stops = [], guide, trail, reports = [],
  follow = true, onUserMove, className = '', active = true, theme = 'standard', base = 'day', lite = false, fitCoords = null,
  friends = [], onFriendTap, pins = [], onPinTap, onGraphicsLost, driveFx = null,
}) {
  const fxRef = useRef(driveFx);
  fxRef.current = driveFx;
  const brakeRef = useRef({ hist: [], until: 0 });
  const lostRef = useRef(onGraphicsLost);
  lostRef.current = onGraphicsLost;
  const box = useRef(null);
  const mapRef = useRef(null);
  const readyRef = useRef(false);
  const carRef = useRef(null);
  const pinRef = useRef(null);
  const reportMarkers = useRef(new Map());
  const pinMarkers = useRef(new Map());
  const pinTap = useRef(onPinTap);
  pinTap.current = onPinTap;
  const friendMarkers = useRef(new Map());
  const friendTap = useRef(onFriendTap);
  friendTap.current = onFriendTap;
  const anim = useRef({ from: null, to: null, t0: 0, dur: 1000, shown: null, brg: 0, brgTarget: 0, zoom: 16, lastFix: 0, lastPos: null });
  const live = useRef({});
  live.current = { ...live.current, follow, driving, speed, onUserMove, active, previewing: !!fitCoords, hasRoute: !!(routeCoords && routeCoords.length > 1) };
  const routeIdx = useRef(0);
  const wx = useWeatherTiles();
  const liveTraffic = useLiveTraffic();
  const [layerPrefs] = useWeatherPrefs();
  const showTraffic = !!liveTraffic && layerPrefs.traffic !== false;
  const day = useRef(isDaytime());

  // Create the map once.
  useEffect(() => {
    const map = new maplibregl.Map({
      container: box.current,
      style: base === 'day' ? STYLE_DAY : STYLE_NIGHT,
      center: pos ? toLngLat(pos) : [-98.58, 39.83],
      zoom: pos ? 16 : 3.5,
      pitch: 0,
      attributionControl: false,
      maxPitch: 70,
      fadeDuration: 0,
    });
    // Map credits live in Settings → App & updates (keeps the map clear).
    // Start with the credits folded into the small (i) button.
    map.once('load', () => box.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'));
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;
    window.__dzMap = map; // handy for debugging and tests

    // A finger on the map pauses the camera so you can drag it; a real drag/zoom tells the screen.
    const userMoved = (e) => { if (e.originalEvent) { live.current.moved = true; live.current.onUserMove?.(); } };
    const canvas = map.getCanvasContainer();
    const down = () => { live.current.held = true; live.current.moved = false; };
    const up = () => { live.current.held = false; };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('touchstart', down, { passive: true });
    window.addEventListener('pointerup', up);
    window.addEventListener('touchend', up);
    map.on('dragstart', userMoved);
    map.on('zoomstart', userMoved);
    map.on('pitchstart', userMoved);

    map.on('webglcontextlost', () => { readyRef.current = false; setTimeout(() => lostRef.current?.(), 50); });
    map.on('load', () => {
      // Draw our lines above every road but below the street names.
      const layers = map.getStyle().layers;
      let lastRoad = -1;
      layers.forEach((l, i) => { if (l.type === 'line' || l.type === 'fill-extrusion') lastRoad = i; });
      const firstSymbol = layers.slice(lastRoad + 1).find((l) => l.type === 'symbol')?.id;
      // World theme colors + 3D buildings (themed windows), then gentle water motion.
      try { applyTheme(map, theme, { lite, beforeId: firstSymbol }); } catch { /* keep the plain style */ }
      if (!lite) live.current.stopWater = animateWater(map, theme, () => live.current.active);
      map.addSource('dz-guide', { type: 'geojson', data: EMPTY });
      map.addSource('dz-trail', { type: 'geojson', data: EMPTY });
      map.addSource('dz-behind', { type: 'geojson', data: EMPTY });
      map.addSource('dz-ahead', { type: 'geojson', data: EMPTY, lineMetrics: true });
      const round = { 'line-join': 'round', 'line-cap': 'round' };
      map.addLayer({ id: 'dz-guide', type: 'line', source: 'dz-guide', layout: round, paint: { 'line-color': '#8a8ac0', 'line-width': 4, 'line-dasharray': [1.5, 2], 'line-opacity': 0.8 } }, firstSymbol);
      map.addLayer({ id: 'dz-trail', type: 'line', source: 'dz-trail', layout: round, paint: { 'line-color': '#00BFFF', 'line-width': 5, 'line-opacity': 0.85 } }, firstSymbol);
      map.addLayer({ id: 'dz-behind', type: 'line', source: 'dz-behind', layout: round, paint: { 'line-color': '#9aa0a6', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 5, 18, 14], 'line-opacity': 0.75 } }, firstSymbol);
      // Route ribbon in the theme's colors: glow, casing, gradient core, chevrons and a moving light flow.
      const rc = routeColors(theme, base !== 'day');
      if (rc.glow && !lite) map.addLayer({ id: 'dz-ahead-glow', type: 'line', source: 'dz-ahead', layout: round, paint: { 'line-color': rc.glow, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 16, 18, 40], 'line-blur': ['interpolate', ['linear'], ['zoom'], 12, 8, 18, 18], 'line-opacity': 0.55 } }, firstSymbol);
      map.addLayer({ id: 'dz-ahead-casing', type: 'line', source: 'dz-ahead', layout: round, paint: { 'line-color': rc.casing, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 8, 18, 22] } }, firstSymbol);
      if (rc.gap) map.addLayer({ id: 'dz-ahead-gap', type: 'line', source: 'dz-ahead', layout: round, paint: { 'line-color': rc.gap, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 6.5, 18, 18] } }, firstSymbol);
      map.addLayer({ id: 'dz-ahead', type: 'line', source: 'dz-ahead', layout: round, paint: { 'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, rc.core[0], 1, rc.core[1]], 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 5, 18, 15] } }, firstSymbol);
      if (!lite) {
        map.addLayer({ id: 'dz-ahead-flow', type: 'line', source: 'dz-ahead', layout: { 'line-join': 'round' }, paint: { 'line-color': rc.flow, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2, 18, 5], 'line-dasharray': [0, 4, 3] } }, firstSymbol);
        try {
          const c = document.createElement('canvas'); c.width = c.height = 48;
          const g = c.getContext('2d'); g.strokeStyle = rc.chev; g.lineWidth = 7; g.lineCap = 'round'; g.lineJoin = 'round';
          g.beginPath(); g.moveTo(16, 10); g.lineTo(32, 24); g.lineTo(16, 38); g.stroke();
          map.addImage('dz-chevron', g.getImageData(0, 0, 48, 48), { pixelRatio: 2 });
          map.addLayer({ id: 'dz-ahead-chev', type: 'symbol', source: 'dz-ahead', layout: { 'symbol-placement': 'line', 'symbol-spacing': 70, 'icon-image': 'dz-chevron', 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 18, 1] } }, firstSymbol);
        } catch { /* chevrons are optional */ }
        // Light flowing along the route (dash pattern stepped like an ant trail).
        const steps = [[0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0], [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5]];
        let k = 0;
        const flowTimer = setInterval(() => {
          if (!live.current.active || !readyRef.current) return;
          const src = map.getSource('dz-ahead');
          if (!src || !live.current.hasRoute) return;
          k = (k + 1) % steps.length;
          try { map.setPaintProperty('dz-ahead-flow', 'line-dasharray', steps[k]); } catch { /* gone */ }
        }, 90);
        live.current.stopFlow = () => clearInterval(flowTimer);
      }
      readyRef.current = true;
      live.current.refresh?.();
    });

    // Animation loop: glide the car between GPS fixes and keep the camera behind it.
    let raf;
    const tick = (now) => {
      // Hidden behind another screen: do nothing so the rest of the app stays quick.
      if (!live.current.active) { raf = requestAnimationFrame(tick); return; }
      const a = anim.current;
      if (a.to) {
        const t = Math.min(1, (now - a.t0) / a.dur);
        const from = a.from || a.to;
        const p = [from[0] + (a.to[0] - from[0]) * t, from[1] + (a.to[1] - from[1]) * t];
        a.shown = p;
        a.brg = (a.brg + angleDiff(a.brg, a.brgTarget) * 0.12 + 360) % 360;
        if (carRef.current) {
          carRef.current.setLngLat(toLngLat(p));
          carRef.current.setRotation(a.brg);
        }
        const { follow: f, driving: d, speed: s } = live.current;
        if (f && readyRef.current && !live.current.held && live.current.active && !live.current.previewing) {
          const targetZoom = d ? zoomForSpeed(s) : 16.5;
          a.zoom += (targetZoom - a.zoom) * 0.03;
          const c = map.getCenter();
          const ll = toLngLat(p);
          const bearing = d ? a.brg : map.getBearing() + angleDiff(map.getBearing(), 0) * 0.08;
          const pitch = d ? Math.min(58, map.getPitch() + 1.5) : Math.max(0, map.getPitch() - 2);
          // Only move the camera when something visibly changes; a still map costs nothing.
          const still = Math.abs(c.lng - ll[0]) < 2e-7 && Math.abs(c.lat - ll[1]) < 2e-7
            && Math.abs(map.getZoom() - a.zoom) < 0.002 && Math.abs(angleDiff(map.getBearing(), bearing)) < 0.05
            && Math.abs(map.getPitch() - pitch) < 0.05;
          if (!still) map.jumpTo({ center: ll, bearing, pitch, zoom: a.zoom });
        }
        if (t < 1 && live.current.car3d && !f) map.triggerRepaint(); // 3D car gliding while you look around
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const resize = () => {
      map.resize();
      live.current.setPad?.();
    };
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('touchend', up);
      live.current.stopWater?.();
      live.current.stopFlow?.();
      readyRef.current = false; // tell the other cleanups the map is gone
      try { map.remove(); } catch { /* already gone */ }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Coming back to the drive screen: the map was hidden, so let it re-measure.
  useEffect(() => {
    if (!active) return;
    const map = mapRef.current;
    const t = setTimeout(() => { try { map.resize(); live.current.setPad?.(); } catch { /* not ready */ } }, 30);
    return () => clearTimeout(t);
  }, [active]);

  // Keep the car in the lower third while driving.
  useEffect(() => {
    const map = mapRef.current;
    const setPad = () => {
      const h = box.current?.clientHeight || 800;
      const top = driving && follow ? Math.round(h * 0.42) : 0;
      if (map.getPadding().top === top) return; // unchanged: don't interrupt camera moves
      map.setPadding({ top, bottom: 0, left: 0, right: 0 });
    };
    live.current.setPad = setPad;
    setPad();
  }, [driving, follow]);

  // Route preview: fit the whole route on screen, flat and north-up (between the search bar and the route card).
  useEffect(() => {
    const map = mapRef.current;
    const fit = () => {
      if (!fitCoords || fitCoords.length < 2) return;
      let w = 180, s = 90, e = -180, n = -90;
      for (const [la, ln] of fitCoords) { if (ln < w) w = ln; if (ln > e) e = ln; if (la < s) s = la; if (la > n) n = la; }
      const h = box.current?.clientHeight || 800;
      try { map.fitBounds([[w, s], [e, n]], { padding: { top: 120, bottom: Math.min(360, h * 0.45), left: 40, right: 70 }, pitch: 0, bearing: 0, duration: 700, maxZoom: 16 }); } catch { /* not ready */ }
    };
    // Wait a moment so the switch out of follow mode (which resets padding) doesn't cancel the zoom-out.
    const t = setTimeout(() => { if (readyRef.current) fit(); else map.once('load', () => setTimeout(fit, 0)); }, 120);
    return () => clearTimeout(t);
  }, [fitCoords]);

  // Jump to the start when re-centering.
  useEffect(() => {
    if (follow) anim.current.zoom = mapRef.current.getZoom();
  }, [follow]);

  // The car / arrow marker.
  useEffect(() => {
    const map = mapRef.current;
    carRef.current?.remove();
    carRef.current = new maplibregl.Marker({ element: carElement(car), rotationAlignment: 'map', pitchAlignment: 'map' })
      .setLngLat(anim.current.shown ? toLngLat(anim.current.shown) : pos ? toLngLat(pos) : [0, 0])
      .addTo(map);
    if (!pos && !anim.current.shown) carRef.current.getElement().style.display = 'none';

    // With a car in the garage, draw it in 3D (your picture on top, underglow on the road).
    let cancelled = false;
    live.current.car3d = false;
    if (car) {
      const add = async () => {
        const { car3dLayer, prepareCarPicture } = await import('@/lib/car3d'); // 3D engine loads only for driving
        // Built car: shape, wheels, paint and underglow from the garage.
        let colors = { body: car.color || '#1f5ad6', glow: car.glow || null, shape: car.shape, wheels: car.wheels, wheelColor: car.wheelColor, scoop: car.scoop, wing: car.wing, style: car.style || {} };
        if (car.display !== 'build' && car.image) {
          try {
            const pic = await prepareCarPicture(car.image);
            colors = car.display === 'picture' ? { ...pic, style: car.style || {}, glow: car.glow !== undefined ? car.glow : pic.glow } : { ...colors, picture: pic.picture, aspect: pic.aspect, glow: car.glow !== undefined ? car.glow : pic.glow };
          } catch { /* keep the built car */ }
        }
        const model = car.display === 'model' && car.model3d && CAR_MODELS[car.model3d];
        if (model) colors = { ...colors, modelUrl: model.url, frontAxis: model.frontAxis, paintMaterials: model.paintMaterials, paint: car.paint || null, glow: colors.glow || null };
        if (cancelled || !readyRef.current) return;
        if (map.getLayer('dz-car3d')) map.removeLayer('dz-car3d');
        try {
          map.addLayer(car3dLayer({
            colors,
            isActive: () => live.current.active,
            getDrive: () => {
              if (!live.current.driving) return null;
              // Brake lights: speed dropped 4+ mph within ~2 s (stay lit a moment after).
              const b = brakeRef.current, now = performance.now(), sp = live.current.speed || 0;
              b.hist = [...b.hist.filter((h) => now - h.t < 2200), { t: now, s: sp }];
              if (b.hist.length > 1 && b.hist[0].s - sp >= 4) b.until = now + 1200;
              const f = fxRef.current || {};
              return { speed: sp, turn: f.turn || null, alert: !!f.alert, braking: now < b.until || (sp < 2 && b.hist.some((h) => h.s >= 5)) };
            },
            getPose: () => {
              const a = anim.current;
              const p = a.shown || pos;
              return p ? { lngLat: toLngLat(p), bearing: a.brg } : null;
            },
          }));
          live.current.car3d = true;
          carRef.current.getElement().style.visibility = 'hidden'; // the 3D car replaces the flat one
        } catch { /* WebGL trouble: keep the flat car */ }
      };
      if (readyRef.current) add(); else map.once('load', add);
    }
    return () => {
      cancelled = true;
      try { carRef.current?.remove(); } catch { /* already gone */ }
      // Only touch the map if it still exists (leaving the screen removes it first).
      if (readyRef.current) { try { if (map.getLayer('dz-car3d')) map.removeLayer('dz-car3d'); } catch { /* already gone */ } }
      live.current.car3d = false;
    };
  }, [car && JSON.stringify(car)]); // eslint-disable-line react-hooks/exhaustive-deps

  // New GPS fix: start gliding from where the car is drawn now to the new spot.
  useEffect(() => {
    if (!pos) return;
    const a = anim.current;
    const now = performance.now();
    if (carRef.current) carRef.current.getElement().style.display = '';
    if (!a.to) { a.shown = pos; a.zoom = live.current.driving ? zoomForSpeed(speed) : 16.5; }
    a.from = a.shown || pos;
    a.to = pos;
    a.dur = a.lastFix ? Math.max(250, Math.min(1600, now - a.lastFix)) : 1;
    a.t0 = now;
    a.lastFix = now;
    if (heading != null && !Number.isNaN(heading) && speed > 3) a.brgTarget = heading;
    else if (a.lastPos && distM(a.lastPos, pos) > 4) a.brgTarget = bearingBetween(a.lastPos, pos);
    if (a.lastPos && distM(a.lastPos, pos) > 4) a.movedOnce = true;
    if (!a.lastPos || distM(a.lastPos, pos) > 4) a.lastPos = pos;
  }, [pos?.[0], pos?.[1], heading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Route: blue ahead of you, grey behind.
  useEffect(() => {
    const refresh = () => {
      const map = mapRef.current;
      if (!readyRef.current || !map.getSource('dz-ahead')) return;
      const coords = routeCoords || [];
      if (coords.length > 1 && pos) {
        // Find the closest route point, searching forward from the last one.
        let best = routeIdx.current, bestD = Infinity;
        const from = Math.max(0, routeIdx.current - 5), to = Math.min(coords.length, routeIdx.current + 300);
        for (let i = from; i < to; i++) { const d = distM(pos, coords[i]); if (d < bestD) { bestD = d; best = i; } }
        if (bestD > 150) { for (let i = 0; i < coords.length; i++) { const d = distM(pos, coords[i]); if (d < bestD) { bestD = d; best = i; } } }
        routeIdx.current = best;
        // Not moving yet? Point the car along the route.
        const a = anim.current;
        if (!a.movedOnce && coords[best + 1]) a.brgTarget = bearingBetween(pos, coords[Math.min(best + 2, coords.length - 1)]);
        map.getSource('dz-behind').setData(line([...coords.slice(0, best + 1), pos].map(toLngLat)));
        map.getSource('dz-ahead').setData(line([pos, ...coords.slice(best + 1)].map(toLngLat)));
      } else {
        map.getSource('dz-behind').setData(EMPTY);
        map.getSource('dz-ahead').setData(coords.length > 1 ? line(coords.map(toLngLat)) : EMPTY);
      }
      map.getSource('dz-trail').setData(!coords.length && trail?.length > 1 ? line(trail.map((p) => [p.lng, p.lat])) : EMPTY);
      map.getSource('dz-guide').setData(guide?.length > 1 ? line(guide.map(toLngLat)) : EMPTY);
    };
    live.current.refresh = refresh;
    refresh();
  }, [routeCoords, pos?.[0], pos?.[1], trail?.length, guide]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { routeIdx.current = 0; }, [routeCoords]);

  // Destination pin.
  useEffect(() => {
    pinRef.current?.remove();
    pinRef.current = dest ? new maplibregl.Marker({ element: pinElement(), anchor: 'bottom' }).setLngLat([dest.lng, dest.lat]).addTo(mapRef.current) : null;
    return () => pinRef.current?.remove();
  }, [dest?.lat, dest?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Numbered stops.
  const stopMarkers = useRef([]);
  useEffect(() => {
    stopMarkers.current.forEach((m) => m.remove());
    stopMarkers.current = stops.map((st, i) => {
      const el = document.createElement('div');
      el.style.cssText = 'width:26px;height:26px;border-radius:50%;background:#4285F4;border:2.5px solid #fff;color:#fff;font:800 12px system-ui;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.5)';
      el.textContent = String(i + 1);
      return new maplibregl.Marker({ element: el }).setLngLat([st.lng, st.lat]).addTo(mapRef.current);
    });
    return () => stopMarkers.current.forEach((m) => m.remove());
  }, [stops.map((x) => `${x.lat},${x.lng}`).join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Road reports.
  useEffect(() => {
    const map = mapRef.current;
    const keep = new Set();
    for (const r of reports) {
      keep.add(r.id);
      if (!reportMarkers.current.has(r.id)) {
        reportMarkers.current.set(r.id, new maplibregl.Marker({ element: reportElement(r.type), pitchAlignment: 'viewport' }).setLngLat([r.lng, r.lat]).addTo(map));
      }
    }
    for (const [id, m] of reportMarkers.current) if (!keep.has(id)) { m.remove(); reportMarkers.current.delete(id); }
  }, [reports]);

  // Extra pins (car meets): emoji badge with a short label. Tap to open.
  useEffect(() => {
    const map = mapRef.current;
    const keep = new Set();
    for (const p of pins) {
      keep.add(p.id);
      if (pinMarkers.current.has(p.id)) continue;
      const el = document.createElement('div');
      el.style.cssText = 'display:flex;flex-direction:column;align-items:center;cursor:pointer';
      const dot = document.createElement('div');
      dot.style.cssText = 'width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;background:hsl(var(--card));border:2px solid hsl(var(--primary));box-shadow:0 0 12px hsl(var(--primary) / .6)';
      dot.textContent = p.emoji || '📍';
      const label = document.createElement('div');
      label.style.cssText = 'margin-top:2px;font:700 10px system-ui;color:#fff;background:rgba(15,18,28,.85);padding:1px 6px;border-radius:8px;white-space:nowrap;max-width:120px;overflow:hidden;text-overflow:ellipsis';
      label.textContent = p.label || '';
      el.append(dot, label);
      el.addEventListener('click', (e) => { e.stopPropagation(); pinTap.current?.(p); });
      pinMarkers.current.set(p.id, new maplibregl.Marker({ element: el, anchor: 'bottom', pitchAlignment: 'viewport' }).setLngLat([p.lng, p.lat]).addTo(map));
    }
    for (const [id, m] of pinMarkers.current) if (!keep.has(id)) { m.remove(); pinMarkers.current.delete(id); }
  }, [pins.map((p) => p.id).join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Friends driving now: their car + name. Tap to see their profile.
  useEffect(() => {
    const map = mapRef.current;
    const keep = new Set();
    for (const f of friends) {
      keep.add(f.userId);
      let m = friendMarkers.current.get(f.userId);
      if (!m) {
        const el = document.createElement('div');
        el.style.cssText = 'display:flex;flex-direction:column;align-items:center;cursor:pointer';
        el.innerHTML = '<div data-car style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 3px 4px rgba(0,0,0,.5))"></div><div data-name style="margin-top:-2px;font:700 11px system-ui;color:#fff;background:rgba(15,18,28,.85);padding:2px 7px;border-radius:9px;white-space:nowrap"></div>';
        el.addEventListener('click', (e) => { e.stopPropagation(); friendTap.current?.(friendMarkers.current.get(f.userId)?.friend); });
        m = new maplibregl.Marker({ element: el, pitchAlignment: 'viewport', rotationAlignment: 'viewport' }).setLngLat([f.lng, f.lat]).addTo(map);
        friendMarkers.current.set(f.userId, m);
      }
      m.friend = f;
      m.setLngLat([f.lng, f.lat]);
      const el = m.getElement();
      const carBox = el.querySelector('[data-car]');
      const sig = JSON.stringify([f.car, Math.round(f.heading || 0)]);
      if (carBox.dataset.sig !== sig) {
        carBox.dataset.sig = sig;
        carBox.innerHTML = `<div style="transform:rotate(${(f.heading || 0) - map.getBearing()}deg)">${f.car ? carMarkup(f.car, 18, 36) : '<div style="width:16px;height:16px;border-radius:50%;background:#39FF14;border:2px solid #fff"></div>'}</div>`;
      }
      el.querySelector('[data-name]').textContent = `${f.name || f.username}${f.speed ? ` · ${f.speed}` : ''}`;
    }
    for (const [id, m] of friendMarkers.current) if (!keep.has(id)) { m.remove(); friendMarkers.current.delete(id); }
  }, [friends]);
  useEffect(() => () => { for (const m of friendMarkers.current.values()) { try { m.remove(); } catch { /* gone */ } } }, []);

  // Weather overlay (under the route).
  useEffect(() => {
    const map = mapRef.current;
    const apply = () => {
      if (!readyRef.current) return;
      if (map.getLayer('dz-wx')) map.removeLayer('dz-wx');
      if (map.getSource('dz-wx')) map.removeSource('dz-wx');
      if (!wx) return;
      map.addSource('dz-wx', { type: 'raster', tiles: [wx.url], tileSize: 256, maxzoom: wx.maxzoom });
      map.addLayer({ id: 'dz-wx', type: 'raster', source: 'dz-wx', paint: { 'raster-opacity': wx.opacity } }, 'dz-guide');
    };
    if (readyRef.current) apply(); else map.once('load', apply);
  }, [wx?.key, wx?.opacity]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live traffic colors on the roads (under the route line).
  useEffect(() => {
    const map = mapRef.current;
    const apply = () => {
      if (!readyRef.current) return;
      if (map.getLayer('dz-traffic')) map.removeLayer('dz-traffic');
      if (map.getSource('dz-traffic')) map.removeSource('dz-traffic');
      if (!showTraffic) return;
      map.addSource('dz-traffic', { type: 'raster', tiles: [trafficTileUrl(!day.current)], tileSize: 256, maxzoom: 18 });
      map.addLayer({ id: 'dz-traffic', type: 'raster', source: 'dz-traffic', paint: { 'raster-opacity': 0.9 } }, 'dz-guide');
    };
    if (readyRef.current) apply(); else map.once('load', apply);
  }, [showTraffic]);

  return <div ref={box} className={`dz-drive-map ${className}`} style={{ position: 'absolute', inset: 0 }} />;
}
