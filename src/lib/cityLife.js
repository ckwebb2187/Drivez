// "City life" on the drive map: swaying trees in parks and woods, little park props,
// low houses that look different from office towers, gas-station canopies and
// recognizable chain-store landmarks. Everything is drawn from the map's own data
// (OpenMapTiles: park / landcover / poi / building), in the world theme's colors.
// Skipped entirely in battery saver.

const SRC = 'openmaptiles';
const MAX_TREES = 1200;
// Aim for this many trees in each green area, spread over the whole shape.
const TREES_PER_AREA = 48;

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

// Themes whose trees should keep their own colors instead of following the theme accent:
// real greens for the forest themes, and each blossom theme's own pinks.
const TREE_TINT = {
  zen: ['#6b9a58', '#4f7a42', '#8ab26d'],
  'zen@n': ['#4a7a4e', '#33603a', '#628f5f'],
  tougedawn: ['#3a6b46', '#2b5236', '#54855a'],
  'tougedawn@n': ['#2f4f3c', '#22392c', '#42684b'],
  wasteland: ['#8a9445', '#6f7a34', '#a3ab5c'],
  sakura: ['#f9c2d6', '#f2a0bd', '#ffd9e6'],
  'sakura@n': ['#e78fb3', '#c96b93', '#ffb3cf'],
  sakuranight: ['#ff86ab', '#e0608a', '#ffb3c9'],
  kawaii: ['#ffa8d4', '#f58cc6', '#ffc7e4'],
  'kawaii@n': ['#d97bb0', '#b45f95', '#f0a3cc'],
  harajuku: ['#ff9ec2', '#ff6fa8', '#ffc7dd'],
  lavender: ['#c2aee8', '#a68fd6', '#d8caf2'],
  'lavender@n': ['#9d86cc', '#7f68ad', '#b9a6e0'],
  rose: ['#e59fae', '#c77f92', '#f5bcc8'],
  y2k: ['#ff9fe0', '#f57cc8', '#ffc4ee'],
  'y2k@n': ['#d96bb8', '#b9529a', '#f08fd0'],
  risingsun: ['#b5101b', '#800a14', '#cc1420'],
};

// Three canopy shades taken from the theme's own palette: the ground color lifted and tinted
// with that theme's signature light, so trees never look bolted onto a world.
export function treeShades(p, theme) {
  const custom = TREE_TINT[theme];
  if (custom) return custom;
  const day = !p || p.base === 'day';
  const accent = (p?.glow && p.glow[0]) || (p?.neon && p.neon[0]) || p?.windows?.[2] || p?.text || (day ? '#6f9a5a' : '#3f8f6a');
  const base = p?.wood || p?.park || (day ? '#5f8a4a' : '#2c4a36');
  // Mixed in one pass: mix() returns an rgb() string, so feeding its output back in (or reusing
  // hexRgb on it) silently turns every theme's trees gray.
  const toHex = (c) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
  const shade = (t, white) => {
    const a = hexRgb(base), b = hexRgb(accent);
    return toHex(a.map((v, i) => (v + (b[i] - v) * t) * (1 - white) + 255 * white));
  };
  return day ? [shade(0.34, 0.12), shade(0.16, 0.2), shade(0.5, 0.04)] : [shade(0.38, 0.18), shade(0.2, 0.26), shade(0.52, 0.1)];
}

