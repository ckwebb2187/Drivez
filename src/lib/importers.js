// Reads export files from Google Maps, Google Timeline, Waze and common map
// formats (GeoJSON, KML, GPX, CSV) and turns them into Drivez places and drives.
// Everything runs on the phone; only the results are sent to the server.
import { unzipSync, strFromU8 } from 'fflate';

const MI = 1609.34;
const r5 = (n) => Math.round(n * 1e5) / 1e5;
const okCoord = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

function haversineMi(a, b) {
  const R = 3958.8, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const pathMiles = (pts) => pts.slice(1).reduce((s, p, i) => s + haversineMi(pts[i], p), 0);

// Keep at most `max` points, always including the first and last.
function thin(pts, max = 300) {
  if (pts.length <= max) return pts;
  const step = (pts.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => pts[Math.round(i * step)]);
}

// "33.12°, -117.3°", "geo:33.1,-117.3", "33.1, -117.3"
function parseLatLngText(s) {
  if (!s) return null;
  const m = String(s).replace(/^geo:/, '').match(/(-?\d+(?:\.\d+)?)°?\s*[,;]\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = +m[1], lng = +m[2];
  return okCoord(lat, lng) ? { lat, lng } : null;
}

// Coordinates hidden in a Google Maps link, if any.
function coordsFromGoogleUrl(url) {
  if (!url) return null;
  const s = decodeURIComponent(String(url));
  let m = s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || s.match(/[?&](?:q|query|ll|destination)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
  if (!m) return null;
  const lat = +m[1], lng = +m[2];
  return okCoord(lat, lng) ? { lat, lng } : null;
}

function placeKey(source, lat, lng, name) {
  return `${source}:${r5(lat)},${r5(lng)}:${(name || '').toLowerCase().slice(0, 40)}`;
}

function makeTrip({ source, start, end, points, distanceMi, title, startName, endName }) {
  const s = new Date(start), e = end ? new Date(end) : null;
  if (Number.isNaN(s.getTime())) return null;
  const pts = thin(points.filter((p) => okCoord(p.lat, p.lng)).map((p) => ({ lat: p.lat, lng: p.lng, speed: 0 })));
  if (pts.length < 2) return null;
  const miles = distanceMi ?? pathMiles(pts);
  if (miles < 0.2) return null; // ignore GPS jitter
  const duration = e && !Number.isNaN(e.getTime()) ? Math.max(0, (e - s) / 1000) : 0;
  return {
    source,
    title: title || `Drive · ${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
    start_time: s.toISOString(),
    end_time: e && !Number.isNaN(e.getTime()) ? e.toISOString() : null,
    distance: Math.round(miles * 10) / 10,
    duration,
    avg_speed: duration > 60 ? Math.round(miles / (duration / 3600)) : 0,
    route_points: pts,
    start_location: startName || '',
    end_location: endName || '',
    import_key: `trip:${s.toISOString().slice(0, 16)}:${r5(pts[0].lat)},${r5(pts[0].lng)}`,
  };
}

const isDriving = (t) => /vehicle|driving|car|taxi|motorcycl|bus/i.test(String(t || ''));

// ---------- Google Takeout "Saved Places.json" / "Labeled places.json" / any GeoJSON ----------
function fromGeoJSON(j, list) {
  const places = [];
  for (const f of j.features || []) {
    const p = f.properties || {};
    const loc = p.location || p.Location || {};
    let lat, lng;
    const g = loc['Geo Coordinates'];
    if (g) { lat = +g.Latitude; lng = +g.Longitude; }
    if (!okCoord(lat, lng) && f.geometry?.type === 'Point') { [lng, lat] = f.geometry.coordinates.map(Number); }
    const url = p.google_maps_url || p['Google Maps URL'];
    if (!okCoord(lat, lng)) { const c = coordsFromGoogleUrl(url); if (c) ({ lat, lng } = c); }
    const name = loc.name || loc['Business Name'] || p.name || p.Title || p.title || loc.address || loc.Address || 'Saved place';
    const address = loc.address || loc.Address || p.address || '';
    if (!okCoord(lat, lng)) { places.push({ needsLookup: true, name, address, list, source: 'google' }); continue; }
    places.push({ name, address, lat, lng, list, note: p.Comment || p.comment || '', source: 'google', import_key: placeKey('google', lat, lng, name) });
  }
  return places;
}

// ---------- Google Timeline (phone export "Timeline.json", iPhone export, old Takeout) ----------
function fromTimelineNew(segments) {
  const trips = [];
  // Paths are stored in separate segments; index them by time so drives can use the real road path.
  const paths = segments.filter((s) => Array.isArray(s.timelinePath)).map((s) => ({
    start: new Date(s.startTime).getTime(), end: new Date(s.endTime).getTime(),
    pts: s.timelinePath.map((p) => ({ ...parseLatLngText(p.point), t: p.time ? new Date(p.time).getTime() : null })).filter((p) => p.lat != null),
  }));
  for (const s of segments) {
    const a = s.activity;
    if (!a || !isDriving(a.topCandidate?.type)) continue;
    const st = new Date(s.startTime).getTime(), en = new Date(s.endTime).getTime();
    const start = parseLatLngText(a.start?.latLng || a.start), end = parseLatLngText(a.end?.latLng || a.end);
    if (!start || !end) continue;
    let pts = [];
    for (const p of paths) if (p.end >= st && p.start <= en) pts.push(...p.pts.filter((x) => x.t == null || (x.t >= st && x.t <= en)));
    pts = [start, ...pts, end];
    const meters = +a.distanceMeters;
    const t = makeTrip({ source: 'google', start: s.startTime, end: s.endTime, points: pts, distanceMi: meters > 0 ? meters / MI : undefined });
    if (t) trips.push(t);
  }
  return trips;
}

function fromSemanticHistory(objs) {
  const trips = [];
  const e7 = (o) => (o && o.latitudeE7 != null ? { lat: o.latitudeE7 / 1e7, lng: o.longitudeE7 / 1e7 } : o && o.latE7 != null ? { lat: o.latE7 / 1e7, lng: o.lngE7 / 1e7 } : null);
  const visitName = (o) => o?.placeVisit?.location?.name || o?.placeVisit?.location?.address?.split('\n')[0] || '';
  objs.forEach((o, i) => {
    const a = o.activitySegment;
    if (!a || !isDriving(a.activityType)) return;
    const start = e7(a.startLocation), end = e7(a.endLocation);
    if (!start || !end) return;
    const mid = (a.simplifiedRawPath?.points || a.waypointPath?.waypoints || []).map(e7).filter(Boolean);
    const t = makeTrip({
      source: 'google',
      start: a.duration?.startTimestamp || (a.duration?.startTimestampMs && +a.duration.startTimestampMs),
      end: a.duration?.endTimestamp || (a.duration?.endTimestampMs && +a.duration.endTimestampMs),
      points: [start, ...mid, end],
      distanceMi: a.distance > 0 ? a.distance / MI : undefined,
      startName: visitName(objs[i - 1]), endName: visitName(objs[i + 1]),
    });
    if (t) trips.push(t);
  });
  return trips;
}

// ---------- Waze "account_activity" CSV and other CSVs ----------
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

const wazeTime = (s) => { const m = s.match(/(\d{4})(\d\d)(\d\d)\s+(\d\d:\d\d:\d\d)/); return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}Z` : null; };

function fromWazeText(text) {
  const trips = [], places = [];
  // Drives: "20240101 12:00:00(33.1; -117.2) => 20240101 12:30:00(33.3; -117.0)"
  const re = /(\d{8}\s+\d\d:\d\d:\d\d)\s*\(\s*(-?\d+\.\d+)\s*;\s*(-?\d+\.\d+)\s*\)\s*=>\s*(\d{8}\s+\d\d:\d\d:\d\d)\s*\(\s*(-?\d+\.\d+)\s*;\s*(-?\d+\.\d+)\s*\)/g;
  let m;
  while ((m = re.exec(text))) {
    const t = makeTrip({ source: 'waze', start: wazeTime(m[1]), end: wazeTime(m[4]), points: [{ lat: +m[2], lng: +m[3] }, { lat: +m[5], lng: +m[6] }] });
    if (t) { t.distance = Math.round(t.distance * 1.25 * 10) / 10; t.avg_speed = t.duration > 60 ? Math.round(t.distance / (t.duration / 3600)) : 0; trips.push(t); }
  }
  // Saved places (Home, Work, favorites): a row that names a place and has "(lat; lng)".
  const text2 = text.replace(re, '');
  for (const line of text2.split(/\r?\n/)) {
    const c = line.match(/\(\s*(-?\d+\.\d+)\s*;\s*(-?\d+\.\d+)\s*\)/) || line.match(/(-?\d{1,2}\.\d{3,})\s*[;,]\s*(-?\d{1,3}\.\d{3,})/);
    if (!c || !/favou?rite|home|work|saved|place|address/i.test(line)) continue;
    const lat = +c[1], lng = +c[2];
    if (!okCoord(lat, lng)) continue;
    const cells = parseCSV(line)[0] || [line];
    const label = cells.map((x) => x.trim()).find((x) => x && !/\d+\.\d{3,}/.test(x) && x.length < 80) || 'Waze place';
    const address = cells.map((x) => x.trim()).find((x) => x !== label && /[a-z]{3,}/i.test(x) && !/\d+\.\d{3,}/.test(x)) || '';
    places.push({ name: label, address, lat, lng, list: 'Waze', source: 'waze', import_key: placeKey('waze', lat, lng, label) });
  }
  return { trips, places };
}

function fromGenericCSV(text, list) {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (re) => head.findIndex((h) => re.test(h));
  const iLat = col(/^lat(itude)?$|latitude/), iLng = col(/^(lng|lon|long|longitude)$|longitude/);
  const iName = col(/^(title|name|label|place)$/), iAddr = col(/address/), iUrl = col(/url|link/), iNote = col(/note|comment/);
  const places = [];
  for (const r of rows.slice(1)) {
    let lat = iLat >= 0 ? +r[iLat] : NaN, lng = iLng >= 0 ? +r[iLng] : NaN;
    const url = iUrl >= 0 ? r[iUrl] : '';
    if (!okCoord(lat, lng)) { const c = coordsFromGoogleUrl(url); if (c) ({ lat, lng } = c); }
    const name = (iName >= 0 && r[iName]?.trim()) || (iAddr >= 0 && r[iAddr]?.trim()) || '';
    if (!name && !okCoord(lat, lng)) continue;
    const address = iAddr >= 0 ? r[iAddr]?.trim() || '' : '';
    const note = iNote >= 0 ? r[iNote]?.trim() || '' : '';
    if (!okCoord(lat, lng)) { places.push({ needsLookup: true, name, address, list, note, source: 'google' }); continue; }
    places.push({ name: name || 'Saved place', address, lat, lng, list, note, source: 'google', import_key: placeKey('google', lat, lng, name) });
  }
  return places;
}

// ---------- KML (Google My Maps) and GPX ----------
function fromKML(text, list) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const places = [], trips = [];
  for (const pm of doc.getElementsByTagName('Placemark')) {
    const name = pm.getElementsByTagName('name')[0]?.textContent?.trim() || 'Saved place';
    const pt = pm.getElementsByTagName('Point')[0]?.getElementsByTagName('coordinates')[0]?.textContent;
    if (pt) {
      const [lng, lat] = pt.trim().split(',').map(Number);
      if (okCoord(lat, lng)) places.push({ name, address: pm.getElementsByTagName('address')[0]?.textContent || '', lat, lng, list, source: 'google', import_key: placeKey('kml', lat, lng, name) });
    }
  }
  return { places, trips };
}

function fromGPX(text, list) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const places = [], trips = [];
  for (const w of doc.getElementsByTagName('wpt')) {
    const lat = +w.getAttribute('lat'), lng = +w.getAttribute('lon');
    const name = w.getElementsByTagName('name')[0]?.textContent?.trim() || 'Saved place';
    if (okCoord(lat, lng)) places.push({ name, address: '', lat, lng, list, source: 'gpx', import_key: placeKey('gpx', lat, lng, name) });
  }
  for (const trk of doc.getElementsByTagName('trk')) {
    const pts = [...trk.getElementsByTagName('trkpt')].map((p) => ({ lat: +p.getAttribute('lat'), lng: +p.getAttribute('lon'), t: p.getElementsByTagName('time')[0]?.textContent }));
    if (pts.length < 2 || !pts[0].t) continue;
    const t = makeTrip({ source: 'gpx', start: pts[0].t, end: pts[pts.length - 1].t, points: pts, title: trk.getElementsByTagName('name')[0]?.textContent?.trim() });
    if (t) trips.push(t);
  }
  return { places, trips };
}

// ---------- entry point ----------
function parseOne(name, text) {
  const lower = name.toLowerCase();
  const list = name.split('/').pop().replace(/\.[^.]+$/, '');
  const out = { places: [], trips: [] };
  if (lower.endsWith('.json') || lower.endsWith('.geojson')) {
    let j; try { j = JSON.parse(text); } catch { return out; }
    if (j.type === 'FeatureCollection') out.places = fromGeoJSON(j, /saved places/i.test(list) ? 'Google saved' : list);
    else if (Array.isArray(j.semanticSegments)) out.trips = fromTimelineNew(j.semanticSegments);
    else if (Array.isArray(j.timelineObjects)) out.trips = fromSemanticHistory(j.timelineObjects);
    else if (Array.isArray(j) && j.some((x) => x.activity || x.timelinePath)) out.trips = fromTimelineNew(j);
    return out;
  }
  if (lower.endsWith('.csv')) {
    const w = fromWazeText(text);
    if (w.trips.length || w.places.length) return w;
    out.places = fromGenericCSV(text, list);
    return out;
  }
  if (lower.endsWith('.kml')) return fromKML(text, list);
  if (lower.endsWith('.gpx')) return fromGPX(text, list);
  if (lower.endsWith('.txt')) return fromWazeText(text);
  return out;
}

const WANTED = /\.(json|geojson|csv|kml|gpx|txt)$/i;
const SKIP = /(records\.json|settings\.json|archive_browser|\/(fit|youtube|chrome|photos|mail|drive)\/)/i;

export async function readExportFiles(files, onStatus = () => {}) {
  const all = { places: [], trips: [], files: 0, encrypted: false };
  for (const file of files) {
    onStatus(`Reading ${file.name}…`);
    const buf = new Uint8Array(await file.arrayBuffer());
    if (/\.zip$/i.test(file.name)) {
      let entries;
      try {
        entries = unzipSync(buf, { filter: (f) => WANTED.test(f.name) && !SKIP.test(`/${f.name.toLowerCase()}`) });
      } catch {
        all.encrypted = true; // Waze zips are password-protected
        continue;
      }
      for (const [name, data] of Object.entries(entries)) {
        const r = parseOne(name, strFromU8(data));
        if (r.places.length || r.trips.length) all.files++;
        all.places.push(...r.places); all.trips.push(...r.trips);
      }
    } else {
      const r = parseOne(file.name, new TextDecoder().decode(buf));
      if (r.places.length || r.trips.length) all.files++;
      all.places.push(...r.places); all.trips.push(...r.trips);
    }
  }
  // Remove duplicates found across files.
  const dedupe = (arr) => { const s = new Set(); return arr.filter((x) => { const k = x.import_key || `${x.name}|${x.address}`; if (s.has(k)) return false; s.add(k); return true; }); };
  all.places = dedupe(all.places);
  all.trips = dedupe(all.trips).sort((a, b) => a.start_time.localeCompare(b.start_time));
  return all;
}

// Places saved without coordinates (Google "Saved" lists) get looked up by name.
export async function lookupMissing(places, onStatus = () => {}) {
  const out = [];
  const todo = places.filter((p) => p.needsLookup).slice(0, 300);
  for (let i = 0; i < todo.length; i++) {
    const p = todo[i];
    onStatus(`Finding places on the map… ${i + 1} of ${todo.length}`);
    try {
      const q = [p.name, p.address].filter(Boolean).join(', ');
      const d = await (await fetch(`https://photon.komoot.io/api/?limit=1&q=${encodeURIComponent(q)}`)).json();
      const f = d.features?.[0];
      if (f) {
        const [lng, lat] = f.geometry.coordinates;
        const pr = f.properties || {};
        const address = p.address || [pr.housenumber && pr.street ? `${pr.housenumber} ${pr.street}` : pr.street, pr.city, pr.state].filter(Boolean).join(', ');
        out.push({ ...p, needsLookup: undefined, lat, lng, address, import_key: placeKey(p.source, lat, lng, p.name) });
      }
    } catch { /* skip this one */ }
    await new Promise((r) => setTimeout(r, 120));
  }
  return [...places.filter((p) => !p.needsLookup), ...out];
}
