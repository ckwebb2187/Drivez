// Engine gauges from an OBD-II Bluetooth adapter (ported from the WRX Logger app).
// The Android app reads the adapter (DrivezNative.obd*); this file holds the gauge list,
// the bubble settings, live polling and a demo mode so bubbles can be arranged without the car.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { isMetric } from '@/lib/units';

// min..max is the arc range; warn/hot change the color (values in US units, as the adapter sends).
export const METRICS = [
  { id: 'boost', label: 'Boost', unit: 'psi', min: 0, max: 22, dec: 1, on: true, big: true },
  { id: 'coolant', label: 'Coolant', unit: '°F', min: 120, max: 250, dec: 0, warn: 215, hot: 225, on: true, temp: true },
  { id: 'iat', label: 'Intake', unit: '°F', min: 40, max: 160, dec: 0, warn: 110, hot: 130, on: true, temp: true },
  { id: 'timing', label: 'Timing', unit: '°', min: -10, max: 30, dec: 1, on: true },
  { id: 'rpm', label: 'RPM', unit: 'rpm', min: 0, max: 7000, dec: 0, warn: 6200, hot: 6600, on: false },
  { id: 'speed', label: 'Speed', unit: 'mph', min: 0, max: 120, dec: 0, on: false, speed: true },
  { id: 'load', label: 'Load', unit: '%', min: 0, max: 100, dec: 0, on: false },
  { id: 'throttle', label: 'Throttle', unit: '%', min: 0, max: 100, dec: 0, on: false },
  { id: 'maf', label: 'MAF', unit: 'g/s', min: 0, max: 250, dec: 0, on: false },
];

// Bubble color sets: "map" follows the world theme; the rest are the WRX Logger themes.
export const BUBBLE_THEMES = [
  { id: 'map', title: 'Match map' },
  { id: 'wrblue', title: 'WR Blue', accent: '#2E6BFF', bg: '#0B1020', track: '#27324A', text: '#FFFFFF', label: '#9DB2D9' },
  { id: 'rallygold', title: 'Rally Gold', accent: '#FFC72C', bg: '#0D1B3E', track: '#263559', text: '#FFFFFF', label: '#FFE08A' },
  { id: 'stealth', title: 'Stealth', accent: '#E8E8E8', bg: '#000000', track: '#2A2A2A', text: '#FFFFFF', label: '#8A8A8A' },
  { id: 'neon', title: 'Neon', accent: '#00F0FF', bg: '#14001F', track: '#3A1550', text: '#FFFFFF', label: '#FF4FD8' },
  { id: 'sunset', title: 'Sunset', accent: '#FF6A13', bg: '#1A0D06', track: '#40261A', text: '#FFFFFF', label: '#FFB38A' },
];
export const WARN = '#FFB020';
export const HOT = '#FF3B3B';
export const SIZES = [64, 80, 100];

// ---------------------------------------------------------------- settings (saved per phone)

const KEY = 'dz-obd';
const DEFAULTS = { show: false, theme: 'map', size: 1, opacity: 85, locked: false, metrics: Object.fromEntries(METRICS.map((m) => [m.id, m.on])), pos: {} };
let prefs = load();
const subs = new Set();
function load() {
  try { const p = JSON.parse(localStorage.getItem(KEY) || '{}'); return { ...DEFAULTS, ...p, metrics: { ...DEFAULTS.metrics, ...(p.metrics || {}) }, pos: p.pos || {} }; } catch { return DEFAULTS; }
}
export function setObdPrefs(patch) {
  prefs = { ...prefs, ...(typeof patch === 'function' ? patch(prefs) : patch) };
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* private mode */ }
  subs.forEach((f) => f());
}
export function useObdPrefs() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => prefs);
}

// ---------------------------------------------------------------- native bridge (Android app)

const nat = () => (typeof window !== 'undefined' ? window.DrivezNative : null);
export const hasNativeObd = () => { try { return !!nat()?.obdState; } catch { return false; } };
const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
export const obdDevices = () => (hasNativeObd() ? parse(nat().obdDevices(), { devices: [] }) : { devices: [] });
export const obdConnect = (address, name) => nat()?.obdConnect(address, name);
export const obdDisconnect = () => nat()?.obdDisconnect();
export const obdLog = (on) => (hasNativeObd() ? nat().obdLog(on) : 'Needs the Android app');
export const obdAskBluetooth = () => { try { nat()?.requestBluetooth(); } catch { /* not in the app */ } };

// Demo values (a looping boost pull) for arranging bubbles without the car.
let demo = false;
let demoPeak = null;
const demoSubs = new Set();
export const setObdDemo = (on) => { demo = on; demoPeak = null; demoSubs.forEach((f) => f()); };
export const useObdDemo = () => useSyncExternalStore((f) => { demoSubs.add(f); return () => demoSubs.delete(f); }, () => demo);
function demoState() {
  const t = performance.now() / 1000;
  const pull = Math.sin(t * 0.7);
  const boost = 7 + 12 * pull;
  demoPeak = demoPeak == null ? boost : Math.max(demoPeak, boost);
  return {
    status: 'demo',
    values: {
      boost, rpm: 3600 + 2600 * pull, timing: 14 - 6 * pull, load: 55 + 40 * pull, maf: 90 + 80 * pull,
      throttle: Math.max(0, 50 + 50 * pull), speed: 48 + 8 * Math.sin(t * 0.2), coolant: 196 + 4 * Math.sin(t * 0.1), iat: 100 + 16 * Math.sin(t * 0.15),
    },
    peakBoost: demoPeak,
  };
}
export const resetPeak = () => { demoPeak = null; try { nat()?.obdResetPeak(); } catch { /* ignore */ } };

// Live engine state, polled ~8 times a second while `active`. { status, values, peakBoost, logging, ... }
export function useObd(active = true, every = 125) {
  const isDemo = useObdDemo();
  const [s, setS] = useState(() => (isDemo ? demoState() : hasNativeObd() ? parse(nat().obdState(), { status: 'off' }) : { status: 'none' }));
  useEffect(() => {
    if (!active) return undefined;
    const tick = () => setS(isDemo ? demoState() : hasNativeObd() ? parse(nat().obdState(), { status: 'off' }) : { status: 'none' });
    tick();
    const t = setInterval(tick, isDemo || hasNativeObd() ? every : 2000);
    return () => clearInterval(t);
  }, [active, isDemo, every]);
  return s;
}

// ---------------------------------------------------------------- display helpers (metric users get °C, km/h, bar)

export function display(m, v) {
  if (v == null || Number.isNaN(v)) return { text: '--', unit: unitOf(m) };
  let x = v;
  if (isMetric()) {
    if (m.temp) x = (v - 32) * 5 / 9;
    else if (m.speed) x = v * 1.609344;
    else if (m.id === 'boost') return { text: (v * 0.0689476).toFixed(2), unit: 'bar' };
  }
  return { text: x.toFixed(m.dec), unit: unitOf(m) };
}
const unitOf = (m) => (isMetric() ? (m.temp ? '°C' : m.speed ? 'km/h' : m.id === 'boost' ? 'bar' : m.unit) : m.unit);
export const level = (m, v) => (v == null ? 0 : m.hot != null && v >= m.hot ? 2 : m.warn != null && v >= m.warn ? 1 : 0);
export const fraction = (m, v) => (v == null ? 0 : Math.max(0, Math.min(1, (v - m.min) / (m.max - m.min))));
