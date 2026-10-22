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
  { key: 'rose', label: 'Midnight Rose', jp: 'Yoru no Bara 夜の薔薇', text: 'Black and rose gold with pink neon.', swatch: ['#0d0a0e', '#e8a598', '#ff4fa3'] },
  { key: 'sakura', label: 'Sakura Drive', jp: 'Sakura 桜', text: 'Soft blossom pinks and falling petals.', swatch: ['#fff1f4', '#f3a6c0', '#cfe6f5'] },
  { key: 'vapor', label: 'Pastel Vaporwave', jp: 'Vapor ヴェイパー', text: 'Retro sunset purples, pink and cyan.', swatch: ['#1a0f33', '#ff71ce', '#01cdfe'] },
  { key: 'galaxy', label: 'Galaxy', jp: 'Ginga 銀河', text: 'Deep space, nebula glow, twinkling stars.', swatch: ['#05040f', '#7c4dff', '#3ad1ff'] },
  { key: 'y2k', label: 'Y2K Gyaru', jp: 'Gyaru ギャル', text: 'Hot pink, chrome and sparkle.', swatch: ['#ffe3f6', '#ff5fc8', '#c0c0c0'] },
  { key: 'lavender', label: 'Lavender Fields', jp: 'Rabendā ラベンダー', text: 'Calm lilac fields and drifting petals.', swatch: ['#f1ecfb', '#b9a6e0', '#5a3f8f'] },
  { key: 'matrix', label: 'Matrix', jp: 'Matorikkusu マトリックス', text: 'Green code rain, hacker city grid.', swatch: ['#010603', '#39ff6a', '#0d3a1c'] },
  { key: 'zen', label: 'Zen Town', jp: 'Zen no Machi 禅の町', text: 'Forest, wood and gold lanterns, misty river.', swatch: ['#efe8d6', '#4f6f45', '#b08a3e'] },
  { key: 'minimal', label: 'Minimalism', jp: 'Minimarizumu ミニマリズム', text: 'Concrete grays with orange accents.', swatch: ['#d9dad8', '#555555', '#f29b30'] },
  { key: 'sakuranight', label: 'Sakura Night', jp: 'Sakura-michi no Machi 桜道の町', text: 'Navy night, pink neon and blossoms.', swatch: ['#0d0f19', '#ff4f7e', '#ffb3cf'] },
  { key: 'harajuku', label: 'Harajuku', jp: 'Harajuku 原宿', text: 'Loud candy colors and street pop.', swatch: ['#fff6d6', '#ff5c8a', '#4dd4ff'] },
];

