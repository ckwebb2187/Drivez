import { base44 } from '@/api/base44Client';
import { distM, distToLineM } from '@/lib/nav';

// Tōge sections: find passes through your saved sections in a drive and score them.
// Scores reward smoothness and control only. Speed and time never add points.

const NEAR_M = 50; // how close to a section's start/end counts as passing it
const OFF_M = 60; // how far from the section line a point may stray

let cached = null;
export async function mySections(force = false) {
  if (cached && !force) return cached;
  cached = await base44.entities.Sector.list('-created_date', 200).catch(() => []);
  return cached;
}
export function forgetSections() { cached = null; }

const toRad = (d) => (d * Math.PI) / 180;
function bearing(a, b) {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return Math.atan2(y, x);
}
const wrap = (r) => Math.atan2(Math.sin(r), Math.cos(r));
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const clamp = (x) => Math.max(0, Math.min(100, Math.round(x)));

// Every pass through `sector` in a drive route ([{ lat, lng, speed (mph), t (ms) }]).
export function findPasses(route, sector) {
  const line = sector.points || [];
  if (line.length < 2 || route.length < 5) return [];
  const start = line[0], end = line[line.length - 1];
  const out = [];
  for (let i = 0; i < route.length; i++) {
    if (distM([route[i].lat, route[i].lng], start) > NEAR_M) continue;
    let j = i + 1, off = 0;
    for (; j < route.length; j++) {
      const p = [route[j].lat, route[j].lng];
      if (distToLineM(p, line) > OFF_M) off++;
      if (distM(p, end) < NEAR_M) break;
    }
    if (j >= route.length) break;
    const span = j - i + 1;
    if (span >= 5 && off / span < 0.1) { out.push(route.slice(i, j + 1)); i = j; }
  }
  return out;
}

// Score one pass, 0-100 overall plus parts. Side g-force comes from speed and how fast the heading turns.
export function scorePass(pts) {
  const lat = [], lon = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const dt = (pts[i + 1].t - pts[i - 1].t) / 1000;
    if (!(dt > 0.2 && dt < 10)) continue;
    const v = ((pts[i].speed || 0) * 0.44704); // m/s
    const yaw = wrap(bearing(pts[i], pts[i + 1]) - bearing(pts[i - 1], pts[i])) / (dt / 2);
    lat.push((v * yaw) / 9.81);
    lon.push((((pts[i + 1].speed || 0) - (pts[i - 1].speed || 0)) * 0.44704) / dt / 9.81);
  }
  if (lat.length < 3) return null;
  // Light 3-point smoothing so normal GPS wobble isn't scored as jerky driving.
  const sm = (xs) => xs.map((x, i) => mean(xs.slice(Math.max(0, i - 1), i + 2)));
  lat.splice(0, lat.length, ...sm(lat));
  lon.splice(0, lon.length, ...sm(lon));
  // Cornering smoothness: how gently the side force changes (less jerk = better).
  const jerk = mean(lat.slice(1).map((g, i) => Math.abs(g - lat[i])));
  const smooth = clamp(100 - jerk * 400);
  // Steady side g: in corners, how even the side force is held.
  const corner = lat.filter((g) => Math.abs(g) > 0.12).map(Math.abs);
  const cv = corner.length > 2 ? Math.sqrt(mean(corner.map((g) => (g - mean(corner)) ** 2))) / mean(corner) : 0;
  const steady = clamp(100 - cv * 120);
  // Clean entry and exit: no hard braking or stabbing the throttle in the first and last fifth.
  const edge = Math.max(1, Math.floor(lon.length / 5));
  const harsh = mean([...lon.slice(0, edge), ...lon.slice(-edge)].map((g) => Math.max(0, Math.abs(g) - 0.15)));
  const clean = clamp(100 - harsh * 500);
  const score = clamp(smooth * 0.45 + steady * 0.35 + clean * 0.2);
  return { score, smooth, steady, clean, peakSideG: Math.round(Math.max(...lat.map(Math.abs)) * 100) / 100 };
}

// After a drive: score passes through your sections and save each run (with a light trace for ghost runs).
export async function scoreDrive(route, tripId) {
  const sectors = await mySections();
  const runs = [];
  for (const s of sectors) {
    for (const pass of findPasses(route, s)) {
      const sc = scorePass(pass);
      if (!sc) continue;
      const t0 = pass[0].t;
      const step = Math.ceil(pass.length / 150) || 1;
      const trace = pass.filter((_, i) => i % step === 0 || i === pass.length - 1).map((p) => [Math.round((p.t - t0) / 100) / 10, Math.round(p.lat * 1e6) / 1e6, Math.round(p.lng * 1e6) / 1e6]);
      const run = { sector_id: s.id, sector_name: s.name, trip_id: tripId, ...sc, trace, at: new Date(t0).toISOString() };
      runs.push(run);
      base44.entities.SectorRun.create(run).catch(() => {});
    }
  }
  return runs;
}
