// Drivez API: accounts, sign-in (email, Google, Discord, Facebook), data, friends,
// live locations, leaderboard and Discord sharing. Runs on Cloudflare Workers + D1.
import { SCHEMA } from "./schema.js";
import { FILES } from "./static/index.js";

const ENTITIES = new Set(["Vehicle", "Trip", "Route", "Place"]);
const BODY_TYPES = new Set(["sports", "sedan", "suv", "truck", "moto"]);
const SESSION_COOKIE = "dz_session";
const SESSION_DAYS = 60;
const LIVE_FRESH_MS = 2 * 60 * 1000;

const OAUTH = {
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
    async profile(accessToken) {
      const u = await getJSON("https://openidconnect.googleapis.com/v1/userinfo", accessToken);
      return { id: u.sub, email: u.email, name: u.name, avatar: u.picture };
    },
  },
  discord: {
    authorize: "https://discord.com/oauth2/authorize",
    token: "https://discord.com/api/oauth2/token",
    scope: "identify email",
    async profile(accessToken) {
      const u = await getJSON("https://discord.com/api/users/@me", accessToken);
      return {
        id: u.id, email: u.email, name: u.global_name || u.username, username: u.username,
        avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=256` : null,
      };
    },
  },
  facebook: {
    authorize: "https://www.facebook.com/v19.0/dialog/oauth",
    token: "https://graph.facebook.com/v19.0/oauth/access_token",
    scope: "email,public_profile",
    async profile(accessToken) {
      const u = await getJSON(`https://graph.facebook.com/me?fields=id,name,email,picture.width(256)&access_token=${encodeURIComponent(accessToken)}`);
      return { id: u.id, email: u.email, name: u.name, avatar: u.picture?.data?.url };
    },
  },
};

// ---------- helpers ----------
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const json = (o, status = 200, headers = {}) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", ...headers } });
const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 24);
const token = () => [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const COLORS = ["#00BFFF", "#39FF14", "#FF4757", "#FF6B35", "#9B59B6", "#F39C12", "#1ABC9C", "#E84393"];

async function getJSON(url, bearer) {
  const r = await fetch(url, { headers: bearer ? { authorization: `Bearer ${bearer}` } : {} });
  if (!r.ok) throw new HttpError(502, "Sign-in service refused the request");
  return r.json();
}

async function hashPassword(pw, saltB64) {
  const salt = saltB64 ? unb64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, key, 256);
  return `pbkdf2$100000$${b64(salt)}$${b64(new Uint8Array(bits))}`;
}
async function checkPassword(pw, stored) {
  if (!stored) return false;
  const [, , salt] = stored.split("$");
  const again = await hashPassword(pw, salt);
  if (again.length !== stored.length) return false;
  let diff = 0;
  for (let i = 0; i < again.length; i++) diff |= again.charCodeAt(i) ^ stored.charCodeAt(i);
  return diff === 0;
}

