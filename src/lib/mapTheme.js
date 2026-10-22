import { useEffect, useState } from 'react';

// World themes: how the whole city around you looks on the drive map.
// Roads, the route, hazards and street names stay readable in every theme.

export const THEMES = [
  { key: 'standard', label: 'Standard', jp: 'Hyōjun 標準', text: 'Clean map. Switches to night colors after dark.', swatch: ['#e8eaed', '#4c8bf5', '#1d2433'] },
  { key: 'tokyo', label: 'Tokyo Neon', jp: 'Yomichi 夜道', text: 'Glowing signs, wet streets, lit windows.', swatch: ['#0b0d1a', '#ff2d95', '#00e5ff'] },
  { key: 'cyberpunk', label: 'Cyberpunk', jp: 'Saibā サイバー', text: 'Neon purple and teal, holo scanlines.', swatch: ['#0a0614', '#b026ff', '#00ffd5'] },
  { key: 'dystopian', label: 'Dystopian', jp: 'Haikyo no machi', text: 'Gray smog, industrial, searchlights.', swatch: ['#2b2b2a', '#8a8a84', '#d6d3c4'] },
  { key: 'wasteland', label: 'Post-Apocalyptic', jp: 'Kōya 荒野', text: 'Rust, dust storms, overgrown blocks.', swatch: ['#4a3d2c', '#a0662f', '#6f7d38'] },
  { key: 'kawaii', label: 'Kawaii', jp: 'Kawaii かわいい', text: 'Pastel pinks, cherry blossoms, sparkles.', swatch: ['#fdeef6', '#ff8cc6', '#b9a3ff'] },
];

// Colors for each part of the map. null = keep the base style's color.
const P = {
  tokyo: { base: 'dark', bg: '#0b0d1a', water: ['#0a1a33', '#0e2447'], park: '#0f1f1f', wood: '#0d1a1a', land: '#10132a', road: '#262a44', roadMajor: '#3a2f55', casing: '#0b0d1a', bldg: '#1b1e36', bldgTop: '#2a2350', windows: ['#ffd36b', '#ff6ec7', '#7af2ff'], text: '#ffd6f5', halo: '#0b0d1a', glow: ['#ff2d95', '#00e5ff'] },
  cyberpunk: { base: 'dark', bg: '#0a0614', water: ['#062a33', '#0a3d47'], park: '#120a24', wood: '#0f0a1f', land: '#120a22', road: '#24123f', roadMajor: '#341a5a', casing: '#0a0614', bldg: '#1a0f2e', bldgTop: '#3b1466', windows: ['#00ffd5', '#b026ff', '#ff3df2'], text: '#7df9ff', halo: '#0a0614', glow: ['#b026ff', '#00ffd5'] },
  dystopian: { base: 'dark', bg: '#2b2b2a', water: ['#3a4040', '#424a4a'], park: '#33362f', wood: '#2f322b', land: '#30302e', road: '#4a4a48', roadMajor: '#5a5a56', casing: '#232322', bldg: '#3c3c3a', bldgTop: '#4a4a46', windows: ['#c9c2a0', '#8a8a84', '#3c3c3a'], text: '#d6d3c4', halo: '#1e1e1d', glow: null },
  wasteland: { base: 'dark', bg: '#4a3d2c', water: ['#3f4a3a', '#46523f'], park: '#4d5a2a', wood: '#46522a', land: '#4f412f', road: '#5c5246', roadMajor: '#6b5d4c', casing: '#3a3022', bldg: '#5e4c3a', bldgTop: '#6f5a41', windows: ['#2a2219', '#7a5a35', '#2a2219'], text: '#f1e3c3', halo: '#2e2519', glow: null },
  kawaii: { base: 'day', bg: '#fdeef6', water: ['#c9e4ff', '#d8ecff'], park: '#d8f5d0', wood: '#c9eec0', land: '#fbe6f1', road: '#ffffff', roadMajor: '#fff3fa', casing: '#f3b6d6', bldg: '#f6d0ea', bldgTop: '#ffe3f3', windows: ['#ffffff', '#ffd1ea', '#d9ccff'], text: '#7a4a8c', halo: '#ffffff', glow: null },
};

export const themeBase = (theme, isDay) => (P[theme]?.base === 'day' ? 'day' : P[theme] ? 'dark' : isDay ? 'day' : 'dark');

// A small square of building wall with windows, used as the side texture of 3D buildings.
function windowTile(p, lit) {
  const s = 32;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.fillStyle = p.bldg; g.fillRect(0, 0, s, s);
  const w = 3, h = 4;
  for (let y = 4; y < s; y += 10) {
    for (let x = 3; x < s; x += 8) {
      const on = lit && Math.random() < 0.4;
      g.fillStyle = on ? p.windows[Math.floor(Math.random() * p.windows.length)] : 'rgba(0,0,0,0.22)';
      g.globalAlpha = on ? 0.7 : 1;
      g.fillRect(x, y, w, h);
    }
  }
  g.globalAlpha = 1;
  return g.getImageData(0, 0, s, s);
}

