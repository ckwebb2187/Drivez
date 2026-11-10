// Engine bubble settings + demo switch. Kept tiny because the drive screen loads it at startup;
// the gauge list and polling live in obd.js, which loads only when bubbles are on.
import { useSyncExternalStore } from 'react';

const KEY = 'dz-obd';
const DEFAULTS = { show: false, theme: 'map', fx: 'auto', valueFx: 'glow', shape: 'circle', fxList: null, fxTargets: {}, glow: 1, extras: { neonRim: true, tipSpark: true }, size: 1, opacity: 85, locked: false, metrics: { boost: true, coolant: true, iat: true, timing: true }, pos: {}, autoConnect: true, autoCar: null };
let prefs = load();
const subs = new Set();
function load() {
  try { const p = JSON.parse(localStorage.getItem(KEY) || '{}'); return { ...DEFAULTS, ...p, metrics: { ...DEFAULTS.metrics, ...(p.metrics || {}) }, extras: { ...DEFAULTS.extras, ...(p.extras || {}) }, pos: p.pos || {} }; } catch { return DEFAULTS; }
}
export function setObdPrefs(patch) {
  prefs = { ...prefs, ...(typeof patch === 'function' ? patch(prefs) : patch) };
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* private mode */ }
  subs.forEach((f) => f());
}
export const getObdPrefs = () => prefs;
export const useObdPrefs = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => prefs);

let demo = false;
const demoSubs = new Set();
export const isObdDemo = () => demo;
export function setObdDemo(on) { demo = on; demoSubs.forEach((f) => f()); }
export const useObdDemo = () => useSyncExternalStore((f) => { demoSubs.add(f); return () => demoSubs.delete(f); }, () => demo);

// Animation choices. "auto" picks one per world theme; several can be mixed (fxList).
const AUTO_FX = {
  greatwave: 'ripple', crimsonwave: 'plasma', dragon: 'plasma', xmas: 'starfield', snowday: 'breathe', heat: 'orbit', carbon: 'comet', underground: 'circuit',
  ghost: 'aurora', thunder: 'glitch', ember: 'plasma', tide: 'sonar', leaf: 'breathe', psychic: 'holo',
  kaido: 'orbit', tokyo: 'orbit', sakuranight: 'orbit', harajuku: 'orbit', cyberpunk: 'glitch', matrix: 'circuit', y2k: 'holo',
  vapor: 'aurora', galaxy: 'starfield', kawaii: 'ripple', rose: 'ripple', bayshore: 'comet', daikoku: 'radar', shuto: 'sonar',
  dystopian: 'radar', wasteland: 'radar', risingsun: 'plasma', samurai: 'reactor', tougedawn: 'heartbeat',
  lavender: 'aurora', zen: 'breathe', minimal: 'breathe',
};
export const fxFor = (fx, themeKey) => (fx !== 'auto' ? fx : AUTO_FX[String(themeKey).split('@')[0]] || 'breathe');
export const fxListOf = (prefs, themeKey) => {
  const list = prefs.fxList?.length ? prefs.fxList : [prefs.fx || 'auto'];
  return [...new Set(list.map((f) => fxFor(f, themeKey)))].filter((f) => f !== 'none');
};
// The animation mix for another part of the app, or null when that part is switched off.
export function useAppFx(target, themeKey) {
  const p = useObdPrefs();
  return p.fxTargets?.[target] ? fxListOf(p, themeKey) : null;
}

// The on-map gauge style panel (open/closed; not saved).
let panel = false;
const panelSubs = new Set();
export function setStylePanel(on) { panel = on; panelSubs.forEach((f) => f()); }
export const useStylePanel = () => useSyncExternalStore((f) => { panelSubs.add(f); return () => panelSubs.delete(f); }, () => panel);
// Open the panel; with no live adapter it turns on demo values (and turns them off again on close).
let autoDemo = false;
// Is the OBD adapter streaming right now? (cheap check of the Android app)
const liveNow = () => { try { return JSON.parse(window.DrivezNative?.obdState?.() || '{}').status === 'live'; } catch { return false; } };
export function openStylePanel(live = liveNow()) {
  if (!live && !demo) { autoDemo = true; setObdDemo(true); }
  setObdPrefs({ show: true });
  setStylePanel(true);
}
export function closeStylePanel() {
  if (autoDemo) { autoDemo = false; setObdDemo(false); }
  setStylePanel(false);
}

// Where the animation mix shows. Engine gauges are on unless switched off; the rest start off.
export const fxTargetOn = (p, id) => (id === 'gauges' ? p.fxTargets?.gauges !== false : !!p.fxTargets?.[id]);
export const toggleFxTarget = (id) => setObdPrefs((p) => ({ fxTargets: { ...p.fxTargets, [id]: !fxTargetOn(p, id) } }));
export const setAllFxTargets = (ids, on) => setObdPrefs((p) => ({ fxTargets: { ...p.fxTargets, ...Object.fromEntries(ids.map((id) => [id, on])) } }));

// Engine peaks for the trip (peak boost, max coolant and intake temps), sampled during a drive.
// Lives here (not obd.js) so the drive screen doesn't load the whole gauge list at startup.
let tripPeaks = null;
export function samplePeaks() {
  let s;
  try { if (!window.DrivezNative?.obdState) return; s = JSON.parse(window.DrivezNative.obdState()); } catch { return; }
  const v = s?.values;
  if (!v || !Object.keys(v).length) return; // not connected / no readings
  tripPeaks = tripPeaks || {};
  const up = (k, x) => { if (typeof x === 'number' && isFinite(x) && (tripPeaks[k] == null || x > tripPeaks[k])) tripPeaks[k] = Math.round(x * 10) / 10; };
  up('boost', s.peakBoost); up('coolant', v.coolant); up('iat', v.iat);
}
export function takePeaks() { const p = tripPeaks; tripPeaks = null; return p && Object.keys(p).length ? p : null; }
