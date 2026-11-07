// Engine bubble settings + demo switch. Kept tiny because the drive screen loads it at startup;
// the gauge list and polling live in obd.js, which loads only when bubbles are on.
import { useSyncExternalStore } from 'react';

const KEY = 'dz-obd';
const DEFAULTS = { show: false, theme: 'map', fx: 'auto', valueFx: 'glow', shape: 'circle', fxList: null, fxTargets: {}, glow: 1, extras: { neonRim: true, tipSpark: true }, size: 1, opacity: 85, locked: false, metrics: { boost: true, coolant: true, iat: true, timing: true }, pos: {} };
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
export const useObdPrefs = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => prefs);

let demo = false;
const demoSubs = new Set();
export const isObdDemo = () => demo;
export function setObdDemo(on) { demo = on; demoSubs.forEach((f) => f()); }
export const useObdDemo = () => useSyncExternalStore((f) => { demoSubs.add(f); return () => demoSubs.delete(f); }, () => demo);

// Animation choices. "auto" picks one per world theme; several can be mixed (fxList).
const AUTO_FX = {
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
