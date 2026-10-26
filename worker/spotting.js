// Spotted mode: opt-in "I saw your car!" with privacy built in.
//  - Off unless you turn it on. Ghost mode, teen/kid accounts with map visibility off, and
//    anyone hiding from strangers never show.
//  - Other drivers only see where you were 10-40 minutes ago, rounded to about 100 m,
//    so nobody can follow you live.
//  - Nothing is recorded within 800 m of your saved Home.
// Crossed paths: after a drive is saved, it's compared with friends' drives from the same time.
// Passing within ~150 m of each other within 5 minutes makes a "crossed paths" card for both.

export const SPOT_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS spot_settings (user_id TEXT PRIMARY KEY, on_ INTEGER NOT NULL DEFAULT 0, updated INTEGER)`,
  `CREATE TABLE IF NOT EXISTS spot_trail (user_id TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (user_id, at))`,
  `CREATE INDEX IF NOT EXISTS spot_trail_at ON spot_trail(at)`,
  `CREATE TABLE IF NOT EXISTS spots (id TEXT PRIMARY KEY, spotter_id TEXT NOT NULL, spotted_id TEXT NOT NULL, lat REAL, lng REAL, note TEXT, created INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS spots_spotted ON spots(spotted_id, created)`,
  `CREATE INDEX IF NOT EXISTS spots_spotter ON spots(spotter_id, created)`,
  `CREATE TABLE IF NOT EXISTS crossings (id TEXT PRIMARY KEY, a_id TEXT NOT NULL, b_id TEXT NOT NULL, a_trip TEXT NOT NULL, b_trip TEXT NOT NULL, lat REAL, lng REAL, at INTEGER NOT NULL, UNIQUE (a_trip, b_trip))`,
  `CREATE INDEX IF NOT EXISTS crossings_a ON crossings(a_id, at)`,
  `CREATE INDEX IF NOT EXISTS crossings_b ON crossings(b_id, at)`,
];

const DELAY = 10 * 60000, WINDOW = 40 * 60000, HOME_M = 800, NEAR_KM = 8;
const rid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 24);
const round = (x) => Math.round(x * 1000) / 1000; // ~100 m
const meters = (a, b) => { const R = 6371000, r = Math.PI / 180; const h = Math.sin((b[0] - a[0]) * r / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin((b[1] - a[1]) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };

async function homeOf(db, userId) {
  const { results } = await db.prepare("SELECT data FROM records WHERE entity = 'Place' AND owner_id = ? AND json_extract(data, '$.kind') = 'home' LIMIT 1").bind(userId).all();
  try { const d = JSON.parse(results[0]?.data || "null"); return d && isFinite(+d.lat) ? [+d.lat, +d.lng] : null; } catch { return null; }
}
const isOn = async (db, userId) => !!(await db.prepare("SELECT on_ FROM spot_settings WHERE user_id = ?").bind(userId).first())?.on_;

// Called from /live (while driving): keep a short, delayed-use trail for spotting.
export async function recordTrail(db, me, lat, lng, { hidden }) {
  if (hidden || !(await isOn(db, me.id))) return;
  const t = Date.now();
  const last = await db.prepare("SELECT at FROM spot_trail WHERE user_id = ? ORDER BY at DESC LIMIT 1").bind(me.id).first();
  if (last && t - last.at < 60000) return; // at most once a minute
  const home = await homeOf(db, me.id);
  if (home && meters(home, [lat, lng]) < HOME_M) return;
  await db.prepare("INSERT OR IGNORE INTO spot_trail (user_id, lat, lng, at) VALUES (?, ?, ?, ?)").bind(me.id, round(lat), round(lng), t).run();
  if (Math.random() < 0.05) await db.prepare("DELETE FROM spot_trail WHERE at < ?").bind(t - 3 * 3600000).run();
}

// After a drive is saved: did it cross a friend's drive?
export async function findCrossings(db, me, tripId, trip, friendIds) {
  if (!friendIds.length || !Array.isArray(trip.route_points) || trip.route_points.length < 6) return;
  const t0 = Date.parse(trip.start_time || ""), t1 = Date.parse(trip.end_time || "") || t0 + (trip.duration || 0) * 1000;
  if (!isFinite(t0)) return;
  const pts = trimmed(trip.route_points, t0);
  const qs = friendIds.map(() => "?").join(",");
  const { results } = await db.prepare(`SELECT id, owner_id, data FROM records WHERE entity = 'Trip' AND owner_id IN (${qs}) AND created_date > ? ORDER BY created_date DESC LIMIT 200`)
    .bind(...friendIds, new Date(t0 - 2 * 86400000).toISOString()).all();
  for (const r of results) {
    let d; try { d = JSON.parse(r.data); } catch { continue; }
    const s0 = Date.parse(d.start_time || ""), s1 = Date.parse(d.end_time || "") || s0 + (d.duration || 0) * 1000;
    if (!isFinite(s0) || s1 < t0 - 300000 || s0 > t1 + 300000 || !Array.isArray(d.route_points)) continue;
    const other = trimmed(d.route_points, s0);
    let hit = null;
    for (const p of pts) {
      for (const q of other) {
        if (Math.abs(p.at - q.at) < 300000 && Math.abs(p.lat - q.lat) < 0.002 && Math.abs(p.lng - q.lng) < 0.002 && meters([p.lat, p.lng], [q.lat, q.lng]) < 150) { hit = p; break; }
      }
      if (hit) break;
    }
    if (!hit) continue;
    const [a, b] = me.id < r.owner_id ? [[me.id, tripId], [r.owner_id, r.id]] : [[r.owner_id, r.id], [me.id, tripId]];
    await db.prepare("INSERT OR IGNORE INTO crossings (id, a_id, b_id, a_trip, b_trip, lat, lng, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(rid(), a[0], b[0], a[1], b[1], round(hit.lat), round(hit.lng), hit.at).run();
  }
}
// Route points with real times, minus the first and last stretch (so homes never count).
function trimmed(points, start) {
  const n = points.length, cut = Math.max(2, Math.round(n * 0.08));
  return points.slice(cut, n - cut).filter((p) => isFinite(+p.lat) && isFinite(+p.lng)).map((p) => ({ lat: +p.lat, lng: +p.lng, at: start + (+p.t || 0) * 1000 }));
}

// Spots and crossings for the feed (you and your friends).
export async function feedItems(db, me, people, card) {
  const qs = people.map(() => "?").join(",");
  const since = Date.now() - 30 * 86400000;
  const { results: spots } = await db.prepare(
    `SELECT s.*, a.id AS a_id, a.display_name AS a_name, a.username AS a_user, a.avatar_url AS a_av, a.color AS a_color,
            b.id AS b_id, b.display_name AS b_name, b.username AS b_user, b.avatar_url AS b_av, b.color AS b_color
     FROM spots s JOIN users a ON a.id = s.spotter_id JOIN users b ON b.id = s.spotted_id
     WHERE s.created > ? AND (s.spotter_id IN (${qs}) OR s.spotted_id IN (${qs})) ORDER BY s.created DESC LIMIT 30`
  ).bind(since, ...people, ...people).all();
  const { results: cross } = await db.prepare(
    `SELECT c.*, a.display_name AS a_name, a.username AS a_user, a.avatar_url AS a_av, a.color AS a_color,
            b.display_name AS b_name, b.username AS b_user, b.avatar_url AS b_av, b.color AS b_color
     FROM crossings c JOIN users a ON a.id = c.a_id JOIN users b ON b.id = c.b_id
     WHERE c.at > ? AND (c.a_id = ? OR c.b_id = ? OR (c.a_id IN (${qs}) AND c.b_id IN (${qs}))) ORDER BY c.at DESC LIMIT 30`
  ).bind(since, me.id, me.id, ...people, ...people).all();
  const u = (r, p) => card({ id: r[`${p}_id`], display_name: r[`${p}_name`], username: r[`${p}_user`], avatar_url: r[`${p}_av`], color: r[`${p}_color`] });
  return [
    ...spots.map((s) => ({ id: `s_${s.id}`, kind: "spot", at: new Date(s.created).toISOString(), user: u(s, "a"), spotted: u(s, "b"), note: s.note || "", lat: s.lat, lng: s.lng, mine: s.spotted_id === me.id })),
    ...cross.map((c) => ({ id: `c_${c.id}`, kind: "crossed", at: new Date(c.at).toISOString(), user: u(c, "a"), other: u(c, "b"), lat: c.lat, lng: c.lng, aTrip: c.a_id === me.id ? c.a_trip : null, bTrip: c.b_id === me.id ? c.b_trip : null })),
  ];
}

// /spot/* endpoints. Returns a Response or null.
export async function handleSpot({ path, method, body, me, db, url, json, HttpError, card, kidRules }) {
  if (!path.startsWith("/spot")) return null;

  if (path === "/spot/settings" && method === "GET") return json({ on: await isOn(db, me.id) });
  if (path === "/spot/settings" && method === "POST") {
    const kid = await kidRules(db, me.id);
    if (body.on && kid && !kid.mapVisible) throw new HttpError(403, "Spotted mode is turned off by your parent.");
    await db.prepare("INSERT INTO spot_settings (user_id, on_, updated) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET on_ = excluded.on_, updated = excluded.updated").bind(me.id, body.on ? 1 : 0, Date.now()).run();
    if (!body.on) await db.prepare("DELETE FROM spot_trail WHERE user_id = ?").bind(me.id).run();
    return json({ on: !!body.on });
  }

  // Spotted-mode cars that passed near you recently (delayed + rounded).
  if (path === "/spot/nearby" && method === "GET") {
    const lat = +url.searchParams.get("lat"), lng = +url.searchParams.get("lng");
    if (!isFinite(lat) || !isFinite(lng)) throw new HttpError(400, "Missing position");
    const t = Date.now(), dLat = NEAR_KM / 111, dLng = NEAR_KM / (111 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
    const { results } = await db.prepare(
      `SELECT p.user_id, p.lat, p.lng, p.at, u.display_name, u.username, u.avatar_url, u.color, u.ghost_mode
       FROM spot_trail p JOIN users u ON u.id = p.user_id JOIN spot_settings s ON s.user_id = p.user_id AND s.on_ = 1
       WHERE p.at BETWEEN ? AND ? AND p.lat BETWEEN ? AND ? AND p.lng BETWEEN ? AND ? AND p.user_id != ? AND u.ghost_mode = 0
       ORDER BY p.at DESC LIMIT 300`
    ).bind(t - WINDOW, t - DELAY, lat - dLat, lat + dLat, lng - dLng, lng + dLng, me.id).all();
    const best = new Map();
    for (const r of results) {
      const d = meters([lat, lng], [r.lat, r.lng]);
      if (d > NEAR_KM * 1000) continue;
      if (!best.has(r.user_id) || d < best.get(r.user_id).d) best.set(r.user_id, { ...r, d });
    }
    const out = [];
    for (const r of best.values()) {
      const kid = await kidRules(db, r.user_id);
      if (kid && !kid.mapVisible) continue;
      const car = await db.prepare("SELECT data FROM records WHERE entity = 'Vehicle' AND owner_id = ? ORDER BY json_extract(data, '$.is_primary') DESC, created_date DESC LIMIT 1").bind(r.user_id).first();
      let v = null; try { v = car ? JSON.parse(car.data) : null; } catch { v = null; }
      out.push({ ...card({ id: r.user_id, display_name: r.display_name, username: r.username, avatar_url: r.avatar_url, color: r.color }),
        car: v ? { name: `${v.year || ""} ${v.make || ""} ${v.model || ""}`.trim(), color: v.color || null, nickname: v.nickname || "" } : null,
        minutesAgo: Math.round((t - r.at) / 60000), distanceM: Math.round(r.d / 100) * 100 });
    }
    out.sort((a, b) => a.distanceM - b.distanceM);
    return json({ cars: out.slice(0, 20), on: await isOn(db, me.id) });
  }

  // "I spotted you!"
  if (path === "/spot" && method === "POST") {
    const target = String(body.userId || "");
    if (!target || target === me.id) throw new HttpError(400, "Pick a car you saw.");
    if (!(await isOn(db, target))) throw new HttpError(403, "That driver isn't in spotted mode.");
    const recent = await db.prepare("SELECT id FROM spots WHERE spotter_id = ? AND spotted_id = ? AND created > ?").bind(me.id, target, Date.now() - 3600000).first();
    if (recent) return json({ ok: true, already: true });
    const lat = isFinite(+body.lat) ? round(+body.lat) : null, lng = isFinite(+body.lng) ? round(+body.lng) : null;
    await db.prepare("INSERT INTO spots (id, spotter_id, spotted_id, lat, lng, note, created) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(rid(), me.id, target, lat, lng, String(body.note || "").trim().slice(0, 120), Date.now()).run();
    return json({ ok: true });
  }

  // Who spotted me lately (for an in-app heads-up).
  if (path === "/spot/inbox" && method === "GET") {
    const since = +url.searchParams.get("since") || Date.now() - 86400000;
    const { results } = await db.prepare("SELECT s.id, s.note, s.created, u.id AS uid, u.display_name, u.username, u.avatar_url, u.color FROM spots s JOIN users u ON u.id = s.spotter_id WHERE s.spotted_id = ? AND s.created > ? ORDER BY s.created DESC LIMIT 10").bind(me.id, since).all();
    return json({ spots: results.map((r) => ({ id: r.id, note: r.note, at: r.created, by: card({ id: r.uid, display_name: r.display_name, username: r.username, avatar_url: r.avatar_url, color: r.color }) })), now: Date.now() });
  }

  throw new HttpError(404, "Not found");
}