function cookies(req) {
  const out = {};
  for (const part of (req.headers.get("cookie") || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function sessionCookie(value, maxAge) {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function publicUser(u) {
  return {
    id: u.id, email: u.email, full_name: u.display_name, display_name: u.display_name, username: u.username,
    bio: u.bio || "", location: u.location || "", ghost_mode: !!u.ghost_mode, avatar_url: u.avatar_url,
    color: u.color, created_date: u.created_date, role: "user",
    discord_connected: !!u.discord_id, discord_webhook_set: !!u.discord_webhook, discord_auto: !!u.discord_auto,
    has_password: !!u.password_hash,
  };
}
const card = (u) => ({ userId: u.id, id: u.id, name: u.display_name, username: u.username, avatarUrl: u.avatar_url, color: u.color });

function cleanUsername(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24) || "driver";
}
async function uniqueUsername(db, base) {
  let name = cleanUsername(base);
  for (let i = 0; i < 20; i++) {
    const taken = await db.prepare("SELECT 1 FROM users WHERE username = ?").bind(name).first();
    if (!taken) return name;
    name = `${cleanUsername(base).slice(0, 18)}${Math.floor(Math.random() * 9000 + 1000)}`;
  }
  return `driver${Date.now()}`;
}

async function createUser(db, { email, name, username, passwordHash = null, avatar = null, provider = null, providerId = null }) {
  const id = uid();
  const uname = await uniqueUsername(db, username || (email || name || "driver").split("@")[0]);
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  await db.prepare(
    `INSERT INTO users (id, email, password_hash, display_name, username, avatar_url, color, created_date${provider ? `, ${provider}_id` : ""})
     VALUES (?, ?, ?, ?, ?, ?, ?, ?${provider ? ", ?" : ""})`
  ).bind(...[id, email ? email.toLowerCase() : null, passwordHash, name || uname, uname, avatar, color, now(), ...(provider ? [providerId] : [])]).run();
  return db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
}

async function startSession(db, userId) {
  const t = token();
  const expires = Date.now() + SESSION_DAYS * 86400000;
  await db.prepare("INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)").bind(t, userId, expires).run();
  return sessionCookie(t, SESSION_DAYS * 86400);
}

async function currentUser(req, db) {
  const t = cookies(req)[SESSION_COOKIE];
  if (!t) return null;
  const row = await db.prepare("SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires > ?").bind(t, Date.now()).first();
  return row || null;
}

function providerReady(env, p) {
  const P = p.toUpperCase();
  return !!(env[`${P}_CLIENT_ID`] && env[`${P}_CLIENT_SECRET`]);
}

function parseRecord(r) {
  const data = JSON.parse(r.data || "{}");
  return { ...data, id: r.id, created_by_id: r.owner_id, created_by: r.owner_email, created_date: r.created_date, updated_date: r.updated_date };
}

async function friendIds(db, userId) {
  const { results } = await db.prepare(
    "SELECT CASE WHEN requester_id = ?1 THEN addressee_id ELSE requester_id END AS fid FROM friends WHERE status = 'accepted' AND (requester_id = ?1 OR addressee_id = ?1)"
  ).bind(userId).all();
  return results.map((r) => r.fid);
}

// ---------- road reports ----------
const MIN = 60 * 1000;
const REPORT_LIFETIME = { police: 45 * MIN, crash: 90 * MIN, hazard: 120 * MIN, traffic: 45 * MIN, closure: 240 * MIN };

// "Still there" extends a report; two "not there" votes (or more than confirms) remove it.
async function vote(db, reportId, userId, stillThere, type) {
  const prev = await db.prepare("SELECT still_there FROM report_votes WHERE report_id = ? AND user_id = ?").bind(reportId, userId).first();
  if (prev && !!prev.still_there === stillThere) return;
  const stmts = [db.prepare("INSERT INTO report_votes (report_id, user_id, still_there) VALUES (?, ?, ?) ON CONFLICT(report_id, user_id) DO UPDATE SET still_there = excluded.still_there").bind(reportId, userId, stillThere ? 1 : 0)];
  const undo = prev ? (prev.still_there ? "confirms = confirms - 1, " : "dismissals = dismissals - 1, ") : "";
  if (stillThere) stmts.push(db.prepare(`UPDATE reports SET ${undo}confirms = confirms + 1, expires = MAX(expires, ?) WHERE id = ?`).bind(Date.now() + REPORT_LIFETIME[type], reportId));
  else stmts.push(db.prepare(`UPDATE reports SET ${undo}dismissals = dismissals + 1 WHERE id = ?`).bind(reportId));
  await db.batch(stmts);
  await db.prepare("DELETE FROM reports WHERE id = ? AND dismissals >= 2 AND dismissals > confirms").bind(reportId).run();
}

// ---------- Discord ----------
function validWebhook(url) {
  return /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(String(url || "").trim());
}
function fmtDuration(s) {
  s = Math.round(s || 0);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}h ${m}m` : m ? `${m}m ${sec}s` : `${sec}s`;
}
async function postTripToDiscord(webhook, user, trip, vehicle, origin) {
  const icon = user.avatar_url ? new URL(user.avatar_url, origin || "https://drivez.invalid").href : undefined;
  const embed = {
    title: `🏁 ${trip.title || "Drive"}`,
    description: [trip.start_location, trip.end_location].filter(Boolean).join(" → ") || undefined,
    color: parseInt(String(user.color || "#00BFFF").slice(1), 16),
    author: { name: `${user.display_name} on Drivez`, icon_url: icon },
    fields: [
      { name: "Distance", value: `${trip.distance ?? 0} mi`, inline: true },
      { name: "Top speed", value: `${trip.top_speed ?? 0} mph`, inline: true },
      { name: "Avg speed", value: `${trip.avg_speed ?? 0} mph`, inline: true },
      { name: "Duration", value: fmtDuration(trip.duration), inline: true },
      ...(vehicle ? [{ name: "Vehicle", value: `${vehicle.year || ""} ${vehicle.make} ${vehicle.model}${vehicle.nickname ? ` "${vehicle.nickname}"` : ""}`.trim(), inline: true }] : []),
    ],
    timestamp: trip.end_time || now(),
    footer: { text: "Drivez" },
  };
  const r = await fetch(`${webhook}?wait=true`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "Drivez", embeds: [embed] }),
  });
  if (!r.ok) throw new HttpError(502, `Discord rejected the post (${r.status}). Check the webhook link.`);
}

// ---------- routes ----------
async function handleApi(req, env, ctx, url) {
  const db = env.DB;
  const path = url.pathname.replace(/^\/api/, "");
  const method = req.method;
  const body = ["POST", "PATCH", "PUT"].includes(method) ? await req.json().catch(() => ({})) : {};

  // --- public auth endpoints ---
  if (path === "/auth/config") {
    return json({
      providers: ["google", "discord", "facebook"].filter((p) => providerReady(env, p)),
      emailReset: !!(env.RESEND_API_KEY && env.RESEND_FROM),
    });
  }

  if (path === "/auth/register" && method === "POST") {
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "Enter a valid email address.");
    if (password.length < 8) throw new HttpError(400, "Use at least 8 characters for your password.");
    const exists = await db.prepare("SELECT id, password_hash FROM users WHERE email = ?").bind(email).first();
    if (exists) throw new HttpError(409, exists.password_hash ? "That email already has an account. Log in instead." : "That email signed up with Google, Discord or Facebook. Use that button to log in.");
    const user = await createUser(db, { email, name: String(body.name || "").trim().slice(0, 60), passwordHash: await hashPassword(password) });
    return json({ user: publicUser(user) }, 200, { "set-cookie": await startSession(db, user.id) });
  }

  if (path === "/auth/login" && method === "POST") {
    const email = String(body.email || "").trim().toLowerCase();
    const user = await db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
    if (!user || !(await checkPassword(String(body.password || ""), user.password_hash))) throw new HttpError(401, "Wrong email or password.");
    return json({ user: publicUser(user) }, 200, { "set-cookie": await startSession(db, user.id) });
  }

  if (path === "/auth/logout" && method === "POST") {
    const t = cookies(req)[SESSION_COOKIE];
    if (t) await db.prepare("DELETE FROM sessions WHERE token = ?").bind(t).run();
    return json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) });
  }

  if (path === "/auth/forgot" && method === "POST") {
    if (!env.RESEND_API_KEY || !env.RESEND_FROM) throw new HttpError(501, "Password reset emails aren't set up yet.");
    const email = String(body.email || "").trim().toLowerCase();
    const user = await db.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
    if (user) {
      const t = token();
      await db.prepare("INSERT INTO resets (token, user_id, expires) VALUES (?, ?, ?)").bind(t, user.id, Date.now() + 3600000).run();
      const link = `${url.origin}/reset-password?token=${t}`;
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ from: env.RESEND_FROM, to: email, subject: "Reset your Drivez password", html: `<p>Tap to choose a new Drivez password (valid for 1 hour):</p><p><a href="${link}">${link}</a></p><p>If you didn't ask for this, ignore this email.</p>` }),
      });
    }
    return json({ ok: true });
  }

  if (path === "/auth/reset" && method === "POST") {
    const row = await db.prepare("SELECT user_id FROM resets WHERE token = ? AND expires > ?").bind(String(body.token || ""), Date.now()).first();
    if (!row) throw new HttpError(400, "That reset link is invalid or has expired.");
    if (String(body.password || "").length < 8) throw new HttpError(400, "Use at least 8 characters.");
    await db.batch([
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(await hashPassword(String(body.password)), row.user_id),
      db.prepare("DELETE FROM resets WHERE user_id = ?").bind(row.user_id),
      db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(row.user_id),
    ]);
    return json({ ok: true });
  }

  // --- OAuth (Google / Discord / Facebook) ---
  const oauth = path.match(/^\/auth\/oauth\/(google|discord|facebook)\/(start|callback)$/);
  if (oauth) {
    const [, provider, step] = oauth;
    const P = provider.toUpperCase();
    if (!providerReady(env, provider)) return Response.redirect(`${url.origin}/login?error=${encodeURIComponent(`${provider} sign-in isn't set up yet.`)}`, 302);
    const cfg = OAUTH[provider];
    const redirectUri = `${url.origin}/api/auth/oauth/${provider}/callback`;
    if (step === "start") {
      const state = token();
      const next = (url.searchParams.get("next") || "/").startsWith("/") ? url.searchParams.get("next") || "/" : "/";
      await db.prepare("INSERT INTO oauth_states (state, provider, next, expires) VALUES (?, ?, ?, ?)").bind(state, provider, next, Date.now() + 600000).run();
      const q = new URLSearchParams({ client_id: env[`${P}_CLIENT_ID`], redirect_uri: redirectUri, response_type: "code", scope: cfg.scope, state });
      if (provider === "google") q.set("prompt", "select_account");
      return Response.redirect(`${cfg.authorize}?${q}`, 302);
    }
    const fail = (msg) => Response.redirect(`${url.origin}/login?error=${encodeURIComponent(msg)}`, 302);
    const st = await db.prepare("SELECT * FROM oauth_states WHERE state = ? AND provider = ? AND expires > ?").bind(url.searchParams.get("state") || "", provider, Date.now()).first();
    if (!st || !url.searchParams.get("code")) return fail("Sign-in was cancelled or expired. Try again.");
    await db.prepare("DELETE FROM oauth_states WHERE state = ?").bind(st.state).run();
    const tokenRes = await fetch(cfg.token, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ client_id: env[`${P}_CLIENT_ID`], client_secret: env[`${P}_CLIENT_SECRET`], code: url.searchParams.get("code"), grant_type: "authorization_code", redirect_uri: redirectUri }),
    });
    const tok = await tokenRes.json().catch(() => ({}));
    if (!tok.access_token) return fail(`${provider} sign-in failed. Try again.`);
    const prof = await cfg.profile(tok.access_token);
    const col = `${provider}_id`;
    const existingSession = await currentUser(req, db);
    let user = await db.prepare(`SELECT * FROM users WHERE ${col} = ?`).bind(prof.id).first();
    if (existingSession && (!user || user.id === existingSession.id)) {
      // Linking a service to the account that's already signed in.
      await db.prepare(`UPDATE users SET ${col} = ?, avatar_url = COALESCE(avatar_url, ?) WHERE id = ?`).bind(prof.id, prof.avatar || null, existingSession.id).run();
      return Response.redirect(`${url.origin}${st.next}`, 302);
    }
    if (!user && prof.email) {
      user = await db.prepare("SELECT * FROM users WHERE email = ?").bind(prof.email.toLowerCase()).first();
      if (user) await db.prepare(`UPDATE users SET ${col} = ?, avatar_url = COALESCE(avatar_url, ?) WHERE id = ?`).bind(prof.id, prof.avatar || null, user.id).run();
    }
    if (!user) user = await createUser(db, { email: prof.email, name: prof.name, username: prof.username || prof.name, avatar: prof.avatar, provider, providerId: prof.id });
    return new Response(null, { status: 302, headers: { location: `${url.origin}${st.next}`, "set-cookie": await startSession(db, user.id) } });
  }

  // Profile pictures are public so friends, the map and Discord can show them.
  const av = path.match(/^\/avatar\/([A-Za-z0-9_-]+)$/);
  if (av && method === "GET") {
    const row = await db.prepare("SELECT mime, data FROM avatars WHERE user_id = ?").bind(av[1]).first();
    if (!row) throw new HttpError(404, "No picture");
    return new Response(new Uint8Array(row.data), { headers: { "content-type": row.mime, "cache-control": "public, max-age=31536000, immutable" } });
  }

  // --- everything below needs a signed-in user ---
  const me = await currentUser(req, db);
  if (!me) throw new HttpError(401, "Please log in.");

  if (path === "/auth/me") {
    if (method === "GET") return json(publicUser(me));
    if (method === "PATCH") {
      const sets = [], vals = [];
      const map = { display_name: 60, bio: 300, location: 80 };
      for (const [k, max] of Object.entries(map)) if (body[k] != null) { sets.push(`${k} = ?`); vals.push(String(body[k]).trim().slice(0, max)); }
      if (body.username != null) {
        const u = cleanUsername(body.username);
        const taken = await db.prepare("SELECT id FROM users WHERE username = ? AND id != ?").bind(u, me.id).first();
        if (taken) throw new HttpError(409, `@${u} is taken. Try another username.`);
        sets.push("username = ?"); vals.push(u);
      }
      if (body.ghost_mode != null) { sets.push("ghost_mode = ?"); vals.push(body.ghost_mode ? 1 : 0); if (body.ghost_mode) await db.prepare("DELETE FROM live_pos WHERE user_id = ?").bind(me.id).run(); }
      if (body.discord_webhook !== undefined) {
        const w = String(body.discord_webhook || "").trim();
        if (w && !validWebhook(w)) throw new HttpError(400, "That doesn't look like a Discord webhook link. It should start with https://discord.com/api/webhooks/");
        sets.push("discord_webhook = ?"); vals.push(w || null);
      }
      if (body.discord_auto != null) { sets.push("discord_auto = ?"); vals.push(body.discord_auto ? 1 : 0); }
      if (sets.length) await db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, me.id).run();
      return json(publicUser(await db.prepare("SELECT * FROM users WHERE id = ?").bind(me.id).first()));
    }
  }

  if (path === "/me/avatar" && method === "POST") {
    const mime = String(body.mime || "");
    if (!/^image\/(jpeg|png|webp)$/.test(mime)) throw new HttpError(400, "Use a JPG, PNG or WebP picture.");
    let bytes;
    try { bytes = Uint8Array.from(atob(String(body.data || "")), (c) => c.charCodeAt(0)); } catch { throw new HttpError(400, "That picture couldn't be read."); }
    if (!bytes.length) throw new HttpError(400, "That picture is empty.");
    if (bytes.length > 700 * 1024) throw new HttpError(413, "That picture is too big. Try a smaller one.");
    const t = Date.now();
    await db.batch([
      db.prepare("INSERT INTO avatars (user_id, mime, data, updated) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET mime = excluded.mime, data = excluded.data, updated = excluded.updated").bind(me.id, mime, bytes, t),
      db.prepare("UPDATE users SET avatar_url = ? WHERE id = ?").bind(`/api/avatar/${me.id}?v=${t}`, me.id),
    ]);
    return json(publicUser(await db.prepare("SELECT * FROM users WHERE id = ?").bind(me.id).first()));
  }
  if (path === "/me/avatar" && method === "DELETE") {
    await db.batch([
      db.prepare("DELETE FROM avatars WHERE user_id = ?").bind(me.id),
      db.prepare("UPDATE users SET avatar_url = NULL WHERE id = ?").bind(me.id),
    ]);
    return json(publicUser(await db.prepare("SELECT * FROM users WHERE id = ?").bind(me.id).first()));
  }

  if (path === "/auth/unlink" && method === "POST") {
    const p = String(body.provider || "");
    if (!OAUTH[p]) throw new HttpError(400, "Unknown service");
    const linked = ["google", "discord", "facebook"].filter((x) => me[`${x}_id`]).length;
    if (!me.password_hash && linked <= 1) throw new HttpError(400, "That's your only way to log in, so it can't be disconnected.");
    await db.prepare(`UPDATE users SET ${p}_id = NULL WHERE id = ?`).bind(me.id).run();
    return json({ ok: true });
  }

  // --- bulk import of saved places and drives (Google Maps, Waze, GPX/KML files) ---
  if (path === "/import" && method === "POST") {
    const places = Array.isArray(body.places) ? body.places.slice(0, 2000) : [];
    const trips = Array.isArray(body.trips) ? body.trips.slice(0, 1000) : [];
    const num = (v) => (Number.isFinite(+v) ? +v : null);
    const str = (v, max) => (v == null ? "" : String(v).slice(0, max));
    const keys = [...places, ...trips].map((x) => str(x.import_key, 200)).filter(Boolean);
    const seen = new Set();
    for (let i = 0; i < keys.length; i += 90) {
      const chunk = keys.slice(i, i + 90);
      const { results } = await db.prepare(
        `SELECT json_extract(data, '$.import_key') AS k FROM records WHERE owner_id = ? AND entity IN ('Place','Trip') AND json_extract(data, '$.import_key') IN (${chunk.map(() => "?").join(",")})`
      ).bind(me.id, ...chunk).all();
      for (const r of results) seen.add(r.k);
    }
    const stmts = [];
    const insert = (entity, data, created) => {
      if (!data.import_key || seen.has(data.import_key)) return false;
      seen.add(data.import_key);
      stmts.push(db.prepare("INSERT INTO records (id, entity, owner_id, data, created_date, updated_date) VALUES (?, ?, ?, ?, ?, ?)").bind(uid(), entity, me.id, JSON.stringify(data), created, now()));
      return true;
    };
    let addedPlaces = 0, addedTrips = 0;
    for (const p of places) {
      const lat = num(p.lat), lng = num(p.lng);
      if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
      if (insert("Place", { name: str(p.name, 120) || "Saved place", address: str(p.address, 200), lat, lng, list: str(p.list, 60), note: str(p.note, 300), source: str(p.source, 20), import_key: str(p.import_key, 200) }, now())) addedPlaces++;
    }
    for (const t of trips) {
      const start = new Date(t.start_time);
      if (Number.isNaN(start.getTime())) continue;
      const pts = (Array.isArray(t.route_points) ? t.route_points : []).slice(0, 400)
        .map((p) => ({ lat: num(p.lat), lng: num(p.lng), speed: num(p.speed) ?? 0 })).filter((p) => p.lat != null && p.lng != null);
      if (pts.length < 2) continue;
      const data = {
        title: str(t.title, 80) || "Drive", start_time: start.toISOString(), end_time: t.end_time ? new Date(t.end_time).toISOString() : null,
        distance: Math.max(0, Math.round((num(t.distance) || 0) * 10) / 10), duration: Math.max(0, Math.round(num(t.duration) || 0)),
        top_speed: 0, avg_speed: Math.max(0, Math.round(num(t.avg_speed) || 0)), vehicle_id: null, route_points: pts,
        start_location: str(t.start_location, 120), end_location: str(t.end_location, 120), source: str(t.source, 20), imported: true, import_key: str(t.import_key, 200),
      };
      if (insert("Trip", data, data.start_time)) addedTrips++;
    }
    for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
    return json({ places: addedPlaces, trips: addedTrips, skipped: places.length + trips.length - addedPlaces - addedTrips });
  }

  // --- generic records: Vehicle, Trip, Route, Place ---
  const ent = path.match(/^\/entities\/(\w+)(?:\/(\w+))?$/);
  if (ent && ENTITIES.has(ent[1])) {
    const [, name, id] = ent;
    if (method === "GET" && !id) {
      const limit = Math.min(+url.searchParams.get("limit") || 100, name === "Place" ? 5000 : 500);
      const q = name === "Route"
        ? db.prepare(`SELECT r.*, u.email AS owner_email FROM records r JOIN users u ON u.id = r.owner_id
            WHERE r.entity = 'Route' AND (r.owner_id = ?1 OR EXISTS (SELECT 1 FROM json_each(r.data, '$.shared_with') WHERE lower(value) = ?2))
            ORDER BY r.created_date DESC LIMIT ?3`).bind(me.id, (me.email || "").toLowerCase(), limit)
        : db.prepare(`SELECT r.*, ?3 AS owner_email FROM records r WHERE r.entity = ?1 AND r.owner_id = ?2 ORDER BY r.created_date DESC LIMIT ?4`).bind(name, me.id, me.email, limit);
      const { results } = await q.all();
      return json(results.map(parseRecord));
    }
    if (method === "POST" && !id) {
      const rid = uid(), t = now();
      const data = { ...body };
      delete data.id;
      if (name === "Route" && Array.isArray(data.shared_with)) data.shared_with = data.shared_with.map((e) => String(e).toLowerCase());
      await db.prepare("INSERT INTO records (id, entity, owner_id, data, created_date, updated_date) VALUES (?, ?, ?, ?, ?, ?)").bind(rid, name, me.id, JSON.stringify(data), t, t).run();
      if (name === "Trip" && me.discord_auto && me.discord_webhook) {
        const vehicle = data.vehicle_id ? await db.prepare("SELECT data FROM records WHERE id = ? AND owner_id = ?").bind(data.vehicle_id, me.id).first() : null;
        ctx.waitUntil(postTripToDiscord(me.discord_webhook, me, data, vehicle ? JSON.parse(vehicle.data) : null, url.origin).catch(() => {}));
      }
      await db.prepare("DELETE FROM live_pos WHERE user_id = ?").bind(me.id).run();
      return json({ ...data, id: rid, created_by_id: me.id, created_by: me.email, created_date: t, updated_date: t });
    }
    const row = id ? await db.prepare("SELECT * FROM records WHERE id = ? AND entity = ? AND owner_id = ?").bind(id, name, me.id).first() : null;
    if (!row) throw new HttpError(404, "Not found");
    if (method === "PATCH") {
      const data = { ...JSON.parse(row.data), ...body };
      if (name === "Route" && Array.isArray(data.shared_with)) data.shared_with = data.shared_with.map((e) => String(e).toLowerCase());
      const t = now();
      await db.prepare("UPDATE records SET data = ?, updated_date = ? WHERE id = ?").bind(JSON.stringify(data), t, id).run();
      return json(parseRecord({ ...row, data: JSON.stringify(data), updated_date: t, owner_email: me.email }));
    }
    if (method === "DELETE") {
      await db.prepare("DELETE FROM records WHERE id = ?").bind(id).run();
      return json({ ok: true });
    }
  }

  // --- Discord sharing ---
  if (path === "/discord/share" && method === "POST") {
    if (!me.discord_webhook) throw new HttpError(400, "Add your Discord channel's webhook link in Profile → Discord first.");
    const row = await db.prepare("SELECT data FROM records WHERE id = ? AND entity = 'Trip' AND owner_id = ?").bind(String(body.tripId || ""), me.id).first();
    if (!row) throw new HttpError(404, "Trip not found");
    const trip = JSON.parse(row.data);
    const v = trip.vehicle_id ? await db.prepare("SELECT data FROM records WHERE id = ? AND owner_id = ?").bind(trip.vehicle_id, me.id).first() : null;
    await postTripToDiscord(me.discord_webhook, me, trip, v ? JSON.parse(v.data) : null, url.origin);
    return json({ ok: true });
  }
  if (path === "/discord/test" && method === "POST") {
    if (!me.discord_webhook) throw new HttpError(400, "Save a webhook link first.");
    const r = await fetch(`${me.discord_webhook}?wait=true`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "Drivez", content: `✅ Drivez is connected! ${me.display_name}'s drives can now be posted here.` }) });
    if (!r.ok) throw new HttpError(502, `Discord rejected the test (${r.status}). Check the webhook link.`);
    return json({ ok: true });
  }

  // --- friends ---
  if (path === "/friends" && method === "GET") {
    const { results } = await db.prepare(
      `SELECT f.id AS fid, f.status, f.requester_id, u.*,
         (SELECT MAX(json_extract(r.data, '$.top_speed')) FROM records r WHERE r.entity = 'Trip' AND r.owner_id = u.id) AS top_speed
       FROM friends f JOIN users u ON u.id = CASE WHEN f.requester_id = ?1 THEN f.addressee_id ELSE f.requester_id END
       WHERE f.requester_id = ?1 OR f.addressee_id = ?1 ORDER BY u.display_name`
    ).bind(me.id).all();
    const row = (r) => ({ ...card(r), id: r.fid, topSpeed: r.ghost_mode ? null : r.top_speed });
    return json({
      friends: results.filter((r) => r.status === "accepted").map(row),
      incoming: results.filter((r) => r.status === "pending" && r.requester_id !== me.id).map(row),
      outgoing: results.filter((r) => r.status === "pending" && r.requester_id === me.id).map(row),
    });
  }
  if (path === "/friends/request" && method === "POST") {
    const who = String(body.who || "").trim().toLowerCase().replace(/^@/, "");
    const other = await db.prepare("SELECT * FROM users WHERE username = ? OR email = ?").bind(who, who).first();
    if (!other) throw new HttpError(404, "No Drivez user with that username or email.");
    if (other.id === me.id) throw new HttpError(400, "That's you!");
    const existing = await db.prepare("SELECT * FROM friends WHERE (requester_id = ?1 AND addressee_id = ?2) OR (requester_id = ?2 AND addressee_id = ?1)").bind(me.id, other.id).first();
    if (existing?.status === "accepted") return json({ message: `You're already friends with ${other.display_name}.` });
    if (existing && existing.requester_id === other.id) {
      await db.prepare("UPDATE friends SET status = 'accepted' WHERE id = ?").bind(existing.id).run();
      return json({ message: `You and ${other.display_name} are now friends.` });
    }
    if (existing) return json({ message: `Request already sent to ${other.display_name}.` });
    await db.prepare("INSERT INTO friends (id, requester_id, addressee_id, status, created_date) VALUES (?, ?, ?, 'pending', ?)").bind(uid(), me.id, other.id, now()).run();
    return json({ message: `Friend request sent to ${other.display_name}.` });
  }
  if (path === "/friends/respond" && method === "POST") {
    const f = await db.prepare("SELECT * FROM friends WHERE id = ? AND addressee_id = ? AND status = 'pending'").bind(String(body.id || ""), me.id).first();
    if (!f) throw new HttpError(404, "Request not found");
    if (body.accept) await db.prepare("UPDATE friends SET status = 'accepted' WHERE id = ?").bind(f.id).run();
    else await db.prepare("DELETE FROM friends WHERE id = ?").bind(f.id).run();
    return json({ ok: true });
  }
  if (path === "/friends/remove" && method === "POST") {
    await db.prepare("DELETE FROM friends WHERE id = ? AND (requester_id = ?2 OR addressee_id = ?2)").bind(String(body.id || ""), me.id).run();
    return json({ ok: true });
  }

  // --- live locations ---
  if (path === "/live" && method === "POST") {
    if (me.ghost_mode) return json({ ok: true, hidden: true });
    const lat = +body.lat, lng = +body.lng;
    if (!isFinite(lat) || !isFinite(lng)) throw new HttpError(400, "Bad position");
    const heading = isFinite(+body.heading) && body.heading !== null ? +body.heading : null;
    const body_ = BODY_TYPES.has(body.carBody) ? body.carBody : null;
    const color = /^#[0-9a-f]{6}$/i.test(body.carColor || "") ? body.carColor : null;
    await db.prepare(`INSERT INTO live_pos (user_id, lat, lng, speed, heading, car_body, car_color, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET lat = excluded.lat, lng = excluded.lng, speed = excluded.speed, heading = excluded.heading, car_body = excluded.car_body, car_color = excluded.car_color, updated = excluded.updated`)
      .bind(me.id, lat, lng, Math.round(+body.speed || 0), heading, body_, color, Date.now()).run();
    return json({ ok: true });
  }
  if (path === "/live/stop" && method === "POST") {
    await db.prepare("DELETE FROM live_pos WHERE user_id = ?").bind(me.id).run();
    return json({ ok: true });
  }
  if (path === "/live" && method === "GET") {
    const ids = await friendIds(db, me.id);
    if (!ids.length) return json({ drivers: [] });
    const { results } = await db.prepare(
      `SELECT l.*, u.display_name, u.username, u.avatar_url, u.color FROM live_pos l JOIN users u ON u.id = l.user_id
       WHERE l.updated > ? AND u.ghost_mode = 0 AND l.user_id IN (${ids.map(() => "?").join(",")})`
    ).bind(Date.now() - LIVE_FRESH_MS, ...ids).all();
    return json({ drivers: results.map((r) => ({ ...card({ ...r, id: r.user_id }), lat: r.lat, lng: r.lng, speed: r.speed, heading: r.heading, car: r.car_body ? { body: r.car_body, color: r.car_color || r.color } : null, updated: new Date(r.updated).toISOString() })) });
  }

  // --- road reports (police, crashes, hazards, traffic, closures) ---
  if (path === "/reports" && method === "GET") {
    const lat = +url.searchParams.get("lat"), lng = +url.searchParams.get("lng");
    const radius = Math.min(+url.searchParams.get("km") || 40, 150) / 111; // degrees, roughly
    if (!isFinite(lat) || !isFinite(lng)) throw new HttpError(400, "Missing position");
    const { results } = await db.prepare(
      `SELECT r.*, u.display_name, v.still_there AS my_vote FROM reports r JOIN users u ON u.id = r.user_id
       LEFT JOIN report_votes v ON v.report_id = r.id AND v.user_id = ?
       WHERE r.expires > ? AND r.lat BETWEEN ? AND ? AND r.lng BETWEEN ? AND ? ORDER BY r.created DESC LIMIT 300`
    ).bind(me.id, Date.now(), lat - radius, lat + radius, lng - radius * 1.5, lng + radius * 1.5).all();
    return json({ reports: results.map((r) => ({
      id: r.id, type: r.type, lat: r.lat, lng: r.lng, created: new Date(r.created).toISOString(),
      by: r.user_id === me.id ? "You" : r.display_name, mine: r.user_id === me.id,
      confirms: r.confirms, myVote: r.my_vote == null ? null : !!r.my_vote,
    })) });
  }
  if (path === "/reports" && method === "POST") {
    const type = String(body.type || "");
    if (!REPORT_LIFETIME[type]) throw new HttpError(400, "Unknown report type");
    const lat = +body.lat, lng = +body.lng;
    if (!isFinite(lat) || !isFinite(lng)) throw new HttpError(400, "Missing position");
    // Merge with a matching report close by instead of stacking duplicates.
    const near = await db.prepare(
      "SELECT id FROM reports WHERE type = ? AND expires > ? AND abs(lat - ?) < 0.0015 AND abs(lng - ?) < 0.002 LIMIT 1"
    ).bind(type, Date.now(), lat, lng).first();
    if (near) {
      await vote(db, near.id, me.id, true, type);
      return json({ ok: true, merged: true, id: near.id });
    }
    const id = uid(), t = Date.now();
    await db.prepare("INSERT INTO reports (id, user_id, type, lat, lng, created, expires) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, me.id, type, lat, lng, t, t + REPORT_LIFETIME[type]).run();
    return json({ ok: true, id });
  }
  const rv = path.match(/^\/reports\/(\w+)\/(vote|delete)$/);
  if (rv && method === "POST") {
    const r = await db.prepare("SELECT * FROM reports WHERE id = ?").bind(rv[1]).first();
    if (!r) throw new HttpError(404, "That report has expired");
    if (rv[2] === "delete") {
      if (r.user_id !== me.id) throw new HttpError(403, "Only the person who reported it can remove it");
      await db.prepare("DELETE FROM reports WHERE id = ?").bind(r.id).run();
      return json({ ok: true });
    }
    await vote(db, r.id, me.id, !!body.stillThere, r.type);
    return json({ ok: true });
  }

  // --- leaderboard ---
  if (path === "/leaderboard" && method === "GET") {
    const scope = url.searchParams.get("scope") || "everyone";
    if (scope === "me") {
      const { results } = await db.prepare(
        `SELECT r.data FROM records r WHERE r.entity = 'Trip' AND r.owner_id = ? ORDER BY json_extract(r.data, '$.top_speed') DESC LIMIT 20`
      ).bind(me.id).all();
      return json({ entries: results.map((r) => { const t = JSON.parse(r.data); return { ...card(me), topSpeed: t.top_speed || 0, title: t.title, name: t.title || "Drive" }; }) });
    }
    let ids = null;
    if (scope === "friends") ids = [me.id, ...(await friendIds(db, me.id))];
    const filter = ids ? `AND r.owner_id IN (${ids.map(() => "?").join(",")})` : "";
    const { results } = await db.prepare(
      `WITH best AS (
         SELECT r.owner_id, r.data, ROW_NUMBER() OVER (PARTITION BY r.owner_id ORDER BY json_extract(r.data, '$.top_speed') DESC) AS rn
         FROM records r WHERE r.entity = 'Trip' ${filter}
       )
       SELECT u.*, b.data AS trip FROM best b JOIN users u ON u.id = b.owner_id
       WHERE b.rn = 1 AND (u.ghost_mode = 0 OR u.id = ?)
       ORDER BY json_extract(b.data, '$.top_speed') DESC LIMIT 50`
    ).bind(...(ids || []), me.id).all();
    const vehicleIds = results.map((r) => JSON.parse(r.trip).vehicle_id).filter(Boolean);
    const vehicles = {};
    if (vehicleIds.length) {
      const { results: vs } = await db.prepare(`SELECT id, data FROM records WHERE id IN (${vehicleIds.map(() => "?").join(",")})`).bind(...vehicleIds).all();
      for (const v of vs) { const d = JSON.parse(v.data); vehicles[v.id] = `${d.year || ""} ${d.make} ${d.model}`.trim(); }
    }
    return json({ entries: results.map((r) => { const t = JSON.parse(r.trip); return { ...card(r), topSpeed: t.top_speed || 0, title: t.title, vehicle: vehicles[t.vehicle_id] || "" }; }) });
  }

  throw new HttpError(404, "Not found");
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        await ensureSchema(env.DB);
        return await handleApi(req, env, ctx, url);
      } catch (e) {
        const status = e.status || 500;
        if (status === 500) console.error(e);
        return json({ error: status === 500 ? "Something went wrong on our side. Try again." : e.message }, status);
      }
    }
    return serveStatic(url);
  },
  // Hourly clean-up of expired sessions, reset links and stale live positions.
  async scheduled(event, env) {
    await ensureSchema(env.DB);
    const t = Date.now();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE expires < ?").bind(t),
      env.DB.prepare("DELETE FROM resets WHERE expires < ?").bind(t),
      env.DB.prepare("DELETE FROM oauth_states WHERE expires < ?").bind(t),
      env.DB.prepare("DELETE FROM live_pos WHERE updated < ?").bind(t - LIVE_FRESH_MS),
      env.DB.prepare("DELETE FROM report_votes WHERE report_id IN (SELECT id FROM reports WHERE expires < ?)").bind(t),
      env.DB.prepare("DELETE FROM reports WHERE expires < ?").bind(t),
    ]);
  },
};

// The app's own files (built by Vite) are bundled into the worker.
function serveStatic(url) {
  const f = FILES[url.pathname] || (url.pathname.includes(".") ? null : FILES["/index.html"]);
  if (!f) return new Response("Not found", { status: 404 });
  return new Response(f.body, { headers: { "content-type": f.type, "cache-control": f.immutable ? "public, max-age=31536000, immutable" : "no-cache" } });
}

let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch(SCHEMA.map((s) => db.prepare(s)));
  schemaReady = true;
}