const kind = (l) => {
  const sl = l['source-layer'] || '';
  const id = l.id || '';
  if (l.type === 'background') return 'bg';
  if (sl === 'water' || sl === 'waterway' || /water/.test(id)) return 'water';
  if (sl === 'park' || /park/.test(id)) return 'park';
  if (sl === 'landcover' && /wood|forest|tree/.test(id)) return 'wood';
  if (sl === 'landcover' || sl === 'landuse') return 'land';
  if (sl === 'building') return l.type === 'fill-extrusion' ? 'bldg3d' : 'bldg';
  if (sl === 'transportation') {
    if (/casing|outline/.test(id)) return 'casing';
    if (/motorway|trunk|primary|major/.test(id)) return 'roadMajor';
    return 'road';
  }
  return null;
};

const setP = (map, id, prop, val) => { try { map.setPaintProperty(id, prop, val); } catch { /* layer lacks this property */ } };

// Recolor the loaded style for a theme. `lite` = battery saver: no textures, no 3D buildings.
export function applyTheme(map, theme, { lite = false, beforeId } = {}) {
  const p = P[theme];
  const layers = map.getStyle().layers;
  if (p) {
    for (const l of layers) {
      const k = kind(l);
      if (l.type === 'symbol') {
        setP(map, l.id, 'text-color', p.text);
        setP(map, l.id, 'text-halo-color', p.halo);
        continue;
      }
      if (!k) continue;
      const color = k === 'water' ? p.water[0] : k === 'bldg3d' ? p.bldg : p[k];
      if (!color) continue;
      if (l.type === 'fill') setP(map, l.id, 'fill-color', color);
      if (l.type === 'line') setP(map, l.id, 'line-color', color);
      if (l.type === 'background') setP(map, l.id, 'background-color', color);
      if (l.type === 'fill-extrusion') setP(map, l.id, 'fill-extrusion-color', color);
    }
  }

  // 3D buildings: one layer we control, so every theme gets them.
  for (const l of layers) if (l.type === 'fill-extrusion' && l.id !== 'dz-buildings') { try { map.setLayoutProperty(l.id, 'visibility', 'none'); } catch { /* ignore */ } }
  if (!lite && map.getSource('openmaptiles')) {
    const night = !p && themeBase(theme, true) === 'dark';
    const textured = !!p;
    if (textured && !map.hasImage('dz-windows')) {
      try { map.addImage('dz-windows', windowTile(p, theme !== 'wasteland'), { pixelRatio: 2 }); } catch { /* ignore */ }
    }
    map.addLayer({
      id: 'dz-buildings', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14,
      paint: {
        ...(textured && map.hasImage('dz-windows')
          ? { 'fill-extrusion-pattern': 'dz-windows' }
          : { 'fill-extrusion-color': night ? '#2b2f3d' : '#d9d4cc' }),
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.9,
        'fill-extrusion-vertical-gradient': true,
      },
    }, beforeId);
  }

  // Neon glow along the big roads.
  if (p?.glow && !lite) {
    const major = layers.find((l) => l.type === 'line' && l['source-layer'] === 'transportation' && /motorway|trunk|primary/.test(l.id) && !/casing/.test(l.id));
    if (major) {
      ['a', 'b'].forEach((n, i) => {
        map.addLayer({
          id: `dz-glow-${n}`, type: 'line', source: major.source, 'source-layer': 'transportation',
          filter: ['in', ['get', 'class'], ['literal', i === 0 ? ['motorway', 'trunk'] : ['primary', 'secondary']]],
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': p.glow[i], 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2, 18, 10], 'line-blur': ['interpolate', ['linear'], ['zoom'], 10, 2, 18, 8], 'line-opacity': 0.55 },
        }, beforeId);
      });
    }
  }
}

// Gentle water shimmer: nudges the water color back and forth. Returns a stop function.
export function animateWater(map, theme) {
  const p = P[theme];
  const ids = map.getStyle().layers.filter((l) => l.type === 'fill' && kind(l) === 'water').map((l) => l.id);
  const [a, b] = p ? p.water : ['#a9cbe8', '#b8d6ef'];
  if (!ids.length || !p) return () => {};
  let on = false;
  const t = setInterval(() => {
    on = !on;
    ids.forEach((id) => { setP(map, id, 'fill-color-transition', { duration: 2400, delay: 0 }); setP(map, id, 'fill-color', on ? b : a); });
  }, 2500);
  return () => clearInterval(t);
}

// ---- Settings (per phone) ----
const KEY = 'dz-map-look';
const EVT = 'dz-map-look';
const lowEndPhone = () => (navigator.deviceMemory && navigator.deviceMemory <= 2) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
const read = () => {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { s = {}; }
  return { theme: s.theme || 'standard', saver: s.saver || 'auto', jpNames: !!s.jpNames, weatherFx: s.weatherFx !== false };
};
export const isLite = (prefs) => prefs.saver === 'on' || (prefs.saver === 'auto' && lowEndPhone());

export function useMapLook() {
  const [prefs, setPrefs] = useState(read);
  useEffect(() => {
    const on = () => setPrefs(read());
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);
  const update = (patch) => {
    try { localStorage.setItem(KEY, JSON.stringify({ ...read(), ...patch })); } catch { /* private mode */ }
    window.dispatchEvent(new Event(EVT));
  };
  return [prefs, update];
}

// Plain English by default; optional Japanese feature names.
const JP = { map: 'Chizu 地図', night: 'Yomichi 夜道', highway: 'Kaidō 街道', twisty: 'Tōge 峠' };
const EN = { map: 'Map', night: 'Night theme', highway: 'Highway mode', twisty: 'Twisty roads' };
export const featureName = (key, jpNames) => (jpNames ? JP[key] : EN[key]) || key;
