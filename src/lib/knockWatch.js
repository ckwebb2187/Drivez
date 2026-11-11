// Knock watch: a stand-in for Subaru's DAM (Dynamic Advance Multiplier) using standard OBD-II data.
// The FA20DIT only reports DAM through Subaru's private memory reads, so instead we learn what timing
// your ECU normally runs in each rpm/load cell and flag sudden drops under load (the ECU pulling timing
// because it heard knock). "Knock health" behaves like DAM: it drops on pulls and recovers slowly
// with clean driving under load.

const KEY = 'dz-knock-map';
const PULL_START = 2.5;   // degrees below normal that counts as a pull
const PULL_END = 1;
let base = {};            // cell -> { t: learned timing, n: samples }
try { base = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { base = {}; }
let score = 100, events = [], cur = null, lastSave = 0, lastT = 0, drive = 0, lastOut = null;

const cellOf = (rpm, load) => `${Math.round(rpm / 250)}:${Math.round(load / 8)}`;
const recent = []; // last few [time, timing] readings, to tell a sudden pull from a smooth map change
const save = (now) => { if (now - lastSave < 10000) return; lastSave = now; try { localStorage.setItem(KEY, JSON.stringify(base)); } catch { /* full */ } };

// Feed one reading (US units: rpm, timing °, load %, boost psi). Adds pull / knockScore / knockEvents to v.
export function knockFeed(v) {
  const now = Date.now();
  // Several screens may read the engine at once: only count each moment once.
  if (now - lastT < 150 && lastOut) { Object.assign(v, lastOut); return v; }
  const dt = lastT ? Math.min(2, (now - lastT) / 1000) : 0; lastT = now;
  const { rpm, timing } = v;
  const load = v.load ?? (v.absLoad != null ? v.absLoad / 2 : null);
  if (rpm == null || timing == null || load == null) return v;
  const loaded = rpm >= 2000 && (load >= 50 || (v.boost ?? 0) >= 2);
  const key = cellOf(rpm, load);
  const c = base[key] || (base[key] = { t: timing, n: 0 });
  const deficit = c.n >= 8 ? Math.max(0, c.t - timing) : 0;
  // A knock pull is abrupt: timing falls 2.5°+ within about half a second.
  while (recent.length && now - recent[0][0] > 750) recent.shift();
  const drop = recent.length ? Math.max(...recent.map((x) => x[1])) - timing : 0;
  recent.push([now, timing]);
  const pull = cur || drop >= 2.5 ? deficit : 0;
  // Learn the usual timing for this rpm/load (not while a pull is happening).
  if (!(loaded && pull >= PULL_END)) { c.t += (timing - c.t) * 0.08; c.n = Math.min(c.n + 1, 9999); }
  if (loaded && pull >= PULL_START) {
    if (!cur) cur = { at: now, max: 0, rpm, boost: v.boost ?? null };
    if (pull > cur.max) { cur.max = pull; cur.rpm = rpm; cur.boost = v.boost ?? cur.boost; }
  } else if (cur && pull < PULL_END) {
    events = [{ ...cur, max: Math.round(cur.max * 10) / 10 }, ...events].slice(0, 20);
    drive += 1;
    score = Math.max(0, score - Math.min(15, cur.max * 2));
    cur = null;
  }
  if (loaded && !cur && dt) score = Math.min(100, score + 0.15 * dt); // clean driving under load slowly earns it back, like DAM
  save(now);
  lastOut = { pull: loaded && pull ? -Math.round(pull * 10) / 10 : 0, knockScore: Math.round(score), dam: Math.round(score) / 100, knockEvents: drive };
  Object.assign(v, lastOut);
  return v;
}

export const knockLog = () => events;
export function knockResetDrive() { drive = 0; events = []; score = 100; cur = null; }
export function knockForget() { base = {}; knockResetDrive(); try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
export const knockLearned = () => Object.values(base).filter((c) => c.n >= 8).length;
