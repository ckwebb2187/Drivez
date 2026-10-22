// Drivez API: accounts, sign-in (email, Google, Discord, Facebook), data, friends,
// live locations, leaderboard and Discord sharing. Runs on Cloudflare Workers + D1.
import { SCHEMA, MIGRATIONS } from "./schema.js";
import { FILES } from "./static/index.js";

const ENTITIES = new Set(["Vehicle", "Trip", "Route", "Place"]);
const BODY_TYPES = new Set(["hatch", "sports", "sedan", "suv", "truck", "moto"]);
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

// Creator accounts get every premium feature, forever, whatever plans exist later.
// More creators can be added with the CREATOR_IDS secret (comma-separated user ids).
const CREATOR_IDS = new Set(["975d2a20cdce4a42a12ed9a5"]);
let extraCreators = null;
const isCreator = (u) => CREATOR_IDS.has(u.id) || !!extraCreators?.has(u.id);
// The single check every premium feature should use.
const hasPremium = (u) => isCreator(u);

function publicUser(u) {
  return {
    id: u.id, email: u.email, full_name: u.display_name, display_name: u.display_name, username: u.username,
    bio: u.bio || "", location: u.location || "", ghost_mode: !!u.ghost_mode, avatar_url: u.avatar_url,
    color: u.color, created_date: u.created_date, role: isCreator(u) ? "creator" : "user",
    creator: isCreator(u), premium: hasPremium(u),
    discord_connected: !!u.discord_id, discord_webhook_set: !!u.discord_webhook, discord_auto: !!u.discord_auto,
    has_password: !!u.password_hash, trip_retention_days: u.trip_retention_days || null,
    app_mode: u.app_mode || null, profile: readProfile(u.profile),
  };
}

// Social profile settings: links, clubs, and who can see each part.
const PROFILE_PARTS = ["car", "mods", "socials", "clubs", "stats", "bio"];
const SOCIALS = ["instagram", "facebook", "tiktok", "youtube"];
function readProfile(raw) {
  let p = {};
  try { p = raw ? JSON.parse(raw) : {}; } catch { p = {}; }
  const show = {};
  for (const k of PROFILE_PARTS) show[k] = ["everyone", "friends", "me"].includes(p.show?.[k]) ? p.show[k] : "friends";
  const socials = {};
  for (const k of SOCIALS) if (p.socials?.[k]) socials[k] = p.socials[k];
  return { socials, clubs: Array.isArray(p.clubs) ? p.clubs : [], show };
}
function cleanProfile(p) {
  const out = readProfile(null);
  for (const k of PROFILE_PARTS) if (["everyone", "friends", "me"].includes(p?.show?.[k])) out.show[k] = p.show[k];
  for (const k of SOCIALS) {
    // Keep just the handle: strip @, spaces and any pasted profile link.
    const h = String(p?.socials?.[k] || "").trim().replace(/^https?:\/\/[^/]+\/(@)?/i, "").replace(/^@/, "").replace(/[/?#].*$/, "").slice(0, 60);
    if (h) out.socials[k] = h;
  }
  out.clubs = (Array.isArray(p?.clubs) ? p.clubs : []).map((c) => String(c).trim().slice(0, 60)).filter(Boolean).slice(0, 10);
  return out;
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

// ---------- Gemini (Ask Gemini, drive narration, natural voice) ----------
// Light per-user limit so one account can't run up the Gemini bill (per worker instance).
const aiUse = new Map();
function aiLimit(userId, max = 40) {
  const now_ = Date.now(), list = (aiUse.get(userId) || []).filter((t) => now_ - t < 10 * 60000);
  if (list.length >= max) throw new HttpError(429, "That's a lot of questions. Give it a few minutes.");
  list.push(now_); aiUse.set(userId, list);
}
const GEMINI_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-flash-latest"];
const GEMINI_TTS_MODELS = ["gemini-3.8-flash-tts", "gemini-2.5-flash-preview-tts"];
async function gemini(env, body, models = GEMINI_MODELS) {
  if (!env.GEMINI_API_KEY) throw new HttpError(404, "Ask Gemini isn't set up yet.");
  let last = "";
  for (const m of models) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
    if (res.ok) return res.json();
    last = `${m}: ${res.status} ${(await res.text()).slice(0, 160)}`;
    console.log("gemini", last);
    if (res.status === 400 || res.status === 401 || res.status === 403) break;
  }
  throw new HttpError(502, "Gemini didn't answer. Try again in a moment.");
}
const ASK_SYSTEM = `You are Kaido, the co-driver voice inside Kaido Maps, a navigation app for car enthusiasts.
The driver may be driving right now, so answer in 1 to 3 short spoken sentences: plain words, no lists, no markdown, no emojis.
Be friendly and a little playful, like a friend in the passenger seat who knows cars.
Never encourage speeding, street racing or using the phone while driving; if asked, steer to safe, legal options (track days, autocross).
Use the tools when the driver wants to go somewhere, find a place nearby, report something on the road, or switch drive modes.
For "nearest gas / food / coffee / car wash / parts store" use navigate_to with a short search like "gas station".
If the question needs live facts you don't have (prices, opening hours, scores), say so briefly.`;
const ASK_TOOLS = [{ functionDeclarations: [
  { name: "navigate_to", description: "Start directions to a place or the closest place of a kind.", parameters: { type: "OBJECT", properties: { query: { type: "STRING", description: "Place name, address, or kind of place like 'gas station'" } }, required: ["query"] } },
  { name: "report_road", description: "Report something on the road at the driver's location.", parameters: { type: "OBJECT", properties: { type: { type: "STRING", enum: ["police", "crash", "hazard", "traffic", "closure", "flood", "pothole", "bump"] } }, required: ["type"] } },
  { name: "set_drive_mode", description: "Switch the drive mode.", parameters: { type: "OBJECT", properties: { mode: { type: "STRING", enum: ["cruise", "toge", "wangan"] } }, required: ["mode"] } },
  { name: "end_route", description: "Stop the current directions.", parameters: { type: "OBJECT", properties: {} } },
] }];
// PCM from Gemini TTS -> a playable WAV.
function wavFromPcm(pcm, rate = 24000) {
  const h = new DataView(new ArrayBuffer(44));
  const w = (o, str) => { for (let i = 0; i < str.length; i++) h.setUint8(o + i, str.charCodeAt(i)); };
  w(0, "RIFF"); h.setUint32(4, 36 + pcm.length, true); w(8, "WAVE"); w(12, "fmt ");
  h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true); h.setUint32(24, rate, true); h.setUint32(28, rate * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true);
  w(36, "data"); h.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length); out.set(new Uint8Array(h.buffer), 0); out.set(pcm, 44);
  return out;
}

// ---------- road reports ----------
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const REPORT_LIFETIME = { police: 45 * MIN, crash: 90 * MIN, hazard: 120 * MIN, traffic: 45 * MIN, closure: 240 * MIN, train: 30 * MIN, bump: 180 * DAY, pothole: 30 * DAY, dip: 180 * DAY, flood: 12 * 60 * MIN };

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
    author: { name: `${user.display_name} on Kaido Maps`, icon_url: icon },
    fields: [
      { name: "Distance", value: `${trip.distance ?? 0} mi`, inline: true },
      { name: "Top speed", value: `${trip.top_speed ?? 0} mph`, inline: true },
      { name: "Avg speed", value: `${trip.avg_speed ?? 0} mph`, inline: true },
      { name: "Duration", value: fmtDuration(trip.duration), inline: true },
      ...(vehicle ? [{ name: "Vehicle", value: `${vehicle.year || ""} ${vehicle.make} ${vehicle.model}${vehicle.nickname ? ` "${vehicle.nickname}"` : ""}`.trim(), inline: true }] : []),
    ],
    timestamp: trip.end_time || now(),
    footer: { text: "Kaido Maps" },
  };
  const r = await fetch(`${webhook}?wait=true`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "Kaido Maps", embeds: [embed] }),
  });
  if (!r.ok) throw new HttpError(502, `Discord rejected the post (${r.status}). Check the webhook link.`);
}

