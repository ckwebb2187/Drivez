// "City life" on the drive map: swaying trees in parks and woods, little park props,
// low houses that look different from office towers, gas-station canopies and
// recognizable chain-store landmarks. Everything is drawn from the map's own data
// (OpenMapTiles: park / landcover / poi / building), in the world theme's colors.
// Skipped entirely in battery saver.

const SRC = 'openmaptiles';
const MAX_TREES = 360;

// Chains people recognize from the road: name match -> badge colors + short mark.
// (Simple colored badges with initials, not logos.)
export const CHAINS = [
  ['McDonald', '#DA291C', '#FFC72C', 'M'], ['Starbucks', '#00704A', '#fff', '☕'], ['Walmart', '#0071CE', '#FFC220', 'W'],
  ['Target', '#CC0000', '#fff', '◎'], ['Costco', '#E31837', '#fff', 'C'], ['Home Depot', '#F96302', '#fff', 'HD'],
  ["Lowe's", '#004990', '#fff', 'L'], ['Walgreens', '#E31837', '#fff', 'W'], ['CVS', '#CC0000', '#fff', 'CVS'],
  ['Taco Bell', '#702082', '#fff', 'TB'], ["Wendy's", '#E2203D', '#fff', 'W'], ['Burger King', '#D62300', '#F5EBDC', 'BK'],
  ['Subway', '#008C15', '#FFC600', 'S'], ['Chick-fil-A', '#E51636', '#fff', 'C'], ['Dunkin', '#FF671F', '#fff', 'D'],
  ['Sonic', '#0067B1', '#FFD100', 'S'], ["Buc-ee", '#C8102E', '#FFD100', 'B'], ['7-Eleven', '#008163', '#fff', '7'],
  ['Shell', '#FFD500', '#DD1D21', 'S'], ['Exxon', '#E31937', '#fff', 'E'], ['Chevron', '#0054A4', '#fff', 'C'],
  ['BP', '#009B3A', '#FFE600', 'bp'], ['Valero', '#00539B', '#FFB81C', 'V'], ['QuikTrip', '#D2232A', '#fff', 'QT'],
  ['Circle K', '#DA291C', '#fff', 'K'], ['Wawa', '#C8102E', '#FFD100', 'W'], ['Sheetz', '#DA291C', '#fff', 'S'],
  ['AutoZone', '#F26100', '#fff', 'AZ'], ["O'Reilly", '#00843D', '#fff', 'O'], ['Advance Auto', '#E31837', '#FFD100', 'A'],
  ['Pep Boys', '#ED1C24', '#fff', 'PB'], ['Jiffy Lube', '#D50032', '#FFD100', 'J'], ['In-N-Out', '#C8102E', '#FFD100', 'IO'],
  ['Whataburger', '#FF7900', '#fff', 'W'], ["Dave & Buster", '#E31837', '#fff', 'DB'],
];

