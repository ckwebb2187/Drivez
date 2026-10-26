// Search, directions and turn-by-turn helpers.
// Place search: Photon (komoot, free). Directions: OSRM public server (free).
import { isMetric } from '@/lib/units';

const toRad = (d) => (d * Math.PI) / 180;

// Distance in metres between two [lat, lng] points.
export function distM(a, b) {
  const R = 6371000;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Shortest distance in metres from point p to a polyline of [lat, lng] points.
export function distToLineM(p, line) {
  if (!line?.length) return Infinity;
  const kx = Math.cos(toRad(p[0])) * 111320, ky = 110540;
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const ax = (line[i][1] - p[1]) * kx, ay = (line[i][0] - p[0]) * ky;
    const bx = (line[i + 1][1] - p[1]) * kx, by = (line[i + 1][0] - p[0]) * ky;
    const dx = bx - ax, dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

export function formatNavDistance(m) {
  if (isMetric()) {
    if (m < 950) return `${Math.max(50, Math.round(m / 50) * 50)} m`;
    const km = m / 1000;
    return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
  }
  const mi = m / 1609.34;
  if (mi < 0.1) return `${Math.max(50, Math.round((m * 3.281) / 50) * 50)} ft`;
  return `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`;
}

export function spokenDistance(m) {
  if (isMetric()) {
    if (m < 950) return `${Math.max(50, Math.round(m / 50) * 50)} meters`;
    return `${(m / 1000).toFixed(1)} kilometers`;
  }
  const mi = m / 1609.34;
  if (mi < 0.1) return `${Math.max(50, Math.round((m * 3.281) / 50) * 50)} feet`;
  if (mi < 0.3) return 'a quarter mile';
  if (mi < 0.6) return 'half a mile';
  return `${mi.toFixed(1)} miles`;
}

export function formatEta(seconds) {
  const m = Math.max(1, Math.round(seconds / 60));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr ${m % 60} min`;
}

export function arrivalTime(seconds) {
  return new Date(Date.now() + seconds * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function compass(bearing) {
  return ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'][Math.round(((bearing || 0) % 360) / 45) % 8];
}

export function stepText(s) {
  const on = s.name ? ` onto ${s.name}` : '';
  const m = s.modifier || '';
  if (m === 'uturn') return `Make a U-turn${on}`;
  switch (s.type) {
    case 'depart': return `Head ${compass(s.bearing)}${s.name ? ` on ${s.name}` : ''}`;
    case 'arrive': return 'Arrive at your destination';
    case 'turn':
    case 'end of road': return m === 'straight' ? `Continue straight${on}` : `Turn ${m}${on}`;
    case 'merge': return `Merge${m && m !== 'straight' ? ` ${m}` : ''}${on}`;
    case 'on ramp': return `Take the ramp${m.includes('left') || m.includes('right') ? ` on the ${m.replace('slight ', '')}` : ''}${on}`;
    case 'off ramp': return `Take the exit${m.includes('left') || m.includes('right') ? ` on the ${m.replace('slight ', '')}` : ''}${on}`;
    case 'fork': return `Keep ${m.replace('slight ', '') || 'straight'} at the fork${on}`;
    case 'roundabout':
    case 'rotary':
    case 'roundabout turn': return `At the roundabout, take the ${ordinal(s.exit || 1)} exit${on}`;
    default:
      if (m.includes('left') || m.includes('right')) return `Keep ${m.replace('slight ', '')}${on}`;
      return `Continue${on}`;
  }
}

function ordinal(n) {
  return ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'][n - 1] || `${n}th`;
}

// Place search, biased towards the user's position when known. The Drivez server
// combines a places search with the US Census address finder for exact house numbers.
export async function searchPlaces(q, near) {
  const params = new URLSearchParams({ q });
  if (near) { params.set('lat', near[0]); params.set('lng', near[1]); }
  const res = await fetch(`/api/geocode?${params}`, { credentials: 'same-origin' });
  if (!res.ok) throw new Error('Search is unavailable right now');
  return (await res.json()).results || [];
}

// Driving directions from `from` to `to` ([lat, lng]), optionally through `stops`
// (up to 15, each { lat, lng, name }). Each leg ends with an "arrive" step.
export const MAX_STOPS = 15;
// How twisty a route is: degrees of turning per mile (big numbers = mountain roads).
function twistiness(coords, distM) {
  let turn = 0;
  const step = Math.max(1, Math.floor(coords.length / 1500));
  let prev = null;
  for (let i = step; i < coords.length; i += step) {
    const [a, b] = [coords[i - step], coords[i]];
    if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) < 1e-5) continue;
    const brg = (Math.atan2(b[1] - a[1], (b[0] - a[0]) / Math.cos(toRad(a[0]))) * 180) / Math.PI;
    if (prev != null) { let d = Math.abs(brg - prev); if (d > 180) d = 360 - d; if (d < 120) turn += d; }
    prev = brg;
  }
  return Math.round(turn / Math.max(0.1, distM / 1609.34));
}

function parseRoute(r, stops, destName) {
  const steps = r.legs.flatMap((leg, legIdx) => leg.steps.map((s) => {
    const step = {
      lat: s.maneuver.location[1],
      lng: s.maneuver.location[0],
      type: s.maneuver.type,
      modifier: s.maneuver.modifier,
      bearing: s.maneuver.bearing_after,
      exit: s.maneuver.exit,
      name: s.name || s.ref || '',
      toward: s.destinations || s.exits || '',
      distance: s.distance,
      duration: s.duration,
      leg: legIdx,
      // Turn lanes at this maneuver (when OpenStreetMap has them): [{ ind: ['left','straight'], ok: true }]
      lanes: (s.intersections?.[0]?.lanes || []).map((l) => ({ ind: l.indications || [], ok: !!l.valid })),
      hwy: (s.intersections || []).some((x) => (x.classes || []).includes('motorway')) || /\b(I|IH)[- ]?\d+\b|Interstate|Expressway|Expy|Freeway|Fwy|Turnpike|Tollway|Motorway|Autobahn|Autoroute|Autopista/i.test(`${s.name || ''} ${s.ref || ''}`),
      geom: s.geometry?.coordinates,
    };
    step.text = stepText(step);
    if (step.type === 'arrive') {
      const isLast = legIdx === r.legs.length - 1;
      const label = isLast ? destName : stops[legIdx]?.name;
      step.text = isLast ? `Arrive at ${label || 'your destination'}` : `Arrive at stop ${legIdx + 1}${label ? `: ${label}` : ''}`;
    }
    return step;
  }));
  const coords = r.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  // Main roads used (for the "via" label on route choices).
  const byName = {};
  for (const st of steps) if (st.name) byName[st.name] = (byName[st.name] || 0) + st.distance;
  const via = Object.entries(byName).sort((x, y) => y[1] - x[1])[0]?.[0] || '';
  // Highway stretches (for the lane reflectors drawn on the map).
  const highway = steps.filter((st) => st.hwy && st.geom?.length > 1 && st.distance > 150).map((st) => st.geom);
  for (const st of steps) { delete st.geom; delete st.hwy; }
  return {
    highway,
    coords,
    distanceM: r.distance,
    distance: Math.round((r.distance / 1609.34) * 10) / 10,
    duration: r.duration,
    legs: r.legs.map((l) => ({ distance: l.distance, duration: l.duration })),
    steps,
    via,
    twisty: twistiness(coords, r.distance),
  };
}

// Avoid tolls / ferries (saved on this phone). The free OSRM server can't avoid anything, so when
// either is on, routes come from the free Valhalla server (FOSSGIS) in OSRM-style JSON instead.
export function getAvoid() {
  try { const a = JSON.parse(localStorage.getItem('dz-avoid') || '{}'); return { tolls: !!a.tolls, ferries: !!a.ferries }; } catch { return { tolls: false, ferries: false }; }
}
export function setAvoid(a) { try { localStorage.setItem('dz-avoid', JSON.stringify(a)); } catch { /* private mode */ } }

async function valhallaRoute(points, alternatives) {
  const { tolls, ferries } = getAvoid();
  const q = {
    locations: points.map(([lat, lon]) => ({ lat, lon })),
    costing: 'auto',
    costing_options: { auto: { use_tolls: tolls ? 0 : 0.5, use_ferry: ferries ? 0 : 0.5 } },
    format: 'osrm', shape_format: 'geojson', units: 'km',
    ...(alternatives ? { alternates: 2 } : {}),
  };
  const res = await fetch(`https://valhalla1.openstreetmap.de/route?json=${encodeURIComponent(JSON.stringify(q))}`);
  return res.json();
}

// Directions. With no stops, also returns up to 2 other ways to go (route.alternatives),
// each labeled: Fastest, Shortest, Twistiest (best for a Tōge run).
export async function getRoute(from, to, stops = [], destName = '') {
  const points = [from, ...stops.map((s) => [s.lat, s.lng]), to];
  const path = points.map(([lat, lng]) => `${lng},${lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson&steps=true${stops.length ? '' : '&alternatives=3'}`;
  let data = {};
  const av = getAvoid();
  if (av.tolls || av.ferries) {
    data = await valhallaRoute(points, !stops.length).catch(() => ({}));
    if (data.code !== 'Ok') throw new Error("Couldn't find a route that avoids those. Try turning Avoid off.");
  } else {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(url).catch(() => null);
      data = res ? await res.json().catch(() => ({})) : {};
      if (data.code === 'Ok') break;
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  if (data.code !== 'Ok' || !data.routes?.length) throw new Error("Couldn't find a driving route there");
  const all = data.routes.slice(0, 3).map((r) => parseRoute(r, stops, destName));
  const fastest = all.reduce((x, y) => (y.duration < x.duration ? y : x));
  const shortest = all.reduce((x, y) => (y.distanceM < x.distanceM ? y : x));
  const twistiest = all.reduce((x, y) => (y.twisty > x.twisty ? y : x));
  all.forEach((r) => {
    r.labels = [r === fastest && 'Fastest', r === shortest && r !== fastest && 'Shortest', all.length > 1 && r === twistiest && r.twisty > 60 && 'Twistiest'].filter(Boolean);
  });
  const main = all[0];
  main.alternatives = all.map((r) => (r === main ? { ...main } : r)); // copy avoids a loop back to main
  return main;
}

// Best visiting order for the stops between start and the final destination.
// Returns the stops reordered (the destination stays last).
export async function optimizeStops(from, stops, to) {
  if (stops.length < 2) return stops;
  const points = [from, ...stops.map((s) => [s.lat, s.lng]), to];
  const path = points.map(([lat, lng]) => `${lng},${lat}`).join(';');
  const res = await fetch(`https://router.project-osrm.org/trip/v1/driving/${path}?source=first&destination=last&roundtrip=false&overview=false`);
  const data = await res.json().catch(() => ({}));
  if (data.code !== 'Ok') throw new Error("Couldn't work out a better order");
  // waypoints[i].waypoint_index = position of input point i in the trip
  const order = data.waypoints.map((w, i) => ({ i, at: w.waypoint_index })).slice(1, -1).sort((a, b) => a.at - b.at);
  return order.map((o) => stops[o.i - 1]);
}

export function speak(text) {
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02;
    // Speed-linked: softer when stopped, full volume at highway speed (road noise).
    let speedLinked = true;
    try { speedLinked = JSON.parse(localStorage.getItem('dz-voice') || '{}').speedAudio !== false; } catch { /* default on */ }
    if (speedLinked) u.volume = Math.min(1, 0.7 + (window.__dzSpeed || 0) / 200);
    window.speechSynthesis.speak(u);
  } catch { /* speech not available */ }
}