// ---------- weather alerts ----------
const NWS_UA = { "user-agent": "Drivez/1.0 (https://drivez.webb-home.workers.dev)", accept: "application/geo+json" };
async function nwsAlerts(lat, lng, ctx) {
  const u = `https://api.weather.gov/alerts/active?point=${lat.toFixed(3)},${lng.toFixed(3)}`;
  const d = await cachedJSON(ctx, u, 300, NWS_UA).catch(() => ({ features: [] }));
  return (d.features || []).map((f) => {
    const p = f.properties || {};
    return {
      id: p.id || f.id, event: p.event, severity: p.severity, urgency: p.urgency, headline: p.headline,
      description: (p.description || "").slice(0, 1500), instruction: (p.instruction || "").slice(0, 1000),
      area: p.areaDesc, ends: p.ends || p.expires, sender: p.senderName,
      geometry: f.geometry && f.geometry.type ? f.geometry : null,
    };
  });
}

// ---------- OpenStreetMap (Overpass) ----------
const OSM_KINDS = {
  bumps: (bb) => `node["traffic_calming"~"bump|hump|table|cushion|dip|rumble_strip"](${bb});out 800;`,
  // Roads with a posted limit, plus named main roads (for the road-name pill).
  limits: (bb) => `(way["highway"]["maxspeed"](${bb});way["highway"~"^(motorway|trunk|primary|secondary|tertiary)(_link)?$"]["name"](${bb}););out tags geom 5000;`,
  shops: (bb) => `(nwr["shop"~"car_repair|car_parts|tyres"](${bb});nwr["craft"="car_repair"](${bb});nwr["amenity"="fuel"]["fuel:octane_93"="yes"](${bb});nwr["amenity"="fuel"]["fuel:e0"="yes"](${bb});nwr["amenity"="fuel"]["fuel:ethanol_free"="yes"](${bb}););out center tags 300;`,
};
const OVERPASS = ["https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass.openstreetmap.fr/api/interpreter", "https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
async function osmLookup(kind, [s, w, n, e], ctx) {
  const r = (v) => (Math.round(v * 50) / 50).toFixed(2); // ~2 km grid so nearby lookups share the cache
  const bbox = `${r(s)},${r(w)},${r(n)},${r(e)}`;
  const query = `[out:json][timeout:25];${OSM_KINDS[kind](bbox)}`;
  const key = new Request(`https://drivez.cache/osm/${kind}/v2/${bbox}`);
  const hit = await caches.default.match(key);
  if (hit) return hit.json();
  let data = null;
  for (const host of OVERPASS) {
    try {
      const res = await fetch(`${host}?data=${encodeURIComponent(query)}`, { headers: { "user-agent": NWS_UA["user-agent"], accept: "application/json" }, signal: AbortSignal.timeout(9000) });
      if (res.ok) { data = await res.json(); break; }
      console.log("overpass", host, res.status);
    } catch (e) { console.log("overpass", host, String(e)); /* try the next mirror */ }
  }
  if (!data) throw new HttpError(502, "Map data is busy right now. Try again in a minute.");
  const items = (data.elements || []).map((el) => {
    const t = el.tags || {};
    if (kind === "limits") {
      // Posted speed limit for a stretch of road, in mph (OSM gives "45 mph" or km/h numbers).
      const m = String(t.maxspeed || "").match(/^(\d+)\s*(mph|km\/h|kmh)?/i);
      if (!el.geometry?.length || (!m && !t.name)) return null;
      const mph = !m ? null : /mph/i.test(m[2] || "") ? +m[1] : Math.round(+m[1] / 1.609 / 5) * 5;
      return { id: `w${el.id}`, mph, name: t.name || t.ref || "", oneway: t.oneway === "yes", g: el.geometry.map((p) => [Math.round(p.lat * 1e5) / 1e5, Math.round(p.lon * 1e5) / 1e5]) };
    }
    const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
    if (lat == null) return null;
    if (kind === "bumps") return { id: `osm${el.id}`, lat, lng, type: /dip/.test(t.traffic_calming) ? "dip" : "bump", what: t.traffic_calming };
    const fuel = t.amenity === "fuel";
    const name = t.name || t.brand || (fuel ? "Gas station" : "Auto shop");
    const tuner = /perform|motorsport|tuning|tune|jdm|import|racing|speed|turbo|dyno/i.test(`${name} ${t.description || ""} ${t.service || ""}`);
    const category = fuel ? "fuel" : t.shop === "car_parts" ? "parts" : t.shop === "tyres" ? "tires" : tuner ? "tuner" : "mechanic";
    return {
      id: `osm${el.type[0]}${el.id}`, lat, lng, name, category,
      octane93: t["fuel:octane_93"] === "yes", ethanolFree: t["fuel:e0"] === "yes" || t["fuel:ethanol_free"] === "yes",
      address: [t["addr:housenumber"], t["addr:street"], t["addr:city"]].filter(Boolean).join(" "),
      phone: t.phone || t["contact:phone"] || "", website: t.website || t["contact:website"] || "", hours: t.opening_hours || "",
    };
  }).filter(Boolean);
  ctx.waitUntil(caches.default.put(key, new Response(JSON.stringify(items), { headers: { "content-type": "application/json", "cache-control": `public, max-age=${kind === "shops" ? 86400 : 7 * 86400}` } })));
  return items;
}

// ---------- place search ----------
const ABBR = { mt: "mount", ft: "fort", pt: "point", hwy: "highway", pkwy: "parkway", fwy: "freeway", expy: "expressway", blvd: "boulevard", ln: "lane", ct: "court", cir: "circle", trl: "trail", pl: "place", ter: "terrace", sq: "square" };
const expandAbbr = (q) => q.replace(/\b([A-Za-z]+)\.?(?=\s|,|$)/g, (w, a) => ABBR[a.toLowerCase()] || w);
const titleCase = (s) => s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(Ne|Nw|Se|Sw|[NSEW])\b/g, (c) => c.toUpperCase());
const metersBetween = (a, b) => { const R = 6371000, r = Math.PI / 180; const h = Math.sin((b[0] - a[0]) * r / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin((b[1] - a[1]) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };

async function cachedJSON(ctx, url, ttl, headers = {}) {
  const key = new Request(url);
  const hit = await caches.default.match(key);
  if (hit) return hit.json();
  const res = await fetch(url, { headers: { "user-agent": "Drivez/1.0 (https://drivez.webb-home.workers.dev)", ...headers } });
  if (!res.ok) throw new Error(`lookup failed ${res.status}`);
  const data = await res.json();
  ctx.waitUntil(caches.default.put(key, new Response(JSON.stringify(data), { headers: { "content-type": "application/json", "cache-control": `public, max-age=${ttl}` } })));
  return data;
}

async function photon(q, near, ctx) {
  const p = new URLSearchParams({ q, limit: "7", lang: "en" });
  if (near) { p.set("lat", near[0]); p.set("lon", near[1]); }
  const d = await cachedJSON(ctx, `https://photon.komoot.io/api/?${p}`, 86400).catch(() => ({ features: [] }));
  return (d.features || []).map((f) => {
    const pr = f.properties || {};
    const street = [pr.housenumber, pr.street].filter(Boolean).join(" ");
    const [lng, lat] = f.geometry.coordinates;
    return {
      id: `${pr.osm_type}${pr.osm_id}`,
      name: pr.name || street || pr.city || "Dropped pin",
      address: [pr.name ? street : "", pr.city || pr.district || pr.county, pr.state].filter(Boolean).join(", "),
      lat, lng, exact: !!pr.housenumber,
    };
  });
}

// The city and state you're in, to finish addresses typed without them.
async function nearbyArea(near, ctx) {
  if (!near) return null;
  const lat = near[0].toFixed(2), lng = near[1].toFixed(2);
  const d = await cachedJSON(ctx, `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&limit=1&lang=en`, 7 * 86400).catch(() => null);
  const p = d?.features?.[0]?.properties;
  return p && p.countrycode === "US" && p.state ? { city: p.city || p.county || "", state: p.state } : null;
}

async function census(address, ctx) {
  const u = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=${encodeURIComponent(address)}`;
  const d = await cachedJSON(ctx, u, 7 * 86400).catch(() => null);
  return (d?.result?.addressMatches || []).slice(0, 3).map((m) => {
    const [street, ...rest] = m.matchedAddress.split(", ");
    const zip = rest.pop();
    return {
      id: `census:${m.matchedAddress}`,
      name: titleCase(street),
      address: `${rest.map((x, i) => (i === rest.length - 1 ? x : titleCase(x))).join(", ")} ${zip}`.trim(),
      lat: m.coordinates.y, lng: m.coordinates.x, exact: true,
    };
  });
}

async function geocode(q, near, ctx) {
  const num = (q.match(/^\s*(\d+[a-z]?)\s+\S/i) || [])[1];
  const hasCity = /,/.test(q) || /\b\d{5}\b/.test(q.replace(/^\s*\d+/, "")) || /\b[A-Z]{2}\s*$/.test(q.trim());
  const [base, area] = await Promise.all([photon(q, near, ctx), num ? nearbyArea(near, ctx) : null]);
  let results = base;
  if (!results.length && expandAbbr(q) !== q) results = await photon(expandAbbr(q), near, ctx);
  // A result only counts as the exact address if it has the house number you typed.
  for (const r of results) r.exact = !!num && r.name.toLowerCase().startsWith(num.toLowerCase() + " ");
  let exact = [];
  if (num) {
    // Street addresses: the Census finds exact house numbers. Without a city, look in your area first.
    const tries = [];
    if (!hasCity && area) tries.push(`${q}, ${area.city}, ${area.state}`, `${q}, ${area.state}`);
    tries.push(q);
    for (const t of tries) { exact = await census(t, ctx); if (exact.length) break; }
  }
  const byDist = (a, b) => (near ? metersBetween(near, [a.lat, a.lng]) - metersBetween(near, [b.lat, b.lng]) : 0);
  // Once the address is found nearby, drop same-number streets in other states.
  const far = (r) => exact.length && near && metersBetween(near, [r.lat, r.lng]) > 300000;
  const all = [...exact, ...results.filter((r) => r.exact && !far(r)).sort(byDist), ...results.filter((r) => !r.exact)];
  const out = [];
  for (const r of all) if (!out.some((o) => metersBetween([o.lat, o.lng], [r.lat, r.lng]) < 25)) out.push(r);
  return out.slice(0, 8).map((r) => ({ ...r, distance: near ? metersBetween(near, [r.lat, r.lng]) : null }));
}

// ---------- routes ----------
async function handleApi(req, env, ctx, url) {
  const db = env.DB;
  const path = url.pathname.replace(/^\/api/, "");
  const method = req.method;
  const body = ["POST", "PATCH", "PUT", "DELETE"].includes(method) ? await req.json().catch(() => ({})) : {};

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
        body: JSON.stringify({ from: env.RESEND_FROM, to: email, subject: "Reset your Kaido Maps password", html: `<p>Tap to choose a new Kaido Maps password (valid for 1 hour):</p><p><a href="${link}">${link}</a></p><p>If you didn't ask for this, ignore this email.</p>` }),
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

  // Invite link preview (public): who invited you.
  const inv = path.match(/^\/invite\/([A-Za-z0-9]{6,16})$/);
  if (inv && method === "GET") {
    const u = await db.prepare("SELECT display_name, username, avatar_url, color FROM users WHERE invite_code = ?").bind(inv[1]).first();
    if (!u) throw new HttpError(404, "That invite link isn't valid anymore.");
    return json({ name: u.display_name, username: u.username, avatarUrl: u.avatar_url, color: u.color });
  }

  // Public driver profile (what a QR sticker opens). Shows only the parts the owner allows.
  const pu = path.match(/^\/u\/([a-z0-9_]{1,24})$/);
  if (pu && method === "GET") {
    const u = await db.prepare("SELECT * FROM users WHERE username = ?").bind(pu[1]).first();
    if (!u) throw new HttpError(404, "No driver with that name.");
    // ?as=public shows the page the way a stranger sees it.
    const viewer = url.searchParams.get("as") === "public" ? null : await currentUser(req, db).catch(() => null);
    const isMe = viewer?.id === u.id;
    const isFriend = !!viewer && !isMe && (await friendIds(db, viewer.id)).includes(u.id);
    const prof = readProfile(u.profile);
    const can = (k) => isMe || prof.show[k] === "everyone" || (prof.show[k] === "friends" && isFriend);
    const out = { username: u.username, name: u.display_name, avatarUrl: u.avatar_url, color: u.color, joined: u.created_date, isMe, isFriend, signedIn: !!viewer };
    if (can("bio")) { out.bio = u.bio || ""; out.location = u.location || ""; }
    if (can("car") || can("mods")) {
      const { results } = await db.prepare("SELECT data, created_date FROM records WHERE entity = 'Vehicle' AND owner_id = ? ORDER BY created_date DESC").bind(u.id).all();
      const cars = results.map((r) => JSON.parse(r.data));
      const v = cars.find((c) => c.is_primary) || cars[0];
      if (v) {
        if (can("car")) out.car = {
          make: v.make, model: v.model, year: v.year, nickname: v.nickname || "", color: v.color, body: v.body, image_url: v.image_url || null,
          catalog_id: v.catalog_id || null, shape: v.shape || null, wheels: v.wheels || null, wheel_color: v.wheel_color || null,
          glow_on: v.glow_on, glow_color: v.glow_color || null, scoop: v.scoop ?? null, wing: v.wing ?? null, model3d: v.model3d || null, display: v.display || null, paint: v.paint || null,
          finish: v.finish || null, lights: v.lights || null, lashes: !!v.lashes, decal: v.decal || null, decal_color: v.decal_color || null, decal_text: v.decal_text || null, glow_pulse: v.glow_pulse || null, charm: v.charm || null,
          photos: (v.photos || []).slice(0, 12),
          specs: v.specs || null,
        };
        if (can("mods")) out.mods = (v.mods || []).map((m) => ({ name: m.name, category: m.category || "", note: m.note || "" }));
      }
    }
    if (can("socials")) out.socials = prof.socials;
    if (can("clubs")) out.clubs = prof.clubs;
    if (can("stats")) {
      const st = await db.prepare("SELECT COUNT(*) AS drives, COALESCE(SUM(json_extract(data, '$.distance')), 0) AS miles FROM records WHERE entity = 'Trip' AND owner_id = ?").bind(u.id).first();
      out.stats = { drives: st.drives, miles: Math.round(st.miles) };
    }
    return json(out, 200, { "cache-control": "no-store" });
  }

  // Custom car pictures are public too (friends see your car on the map).
  const ci = path.match(/^\/car-image\/([A-Za-z0-9_-]+)$/);
  if (ci && method === "GET") {
    const row = await db.prepare("SELECT mime, data FROM car_images WHERE vehicle_id = ?").bind(ci[1]).first();
    if (!row) throw new HttpError(404, "No picture");
    return new Response(new Uint8Array(row.data), { headers: { "content-type": row.mime, "cache-control": "public, max-age=31536000, immutable" } });
  }

  // Car gallery photos (ids are random, so a link is needed to see one).
  const cp = path.match(/^\/car-photo\/([a-f0-9]{24})$/);
  if (cp && method === "GET") {
    const row = await db.prepare("SELECT mime, data FROM car_photos WHERE id = ?").bind(cp[1]).first();
    if (!row) throw new HttpError(404, "No photo");
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
      if (body.app_mode != null) { sets.push("app_mode = ?"); vals.push(body.app_mode === "nav" ? "nav" : "scene"); }
      if (body.profile != null) { sets.push("profile = ?"); vals.push(JSON.stringify(cleanProfile(body.profile))); }
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

  // --- invite links: anyone who joins through your link becomes your friend ---
  if (path === "/me/invite" && (method === "GET" || method === "POST")) {
    let code = me.invite_code;
    if (!code || (method === "POST" && body.reset)) {
      code = token().replace(/[^A-Za-z0-9]/g, "").slice(0, 10);
      await db.prepare("UPDATE users SET invite_code = ? WHERE id = ?").bind(code, me.id).run();
    }
    return json({ code, url: `${url.origin}/join/${code}` });
  }
  if (path === "/invite/accept" && method === "POST") {
    const other = await db.prepare("SELECT id, display_name FROM users WHERE invite_code = ?").bind(String(body.code || "")).first();
    if (!other) throw new HttpError(404, "That invite link isn't valid anymore.");
    if (other.id === me.id) return json({ message: "That's your own invite link." , self: true });
    const existing = await db.prepare("SELECT * FROM friends WHERE (requester_id = ?1 AND addressee_id = ?2) OR (requester_id = ?2 AND addressee_id = ?1)").bind(me.id, other.id).first();
    if (existing) await db.prepare("UPDATE friends SET status = 'accepted' WHERE id = ?").bind(existing.id).run();
    else await db.prepare("INSERT INTO friends (id, requester_id, addressee_id, status, created_date) VALUES (?, ?, ?, 'accepted', ?)").bind(uid(), other.id, me.id, now()).run();
    return json({ message: `You and ${other.display_name} are now friends.`, name: other.display_name });
  }

  if (path === "/auth/unlink" && method === "POST") {
    const p = String(body.provider || "");
    if (!OAUTH[p]) throw new HttpError(400, "Unknown service");
    const linked = ["google", "discord", "facebook"].filter((x) => me[`${x}_id`]).length;
    if (!me.password_hash && linked <= 1) throw new HttpError(400, "That's your only way to log in, so it can't be disconnected.");
    await db.prepare(`UPDATE users SET ${p}_id = NULL WHERE id = ?`).bind(me.id).run();
    return json({ ok: true });
  }

  // --- place search: Photon (places, businesses) + US Census (exact street addresses) ---
  if (path === "/geocode" && method === "GET") {
    const q = (url.searchParams.get("q") || "").trim().slice(0, 200);
    const lat = +url.searchParams.get("lat"), lng = +url.searchParams.get("lng");
    if (q.length < 3) return json({ results: [] });
    return json({ results: await geocode(q, Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng) ? [lat, lng] : null, ctx) });
  }

  // --- live traffic (TomTom, free tier) — only when TOMTOM_API_KEY is set ---
  // --- Gemini: is it set up? ---
  if (path === "/ai/config" && method === "GET") return json({ enabled: !!env.GEMINI_API_KEY });

  // --- Ask Gemini: a question (typed or spoken) with where you are and what you're doing ---
  if (path === "/ask" && method === "POST") {
    aiLimit(me.id);
    const c = body.context || {};
    const ctxLines = [
      `Local time: ${String(c.time || "").slice(0, 40)}`,
      c.place ? `Near: ${String(c.place).slice(0, 80)}` : "",
      isFinite(+c.lat) && isFinite(+c.lng) ? `Position: ${(+c.lat).toFixed(3)}, ${(+c.lng).toFixed(3)}` : "",
      c.driving ? `Driving now at ${Math.round(+c.speed || 0)} mph${c.road ? ` on ${String(c.road).slice(0, 60)}` : ""}${c.limit ? ` (limit ${+c.limit})` : ""}.` : "Parked / not driving.",
      c.dest ? `Heading to ${String(c.dest).slice(0, 80)}${c.etaMin ? `, about ${Math.round(+c.etaMin)} min away` : ""}.` : "",
      c.car ? `Car: ${String(c.car).slice(0, 60)}.` : "",
      c.mode && c.mode !== "cruise" ? `Drive mode: ${c.mode}.` : "",
      c.trip ? `This drive so far: ${String(c.trip).slice(0, 120)}.` : "",
    ].filter(Boolean).join("\n");
    const history = (Array.isArray(body.history) ? body.history : []).slice(-6).map((h) => ({ role: h.role === "model" ? "model" : "user", parts: [{ text: String(h.text || "").slice(0, 600) }] }));
    const parts = [{ text: `[Situation]\n${ctxLines}\n\n[Driver]` }];
    if (body.audio?.data) {
      if (!/^audio\/(wav|webm|ogg|mp4|mpeg|aac)/.test(String(body.audio.mime || ""))) throw new HttpError(400, "Unsupported audio.");
      if (String(body.audio.data).length > 1400000) throw new HttpError(413, "That recording is too long.");
      parts.push({ inline_data: { mime_type: String(body.audio.mime).split(";")[0], data: String(body.audio.data) } });
      parts.push({ text: "(The driver's question is in the audio above. Answer it.)" });
    } else {
      const q = String(body.question || "").trim().slice(0, 500);
      if (!q) throw new HttpError(400, "Ask something.");
      parts.push({ text: q });
    }
    const out = await gemini(env, {
      systemInstruction: { parts: [{ text: ASK_SYSTEM }] },
      contents: [...history, { role: "user", parts }],
      tools: ASK_TOOLS,
      generationConfig: { temperature: 0.7, maxOutputTokens: 400 },
    });
    const got = out.candidates?.[0]?.content?.parts || [];
    const text = got.map((x) => x.text || "").join(" ").replace(/[*_#`]/g, "").trim();
    const call = got.find((x) => x.functionCall)?.functionCall || null;
    const action = call ? { name: call.name, args: call.args || {} } : null;
    const fallback = action?.name === "navigate_to" ? `Okay, finding ${action.args.query}.` : action?.name === "report_road" ? `Got it, reporting ${action.args.type}.` : action?.name === "set_drive_mode" ? `Switching to ${action.args.mode} mode.` : action?.name === "end_route" ? "Okay, ending the route." : "Sorry, I didn't catch that.";
    return json({ text: text || fallback, action });
  }

  // --- a few spoken sentences about a drive (trip page "Narrate" and the end-of-drive summary) ---
  if (path === "/narrate" && method === "POST") {
    aiLimit(me.id);
    const t = body.trip || {};
    const facts = {
      title: String(t.title || "").slice(0, 80), when: String(t.when || "").slice(0, 60), from: String(t.from || "").slice(0, 80), to: String(t.to || "").slice(0, 80),
      miles: +t.miles || 0, minutes: Math.round(+t.minutes || 0), topMph: Math.round(+t.topMph || 0), avgMph: Math.round(+t.avgMph || 0),
      smoothness: t.smoothness ?? null, hardBrakes: t.hardBrakes ?? null, maxG: t.maxG ?? null, zeroToSixty: t.zeroToSixty ?? null,
      mode: t.mode || null, corners: t.corners ?? null, convoy: !!t.convoy, car: String(t.car || "").slice(0, 60),
    };
    const out = await gemini(env, {
      systemInstruction: { parts: [{ text: "You are Kaido, a co-driver narrator for a car-enthusiast driving app. Write a short spoken recap of the drive: 3 to 4 sentences, vivid but grounded only in the facts given, no invented places or events, no markdown or emojis, about 20 seconds to read aloud. Celebrate smooth driving; never praise speeding." }] },
      contents: [{ role: "user", parts: [{ text: JSON.stringify(facts) }] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 300 },
    });
    const text = (out.candidates?.[0]?.content?.parts || []).map((x) => x.text || "").join(" ").replace(/[*_#`]/g, "").trim();
    if (!text) throw new HttpError(502, "Gemini didn't answer. Try again in a moment.");
    return json({ text });
  }

  // --- natural voice: Gemini text-to-speech, returned as a WAV ---
  if (path === "/tts" && method === "POST") {
    const text = String(body.text || "").trim().slice(0, 700);
    if (!text) throw new HttpError(400, "Nothing to say.");
    const voice = ["Puck", "Kore", "Charon", "Fenrir", "Aoede", "Zephyr"].includes(body.voice) ? body.voice : "Puck";
    const key = new Request(`https://drivez.cache/tts/${voice}/${encodeURIComponent(text).slice(0, 1500)}`);
    const hit = await caches.default.match(key);
    if (hit) return hit;
    aiLimit(me.id, 80);
    const out = await gemini(env, {
      contents: [{ parts: [{ text }] }],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
    }, GEMINI_TTS_MODELS);
    const part = (out.candidates?.[0]?.content?.parts || []).find((x) => x.inlineData || x.inline_data);
    const inline = part?.inlineData || part?.inline_data;
    if (!inline?.data) throw new HttpError(502, "No audio came back.");
    const mime = String(inline.mimeType || inline.mime_type || "");
    const bytes = Uint8Array.from(atob(inline.data), (ch) => ch.charCodeAt(0));
    // Newer models send a ready WAV/MP3; older ones send raw 16-bit PCM ("audio/L16;rate=24000").
    const raw = /l16|pcm/i.test(mime);
    const rate = +(mime.match(/rate=(\d+)/)?.[1] || 24000);
    const res = new Response(raw ? wavFromPcm(bytes, rate) : bytes, { headers: { "content-type": raw ? "audio/wav" : mime.split(";")[0] || "audio/wav", "cache-control": "public, max-age=604800" } });
    ctx.waitUntil(caches.default.put(key, res.clone()));
    return res;
  }

  if (path === "/traffic/config" && method === "GET") {
    return json({ live: !!env.TOMTOM_API_KEY });
  }
  const tt = path.match(/^\/traffic\/tile\/(day|night)\/(\d{1,2})\/(\d+)\/(\d+)\.png$/);
  if (tt && method === "GET") {
    if (!env.TOMTOM_API_KEY) throw new HttpError(404, "Live traffic isn't set up.");
    const [, theme, z, x, y] = tt;
    const bucket = Math.floor(Date.now() / 120000);
    const cacheKey = new Request(`${url.origin}/__traffic/${theme}/${z}/${x}/${y}.png?b=${bucket}`);
    let res = await caches.default.match(cacheKey);
    if (!res) {
      const style = theme === "night" ? "relative0-dark" : "relative0";
      const up = await fetch(`https://api.tomtom.com/traffic/map/4/tile/flow/${style}/${z}/${x}/${y}.png?key=${encodeURIComponent(env.TOMTOM_API_KEY)}&thickness=8`);
      if (!up.ok) throw new HttpError(502, `TomTom said ${up.status}`);
      res = new Response(up.body, { headers: { "content-type": "image/png", "cache-control": "public, max-age=120" } });
      ctx.waitUntil(caches.default.put(cacheKey, res.clone()));
    }
    return res;
  }
  if (path === "/traffic/eta" && method === "POST") {
    if (!env.TOMTOM_API_KEY) return json({ live: false });
    const pts = (Array.isArray(body.points) ? body.points : []).slice(0, 12)
      .map((p) => [+p[0], +p[1]]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
    if (pts.length < 2) throw new HttpError(400, "Need a start and a destination.");
    const loc = pts.map(([a, b]) => `${a.toFixed(5)},${b.toFixed(5)}`).join(":");
    const u = `https://api.tomtom.com/routing/1/calculateRoute/${loc}/json?key=${encodeURIComponent(env.TOMTOM_API_KEY)}&traffic=true&travelMode=car&routeType=fastest&computeTravelTimeFor=all&routeRepresentation=summaryOnly`;
    const r = await fetch(u);
    const d = await r.json().catch(() => ({}));
    const sm = d.routes?.[0]?.summary;
    if (!r.ok || !sm) throw new HttpError(502, "Live traffic is unavailable right now.");
    return json({
      live: true,
      travelTime: sm.travelTimeInSeconds,
      noTrafficTime: sm.noTrafficTravelTimeInSeconds ?? null,
      delay: sm.trafficDelayInSeconds ?? 0,
      length: sm.lengthInMeters,
      legs: (d.routes[0].legs || []).map((l) => ({ travelTime: l.summary?.travelTimeInSeconds, delay: l.summary?.trafficDelayInSeconds ?? 0 })),
    });
  }

  // --- National Weather Service alerts (floods, hurricanes, evacuations) ---
  if (path === "/nws/alerts" && method === "GET") {
    const lat = +url.searchParams.get("lat"), lng = +url.searchParams.get("lng");
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new HttpError(400, "Need a location");
    return json({ alerts: await nwsAlerts(lat, lng, ctx) });
  }
  if (path === "/nws/route" && method === "POST") {
    const pts = (Array.isArray(body.points) ? body.points : []).slice(0, 10).map((p) => [+p[0], +p[1]]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
    const all = new Map();
    for (const list of await Promise.all(pts.map(([a, b]) => nwsAlerts(a, b, ctx).catch(() => [])))) for (const al of list) all.set(al.id, al);
    return json({ alerts: [...all.values()] });
  }

  // --- OpenStreetMap lookups (speed bumps, car shops, special fuel) ---
  if (path === "/osm" && method === "GET") {
    const kind = url.searchParams.get("kind");
    const b = ["s", "w", "n", "e"].map((k) => +url.searchParams.get(k));
    if (!OSM_KINDS[kind] || b.some((v) => !Number.isFinite(v))) throw new HttpError(400, "Bad lookup");
    if ((b[2] - b[0]) * (b[3] - b[1]) > 1.2) throw new HttpError(400, "Area too big");
    return json({ items: await osmLookup(kind, b, ctx) });
  }

  // --- privacy: download everything, auto-delete old trips, delete account ---
  if (path === "/me/export" && method === "GET") {
    const records = (await db.prepare("SELECT entity, data, created_date FROM records WHERE owner_id = ?").bind(me.id).all()).results.map((r) => ({ type: r.entity, created: r.created_date, ...JSON.parse(r.data) }));
    const reports = (await db.prepare("SELECT type, lat, lng, created FROM reports WHERE user_id = ?").bind(me.id).all()).results;
    const friends = (await db.prepare("SELECT requester_id, addressee_id, status, created_date FROM friends WHERE requester_id = ? OR addressee_id = ?").bind(me.id, me.id).all()).results;
    return new Response(JSON.stringify({ exported: new Date().toISOString(), account: publicUser(me), records, reports, friends }, null, 2), {
      headers: { "content-type": "application/json", "content-disposition": `attachment; filename="drivez-data-${now().slice(0, 10)}.json"` },
    });
  }
  if (path === "/me/privacy" && method === "PATCH") {
    const days = body.trip_retention_days == null ? null : Math.max(0, Math.min(3650, Math.round(+body.trip_retention_days) || 0)) || null;
    await db.prepare("UPDATE users SET trip_retention_days = ? WHERE id = ?").bind(days, me.id).run();
    if (days) await db.prepare("DELETE FROM records WHERE owner_id = ? AND entity = 'Trip' AND created_date < ?").bind(me.id, new Date(Date.now() - days * 86400000).toISOString()).run();
    return json(publicUser(await db.prepare("SELECT * FROM users WHERE id = ?").bind(me.id).first()));
  }
  if (path === "/me" && method === "DELETE") {
    if (String(body.confirm || "").toUpperCase() !== "DELETE") throw new HttpError(400, 'Type DELETE to confirm.');
    const id = me.id;
    await db.batch([
      "DELETE FROM records WHERE owner_id = ?", "DELETE FROM sessions WHERE user_id = ?", "DELETE FROM friends WHERE requester_id = ?1 OR addressee_id = ?1",
      "DELETE FROM live_pos WHERE user_id = ?", "DELETE FROM report_votes WHERE user_id = ?", "DELETE FROM reports WHERE user_id = ?",
      "DELETE FROM avatars WHERE user_id = ?", "DELETE FROM car_images WHERE owner_id = ?", "DELETE FROM users WHERE id = ?",
    ].map((q) => db.prepare(q).bind(id)));
    return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json", "set-cookie": `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` } });
  }

  // --- weather map overlays ---
  if (path === "/wx/config" && method === "GET") {
    return json({ accuweather: !!env.ACCUWEATHER_API_KEY });
  }
  const wx = path.match(/^\/wx\/accu\/(radar|satellite)\/(\d{1,2})\/(\d+)\/(\d+)\.png$/);
  if (wx && method === "GET") {
    if (!env.ACCUWEATHER_API_KEY) throw new HttpError(404, "AccuWeather isn't set up.");
    const [, kind, z, x, y] = wx;
    // One cached copy per tile for 5 minutes, shared by everyone, so AccuWeather is called as little as possible.
    const bucket = Math.floor(Date.now() / 300000);
    const cacheKey = new Request(`${url.origin}/__wx/${kind}/${z}/${x}/${y}.png?b=${bucket}`);
    const cache = caches.default;
    let res = await cache.match(cacheKey);
    if (!res) {
      const product = kind === "radar" ? "radar/globalSIR" : "satellite/globalIR";
      const up = await fetch(`https://api.accuweather.com/maps/v1/${product}/zxy/tile/${z}/${x}/${y}.png?apikey=${encodeURIComponent(env.ACCUWEATHER_API_KEY)}`, { redirect: "follow" });
      if (!up.ok) throw new HttpError(up.status === 401 || up.status === 403 ? 502 : up.status, `AccuWeather said ${up.status}`);
      res = new Response(up.body, { headers: { "content-type": "image/png", "cache-control": "public, max-age=300" } });
      ctx.waitUntil(cache.put(cacheKey, res.clone()));
    }
    return res;
  }

  // --- your own car picture for a vehicle in your garage ---
  const vi = path.match(/^\/vehicles\/([A-Za-z0-9_-]+)\/image$/);
  if (vi && (method === "POST" || method === "DELETE")) {
    const rec = await db.prepare("SELECT * FROM records WHERE id = ? AND entity = 'Vehicle' AND owner_id = ?").bind(vi[1], me.id).first();
    if (!rec) throw new HttpError(404, "Vehicle not found");
    const data = JSON.parse(rec.data);
    if (method === "POST") {
      if (!/^image\/(png|webp)$/.test(String(body.mime || ""))) throw new HttpError(400, "Use a PNG or WebP picture.");
      let bytes;
      try { bytes = Uint8Array.from(atob(String(body.data || "")), (c) => c.charCodeAt(0)); } catch { throw new HttpError(400, "That picture couldn't be read."); }
      if (!bytes.length || bytes.length > 900 * 1024) throw new HttpError(413, "That picture is too big. Try a smaller one.");
      const t = Date.now();
      data.image_url = `/api/car-image/${rec.id}?v=${t}`;
      await db.batch([
        db.prepare("INSERT INTO car_images (vehicle_id, owner_id, mime, data, updated) VALUES (?, ?, ?, ?, ?) ON CONFLICT(vehicle_id) DO UPDATE SET mime = excluded.mime, data = excluded.data, updated = excluded.updated").bind(rec.id, me.id, body.mime, bytes, t),
        db.prepare("UPDATE records SET data = ?, updated_date = ? WHERE id = ?").bind(JSON.stringify(data), now(), rec.id),
      ]);
    } else {
      delete data.image_url;
      await db.batch([
        db.prepare("DELETE FROM car_images WHERE vehicle_id = ?").bind(rec.id),
        db.prepare("UPDATE records SET data = ?, updated_date = ? WHERE id = ?").bind(JSON.stringify(data), now(), rec.id),
      ]);
    }
    return json(parseRecord({ ...rec, data: JSON.stringify(data), owner_email: me.email }));
  }

  // --- photo gallery for a car in your garage ---
  const vp = path.match(/^\/vehicles\/([A-Za-z0-9_-]+)\/photos(?:\/([a-f0-9]{24}))?$/);
  if (vp && ((method === "POST" && !vp[2]) || (method === "DELETE" && vp[2]))) {
    const rec = await db.prepare("SELECT * FROM records WHERE id = ? AND entity = 'Vehicle' AND owner_id = ?").bind(vp[1], me.id).first();
    if (!rec) throw new HttpError(404, "Vehicle not found");
    const data = JSON.parse(rec.data);
    const photos = Array.isArray(data.photos) ? data.photos : [];
    if (method === "POST") {
      if (photos.length >= 24) throw new HttpError(400, "That's the most photos one car can hold (24). Delete one first.");
      if (!/^image\/(jpeg|png|webp)$/.test(String(body.mime || ""))) throw new HttpError(400, "Use a JPEG, PNG or WebP photo.");
      let bytes;
      try { bytes = Uint8Array.from(atob(String(body.data || "")), (c) => c.charCodeAt(0)); } catch { throw new HttpError(400, "That photo couldn't be read."); }
      if (!bytes.length || bytes.length > 900 * 1024) throw new HttpError(413, "That photo is too big.");
      const id = uid();
      data.photos = [{ id, url: `/api/car-photo/${id}`, caption: String(body.caption || "").slice(0, 120), at: now() }, ...photos];
      await db.batch([
        db.prepare("INSERT INTO car_photos (id, vehicle_id, owner_id, mime, data, created) VALUES (?, ?, ?, ?, ?, ?)").bind(id, rec.id, me.id, body.mime, bytes, Date.now()),
        db.prepare("UPDATE records SET data = ?, updated_date = ? WHERE id = ?").bind(JSON.stringify(data), now(), rec.id),
      ]);
    } else {
      data.photos = photos.filter((p) => p.id !== vp[2]);
      await db.batch([
        db.prepare("DELETE FROM car_photos WHERE id = ? AND owner_id = ?").bind(vp[2], me.id),
        db.prepare("UPDATE records SET data = ?, updated_date = ? WHERE id = ?").bind(JSON.stringify(data), now(), rec.id),
      ]);
    }
    return json(parseRecord({ ...rec, data: JSON.stringify(data), owner_email: me.email }));
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
    const r = await fetch(`${me.discord_webhook}?wait=true`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "Kaido Maps", content: `✅ Kaido Maps is connected! ${me.display_name}'s drives can now be posted here.` }) });
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
    if (!other) throw new HttpError(404, "No Kaido Maps user with that username or email.");
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
    const image = /^\/api\/car-image\/[A-Za-z0-9_-]+\?v=\d+$/.test(body.carImage || "") ? body.carImage : null;
    await db.prepare(`INSERT INTO live_pos (user_id, lat, lng, speed, heading, car_body, car_color, car_image, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET lat = excluded.lat, lng = excluded.lng, speed = excluded.speed, heading = excluded.heading, car_body = excluded.car_body, car_color = excluded.car_color, car_image = excluded.car_image, updated = excluded.updated`)
      .bind(me.id, lat, lng, Math.round(+body.speed || 0), heading, body_, color, image, Date.now()).run();
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
    return json({ drivers: results.map((r) => ({ ...card({ ...r, id: r.user_id }), lat: r.lat, lng: r.lng, speed: r.speed, heading: r.heading, car: r.car_body || r.car_image ? { body: r.car_body || 'sedan', color: r.car_color || r.color, image: r.car_image || null } : null, updated: new Date(r.updated).toISOString() })) });
  }

  // --- group drives (convoys): everyone heads to the same place and sees each other on the map ---
  const CONVOY_HOURS = 12;
  const convoyOut = async (c) => {
    const { results } = await db.prepare(
      `SELECT u.id, u.display_name, u.username, u.avatar_url, u.color, u.ghost_mode, l.lat, l.lng, l.speed, l.heading, l.car_body, l.car_color, l.car_image, l.updated
       FROM convoy_members m JOIN users u ON u.id = m.user_id LEFT JOIN live_pos l ON l.user_id = u.id WHERE m.convoy_id = ? ORDER BY m.joined`
    ).bind(c.id).all();
    const fresh = Date.now() - LIVE_FRESH_MS;
    return {
      id: c.id, code: c.code, name: c.name || "", dest: JSON.parse(c.dest), leaderId: c.owner_id, isLeader: c.owner_id === me.id,
      expires: new Date(c.expires).toISOString(),
      members: results.map((r) => ({
        ...card(r), me: r.id === me.id,
        live: !r.ghost_mode && r.updated > fresh ? { lat: r.lat, lng: r.lng, speed: r.speed, heading: r.heading, car: { body: r.car_body || "sedan", color: r.car_color || r.color, image: r.car_image || null } } : null,
      })),
    };
  };
  if (path === "/convoys" && method === "POST") {
    const d = body.dest || {};
    const lat = +d.lat, lng = +d.lng;
    if (!isFinite(lat) || !isFinite(lng)) throw new HttpError(400, "Pick a destination first.");
    // One group drive at a time: leave any you're in.
    await db.prepare("DELETE FROM convoy_members WHERE user_id = ?").bind(me.id).run();
    const id = uid(), t = Date.now();
    const code = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
    const dest = JSON.stringify({ name: String(d.name || "Destination").slice(0, 120), lat, lng });
    await db.batch([
      db.prepare("INSERT INTO convoys (id, code, owner_id, name, dest, created, expires) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, code, me.id, String(body.name || "").slice(0, 60), dest, t, t + CONVOY_HOURS * 3600000),
      db.prepare("INSERT INTO convoy_members (convoy_id, user_id, joined) VALUES (?, ?, ?)").bind(id, me.id, t),
    ]);
    return json(await convoyOut(await db.prepare("SELECT * FROM convoys WHERE id = ?").bind(id).first()));
  }
  if (path === "/convoys/mine" && method === "GET") {
    const c = await db.prepare("SELECT c.* FROM convoys c JOIN convoy_members m ON m.convoy_id = c.id WHERE m.user_id = ? AND c.expires > ? ORDER BY m.joined DESC LIMIT 1").bind(me.id, Date.now()).first();
    return json({ convoy: c ? await convoyOut(c) : null });
  }
  const cv = path.match(/^\/convoys\/([a-f0-9]{8})(?:\/(join|leave))?$/);
  if (cv) {
    const c = await db.prepare("SELECT * FROM convoys WHERE code = ? AND expires > ?").bind(cv[1], Date.now()).first();
    if (!c) throw new HttpError(404, "That group drive has ended.");
    if (!cv[2] && method === "GET") return json(await convoyOut(c));
    if (cv[2] === "join" && method === "POST") {
      await db.batch([
        db.prepare("DELETE FROM convoy_members WHERE user_id = ? AND convoy_id != ?").bind(me.id, c.id),
        db.prepare("INSERT OR IGNORE INTO convoy_members (convoy_id, user_id, joined) VALUES (?, ?, ?)").bind(c.id, me.id, Date.now()),
      ]);
      return json(await convoyOut(c));
    }
    if (cv[2] === "leave" && method === "POST") {
      // The leader leaving ends it for everyone.
      if (c.owner_id === me.id) await db.batch([db.prepare("DELETE FROM convoy_members WHERE convoy_id = ?").bind(c.id), db.prepare("UPDATE convoys SET expires = ? WHERE id = ?").bind(Date.now(), c.id)]);
      else await db.prepare("DELETE FROM convoy_members WHERE convoy_id = ? AND user_id = ?").bind(c.id, me.id).run();
      return json({ ok: true });
    }
  }

  // --- car meets: anyone can post one; public meets show to drivers nearby, friends-only to friends ---
  const meetOut = (r) => ({
    id: r.id, title: r.title, about: r.about || "", place: r.place || "", lat: r.lat, lng: r.lng,
    starts: new Date(r.starts).toISOString(), visibility: r.visibility, mine: r.owner_id === me.id,
    host: { ...card({ id: r.owner_id, display_name: r.display_name, username: r.username, avatar_url: r.avatar_url, color: r.color }) },
    going: r.going || 0, imGoing: !!r.im_going,
  });
  if (path === "/meets" && method === "GET") {
    const lat = +url.searchParams.get("lat"), lng = +url.searchParams.get("lng");
    const ids = await friendIds(db, me.id);
    const near = isFinite(lat) && isFinite(lng);
    const r = 1.0; // ~110 km
    const { results } = await db.prepare(
      `SELECT m.*, u.display_name, u.username, u.avatar_url, u.color,
        (SELECT COUNT(*) FROM meet_rsvps x WHERE x.meet_id = m.id) AS going,
        (SELECT 1 FROM meet_rsvps x WHERE x.meet_id = m.id AND x.user_id = ?) AS im_going
       FROM meets m JOIN users u ON u.id = m.owner_id
       WHERE m.starts > ? AND (m.owner_id = ? OR (m.visibility = 'friends' AND m.owner_id IN (${ids.map(() => "?").join(",") || "''"}))
         OR (m.visibility = 'public' AND ${near ? "m.lat BETWEEN ? AND ? AND m.lng BETWEEN ? AND ?" : "1"}))
       ORDER BY m.starts LIMIT 100`
    ).bind(me.id, Date.now() - 3 * 3600000, me.id, ...ids, ...(near ? [lat - r, lat + r, lng - r * 1.3, lng + r * 1.3] : [])).all();
    return json({ meets: results.map(meetOut) });
  }
  if (path === "/meets" && method === "POST") {
    const title = String(body.title || "").trim().slice(0, 80);
    const lat = +body.lat, lng = +body.lng, starts = Date.parse(body.starts);
    if (!title) throw new HttpError(400, "Give the meet a name.");
    if (!isFinite(lat) || !isFinite(lng)) throw new HttpError(400, "Pick where the meet is.");
    if (!isFinite(starts) || starts < Date.now() - 3600000) throw new HttpError(400, "Pick a time that hasn't passed.");
    const id = uid();
    await db.batch([
      db.prepare("INSERT INTO meets (id, owner_id, title, about, place, lat, lng, starts, visibility, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, me.id, title, String(body.about || "").slice(0, 500), String(body.place || "").slice(0, 160), lat, lng, starts, body.visibility === "public" ? "public" : "friends", Date.now()),
      db.prepare("INSERT INTO meet_rsvps (meet_id, user_id) VALUES (?, ?)").bind(id, me.id),
    ]);
    return json({ ok: true, id });
  }
  const mt = path.match(/^\/meets\/([a-f0-9]{24})\/(rsvp|delete)$/);
  if (mt && method === "POST") {
    const m = await db.prepare("SELECT * FROM meets WHERE id = ?").bind(mt[1]).first();
    if (!m) throw new HttpError(404, "That meet is gone.");
    if (mt[2] === "delete") {
      if (m.owner_id !== me.id) throw new HttpError(403, "Only the host can cancel it.");
      await db.batch([db.prepare("DELETE FROM meets WHERE id = ?").bind(m.id), db.prepare("DELETE FROM meet_rsvps WHERE meet_id = ?").bind(m.id)]);
    } else if (body.going) await db.prepare("INSERT OR IGNORE INTO meet_rsvps (meet_id, user_id) VALUES (?, ?)").bind(m.id, me.id).run();
    else await db.prepare("DELETE FROM meet_rsvps WHERE meet_id = ? AND user_id = ?").bind(m.id, me.id).run();
    return json({ ok: true });
  }

  // --- feed: recent drives, new car photos and meets from you and your friends ---
  if (path === "/feed" && method === "GET") {
    const ids = await friendIds(db, me.id);
    const people = [me.id, ...ids];
    const qs = people.map(() => "?").join(",");
    const { results: users } = await db.prepare(`SELECT id, display_name, username, avatar_url, color, profile FROM users WHERE id IN (${qs})`).bind(...people).all();
    // Respect "Miles & drives" visibility: friends see it unless set to "Only me".
    const byId = Object.fromEntries(users.map((u) => [u.id, u]));
    const showsDrives = (u) => u.id === me.id || readProfile(u.profile).show?.stats !== "me";
    const showsCar = (u) => u.id === me.id || readProfile(u.profile).show?.car !== "me";
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { results: recs } = await db.prepare(
      `SELECT id, entity, owner_id, data, created_date FROM records WHERE owner_id IN (${qs}) AND ((entity = 'Trip' AND created_date > ?) OR entity = 'Vehicle') ORDER BY created_date DESC LIMIT 400`
    ).bind(...people, since).all();
    const items = [];
    const cars = {};
    for (const r of recs) if (r.entity === "Vehicle") { const v = JSON.parse(r.data); cars[r.id] = v; }
    // Trim the first and last stretch of a drive so homes aren't shown.
    const trim = (pts) => {
      if (!Array.isArray(pts) || pts.length < 6) return [];
      const n = pts.length, cut = Math.max(2, Math.round(n * 0.08));
      const mid = pts.slice(cut, n - cut);
      const step = Math.max(1, Math.ceil(mid.length / 60));
      return mid.filter((_, i) => i % step === 0).map((p) => [Math.round(p.lat * 1e4) / 1e4, Math.round(p.lng * 1e4) / 1e4]);
    };
    for (const r of recs) {
      const u = byId[r.owner_id];
      if (!u) continue;
      const d = JSON.parse(r.data);
      if (r.entity === "Trip" && showsDrives(u) && (d.distance || 0) >= 1) {
        const v = cars[d.vehicle_id];
        items.push({
          id: `t_${r.id}`, kind: "drive", at: d.start_time || r.created_date, user: card(u),
          title: d.title || "Drive", distance: d.distance || 0, duration: d.duration || 0, topSpeed: d.top_speed || 0,
          mode: d.mode || null, convoy: !!d.convoy, corners: d.corners || null,
          car: v ? `${v.year || ""} ${v.make || ""} ${v.model || ""}`.trim() : "", end: String(d.end_location || "").split(",").slice(-1)[0].trim(),
          path: trim(d.route_points),
        });
      }
      if (r.entity === "Vehicle" && showsCar(u)) {
        for (const p of (d.photos || []).filter((x) => x.at > since).slice(0, 6)) {
          items.push({ id: `p_${p.id}`, kind: "photo", at: p.at, user: card(u), url: p.url, caption: p.caption || "", car: `${d.year || ""} ${d.make || ""} ${d.model || ""}`.trim() });
        }
      }
    }
    const { results: mts } = await db.prepare(`SELECT * FROM meets WHERE owner_id IN (${qs}) AND starts > ? AND (visibility = 'public' OR visibility = 'friends') ORDER BY created DESC LIMIT 20`).bind(...people, Date.now()).all();
    for (const m of mts) items.push({ id: `m_${m.id}`, kind: "meet", at: new Date(m.created).toISOString(), user: card(byId[m.owner_id]), meetId: m.id, title: m.title, place: m.place || "", starts: new Date(m.starts).toISOString(), lat: m.lat, lng: m.lng });
    items.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const top = items.slice(0, 60);
    if (top.length) {
      const { results: likes } = await db.prepare(`SELECT item_id, COUNT(*) AS n, SUM(user_id = ?) AS mine FROM feed_likes WHERE item_id IN (${top.map(() => "?").join(",")}) GROUP BY item_id`).bind(me.id, ...top.map((i) => i.id)).all();
      const L = Object.fromEntries(likes.map((l) => [l.item_id, l]));
      for (const it of top) { it.likes = L[it.id]?.n || 0; it.liked = !!L[it.id]?.mine; }
    }
    return json({ items: top });
  }
  const fl = path.match(/^\/feed\/([a-z]_[a-f0-9A-Za-z_-]{6,40})\/like$/);
  if (fl && method === "POST") {
    if (body.like) await db.prepare("INSERT OR IGNORE INTO feed_likes (item_id, user_id) VALUES (?, ?)").bind(fl[1], me.id).run();
    else await db.prepare("DELETE FROM feed_likes WHERE item_id = ? AND user_id = ?").bind(fl[1], me.id).run();
    return json({ ok: true });
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
        if (extraCreators === null) extraCreators = new Set(String(env.CREATOR_IDS || "").split(",").map((x) => x.trim()).filter(Boolean));
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
    // Auto-delete old trips for people who asked for it (Profile → Privacy).
    const { results } = await env.DB.prepare("SELECT id, trip_retention_days d FROM users WHERE trip_retention_days > 0").all();
    for (const u of results) {
      await env.DB.prepare("DELETE FROM records WHERE owner_id = ? AND entity = 'Trip' AND created_date < ?").bind(u.id, new Date(t - u.d * 86400000).toISOString()).run();
    }
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
  for (const m of MIGRATIONS) { try { await db.prepare(m).run(); } catch { /* already applied */ } }
  schemaReady = true;
}
