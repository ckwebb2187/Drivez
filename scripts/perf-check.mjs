// Speed gate. Run after `npm run build`.
// Measures what a phone downloads at startup (gzipped) and all JS in the app,
// compares with perf/baseline.json, and logs the result to perf/history.csv.
// Exit 1 = the update made startup too heavy, so don't deploy.
//
// Usage: node scripts/perf-check.mjs [ticket-id]
import fs from "fs";
import path from "path";
import zlib from "zlib";

const DIST = "dist";
const BASELINE = "perf/baseline.json";
const HISTORY = "perf/history.csv";
// Allowed growth per update, in KB gzipped.
const MAX_STARTUP_GROWTH_KB = 15;
const MAX_TOTAL_JS_GROWTH_KB = 60;

const gz = (file) => zlib.gzipSync(fs.readFileSync(file), { level: 9 }).length / 1024;
const ticket = process.argv[2] || "manual";

if (!fs.existsSync(path.join(DIST, "index.html"))) {
  console.error("perf-check: dist/index.html missing. Run `npm run build` first.");
  process.exit(1);
}

// Startup = files index.html loads right away (scripts, preloads, stylesheets).
const html = fs.readFileSync(path.join(DIST, "index.html"), "utf8");
const startupFiles = [...new Set(
  [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1])
)];
const startup = startupFiles.map((u) => ({ file: u, kb: gz(path.join(DIST, u)) }));
const startupKB = startup.reduce((s, f) => s + f.kb, 0);

// Every JS file in the build (startup + lazy pages).
const assets = fs.readdirSync(path.join(DIST, "assets"));
const totalJsKB = assets
  .filter((f) => f.endsWith(".js"))
  .reduce((s, f) => s + gz(path.join(DIST, "assets", f)), 0);

const round = (n) => Math.round(n * 10) / 10;
console.log("Startup files (KB gzipped):");
for (const f of startup.sort((a, b) => b.kb - a.kb)) console.log(`  ${round(f.kb).toString().padStart(7)}  ${f.file}`);
console.log(`Startup total: ${round(startupKB)} KB · All JS: ${round(totalJsKB)} KB`);

let base = null;
if (fs.existsSync(BASELINE)) base = JSON.parse(fs.readFileSync(BASELINE, "utf8"));

let ok = true;
const notes = [];
if (base) {
  const dS = startupKB - base.startupKB;
  const dT = totalJsKB - base.totalJsKB;
  console.log(`Change vs baseline: startup ${dS >= 0 ? "+" : ""}${round(dS)} KB · all JS ${dT >= 0 ? "+" : ""}${round(dT)} KB`);
  if (dS > MAX_STARTUP_GROWTH_KB) { ok = false; notes.push(`startup grew ${round(dS)} KB (limit ${MAX_STARTUP_GROWTH_KB})`); }
  if (dT > MAX_TOTAL_JS_GROWTH_KB) { ok = false; notes.push(`all JS grew ${round(dT)} KB (limit ${MAX_TOTAL_JS_GROWTH_KB})`); }
} else {
  console.log("No baseline yet: this build becomes the baseline.");
}

// Ratchet: when an update makes the app lighter, that becomes the new bar.
if (ok && (!base || startupKB < base.startupKB || totalJsKB < base.totalJsKB)) {
  const next = {
    startupKB: round(base ? Math.min(startupKB, base.startupKB) : startupKB),
    totalJsKB: round(base ? Math.min(totalJsKB, base.totalJsKB) : totalJsKB),
    updated: new Date().toISOString().slice(0, 10),
    ticket,
  };
  fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
  fs.writeFileSync(BASELINE, JSON.stringify(next, null, 2) + "\n");
  console.log("Baseline updated.");
}

if (!fs.existsSync(HISTORY)) fs.writeFileSync(HISTORY, "date,ticket,kind,startup_kb,all_js_kb,ttfb_ms,load_ms,result\n");
fs.appendFileSync(HISTORY, `${new Date().toISOString().slice(0, 16)},${ticket},build,${round(startupKB)},${round(totalJsKB)},,,${ok ? "pass" : "FAIL"}\n`);

if (!ok) {
  console.error(`SPEED CHECK FAILED: ${notes.join("; ")}`);
  process.exit(1);
}
console.log("SPEED CHECK PASSED");
