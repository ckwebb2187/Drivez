// Family: a private group that shares live location, saved places with arrive/leave alerts,
// battery, check-ins, SOS, and teen-driver alerts. Parents can link teen/kid accounts and
// choose what those accounts can use, locked with a parent PIN.
// (Crash detection is planned for later.)

export const FAMILY_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS families (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL, pin_hash TEXT, created INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS family_members (user_id TEXT PRIMARY KEY, family_id TEXT NOT NULL, role TEXT NOT NULL, controls TEXT, joined INTEGER NOT NULL,
    sharing INTEGER NOT NULL DEFAULT 1, lat REAL, lng REAL, speed INTEGER, driving INTEGER, battery REAL, charging INTEGER, inside TEXT, updated INTEGER)`,
  `CREATE INDEX IF NOT EXISTS family_members_fam ON family_members(family_id)`,
  `CREATE TABLE IF NOT EXISTS family_places (id TEXT PRIMARY KEY, family_id TEXT NOT NULL, name TEXT NOT NULL, emoji TEXT, lat REAL NOT NULL, lng REAL NOT NULL, radius INTEGER NOT NULL, created_by TEXT)`,
  `CREATE TABLE IF NOT EXISTS family_invites (code TEXT PRIMARY KEY, family_id TEXT NOT NULL, role TEXT NOT NULL, created_by TEXT NOT NULL, expires INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS family_events (id TEXT PRIMARY KEY, family_id TEXT NOT NULL, user_id TEXT NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL, lat REAL, lng REAL, created INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS family_events_fam ON family_events(family_id, created)`,
];

const ROLES = ["parent", "adult", "teen", "kid"];
const YOUNG = new Set(["teen", "kid"]);
// What a teen / kid account can use. Kids start with everything off; map visibility to
// strangers is always off for both unless a parent turns it on.
const DEFAULT_CONTROLS = {
  kid: { meets: false, social: false, mapVisible: false, convoys: false, purchases: false },
  teen: { meets: true, social: true, mapVisible: false, convoys: true, purchases: false },
};
const PARENT_ONLY = new Set(["speeding", "hard_brake", "phone"]);

class FamilyError extends Error { constructor(status, message) { super(message); this.status = status; } }
const rid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 24);
const code6 = () => { const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const b = crypto.getRandomValues(new Uint8Array(6)); return [...b].map((x) => a[x % a.length]).join(""); };
const meters = (a, b) => { const R = 6371000, r = Math.PI / 180; const h = Math.sin((b[0] - a[0]) * r / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin((b[1] - a[1]) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
async function sha(s) { const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join(""); }
const readControls = (role, raw) => { if (!YOUNG.has(role)) return null; let c = {}; try { c = raw ? JSON.parse(raw) : {}; } catch { c = {}; } return { ...DEFAULT_CONTROLS[role], ...c }; };

async function membership(db, userId) {
  return db.prepare("SELECT m.*, f.name AS family_name, f.owner_id, f.pin_hash FROM family_members m JOIN families f ON f.id = m.family_id WHERE m.user_id = ?").bind(userId).first();
}

// For the rest of the app: the limits on a teen/kid account (null = no limits).
export async function kidRules(db, userId) {
  try { const m = await db.prepare("SELECT role, controls FROM family_members WHERE user_id = ?").bind(userId).first(); return m ? readControls(m.role, m.controls) : null; } catch { return null; }
}
// Short summary for /auth/me.
export async function familyBrief(db, userId) {
  try {
    const m = await membership(db, userId);
    if (!m) return null;
    return { id: m.family_id, name: m.family_name, role: m.role, controls: readControls(m.role, m.controls), locked: YOUNG.has(m.role) && !!m.pin_hash, sharing: !!m.sharing };
  } catch { return null; }
}

async function addEvent(db, familyId, userId, kind, text, lat = null, lng = null) {
  await db.prepare("INSERT INTO family_events (id, family_id, user_id, kind, text, lat, lng, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(rid(), familyId, userId, kind, text.slice(0, 200), lat, lng, Date.now()).run();
}
// Hidden from strangers: ghost mode on, off the live map.
async function applyVisibility(db, userId, controls) {
  if (controls && !controls.mapVisible) {
    await db.prepare("UPDATE users SET ghost_mode = 1 WHERE id = ?").bind(userId).run();
    await db.prepare("DELETE FROM live_pos WHERE user_id = ?").bind(userId).run();
  }
}

// Returns a Response for /family/* paths, or null if the path isn't ours.
export async function handleFamily({ path, method, body, me, db, url, json }) {
  if (!path.startsWith("/family")) return null;
  try {
    return await route({ path, method, body, me, db, url, json });
  } catch (e) {
    if (e instanceof FamilyError) return json({ error: e.message }, e.status);
    throw e;
  }
}

async function route({ path, method, body, me, db, url, json }) {
  const mine = await membership(db, me.id);
  const isParent = mine?.role === "parent";
  const need = () => { if (!mine) throw new FamilyError(404, "You're not in a family yet."); };
  const needParent = () => { need(); if (!isParent) throw new FamilyError(403, "Only a parent can do that."); };

  if (path === "/family" && method === "GET") {
    if (!mine) return json({ family: null });
    const { results: members } = await db.prepare("SELECT m.*, u.display_name, u.username, u.avatar_url, u.color FROM family_members m JOIN users u ON u.id = m.user_id WHERE m.family_id = ? ORDER BY m.joined").bind(mine.family_id).all();
    const { results: places } = await db.prepare("SELECT * FROM family_places WHERE family_id = ? ORDER BY name").bind(mine.family_id).all();
    const { results: events } = await db.prepare("SELECT e.*, u.display_name FROM family_events e JOIN users u ON u.id = e.user_id WHERE e.family_id = ? AND e.created > ? ORDER BY e.created DESC LIMIT 60")
      .bind(mine.family_id, Date.now() - 7 * 86400000).all();
    const placeName = (ids) => { try { const s = JSON.parse(ids || "[]"); return places.find((p) => s.includes(p.id))?.name || null; } catch { return null; } };
    return json({
      family: { id: mine.family_id, name: mine.family_name, ownerId: mine.owner_id, pinSet: !!mine.pin_hash },
      me: { role: mine.role, controls: readControls(mine.role, mine.controls), sharing: !!mine.sharing },
      members: members.map((m) => {
        const shared = m.sharing || YOUNG.has(m.role);
        return {
          id: m.user_id, name: m.display_name, username: m.username, avatarUrl: m.avatar_url, color: m.color, role: m.role,
          controls: isParent || m.user_id === me.id ? readControls(m.role, m.controls) : undefined,
          sharing: !!shared, battery: m.battery, charging: !!m.charging, updated: m.updated,
          at: shared ? placeName(m.inside) : null,
          live: shared && m.lat != null ? { lat: m.lat, lng: m.lng, speed: m.speed || 0, driving: !!m.driving } : null,
        };
      }),
      places: places.map((p) => ({ id: p.id, name: p.name, emoji: p.emoji, lat: p.lat, lng: p.lng, radius: p.radius })),
      events: events.filter((e) => isParent || !PARENT_ONLY.has(e.kind) || e.user_id === me.id)
        .map((e) => ({ id: e.id, kind: e.kind, text: e.text, who: e.display_name, userId: e.user_id, lat: e.lat, lng: e.lng, at: e.created })),
    });
  }

  if (path === "/family" && method === "POST") {
    if (mine) throw new FamilyError(409, "You're already in a family. Leave it first to start a new one.");
    const id = rid();
    const name = String(body.name || "").trim().slice(0, 40) || `${me.display_name || "My"} family`;
    await db.batch([
      db.prepare("INSERT INTO families (id, name, owner_id, created) VALUES (?, ?, ?, ?)").bind(id, name, me.id, Date.now()),
      db.prepare("INSERT INTO family_members (user_id, family_id, role, joined) VALUES (?, ?, 'parent', ?)").bind(me.id, id, Date.now()),
    ]);
    return json({ ok: true, id });
  }

  if (path === "/family/invite" && method === "POST") {
    need();
    const role = ROLES.includes(body.role) ? body.role : "adult";
    if (!isParent && role !== "adult") throw new FamilyError(403, "Only a parent can add teen or kid accounts.");
    if (role === "parent" && !isParent) throw new FamilyError(403, "Only a parent can add another parent.");
    const code = code6();
    await db.prepare("INSERT INTO family_invites (code, family_id, role, created_by, expires) VALUES (?, ?, ?, ?, ?)").bind(code, mine.family_id, role, me.id, Date.now() + 7 * 86400000).run();
    return json({ code, role, expires: Date.now() + 7 * 86400000 });
  }

  if (path === "/family/join" && method === "POST") {
    if (mine) throw new FamilyError(409, "You're already in a family. Leave it first.");
    const inv = await db.prepare("SELECT * FROM family_invites WHERE code = ? AND expires > ?").bind(String(body.code || "").trim().toUpperCase(), Date.now()).first();
    if (!inv) throw new FamilyError(404, "That code didn't work. Ask for a new one (codes last 7 days).");
    const controls = DEFAULT_CONTROLS[inv.role] ? JSON.stringify(DEFAULT_CONTROLS[inv.role]) : null;
    await db.prepare("INSERT INTO family_members (user_id, family_id, role, controls, joined) VALUES (?, ?, ?, ?, ?)").bind(me.id, inv.family_id, inv.role, controls, Date.now()).run();
    await db.prepare("DELETE FROM family_invites WHERE code = ?").bind(inv.code).run();
    await applyVisibility(db, me.id, readControls(inv.role, controls));
    await addEvent(db, inv.family_id, me.id, "join", `${me.display_name || "Someone"} joined the family`);
    return json({ ok: true, role: inv.role });
  }

  if (path === "/family/leave" && method === "POST") {
    need();
    if (YOUNG.has(mine.role) && mine.pin_hash && !(await pinOk(mine, body.pin))) throw new FamilyError(403, "A parent's PIN is needed to leave.");
    const { results: others } = await db.prepare("SELECT user_id, role FROM family_members WHERE family_id = ? AND user_id != ?").bind(mine.family_id, me.id).all();
    if (isParent && others.length && !others.some((o) => o.role === "parent")) throw new FamilyError(400, "Make someone else a parent before you leave, or remove everyone first.");
    await db.prepare("DELETE FROM family_members WHERE user_id = ?").bind(me.id).run();
    if (!others.length) {
      await db.batch(["families WHERE id", "family_places WHERE family_id", "family_invites WHERE family_id", "family_events WHERE family_id"].map((t) => db.prepare(`DELETE FROM ${t} = ?`).bind(mine.family_id)));
    } else {
      if (mine.owner_id === me.id) await db.prepare("UPDATE families SET owner_id = ? WHERE id = ?").bind(others.find((o) => o.role === "parent").user_id, mine.family_id).run();
      await addEvent(db, mine.family_id, me.id, "leave_family", `${me.display_name || "Someone"} left the family`);
    }
    return json({ ok: true });
  }

  if (path === "/family/member" && method === "PATCH") {
    needParent();
    const target = await db.prepare("SELECT * FROM family_members WHERE user_id = ? AND family_id = ?").bind(String(body.userId || ""), mine.family_id).first();
    if (!target) throw new FamilyError(404, "Not in your family.");
    let role = target.role;
    if (body.role && ROLES.includes(body.role)) {
      if (target.user_id === me.id && body.role !== "parent") {
        const { results } = await db.prepare("SELECT user_id FROM family_members WHERE family_id = ? AND role = 'parent' AND user_id != ?").bind(mine.family_id, me.id).all();
        if (!results.length) throw new FamilyError(400, "Your family needs at least one parent.");
      }
      role = body.role;
    }
    let controls = readControls(role, role === target.role ? target.controls : null);
    if (controls && body.controls && typeof body.controls === "object") {
      for (const k of Object.keys(DEFAULT_CONTROLS.kid)) if (typeof body.controls[k] === "boolean") controls[k] = body.controls[k];
    }
    await db.prepare("UPDATE family_members SET role = ?, controls = ? WHERE user_id = ?").bind(role, controls ? JSON.stringify(controls) : null, target.user_id).run();
    await applyVisibility(db, target.user_id, controls);
    return json({ ok: true, role, controls });
  }

  if (path === "/family/remove" && method === "POST") {
    needParent();
    const id = String(body.userId || "");
    if (id === me.id) throw new FamilyError(400, "Use Leave to remove yourself.");
    await db.prepare("DELETE FROM family_members WHERE user_id = ? AND family_id = ?").bind(id, mine.family_id).run();
    return json({ ok: true });
  }

  if (path === "/family/sharing" && method === "POST") {
    need();
    if (YOUNG.has(mine.role)) throw new FamilyError(403, "Location sharing stays on for teen and kid accounts. A parent can change your account type.");
    await db.prepare("UPDATE family_members SET sharing = ? WHERE user_id = ?").bind(body.on ? 1 : 0, me.id).run();
    return json({ ok: true });
  }

  // Phone check-in: position, battery, driving. Works out arrive/leave for saved places.
  if (path === "/family/ping" && method === "POST") {
    if (!mine) return json({ family: false });
    const lat = +body.lat, lng = +body.lng;
    const has = isFinite(lat) && isFinite(lng) && (lat || lng);
    const battery = isFinite(+body.battery) && body.battery !== null ? Math.max(0, Math.min(1, +body.battery)) : null;
    let inside = [];
    try { inside = JSON.parse(mine.inside || "[]"); } catch { inside = []; }
    if (has && (mine.sharing || YOUNG.has(mine.role))) {
      const { results: places } = await db.prepare("SELECT * FROM family_places WHERE family_id = ?").bind(mine.family_id).all();
      const next = [];
      for (const p of places) {
        const d = meters([lat, lng], [p.lat, p.lng]);
        const was = inside.includes(p.id);
        if (d <= p.radius || (was && d <= p.radius * 1.4)) next.push(p.id);
        if (!was && d <= p.radius) await addEvent(db, mine.family_id, me.id, "arrive", `${me.display_name || "Someone"} arrived at ${p.name}`, lat, lng);
        if (was && d > p.radius * 1.4) await addEvent(db, mine.family_id, me.id, "leave", `${me.display_name || "Someone"} left ${p.name}`, lat, lng);
      }
      inside = next;
      await db.prepare("UPDATE family_members SET lat = ?, lng = ?, speed = ?, driving = ?, battery = COALESCE(?, battery), charging = ?, inside = ?, updated = ? WHERE user_id = ?")
        .bind(lat, lng, Math.round(+body.speed || 0), body.driving ? 1 : 0, battery, body.charging ? 1 : 0, JSON.stringify(inside), Date.now(), me.id).run();
    } else if (battery != null) {
      await db.prepare("UPDATE family_members SET battery = ?, charging = ?, updated = ? WHERE user_id = ?").bind(battery, body.charging ? 1 : 0, Date.now(), me.id).run();
    }
    // New events for this person since they last looked (for in-app alerts).
    const since = +url.searchParams.get("since") || Date.now() - 120000;
    const { results } = await db.prepare("SELECT e.*, u.display_name FROM family_events e JOIN users u ON u.id = e.user_id WHERE e.family_id = ? AND e.created > ? AND e.user_id != ? ORDER BY e.created LIMIT 20").bind(mine.family_id, since, me.id).all();
    return json({ family: true, events: results.filter((e) => isParent || !PARENT_ONLY.has(e.kind)).map((e) => ({ id: e.id, kind: e.kind, text: e.text, lat: e.lat, lng: e.lng, at: e.created })), now: Date.now() });
  }

  if (path === "/family/places" && method === "POST") {
    need();
    const lat = +body.lat, lng = +body.lng;
    if (!isFinite(lat) || !isFinite(lng)) throw new FamilyError(400, "Pick a spot for the place.");
    const name = String(body.name || "").trim().slice(0, 40);
    if (!name) throw new FamilyError(400, "Give the place a name, like Home or School.");
    const radius = Math.max(60, Math.min(800, Math.round(+body.radius || 150)));
    const id = rid();
    await db.prepare("INSERT INTO family_places (id, family_id, name, emoji, lat, lng, radius, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, mine.family_id, name, String(body.emoji || "📍").slice(0, 4), lat, lng, radius, me.id).run();
    return json({ ok: true, id });
  }
  const pl = path.match(/^\/family\/places\/([a-f0-9]{24})$/);
  if (pl && method === "DELETE") {
    need();
    await db.prepare("DELETE FROM family_places WHERE id = ? AND family_id = ?").bind(pl[1], mine.family_id).run();
    return json({ ok: true });
  }

  if (path === "/family/checkin" && method === "POST") {
    need();
    const lat = isFinite(+body.lat) ? +body.lat : null, lng = isFinite(+body.lng) ? +body.lng : null;
    const note = String(body.note || "").trim().slice(0, 80);
    await addEvent(db, mine.family_id, me.id, "checkin", `${me.display_name || "Someone"} checked in: ${note || "I'm here and safe"}`, lat, lng);
    return json({ ok: true });
  }
  if (path === "/family/sos" && method === "POST") {
    need();
    const lat = isFinite(+body.lat) ? +body.lat : null, lng = isFinite(+body.lng) ? +body.lng : null;
    await addEvent(db, mine.family_id, me.id, "sos", `🚨 ${me.display_name || "Someone"} needs help${lat != null ? " — tap to see where" : ""}`, lat, lng);
    return json({ ok: true });
  }
  // Teen-driver alerts (sent by the teen's own phone while driving). Parents see these.
  if (path === "/family/alert" && method === "POST") {
    need();
    if (!YOUNG.has(mine.role)) return json({ ok: true, skipped: true });
    const kind = ["speeding", "hard_brake", "phone"].includes(body.kind) ? body.kind : null;
    if (!kind) throw new FamilyError(400, "Unknown alert.");
    const recent = await db.prepare("SELECT id FROM family_events WHERE user_id = ? AND kind = ? AND created > ?").bind(me.id, kind, Date.now() - 5 * 60000).first();
    if (recent) return json({ ok: true, skipped: true });
    const n = me.display_name || "Your teen";
    const text = kind === "speeding" ? `${n} was speeding: ${Math.round(+body.speed || 0)} mph in a ${Math.round(+body.limit || 0)} zone`
      : kind === "hard_brake" ? `${n} braked hard` : `${n} was using the phone while driving (${Math.round(+body.speed || 0)} mph)`;
    await addEvent(db, mine.family_id, me.id, kind, text, isFinite(+body.lat) ? +body.lat : null, isFinite(+body.lng) ? +body.lng : null);
    return json({ ok: true });
  }

  // Parent PIN that locks teen/kid settings.
  if (path === "/family/pin" && method === "POST") {
    needParent();
    const pin = String(body.pin || "");
    if (pin && !/^\d{4,8}$/.test(pin)) throw new FamilyError(400, "Use 4 to 8 digits.");
    await db.prepare("UPDATE families SET pin_hash = ? WHERE id = ?").bind(pin ? await sha(`${mine.family_id}:${pin}`) : null, mine.family_id).run();
    return json({ ok: true, pinSet: !!pin });
  }
  if (path === "/family/unlock" && method === "POST") {
    need();
    if (!(await pinOk(mine, body.pin))) throw new FamilyError(403, "Wrong PIN.");
    return json({ ok: true });
  }

  // A parent looking at a teen/kid's recent drives.
  const tr = path.match(/^\/family\/trips\/([a-z0-9]{6,40})$/);
  if (tr && method === "GET") {
    needParent();
    const t = await db.prepare("SELECT role FROM family_members WHERE user_id = ? AND family_id = ?").bind(tr[1], mine.family_id).first();
    if (!t || !YOUNG.has(t.role)) throw new FamilyError(403, "Drives are shared for teen and kid accounts only.");
    const { results } = await db.prepare("SELECT id, data, created_date FROM records WHERE entity = 'Trip' AND owner_id = ? ORDER BY created_date DESC LIMIT 20").bind(tr[1]).all();
    return json({ trips: results.map((r) => { const d = JSON.parse(r.data || "{}"); return { id: r.id, title: d.title, start: d.start_time, end_location: d.end_location, start_location: d.start_location, distance: d.distance, duration: d.duration, top_speed: d.top_speed, avg_speed: d.avg_speed, hard_brakes: d.hard_brakes, smoothness: d.smoothness }; }) });
  }

  throw new FamilyError(404, "Not found");
}

async function pinOk(mine, pin) {
  if (!mine.pin_hash) return true;
  return (await sha(`${mine.family_id}:${String(pin || "")}`)) === mine.pin_hash;
}
