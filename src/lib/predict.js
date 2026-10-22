// Waze-style suggested drives: guess where you're probably heading now from
// your past drives (where they ended, what day/time they started) and your
// Home, Work and saved places.
import { distM } from './nav';

const NEAR_PLACE_M = 200; // a drive "ended at" a saved place if within this distance
const HERE_M = 400;       // don't suggest the place you're already at

const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;
const minutesOfDay = (d) => d.getHours() * 60 + d.getMinutes();
const circDiff = (a, b) => { const x = Math.abs(a - b) % 1440; return Math.min(x, 1440 - x); };

function endOf(trip) {
  const pts = trip.route_points || [];
  const last = pts[pts.length - 1];
  return last && last.lat != null ? [last.lat, last.lng] : null;
}

export function suggestDrives({ trips = [], places = [], pos, now = new Date() }) {
  if (!pos) return [];
  const candidates = new Map(); // key -> { place, score, count, reason }
  const add = (place, score, reason) => {
    if (!place || distM(pos, [place.lat, place.lng]) < HERE_M) return;
    const key = place.id || `${place.lat.toFixed(4)},${place.lng.toFixed(4)}`;
    const c = candidates.get(key) || { place, score: 0, count: 0, reason };
    c.score += score; c.count += 1;
    if (score > (c.best || 0)) { c.best = score; c.reason = reason; }
    candidates.set(key, c);
  };

  const nowMin = minutesOfDay(now);
  const weekend = isWeekend(now);
  const nowMs = now.getTime();

  // 1) Learn from history: drives that started around this time of day, on the same kind of day.
  for (const t of trips) {
    const end = endOf(t);
    const start = new Date(t.start_time || t.date);
    if (!end || Number.isNaN(start.getTime())) continue;
    const gap = circDiff(minutesOfDay(start), nowMin);
    if (gap > 90) continue;
    const sameKind = isWeekend(start) === weekend;
    const ageDays = (nowMs - start.getTime()) / 86400000;
    const recency = Math.max(0.15, 1 - ageDays / 120);
    const score = (1 - gap / 120) * (sameKind ? 1 : 0.35) * recency;
    // Prefer naming it after a saved place it ended at.
    let match = null, best = Infinity;
    for (const p of places) { const d = distM(end, [p.lat, p.lng]); if (d < NEAR_PLACE_M && d < best) { best = d; match = p; } }
    const place = match || { id: `end:${end[0].toFixed(3)},${end[1].toFixed(3)}`, name: t.end_location || 'Usual stop', address: '', lat: end[0], lng: end[1] };
    add(place, score, !sameKind ? 'You sometimes drive here around now' : weekend ? 'You often drive here on weekends around now' : 'You often drive here around now');
  }

  // 2) Routine guesses for Home and Work, even without history.
  const home = places.find((p) => p.kind === 'home');
  const work = places.find((p) => p.kind === 'work');
  const h = now.getHours();
  const atHome = home && distM(pos, [home.lat, home.lng]) < HERE_M;
  const atWork = work && distM(pos, [work.lat, work.lng]) < HERE_M;
  if (work && !weekend && h >= 5 && h < 11 && !atWork) add(work, atHome ? 0.9 : 0.6, 'Morning commute');
  if (home && !atHome && (h >= 15 || h < 2)) add(home, atWork ? 0.9 : 0.55, atWork ? 'Evening commute' : 'Head home');

  // Only drives seen more than once count as a habit (unless it's Home/Work).
  return [...candidates.values()]
    .filter((c) => c.place.kind || c.count >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((c) => ({ ...c.place, reason: c.reason, confidence: Math.min(1, c.score) }));
}