// A full tree sprite: trunk, a four-blob canopy in three shades of the theme's leaf color, and
// soft light from the top-left. `variant` rotates which blob gets which shade, so neighbouring
// trees aren't identical.
function treeSprite(p, theme, variant = 0) {
  const [, g] = canvas(52, 68);
  const day = !p || p.base === 'day';
  const shades = treeShades(p, theme);
  const leaf = (i) => shades[(i + variant) % shades.length];
  const trunk = p ? mix(p.bldgTop || p.bldg || '#6b4a2b', day ? '#3a2a18' : '#0e0b09', day ? 0.5 : 0.78) : '#5b4128';
  g.fillStyle = day ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.32)';
  g.beginPath(); g.ellipse(26, 64, 13, 3.6, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = trunk; g.beginPath(); g.roundRect(23, 38, 6, 26, 2); g.fill();
  // Each blob a different shade: reads as depth instead of one flat disc.
  const blobs = [[26, 27, 18, 0], [15, 35, 12, 1], [37, 35, 12, 1], [26, 16, 13, 2]];
  for (const [x, y, r, si] of blobs) { g.fillStyle = leaf(si); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  g.globalCompositeOperation = 'source-atop';
  const grd = g.createRadialGradient(18, 15, 2, 26, 28, 28);
  grd.addColorStop(0, day ? 'rgba(255,255,255,0.34)' : 'rgba(255,255,255,0.22)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0)');
  grd.addColorStop(1, 'rgba(0,0,0,0.32)');
  g.fillStyle = grd; g.fillRect(0, 0, 52, 48);
  g.globalCompositeOperation = 'source-over';
  if (!day && p?.glow) { g.strokeStyle = `${p.glow[0]}66`; g.lineWidth = 1.5; g.beginPath(); g.arc(26, 26, 19, 0, Math.PI * 2); g.stroke(); }
  return img(g, 52, 68);
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

// Scatter trees inside the green areas currently on screen. Each area is filled on its own and
// they take turns at the cap, so the trees can't all be spent on whichever park came back first.
export function scatterTrees(map) {
  const b = map.getBounds();
  const feats = [
    ...map.querySourceFeatures(SRC, { sourceLayer: 'park' }),
    ...map.querySourceFeatures(SRC, { sourceLayer: 'landcover', filter: ['in', ['get', 'class'], ['literal', ['wood', 'grass']]] }),
  ];
  const seen = new Set();
  const buckets = [];
  for (const f of feats) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
    const wood = f.properties?.class === 'wood' || f.sourceLayer === 'park';
    for (const poly of polys) {
      const outer = poly[0];
      if (!outer || outer.length < 3) continue;
      let minX = 180, minY = 90, maxX = -180, maxY = -90;
      for (const [x, y] of outer) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      minX = Math.max(minX, b.getWest()); maxX = Math.min(maxX, b.getEast()); minY = Math.max(minY, b.getSouth()); maxY = Math.min(maxY, b.getNorth());
      const areaDeg = (maxX - minX) * (maxY - minY);
      if (!(areaDeg > 0)) continue;
      // How many trees this shape should get, and therefore how wide the spacing has to be:
      // a small square gets a handful, a big wood gets a full stand, both evenly spread.
      const want = Math.max(12, Math.min(220, Math.round(12 + 3600 * Math.sqrt(areaDeg))));
      const accept = wood ? 0.88 : 0.66; // share of cells that get a tree, the rest is gaps
      const s = Math.sqrt(areaDeg / Math.max(12, Math.round(want / accept)));
      const pts = [];
      for (let x = Math.floor(minX / s) * s; x < maxX; x += s) {
        for (let y = Math.floor(minY / s) * s; y < maxY; y += s) {
          const key = `${Math.round(x / s)}:${Math.round(y / s)}`;
          if (seen.has(key)) continue;
          const h = rnd(Math.round(x / s) * 7919 + Math.round(y / s));
          if (h < 1 - accept) continue; // gaps, so it looks natural
          const pt = [x + (rnd(h * 991) - 0.5) * s * 0.9, y + (rnd(h * 373) - 0.5) * s * 0.9];
          if (!inRing(pt, outer) || poly.slice(1).some((hole) => inRing(pt, hole))) continue;
          seen.add(key);
          pts.push({ h, pt });
        }
      }
      if (pts.length) buckets.push(pts);
    }
  }
  // One tree per green area per pass, so every park, verge and wood on screen gets its share.
  const out = [];
  for (let round = 0; out.length < MAX_TREES; round++) {
    let added = 0;
    for (const pts of buckets) {
      const t = pts[round];
      if (!t) continue;
      added++;
      out.push({
        type: 'Feature',
        properties: { ph: Math.round(t.h * 628) / 100, sz: 0.75 + rnd(t.h * 17) * 0.45, v: Math.floor(rnd(t.h * 53) * 3) },
        geometry: { type: 'Point', coordinates: t.pt },
      });
      if (out.length >= MAX_TREES) break;
    }
    if (!added) break;
  }
  return out;
}

// Adds everything. Returns a stop function. `isActive()` = the map is on screen.
export function addCityLife(map, theme, palette, isActive = () => true, { beforeId } = {}) {
  if (!map.getSource(SRC)) return () => {};
  const p = palette;
  const add = (id, data, opts) => { try { if (!map.hasImage(id)) map.addImage(id, data, opts); } catch { /* ignore */ } };
  // Three shades of the same tree per theme, so a stand of trees has some variety.
  for (let v = 0; v < 3; v++) add(`dz-tree-${theme}-${v}`, treeSprite(p, theme, v), { pixelRatio: 2 });
  const treeImage = ['concat', `dz-tree-${theme}-`, ['to-string', ['%', ['coalesce', ['get', 'v'], 0], 3]]];
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
    layout: { 'icon-image': treeImage, 'icon-anchor': 'bottom', 'icon-size': ['interpolate', ['linear'], ['zoom'], 15, ['*', 0.55, ['get', 'sz']], 18, ['*', 1.15, ['get', 'sz']]],
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
