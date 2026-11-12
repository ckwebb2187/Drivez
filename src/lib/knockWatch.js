// Knock watch: a stand-in for Subaru's DAM (Dynamic Advance Multiplier) using standard OBD-II data.
// The FA20DIT only reports DAM through Subaru's private memory reads, so instead we learn what timing
// your ECU normally runs in each rpm/load cell and flag sudden drops during a real pull (the ECU
// pulling timing because it heard knock).
//
// The ECU also pulls timing on purpose when you lift, shift, rev-match or when it pops on decel.
// Those aren't knock, so we only judge steady pulls: on boost, throttle held open, rpm climbing
// smoothly, and never in the second after a lift-off, shift or rpm jump. A pull must last half a
// second to count. "DAM (est.)" drops on real pulls and climbs back after clean driving, like DAM.

const KEY = 'dz-knock-map-v2';          // v2: relearn without the shift / decel transients
const PULL_START = 2.5;                 // degrees below normal that counts as a pull
const PULL_END = 1;
const CONFIRM = 2;                      // readings in a row (about half a second) before a pull counts
let base = {};                          // cell -> { t: learned timing, n: samples }
try { localStorage.removeItem('dz-knock-map'); base = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { base = {}; }
let score = 100, events = [], cur = null, pending = 0, lastSave = 0, lastT = 0, drive = 0, lastOut = null;
let quietUntil = 0, lastEventAt = 0;
const hist = [];                        // last ~1.5 s of { t, rpm, thr, timing }

const cellOf = (rpm, load) => `${Math.round(rpm / 250)}:${Math.round(load / 8)}`;
const save = (now) => { if (now - lastSave < 10000) return; lastSave = now; try { localStorage.setItem(KEY, JSON.stringify(base)); } catch { /* full */ } };

// Feed one reading (US units: rpm, timing °, load %, boost psi, throttle %). Adds pull / dam / knockScore / knockEvents to v.
export function knockFeed(v) {
  const now = Date.now();
  // Several screens may read the engine at once: only count each moment once.
  if (now - lastT < 150 && lastOut) { Object.assign(v, lastOut); return v; }
  const dt = lastT ? Math.min(2, (now - lastT) / 1000) : 0; lastT = now;
  const { rpm, timing } = v;
  const load = v.load ?? (v.absLoad != null ? v.absLoad / 2 : null);
  if (rpm == null || timing == null || load == null) return v;
  const thr = v.throttle ?? v.pedal ?? null;

  // How things changed over the last half second.
  while (hist.length && now - hist[0].t > 1500) hist.shift();
  const ago = hist.find((h) => now - h.t <= 650) || hist[hist.length - 1];
  const secs = ago ? Math.max(0.1, (now - ago.t) / 1000) : 1;
  const dRpm = ago ? (rpm - ago.rpm) / secs : 0;
  const dThr = ago && thr != null && ago.thr != null ? thr - ago.thr : 0;
  const dropRecent = hist.filter((h) => now - h.t <= 750).reduce((m, h) => Math.max(m, h.timing), timing) - timing;
  hist.push({ t: now, rpm, thr, timing });

  // Lift-off, shift, rev-match blip or an rpm jump: the ECU pulls timing on purpose. Ignore the next second.
  if (dThr < -8 || dRpm < -600 || dRpm > 2500) quietUntil = now + 1000;
  const steady = now >= quietUntil;
  const inPull = steady && rpm >= 2200 && (v.boost ?? -99) >= 2 && (thr == null || thr >= 35);

  const key = cellOf(rpm, load);
  const c = base[key] || (base[key] = { t: timing, n: 0 });
  const deficit = c.n >= 8 ? Math.max(0, c.t - timing) : 0;
  // Learn the usual timing for this rpm/load, only from steady driving and never during a pull.
  if (steady && !cur && pending === 0) { c.t += (timing - c.t) * 0.08; c.n = Math.min(c.n + 1, 9999); }

  // A knock pull: sudden (2.5°+ drop within ~0.75 s), 2.5°+ below normal, during a steady pull, held ~0.5 s.
  const candidate = inPull && deficit >= PULL_START && (cur || pending > 0 || dropRecent >= 2.5);
  if (candidate) {
    pending += 1;
    if (pending >= CONFIRM) {
      if (!cur) cur = { at: now, max: 0, rpm, boost: v.boost ?? null };
      if (deficit > cur.max) { cur.max = deficit; cur.rpm = rpm; cur.boost = v.boost ?? cur.boost; }
    }
  } else {
    if (cur && (deficit < PULL_END || !inPull)) {
      events = [{ ...cur, max: Math.round(cur.max * 10) / 10 }, ...events].slice(0, 20);
      drive += 1; lastEventAt = now;
      score = Math.max(0, score - Math.min(12, cur.max * 2));
      cur = null;
    }
    if (!cur) pending = 0;
  }
  // Climbs back toward 1.00 after ~10 s of driving with no knock (about a minute or two from a big drop).
  if (!cur && dt && rpm > 1000 && now - lastEventAt > 10000) score = Math.min(100, score + 0.5 * dt);
  save(now);
  lastOut = { pull: cur ? -Math.round(Math.max(deficit, 0) * 10) / 10 : 0, knockScore: Math.round(score), dam: Math.round(score) / 100, knockEvents: drive };
  Object.assign(v, lastOut);
  return v;
}

export const knockLog = () => events;
export function knockResetDrive() { drive = 0; events = []; score = 100; cur = null; pending = 0; }
export function knockForget() { base = {}; knockResetDrive(); try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
export const knockLearned = () => Object.values(base).filter((c) => c.n >= 8).length;