const hexRgb = (h) => { const n = parseInt(h.replace('#', '').padEnd(6, '0').slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, t) => { const x = hexRgb(a), y = hexRgb(b); return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`; };
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const img = (g, w, h) => g.getImageData(0, 0, w, h);

// A tree sprite: trunk + round canopy (pink blossoms on sakura themes), with soft shading.
function treeSprite(p, kind) {
  const [, g] = canvas(48, 64);
  const day = !p || p.base === 'day';
  const pink = /sakura|kawaii|rose/.test(kind);
  const leaf = pink ? '#f7a8c4' : p ? mix(p.wood || p.park, day ? '#3f8f3a' : '#4fd08a', day ? 0.55 : 0.45) : '#3f8f3a';
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(24, 60, 12, 3.5, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = day ? '#6b4a2b' : '#3a2a1e'; g.fillRect(21, 36, 6, 24);
  const blobs = [[24, 24, 17], [14, 30, 11], [34, 30, 11], [24, 14, 11]];
  g.fillStyle = leaf;
  for (const [x, y, r] of blobs) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  // Light from the top-left, shade at the bottom.
  g.globalCompositeOperation = 'source-atop';
  const grd = g.createRadialGradient(17, 14, 2, 24, 26, 26);
  grd.addColorStop(0, 'rgba(255,255,255,0.4)'); grd.addColorStop(0.6, 'rgba(255,255,255,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.3)');
  g.fillStyle = grd; g.fillRect(0, 0, 48, 44);
  g.globalCompositeOperation = 'source-over';
  if (!day && p?.glow) { g.strokeStyle = `${p.glow[0]}88`; g.lineWidth = 1.5; g.beginPath(); g.arc(24, 24, 18, 0, Math.PI * 2); g.stroke(); }
  return img(g, 48, 64);
}

// Park props: bench, fountain, playground swing, picnic table.
function propSprite(kind, p) {
  const [, g] = canvas(36, 36);
  const day = !p || p.base === 'day';
  const ink = day ? '#4a3a2a' : '#c9d6ff';
  g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = ink; g.lineWidth = 3;
  g.fillStyle = day ? 'rgba(255,255,255,.85)' : 'rgba(15,18,30,.8)';
  g.beginPath(); g.arc(18, 18, 16, 0, Math.PI * 2); g.fill();
  if (kind === 'fountain') { g.strokeStyle = '#4fb3ff'; g.beginPath(); g.moveTo(18, 26); g.lineTo(18, 10); g.moveTo(18, 12); g.quadraticCurveTo(10, 10, 9, 20); g.moveTo(18, 12); g.quadraticCurveTo(26, 10, 27, 20); g.stroke(); g.strokeStyle = ink; g.beginPath(); g.moveTo(9, 27); g.lineTo(27, 27); g.stroke(); }
  else if (kind === 'playground') { g.beginPath(); g.moveTo(8, 28); g.lineTo(13, 9); g.lineTo(23, 9); g.lineTo(28, 28); g.moveTo(16, 9); g.lineTo(16, 22); g.moveTo(20, 9); g.lineTo(20, 22); g.moveTo(15, 22); g.lineTo(21, 22); g.stroke(); }
  else if (kind === 'picnic') { g.beginPath(); g.moveTo(8, 16); g.lineTo(28, 16); g.moveTo(12, 16); g.lineTo(9, 27); g.moveTo(24, 16); g.lineTo(27, 27); g.moveTo(7, 22); g.lineTo(29, 22); g.stroke(); }
  else { g.beginPath(); g.moveTo(8, 18); g.lineTo(28, 18); g.moveTo(8, 13); g.lineTo(28, 13); g.moveTo(10, 18); g.lineTo(10, 26); g.moveTo(26, 18); g.lineTo(26, 26); g.stroke(); }
  return img(g, 36, 36);
}

// Gas-station canopy: a little 3/4-view roof on posts with a lit edge.
function canopySprite(p) {
  const [, g] = canvas(56, 44);
  const day = !p || p.base === 'day';
  const edge = p?.glow ? p.glow[1] : day ? '#e53935' : '#ff5a5a';
  g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(28, 40, 22, 4, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = day ? '#9aa3ad' : '#59606e'; for (const x of [12, 42]) g.fillRect(x, 16, 3, 24);
  g.fillStyle = day ? '#f5f5f5' : '#2b3040'; g.beginPath(); g.moveTo(4, 12); g.lineTo(52, 12); g.lineTo(48, 20); g.lineTo(8, 20); g.closePath(); g.fill();
  g.fillStyle = edge; g.fillRect(6, 17, 44, 3);
  if (!day) { g.shadowColor = edge; g.shadowBlur = 8; g.fillRect(6, 17, 44, 3); g.shadowBlur = 0; }
  g.fillStyle = day ? '#3a7bd5' : '#7af2ff'; g.fillRect(22, 26, 5, 12); g.fillRect(30, 26, 5, 12);
  return img(g, 56, 44);
}

// Chain landmark: a pylon sign (badge on a pole) people can spot from the road.
function chainSprite([, bg, fg, mark]) {
  const [, g] = canvas(44, 60);
  g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(22, 57, 8, 2.5, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#8a8f99'; g.fillRect(20, 34, 4, 23);
  g.fillStyle = bg; g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 2.5;
  g.beginPath(); g.roundRect(3, 3, 38, 33, 8); g.fill(); g.stroke();
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `900 ${mark.length > 2 ? 12 : mark.length > 1 ? 16 : 20}px system-ui, sans-serif`;
  g.fillText(mark, 22, 20);
  return img(g, 44, 60);
}

// Deterministic 0..1 from a number (so trees don't jump around between redraws).
const rnd = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function inRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Scatter trees inside the green areas currently on screen.
function scatterTrees(map) {
  const b = map.getBounds();
  const feats = [
    ...map.querySourceFeatures(SRC, { sourceLayer: 'park' }),
    ...map.querySourceFeatures(SRC, { sourceLayer: 'landcover', filter: ['in', ['get', 'class'], ['literal', ['wood', 'grass']]] }),
  ];
  const step = 0.00028 * 2 ** (16 - Math.min(18, Math.max(15, map.getZoom()))); // ~30 m at z16
  const pts = [];
  const seen = new Set();
  for (const f of feats) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
    const wood = f.properties?.class === 'wood' || f.sourceLayer === 'park';
    for (const poly of polys) {
      const outer = poly[0];
      let minX = 180, minY = 90, maxX = -180, maxY = -90;
      for (const [x, y] of outer) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      minX = Math.max(minX, b.getWest()); maxX = Math.min(maxX, b.getEast()); minY = Math.max(minY, b.getSouth()); maxY = Math.min(maxY, b.getNorth());
      const s = wood ? step : step * 1.8;
      for (let x = Math.floor(minX / s) * s; x < maxX; x += s) {
        for (let y = Math.floor(minY / s) * s; y < maxY; y += s) {
          const key = `${Math.round(x / s)}:${Math.round(y / s)}`;
          if (seen.has(key)) continue;
          const h = rnd(Math.round(x / s) * 7919 + Math.round(y / s));
          if (h < (wood ? 0.25 : 0.55)) continue; // gaps, so it looks natural
          const pt = [x + (rnd(h * 991) - 0.5) * s * 0.8, y + (rnd(h * 373) - 0.5) * s * 0.8];
          if (!inRing(pt, outer) || poly.slice(1).some((hole) => inRing(pt, hole))) continue;
          seen.add(key);
          pts.push({ type: 'Feature', properties: { ph: Math.round(h * 628) / 100, sz: 0.75 + rnd(h * 17) * 0.45 }, geometry: { type: 'Point', coordinates: pt } });
          if (pts.length >= MAX_TREES) return pts;
        }
      }
    }
  }
  return pts;
}

// Adds everything. Returns a stop function. `isActive()` = the map is on screen.
export function addCityLife(map, theme, palette, isActive = () => true, { beforeId } = {}) {
  if (!map.getSource(SRC)) return () => {};
  const p = palette;
  const add = (id, data, opts) => { try { if (!map.hasImage(id)) map.addImage(id, data, opts); } catch { /* ignore */ } };
  add('dz-tree', treeSprite(p, theme), { pixelRatio: 2 });
  for (const k of ['bench', 'fountain', 'playground', 'picnic']) add(`dz-prop-${k}`, propSprite(k, p), { pixelRatio: 2 });
  add('dz-canopy', canopySprite(p), { pixelRatio: 2 });
  CHAINS.forEach((c, i) => add(`dz-chain-${i}`, chainSprite(c), { pixelRatio: 2 }));

  const night = p ? p.base !== 'day' : false;
  const font = map.getStyle().layers.find((l) => l.layout?.['text-font'] && Array.isArray(l.layout['text-font']))?.layout['text-font'] || ['Noto Sans Regular'];

  // Low-rise buildings (under ~6 floors) as houses/shops: short, warm, with a darker roof, only up close.
  // Big ones keep the office-tower look from the theme.
  try {
    const low = ['all', ['<', ['coalesce', ['get', 'render_height'], 0], 30], ['!=', ['get', 'hide_3d'], true]];
    const wall = p ? mix(p.bldg, night ? '#6b5a4a' : '#e8d2b8', 0.35) : '#e2d3c0';
    const roof = p ? mix(p.bldgTop, night ? '#3a2a2a' : '#a0533c', 0.45) : '#b0634a';
    const h = ['min', ['*', ['coalesce', ['get', 'render_height'], 5], 0.45], 5];
    map.addLayer({ id: 'dz-house', type: 'fill-extrusion', source: SRC, 'source-layer': 'building', minzoom: 16.6, filter: low,
      paint: { 'fill-extrusion-color': wall, 'fill-extrusion-height': h, 'fill-extrusion-base': 0, 'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 16.6, 0, 17.4, 0.75], 'fill-extrusion-vertical-gradient': true } }, beforeId);
    map.addLayer({ id: 'dz-house-roof', type: 'fill-extrusion', source: SRC, 'source-layer': 'building', minzoom: 16.6, filter: low,
      paint: { 'fill-extrusion-color': roof, 'fill-extrusion-height': ['+', h, 0.8], 'fill-extrusion-base': h, 'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 16.6, 0, 17.4, 0.8] } }, beforeId);
  } catch { /* optional */ }

  // Trees (billboards that stand up when the map tilts) + a gentle sway.
  map.addSource('dz-trees', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'dz-trees', type: 'symbol', source: 'dz-trees', minzoom: 14.8,
    layout: { 'icon-image': 'dz-tree', 'icon-anchor': 'bottom', 'icon-size': ['interpolate', ['linear'], ['zoom'], 15, ['*', 0.55, ['get', 'sz']], 18, ['*', 1.15, ['get', 'sz']]],
      'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-pitch-alignment': 'viewport', 'icon-rotation-alignment': 'viewport',
      'icon-rotate': ['*', 3, ['sin', ['get', 'ph']]], 'symbol-z-order': 'viewport-y' },
    paint: { 'icon-opacity': ['interpolate', ['linear'], ['zoom'], 14.8, 0, 15.4, 1] } }, beforeId);

  // Park props and gas canopies from the map's points of interest.
  const PROP = { playground: 'playground', fountain: 'fountain', picnic_site: 'picnic', bench: 'bench', dog_park: 'bench', park: 'bench' };
  map.addLayer({ id: 'dz-props', type: 'symbol', source: SRC, 'source-layer': 'poi', minzoom: 16,
    filter: ['in', ['get', 'subclass'], ['literal', Object.keys(PROP)]],
    layout: { 'icon-image': ['match', ['get', 'subclass'], ...Object.entries(PROP).flatMap(([k, v]) => [k, `dz-prop-${v}`]), 'dz-prop-bench'],
      'icon-size': 0.8, 'icon-pitch-alignment': 'viewport', 'icon-allow-overlap': false } }, beforeId);

  // Chains first (they win over the generic gas canopy).
  const chainCase = ['case', ...CHAINS.flatMap(([n], i) => [['in', n.toLowerCase(), ['downcase', ['coalesce', ['get', 'name'], '']]], `dz-chain-${i}`]), ''];
  map.addLayer({ id: 'dz-chains', type: 'symbol', source: SRC, 'source-layer': 'poi', minzoom: 14.5,
    filter: ['!=', chainCase, ''],
    layout: { 'icon-image': chainCase, 'icon-anchor': 'bottom', 'icon-size': ['interpolate', ['linear'], ['zoom'], 14.5, 0.8, 18, 1.4],
      'icon-pitch-alignment': 'viewport', 'icon-rotation-alignment': 'viewport', 'icon-allow-overlap': true, 'symbol-sort-key': ['coalesce', ['get', 'rank'], 50],
      'text-field': ['get', 'name'], 'text-size': 10, 'text-anchor': 'top', 'text-offset': [0, 0.3], 'text-optional': true, 'text-font': font },
    paint: { 'text-color': p?.text || '#222', 'text-halo-color': p?.halo || '#fff', 'text-halo-width': 1.4, 'text-opacity': ['interpolate', ['linear'], ['zoom'], 16, 0, 16.5, 1] } });
  map.addLayer({ id: 'dz-fuel', type: 'symbol', source: SRC, 'source-layer': 'poi', minzoom: 15,
    filter: ['all', ['==', ['get', 'class'], 'fuel'], ['==', chainCase, '']],
    layout: { 'icon-image': 'dz-canopy', 'icon-anchor': 'bottom', 'icon-size': ['interpolate', ['linear'], ['zoom'], 15, 0.6, 18, 1.1], 'icon-pitch-alignment': 'viewport', 'icon-allow-overlap': true } }, 'dz-chains');

  // Keep the trees filled in for whatever is on screen.
  let timer = null;
  const refill = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!isActive() || map.getZoom() < 14.8) return;
      try { map.getSource('dz-trees')?.setData({ type: 'FeatureCollection', features: scatterTrees(map) }); } catch { /* ignore */ }
    }, 250);
  };
  map.on('moveend', refill);
  map.on('sourcedata', (e) => { if (e.sourceId === SRC && e.isSourceLoaded) refill(); });
  refill();

  // Sway: nudge each tree's phase a little, a few times a second, only while on screen and zoomed in.
  let t = 0;
  const sway = setInterval(() => {
    if (!isActive() || map.getZoom() < 15.5 || !map.getLayer('dz-trees')) return;
    t += 0.5;
    try { map.setLayoutProperty('dz-trees', 'icon-rotate', ['*', 3, ['sin', ['+', ['get', 'ph'], t]]]); } catch { /* ignore */ }
  }, 220);

  return () => { clearInterval(sway); clearTimeout(timer); map.off('moveend', refill); };
}
