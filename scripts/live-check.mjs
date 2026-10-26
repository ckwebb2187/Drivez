// Live check. Run right after `npm run deploy`.
// Loads the live app 3 times: every startup file must return 200, and the
// median load time is logged to perf/history.csv.
// Exit 1 = the live app is broken, so roll back (`npx wrangler rollback`).
//
// Usage: node scripts/live-check.mjs [ticket-id]
import fs from "fs";

const URL_BASE = process.env.KAIDO_URL || "https://drivez.webb-home.workers.dev";
const HISTORY = "perf/history.csv";
// Warn (not fail) when a cold load takes longer than this.
const SLOW_LOAD_MS = 3000;
const ticket = process.argv[2] || "manual";

async function timed(url) {
  const t0 = performance.now();
  const res = await fetch(url, { headers: { "cache-control": "no-cache" } });
  const ttfb = performance.now() - t0;
  const body = await res.text();
  return { status: res.status, ttfb, ms: performance.now() - t0, body };
}

async function loadOnce() {
  const page = await timed(`${URL_BASE}/?livecheck=${Date.now()}`);
  if (page.status !== 200) throw new Error(`index.html returned ${page.status}`);
  const files = [...new Set([...page.body.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]))];
  if (!files.length) throw new Error("index.html lists no /assets files");
  const t0 = performance.now();
  const results = await Promise.all(files.map((f) => timed(URL_BASE + f).then((r) => ({ f, ...r }))));
  const bad = results.filter((r) => r.status !== 200);
  if (bad.length) throw new Error(`asset errors: ${bad.map((b) => `${b.f}=${b.status}`).join(", ")}`);
  return { ttfb: page.ttfb, load: page.ms + (performance.now() - t0) };
}

const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
let ok = true;
let runs = [];
try {
  for (let i = 0; i < 3; i++) runs.push(await loadOnce());
} catch (e) {
  ok = false;
  console.error(`LIVE CHECK FAILED: ${e.message}`);
}

const ttfb = runs.length ? Math.round(median(runs.map((r) => r.ttfb))) : "";
const load = runs.length ? Math.round(median(runs.map((r) => r.load))) : "";
if (ok) {
  console.log(`Live app OK · first byte ${ttfb} ms · full startup download ${load} ms (median of 3)`);
  if (load > SLOW_LOAD_MS) console.warn(`WARNING: startup download over ${SLOW_LOAD_MS} ms`);
}

if (!fs.existsSync(HISTORY)) fs.writeFileSync(HISTORY, "date,ticket,kind,startup_kb,all_js_kb,ttfb_ms,load_ms,result\n");
fs.appendFileSync(HISTORY, `${new Date().toISOString().slice(0, 16)},${ticket},live,,,${ttfb},${load},${ok ? "pass" : "FAIL"}\n`);
process.exit(ok ? 0 : 1);
