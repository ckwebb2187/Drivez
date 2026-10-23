// Mod-aware routing: for lowered cars, count speed bumps, dips and potholes along each route
// choice (from OpenStreetMap plus drivers' reports) so the smoothest way can be picked.
import { api } from '@/api/base44Client';
import { distToLineM } from '@/lib/nav';

const LOW_MODS = /coilover|lower|lowered|lowering|drop|slam|static|air ?ride|air ?suspension|bag(s|ged)?\b|spring/i;
export function isLowered(vehicle, myCar) {
  if (myCar?.lowered || vehicle?.lowered) return true;
  return (vehicle?.mods || []).some((m) => LOW_MODS.test(`${m.name || ''} ${m.category || ''} ${m.note || ''}`));
}

// routes: [{ coords: [[lat,lng]...] }]; reports: road reports near you. Adds r.bumps to each route.
export async function countBumps(routes, reports = []) {
  const all = routes.flatMap((r) => r.coords);
  if (!all.length) return routes;
  let s = 90, w = 180, n = -90, e = -180;
  for (const [la, ln] of all) { if (la < s) s = la; if (la > n) n = la; if (ln < w) w = ln; if (ln > e) e = ln; }
  const pad = 0.003;
  let items = [];
  if ((n - s + 2 * pad) * (e - w + 2 * pad) <= 1.2) {
    try { items = (await api.get(`/osm?kind=bumps&s=${s - pad}&w=${w - pad}&n=${n + pad}&e=${e + pad}`)).items || []; } catch { items = []; }
  }
  const hazards = [...items, ...reports.filter((r) => ['bump', 'pothole', 'dip'].includes(r.type))];
  for (const r of routes) {
    // Thin the line for speed; 20 m either side counts as "on the route".
    const step = Math.max(1, Math.floor(r.coords.length / 600));
    const line = r.coords.filter((_, i) => i % step === 0 || i === r.coords.length - 1);
    r.bumps = hazards.filter((h) => h.lat >= s - pad && h.lat <= n + pad && distToLineM([h.lat, h.lng], line) < 20).length;
  }
  return routes;
}
