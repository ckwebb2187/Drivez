import { useEffect, useRef } from 'react';
import { applyTheme, animateWater, themeBase, useMapLook, isLite } from '@/lib/mapTheme';
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
  return (
    <>
      <DriveMapInner key={`${look.theme}-${base}-${lite}`} {...props} theme={look.theme} base={base} lite={lite} />
      <MapAtmosphere theme={look.theme} pos={props.pos} active={props.active !== false} lite={lite} weatherFx={look.weatherFx} />
    </>
  );
}

function DriveMapInner({
  pos, heading, speed = 0, car, driving, routeCoords, dest, stops = [], guide, trail, reports = [],
  follow = true, onUserMove, className = '', active = true, theme = 'standard', base = 'day', lite = false, fitCoords = null,
}) {
  const box = useRef(null);
  const mapRef = useRef(null);
  const readyRef = useRef(false);
  const carRef = useRef(null);
  const pinRef = useRef(null);
  const reportMarkers = useRef(new Map());
  const anim = useRef({ from: null, to: null, t0: 0, dur: 1000, shown: null, brg: 0, brgTarget: 0, zoom: 16, lastFix: 0, lastPos: null });
  const live = useRef({});
  live.current = { ...live.current, follow, driving, speed, onUserMove, active, previewing: !!fitCoords };
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
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-right');
    // Start with the credits folded into the small (i) button.
    map.once('load', () => box.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'));
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;

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

    map.on('load', () => {
      // Draw our lines above every road but below the street names.
      const layers = map.getStyle().layers;
      let lastRoad = -1;
      layers.forEach((l, i) => { if (l.type === 'line' || l.type === 'fill-extrusion') lastRoad = i; });
      const firstSymbol = layers.slice(lastRoad + 1).find((l) => l.type === 'symbol')?.id;
      // World theme colors + 3D buildings (themed windows), then gentle water motion.
      try { applyTheme(map, theme, { lite, beforeId: firstSymbol }); } catch { /* keep the plain style */ }
      if (!lite) live.current.stopWater = animateWater(map, theme);
      map.addSource('dz-guide', { type: 'geojson', data: EMPTY });
      map.addSource('dz-trail', { type: 'geojson', data: EMPTY });
      map.addSource('dz-behind', { type: 'geojson', data: EMPTY });
      map.addSource('dz-ahead', { type: 'geojson', data: EMPTY });
      const round = { 'line-join': 'round', 'line-cap': 'round' };
      map.addLayer({ id: 'dz-guide', type: 'line', source: 'dz-guide', layout: round, paint: { 'line-color': '#8a8ac0', 'line-width': 4, 'line-dasharray': [1.5, 2], 'line-opacity': 0.8 } }, firstSymbol);
      map.addLayer({ id: 'dz-trail', type: 'line', source: 'dz-trail', layout: round, paint: { 'line-color': '#00BFFF', 'line-width': 5, 'line-opacity': 0.85 } }, firstSymbol);
      map.addLayer({ id: 'dz-behind', type: 'line', source: 'dz-behind', layout: round, paint: { 'line-color': '#9aa0a6', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 5, 18, 14], 'line-opacity': 0.75 } }, firstSymbol);
      map.addLayer({ id: 'dz-ahead-casing', type: 'line', source: 'dz-ahead', layout: round, paint: { 'line-color': '#1a4fb3', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 8, 18, 22] } }, firstSymbol);
      map.addLayer({ id: 'dz-ahead', type: 'line', source: 'dz-ahead', layout: round, paint: { 'line-color': '#4c8bf5', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 5, 18, 15] } }, firstSymbol);
      readyRef.current = true;
      live.current.refresh?.();
    });

    // Animation loop: glide the car between GPS fixes and keep the camera behind it.
    let raf;
    const tick = (now) => {
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
          map.jumpTo({
            center: toLngLat(p),
            bearing: d ? a.brg : map.getBearing() + angleDiff(map.getBearing(), 0) * 0.08,
            pitch: d ? Math.min(58, map.getPitch() + 1.5) : Math.max(0, map.getPitch() - 2),
            zoom: a.zoom,
          });
        }
      }
      if (live.current.car3d && !live.current.follow) map.triggerRepaint();
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
        let colors = { body: car.color || '#1f5ad6', glow: null };
        if (car.image) { try { colors = await prepareCarPicture(car.image); } catch { /* keep plain colors */ } }
        const model = car.model3d && CAR_MODELS[car.model3d];
        if (model) colors = { ...colors, modelUrl: model.url, frontAxis: model.frontAxis, paintMaterials: model.paintMaterials, paint: car.paint || null };
        if (cancelled || !readyRef.current) return;
        if (map.getLayer('dz-car3d')) map.removeLayer('dz-car3d');
        try {
          map.addLayer(car3dLayer({
            colors,
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
  }, [car?.body, car?.color, car?.image, car?.model3d, car?.paint]); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (!readyRef.current) return;
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
