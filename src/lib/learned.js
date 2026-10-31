// Routes you drive a lot: what the free router thinks a route takes vs what it actually
// took in your own drives. The gap is applied to the ETA, so the number reflects how you
// really drive rather than the router's road-speed guess.
import { distM } from './nav';

const MATCH_M = 400;      // a past drive counts as this route if it started and ended here
const MIN_MILES = 0.3;    // too short to say anything useful
const MIN_TRIPS = 2;      // one drive isn't a habit
const MAX_AGE_DAYS = 240; // older drives are worth less, and eventually nothing

const pointsOf = (t) => (t.route?.length ? t.route : (t.route_points || []).map((p) => [p.lat, p.lng]));
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

// How long this route really takes you. Returns { adjust, count, seconds } or null when
// there isn't enough history to beat the router's own estimate.
export function learnedRoute({ trips = [], from, to, route, now = Date.now() }) {
  if (!from || !to || !(route?.duration > 0) || !(route?.distance > 0)) return null;
  const routerMph = route.distance / (route.duration / 3600);
  if (!(routerMph > 0)) return null;

  const speeds = [];
  let newest = 0;
  for (const t of trips) {
    const pts = pointsOf(t);
    if (pts.length < 2) continue;
    if (distM(from, pts[0]) > MATCH_M || distM(to, pts[pts.length - 1]) > MATCH_M) continue;
    const miles = +t.distance;
    const secs = +t.duration;
    if (!(miles >= MIN_MILES) || !(secs > 0)) continue;
    // Ignore drives that were paused or that sat in a car park: they'd drag the average down.
    const mph = miles / (secs / 3600);
    if (!(mph > 3 && mph < 100)) continue;
    const at = new Date(t.start_time || t.date || 0).getTime();
    if (Number.isFinite(at) && now - at > MAX_AGE_DAYS * 86400000) continue;
    speeds.push(mph);
    if (at > newest) newest = at;
  }
  if (speeds.length < MIN_TRIPS) return null;

  // Router time x (router speed / your real speed) = your real time.
  const adjust = Math.min(1.8, Math.max(0.6, routerMph / median(speeds)));
  // Trust it more the more often you've driven it, and a little less when the drives are old.
  const ageDays = newest ? (now - newest) / 86400000 : 0;
  const recency = Math.max(0.5, 1 - ageDays / MAX_AGE_DAYS);
  const weight = Math.min(1, speeds.length / 3) * recency;
  const applied = 1 + (adjust - 1) * weight;
  return { count: speeds.length, adjust: applied, seconds: Math.round(route.duration * applied) };
}