// Colors for each part of the map. null = keep the base style's color.
const P = {
  tokyo: { base: 'dark', bg: '#0b0d1a', water: ['#0a1a33', '#0e2447'], park: '#0f1f1f', wood: '#0d1a1a', land: '#10132a', road: '#262a44', roadMajor: '#3a2f55', casing: '#0b0d1a', bldg: '#1b1e36', bldgTop: '#2a2350', windows: ['#ffd36b', '#ff6ec7', '#7af2ff'], text: '#ffd6f5', halo: '#0b0d1a', glow: ['#ff2d95', '#00e5ff'] },
  cyberpunk: { base: 'dark', bg: '#0a0614', water: ['#062a33', '#0a3d47'], park: '#120a24', wood: '#0f0a1f', land: '#120a22', road: '#24123f', roadMajor: '#341a5a', casing: '#0a0614', bldg: '#1a0f2e', bldgTop: '#3b1466', windows: ['#00ffd5', '#b026ff', '#ff3df2'], text: '#7df9ff', halo: '#0a0614', glow: ['#b026ff', '#00ffd5'] },
  dystopian: { base: 'dark', bg: '#2b2b2a', water: ['#3a4040', '#424a4a'], park: '#33362f', wood: '#2f322b', land: '#30302e', road: '#4a4a48', roadMajor: '#5a5a56', casing: '#232322', bldg: '#3c3c3a', bldgTop: '#4a4a46', windows: ['#c9c2a0', '#8a8a84', '#3c3c3a'], text: '#d6d3c4', halo: '#1e1e1d', glow: null },
  wasteland: { base: 'dark', bg: '#4a3d2c', water: ['#3f4a3a', '#46523f'], park: '#4d5a2a', wood: '#46522a', land: '#4f412f', road: '#5c5246', roadMajor: '#6b5d4c', casing: '#3a3022', bldg: '#5e4c3a', bldgTop: '#6f5a41', windows: ['#2a2219', '#7a5a35', '#2a2219'], text: '#f1e3c3', halo: '#2e2519', glow: null },
  rose: { base: 'dark', bg: '#0d0a0e', water: ['#1a0f1a', '#24121f'], park: '#1a1216', wood: '#161014', land: '#120c11', road: '#2a1c24', roadMajor: '#3d2531', casing: '#0d0a0e', bldg: '#1c1418', bldgTop: '#2a1c22', windows: ['#f4c2b8', '#ff6fae', '#e8a598'], text: '#f4c2b8', halo: '#0d0a0e', glow: ['#ff4fa3', '#e8a598'] },
  sakura: { base: 'day', bg: '#fff1f4', water: ['#cfe6f5', '#dcedf8'], park: '#f8d7e3', wood: '#f3c6d6', land: '#fdeef2', road: '#ffffff', roadMajor: '#ffe6ee', casing: '#e9a8bd', bldg: '#f7dde6', bldgTop: '#fff', windows: ['#ffffff', '#ffc4d6', '#f3a6c0'], text: '#8a3b5c', halo: '#ffffff', glow: null },
  vapor: { base: 'dark', bg: '#1a0f33', water: ['#2b1b5c', '#34226e'], park: '#2a1650', wood: '#24134a', land: '#1e1240', road: '#3a2470', roadMajor: '#5b2d8f', casing: '#140b2b', bldg: '#2a1a55', bldgTop: '#3d2575', windows: ['#ff71ce', '#01cdfe', '#b967ff'], text: '#fffb96', halo: '#1a0f33', glow: ['#ff71ce', '#01cdfe'] },
  galaxy: { base: 'dark', bg: '#05040f', water: ['#0b0a26', '#110f33'], park: '#0a0b1f', wood: '#08091a', land: '#07061a', road: '#1a1840', roadMajor: '#2a2266', casing: '#05040f', bldg: '#120f30', bldgTop: '#1d1850', windows: ['#ffffff', '#9db4ff', '#c79bff'], text: '#d8d4ff', halo: '#05040f', glow: ['#7c4dff', '#3ad1ff'] },
  y2k: { base: 'day', bg: '#ffe3f6', water: ['#b8f0ff', '#c9f4ff'], park: '#e9ffd6', wood: '#dcf7c4', land: '#ffd9f1', road: '#ffffff', roadMajor: '#ffeefa', casing: '#ff8fd1', bldg: '#ffc6ea', bldgTop: '#ffe6f6', windows: ['#ffffff', '#c0c0c0', '#ff5fc8'], text: '#b0007a', halo: '#ffffff', glow: null },
  lavender: { base: 'day', bg: '#f1ecfb', water: ['#d6e2f7', '#e0e9fa'], park: '#dcd0f2', wood: '#cdbdeb', land: '#ece5f8', road: '#ffffff', roadMajor: '#f6f1ff', casing: '#b9a6e0', bldg: '#e2d8f5', bldgTop: '#f3eefc', windows: ['#ffffff', '#cdb8f5', '#a58bd9'], text: '#5a3f8f', halo: '#ffffff', glow: null },
  harajuku: { base: 'day', bg: '#fff6d6', water: ['#9fe7ff', '#b5edff'], park: '#b8f5a0', wood: '#a6ee8c', land: '#ffe9c9', road: '#ffffff', roadMajor: '#fff2fb', casing: '#ff5c8a', bldg: '#ffd0e6', bldgTop: '#fff0f7', windows: ['#ff5c8a', '#4dd4ff', '#ffe14d'], text: '#2a1a5e', halo: '#ffffff', glow: null },
  matrix: { base: 'dark', bg: '#020a04', water: ['#031a0c', '#052412'], park: '#04140a', wood: '#03110a', land: '#030d06', road: '#0b2a14', roadMajor: '#0f3d1c', casing: '#020a04', bldg: '#062010', bldgTop: '#0b3519', windows: ['#39ff6a', '#1fd655', '#0a8a35'], text: '#6bff95', halo: '#020a04', glow: ['#39ff6a', '#1fd655'] },
  zen: { base: 'day', bg: '#e9e4d4', water: ['#6f9aa0', '#7ea8ad'], park: '#6f8f5a', wood: '#4f6f45', land: '#dcd5bf', road: '#f4efe0', roadMajor: '#ecd9a8', casing: '#8a7550', bldg: '#b8a27c', bldgTop: '#d9c79f', windows: ['#ffd27a', '#f2c46b', '#8a6a3a'], text: '#3d3326', halo: '#f4efe0', glow: null },
  minimal: { base: 'day', bg: '#cfd0cf', water: ['#9aa3a6', '#a6aeb1'], park: '#b9bdb5', wood: '#adb2a9', land: '#c8c9c7', road: '#ececeb', roadMajor: '#f6f6f5', casing: '#8c8c8a', bldg: '#a9aaa8', bldgTop: '#bdbebc', windows: ['#ffb347', '#e8e8e8', '#6b6b6b'], text: '#2f2f2f', halo: '#ececeb', glow: null },
  sakuranight: { base: 'dark', bg: '#12141f', water: ['#1a2236', '#202a42'], park: '#2a1e2e', wood: '#251a2a', land: '#161827', road: '#262a3d', roadMajor: '#3a2b45', casing: '#12141f', bldg: '#1d2032', bldgTop: '#2a2d45', windows: ['#ff6fa3', '#ffb3cf', '#ffd27a'], text: '#ffd0e2', halo: '#12141f', glow: ['#ff3b6b', '#ff8fb3'] },
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
const JP = { map: 'Chizu 地図', night: 'Yomichi 夜道', highway: 'Wangan 湾岸', twisty: 'Tōge 峠' };
const EN = { map: 'Map', night: 'Night theme', highway: 'Highway mode', twisty: 'Twisty roads' };
export const featureName = (key, jpNames) => (jpNames ? JP[key] : EN[key]) || key;

// Speed bubble colors to match the world theme.
const SPEED = {
  standard: { bg: '#ffffff', text: '#111111', ring: '#1f1f2e', sub: '#555555' },
  tokyo: { bg: '#0b0d1a', text: '#ffffff', ring: '#ff2d95', sub: '#7af2ff', glow: '#ff2d95' },
  cyberpunk: { bg: '#0a0614', text: '#7df9ff', ring: '#b026ff', sub: '#00ffd5', glow: '#b026ff' },
  dystopian: { bg: '#2b2b2a', text: '#e9e6d6', ring: '#8a8a84', sub: '#b9b5a2' },
  wasteland: { bg: '#3a3022', text: '#f1e3c3', ring: '#a0662f', sub: '#d1b483' },
  kawaii: { bg: '#fff3fa', text: '#7a4a8c', ring: '#ff8cc6', sub: '#b98ac9', glow: '#ff8cc6' },
  rose: { bg: '#0d0a0e', text: '#f4c2b8', ring: '#e8a598', sub: '#ff6fae', glow: '#ff4fa3' },
  sakura: { bg: '#fff1f4', text: '#8a3b5c', ring: '#f3a6c0', sub: '#c56f8f' },
  vapor: { bg: '#1a0f33', text: '#fffb96', ring: '#ff71ce', sub: '#01cdfe', glow: '#ff71ce' },
  galaxy: { bg: '#05040f', text: '#ffffff', ring: '#7c4dff', sub: '#3ad1ff', glow: '#7c4dff' },
  y2k: { bg: '#ffe3f6', text: '#b0007a', ring: '#c0c0c0', sub: '#ff5fc8', glow: '#ff5fc8' },
  lavender: { bg: '#f6f2fd', text: '#5a3f8f', ring: '#b9a6e0', sub: '#8a72c2' },
  harajuku: { bg: '#fff6d6', text: '#2a1a5e', ring: '#ff5c8a', sub: '#4dd4ff', glow: '#ffe14d' },
  matrix: { bg: '#010603', text: '#6bff95', ring: '#39ff6a', sub: '#1fd655', glow: '#39ff6a' },
  zen: { bg: '#f8f3e6', text: '#2f2a1f', ring: '#b08a3e', sub: '#4f6f45' },
  minimal: { bg: '#eeeeed', text: '#2b2b2b', ring: '#f29b30', sub: '#7a7a78' },
  sakuranight: { bg: '#0d0f19', text: '#ffe9f1', ring: '#ff4f7e', sub: '#ffb3cf', glow: '#ff4f7e' },
};
export const speedStyle = (theme) => SPEED[theme] || SPEED.standard;

// Route ribbon colors per theme: casing, core gradient (start -> end), outer glow, chevrons, moving flow.
const ROUTE = {
  standard: { casing: '#1a4fb3', core: ['#4c8bf5', '#4c8bf5'], glow: null, chev: '#ffffff', flow: 'rgba(255,255,255,0.55)' },
  tokyo: { casing: '#3b0a2a', core: ['#ff2d95', '#ff8a3d'], glow: '#ff2d95', chev: '#7af2ff', flow: 'rgba(255,255,255,0.75)' },
  cyberpunk: { casing: '#1b0636', core: ['#b026ff', '#00ffd5'], glow: '#b026ff', chev: '#00ffd5', flow: 'rgba(255,255,255,0.7)' },
  dystopian: { casing: '#1e1e1d', core: ['#e9e6d6', '#c9c2a0'], glow: null, chev: '#2b2b2a', flow: 'rgba(43,43,42,0.5)' },
  wasteland: { casing: '#2a2219', core: ['#ff9a3d', '#ffcf6b'], glow: '#ff9a3d', chev: '#2a2219', flow: 'rgba(42,34,25,0.5)' },
  kawaii: { casing: '#ff8cc6', core: ['#ff8cc6', '#b9a3ff'], glow: null, chev: '#ffffff', flow: 'rgba(255,255,255,0.8)' },
  rose: { casing: '#2a0f1c', core: ['#ff4fa3', '#e8a598'], glow: '#ff4fa3', chev: '#ffffff', flow: 'rgba(255,255,255,0.7)' },
  sakura: { casing: '#e9a8bd', core: ['#f3a6c0', '#ff6fa0'], glow: null, chev: '#ffffff', flow: 'rgba(255,255,255,0.8)' },
  vapor: { casing: '#2b1b5c', core: ['#ff71ce', '#01cdfe'], glow: '#ff71ce', chev: '#fffb96', flow: 'rgba(255,255,255,0.7)' },
  galaxy: { casing: '#120f30', core: ['#7c4dff', '#3ad1ff'], glow: '#7c4dff', chev: '#ffffff', flow: 'rgba(255,255,255,0.75)' },
  y2k: { casing: '#ff5fc8', core: ['#ff5fc8', '#c0c0c0'], glow: null, chev: '#ffffff', flow: 'rgba(255,255,255,0.85)' },
  lavender: { casing: '#8a72c2', core: ['#a58bd9', '#cdb8f5'], glow: null, chev: '#ffffff', flow: 'rgba(255,255,255,0.8)' },
  harajuku: { casing: '#2a1a5e', core: ['#ff5c8a', '#4dd4ff'], glow: null, chev: '#ffe14d', flow: 'rgba(255,255,255,0.8)' },
  matrix: { casing: '#03140a', core: ['#39ff6a', '#b7ffcb'], glow: '#39ff6a', chev: '#010603', flow: 'rgba(1,6,3,0.6)' },
  zen: { casing: '#8a6a2a', core: ['#e7b75a', '#f6d68e'], glow: null, chev: '#ffffff', flow: 'rgba(255,255,255,0.75)' },
  minimal: { casing: '#b86a10', core: ['#f29b30', '#ffb85c'], glow: null, chev: '#ffffff', flow: 'rgba(255,255,255,0.75)' },
  sakuranight: { casing: '#3a0a1c', core: ['#ff3b6b', '#ff8fb3'], glow: '#ff3b6b', chev: '#ffffff', flow: 'rgba(255,255,255,0.75)' },
};

// Whole-app look per theme: panels, buttons, text and accents follow the world theme.
const SKIN = {
  tokyo: { bg: '#07080f', card: '#10121f', sec: '#191c2e', border: '#262a44', fg: '#f4f4ff', muted: '#8a8fb5', primary: '#ff2d95', pfg: '#ffffff', accent: '#00e5ff' },
  cyberpunk: { bg: '#07040f', card: '#120a22', sec: '#1c1033', border: '#2e1a4f', fg: '#eafcff', muted: '#8d7bb5', primary: '#00ffd5', pfg: '#07040f', accent: '#b026ff' },
  dystopian: { bg: '#161615', card: '#222221', sec: '#2c2c2a', border: '#3a3a37', fg: '#e9e6d6', muted: '#9a978a', primary: '#c9c2a0', pfg: '#161615', accent: '#8a8a84' },
  wasteland: { bg: '#1c160f', card: '#2a2117', sec: '#3a2e20', border: '#4a3a28', fg: '#f1e3c3', muted: '#b39a74', primary: '#ff9a3d', pfg: '#1c160f', accent: '#9fb04f' },
  kawaii: { bg: '#fff4fa', card: '#ffffff', sec: '#fde6f2', border: '#f6c9e1', fg: '#4a2a5c', muted: '#a07fb0', primary: '#ff5fae', pfg: '#ffffff', accent: '#8f6cff', light: true },
  rose: { bg: '#0b080a', card: '#160f13', sec: '#21161c', border: '#33212a', fg: '#f7e1dc', muted: '#b58f8a', primary: '#ff4fa3', pfg: '#ffffff', accent: '#e8a598' },
  sakura: { bg: '#fff6f8', card: '#ffffff', sec: '#fde8ee', border: '#f3c6d4', fg: '#5a2a3e', muted: '#b07890', primary: '#e75a8a', pfg: '#ffffff', accent: '#4fa3d1', light: true },
  vapor: { bg: '#120a26', card: '#1c1238', sec: '#281a4d', border: '#3a2770', fg: '#fdf2ff', muted: '#a58bd0', primary: '#ff71ce', pfg: '#1a0f33', accent: '#01cdfe' },
  galaxy: { bg: '#04030c', card: '#0d0b22', sec: '#161333', border: '#241f4d', fg: '#eceaff', muted: '#8c87c0', primary: '#7c4dff', pfg: '#ffffff', accent: '#3ad1ff' },
  y2k: { bg: '#fff0fa', card: '#ffffff', sec: '#ffe0f4', border: '#ffb8e4', fg: '#5c0040', muted: '#c0609e', primary: '#ff2fb3', pfg: '#ffffff', accent: '#7a7a7a', light: true },
  lavender: { bg: '#f6f2fd', card: '#ffffff', sec: '#ece4fa', border: '#d6c8f0', fg: '#3d2a66', muted: '#8a78b0', primary: '#8a62d6', pfg: '#ffffff', accent: '#5c9ad6', light: true },
  harajuku: { bg: '#fffaf0', card: '#ffffff', sec: '#fff0d6', border: '#ffd28a', fg: '#2a1a5e', muted: '#8a76b0', primary: '#ff3d7f', pfg: '#ffffff', accent: '#2ec4ff', light: true },
  matrix: { bg: '#010603', card: '#041009', sec: '#071a0e', border: '#0d3a1c', fg: '#b7ffcb', muted: '#3fae62', primary: '#39ff6a', pfg: '#010603', accent: '#1fd655', font: "'SF Mono','Fira Code','JetBrains Mono',ui-monospace,monospace" },
  zen: { bg: '#efe8d6', card: '#f8f3e6', sec: '#e6dcc4', border: '#cdbf9c', fg: '#2f2a1f', muted: '#7d7259', primary: '#9c7630', pfg: '#ffffff', accent: '#4f6f45', light: true, font: "'Iowan Old Style','Palatino Linotype',Georgia,serif" },
  minimal: { bg: '#d9dad8', card: '#eeeeed', sec: '#e2e2e1', border: '#c3c4c2', fg: '#2b2b2b', muted: '#6f6f6d', primary: '#e8891a', pfg: '#ffffff', accent: '#555555', light: true },
  sakuranight: { bg: '#0d0f19', card: '#161927', sec: '#1f2335', border: '#2f3550', fg: '#ffe9f1', muted: '#a68aa0', primary: '#ff4f7e', pfg: '#ffffff', accent: '#ffb3cf' },
};
const hsl = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let h = 0, sat = 0;
  if (max !== min) {
    const d = max - min;
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return `${Math.round(h)} ${Math.round(sat * 100)}% ${Math.round(l * 100)}%`;
};
const SKIN_VARS = ['--background', '--foreground', '--card', '--card-foreground', '--popover', '--popover-foreground', '--primary', '--primary-foreground', '--secondary', '--secondary-foreground', '--muted', '--muted-foreground', '--accent', '--accent-foreground', '--border', '--input', '--ring', '--font-heading', '--font-body', '--glass'];
export function applySkin(theme) {
  const el = document.documentElement;
  const k = SKIN[theme];
  SKIN_VARS.forEach((v) => el.style.removeProperty(v));
  el.dataset.skin = k ? theme : 'standard';
  el.dataset.light = k?.light ? '1' : '0';
  if (!k) return;
  const set = (v, hex) => el.style.setProperty(v, hsl(hex));
  set('--background', k.bg); set('--foreground', k.fg);
  set('--card', k.card); set('--card-foreground', k.fg);
  set('--popover', k.card); set('--popover-foreground', k.fg);
  set('--primary', k.primary); set('--primary-foreground', k.pfg);
  set('--secondary', k.sec); set('--secondary-foreground', k.fg);
  set('--muted', k.sec); set('--muted-foreground', k.muted);
  set('--accent', k.accent); set('--accent-foreground', k.pfg);
  set('--border', k.border); set('--input', k.border); set('--ring', k.primary);
  el.style.setProperty('--glass', hsl(k.card));
  if (k.font) { el.style.setProperty('--font-heading', k.font); }
}
export const routeColors = (theme, night = false) => (theme === 'standard' && night ? { ...ROUTE.standard, glow: '#4c8bf5' } : ROUTE[theme] || ROUTE.standard);
