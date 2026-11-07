// Engine bubble settings + demo switch. Kept tiny because the drive screen loads it at startup;
// the gauge list and polling live in obd.js, which loads only when bubbles are on.
import { useSyncExternalStore } from 'react';

const KEY = 'dz-obd';
const DEFAULTS = { show: false, theme: 'map', fx: 'auto', valueFx: 'glow', glow: 1, extras: { neonRim: true, tipSpark: true }, size: 1, opacity: 85, locked: false, metrics: { boost: true, coolant: true, iat: true, timing: true }, pos: {} };
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
