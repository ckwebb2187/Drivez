// Engine gauges from an OBD-II Bluetooth adapter (ported from the WRX Logger app, plus every
// standard Mode 01 reading). The Android app reads the adapter (DrivezNative.obd*); this file holds
// the gauge list, bubble settings, live polling and a demo mode so bubbles can be arranged without the car.
import { useEffect, useRef, useState } from 'react';
import { isMetric } from '@/lib/units';

// Values arrive in US units. kind: how to convert for metric users. warn/hot: high limits;
// warnLow/hotLow: low limits; abs: limits apply to the size either way (fuel trims).
// needs: native keys a derived gauge reads.
export const GROUPS = [
  { id: 'air', title: 'Boost & air' },
  { id: 'engine', title: 'Engine' },
  { id: 'fuel', title: 'Fuel' },
  { id: 'temps', title: 'Temperatures' },
  { id: 'more', title: 'Electrical & trip' },
];
export const METRICS = [
  { id: 'boost', g: 'air', label: 'Boost', unit: 'psi', kind: 'boost', min: 0, max: 22, dec: 1, on: true, big: true, needs: ['map', 'baro'] },
  { id: 'map', g: 'air', label: 'Manifold', unit: 'kPa', min: 0, max: 255, dec: 0 },
  { id: 'maf', g: 'air', label: 'MAF', unit: 'g/s', min: 0, max: 250, dec: 0 },
  { id: 'baro', g: 'air', label: 'Baro', unit: 'kPa', min: 70, max: 105, dec: 0 },
  { id: 'rpm', g: 'engine', label: 'RPM', unit: 'rpm', min: 0, max: 7000, dec: 0, warn: 6200, hot: 6600 },
  { id: 'load', g: 'engine', label: 'Load', unit: '%', min: 0, max: 100, dec: 0 },
  { id: 'absLoad', g: 'engine', label: 'Abs load', unit: '%', min: 0, max: 200, dec: 0 },
  { id: 'timing', g: 'engine', label: 'Timing', unit: '°', min: -10, max: 30, dec: 1, on: true },
  { id: 'throttle', g: 'engine', label: 'Throttle', unit: '%', min: 0, max: 100, dec: 0 },
  { id: 'relThrottle', g: 'engine', label: 'Rel throttle', unit: '%', min: 0, max: 100, dec: 0 },
  { id: 'cmdThrottle', g: 'engine', label: 'Cmd throttle', unit: '%', min: 0, max: 100, dec: 0 },
  { id: 'pedal', g: 'engine', label: 'Pedal', unit: '%', min: 0, max: 100, dec: 0 },
  { id: 'demandTorque', g: 'engine', label: 'Torque ask', unit: '%', min: -25, max: 100, dec: 0 },
  { id: 'actualTorque', g: 'engine', label: 'Torque', unit: '%', min: -25, max: 100, dec: 0 },
  { id: 'runtime', g: 'engine', label: 'Run time', unit: 'min', kind: 'time', min: 0, max: 3600, dec: 0 },
  { id: 'afr', g: 'fuel', label: 'AFR', unit: ':1', min: 10, max: 18, dec: 1, needs: ['lambda', 'lambdaW'] },
  { id: 'cmdAfr', g: 'fuel', label: 'Target AFR', unit: ':1', min: 10, max: 18, dec: 1, needs: ['cmdLambda'] },
  { id: 'stft1', g: 'fuel', label: 'STFT B1', unit: '%', min: -25, max: 25, dec: 1, warn: 10, hot: 20, abs: true },
  { id: 'ltft1', g: 'fuel', label: 'LTFT B1', unit: '%', min: -25, max: 25, dec: 1, warn: 8, hot: 15, abs: true },
  { id: 'stft2', g: 'fuel', label: 'STFT B2', unit: '%', min: -25, max: 25, dec: 1, warn: 10, hot: 20, abs: true },
  { id: 'ltft2', g: 'fuel', label: 'LTFT B2', unit: '%', min: -25, max: 25, dec: 1, warn: 8, hot: 15, abs: true },
  { id: 'railPress', g: 'fuel', label: 'Rail (DI)', unit: 'psi', kind: 'psi', min: 0, max: 3000, dec: 0 },
  { id: 'railRel', g: 'fuel', label: 'Rail rel', unit: 'psi', kind: 'psi', min: 0, max: 100, dec: 0 },
  { id: 'fuelPress', g: 'fuel', label: 'Fuel press', unit: 'psi', kind: 'psi', min: 0, max: 110, dec: 0 },
  { id: 'fuelLevel', g: 'fuel', label: 'Fuel', unit: '%', min: 0, max: 100, dec: 0, warnLow: 15, hotLow: 8 },
  { id: 'fuelRate', g: 'fuel', label: 'Fuel rate', unit: 'gal/h', kind: 'galh', min: 0, max: 10, dec: 1 },
  { id: 'mpg', g: 'fuel', label: 'Economy', unit: 'mpg', kind: 'mpg', min: 0, max: 60, dec: 0, needs: ['speed', 'maf'] },
  { id: 'ethanol', g: 'fuel', label: 'Ethanol', unit: '%', min: 0, max: 100, dec: 0 },
  { id: 'coolant', g: 'temps', label: 'Coolant', unit: '°F', kind: 'temp', min: 120, max: 250, dec: 0, warn: 215, hot: 225, on: true },
  { id: 'iat', g: 'temps', label: 'Intake', unit: '°F', kind: 'temp', min: 40, max: 160, dec: 0, warn: 110, hot: 130, on: true },
  { id: 'oil', g: 'temps', label: 'Oil', unit: '°F', kind: 'temp', min: 120, max: 300, dec: 0, warn: 250, hot: 270 },
  { id: 'catTemp', g: 'temps', label: 'Catalyst', unit: '°F', kind: 'temp', min: 200, max: 1800, dec: 0, warn: 1500, hot: 1650 },
  { id: 'ambient', g: 'temps', label: 'Outside', unit: '°F', kind: 'temp', min: 0, max: 120, dec: 0 },
  { id: 'voltage', g: 'more', label: 'Battery', unit: 'V', min: 10, max: 16, dec: 1, warnLow: 12.2, hotLow: 11.5, warn: 15, hot: 15.5 },
  { id: 'speed', g: 'more', label: 'Speed', unit: 'mph', kind: 'speed', min: 0, max: 120, dec: 0 },
  { id: 'egr', g: 'more', label: 'EGR', unit: '%', min: 0, max: 100, dec: 0 },
  { id: 'evap', g: 'more', label: 'EVAP purge', unit: '%', min: 0, max: 100, dec: 0 },
  { id: 'milDist', g: 'more', label: 'Dist w/ CEL', unit: 'mi', kind: 'dist', min: 0, max: 1000, dec: 0, warn: 1 },
  { id: 'clearDist', g: 'more', label: 'Since clear', unit: 'mi', kind: 'dist', min: 0, max: 5000, dec: 0 },
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

// Bubble animations (all take the theme's colors). "auto" picks one per world theme. Several can be mixed.
export const BUBBLE_FX = [
  { id: 'auto', title: 'Auto (by theme)' },
  { id: 'breathe', title: 'Breathe' },
  { id: 'orbit', title: 'Orbit' },
  { id: 'comet', title: 'Comet trail' },
  { id: 'radar', title: 'Radar sweep' },
  { id: 'ripple', title: 'Ripple' },
  { id: 'sonar', title: 'Sonar' },
  { id: 'holo', title: 'Hologram' },
  { id: 'reactor', title: 'Reactor' },
  { id: 'plasma', title: 'Plasma ring' },
  { id: 'aurora', title: 'Aurora' },
  { id: 'circuit', title: 'Circuit' },
  { id: 'heartbeat', title: 'Heartbeat' },
  { id: 'starfield', title: 'Starfield' },
  { id: 'glitch', title: 'Glitch' },
  { id: 'tracer', title: 'Edge tracer' },
  { id: 'stream', title: 'Data stream' },
  { id: 'lattice', title: 'Hex lattice' },
  { id: 'charge', title: 'Charge up' },
  { id: 'none', title: 'Still' },
];
export const VALUE_FX = [
  { id: 'glow', title: 'Neon glow' },
  { id: 'outline', title: 'Neon outline' },
  { id: 'chroma', title: 'Chromatic' },
  { id: 'flash', title: 'Flash on change' },
  { id: 'pulse', title: 'Pop on change' },
  { id: 'flicker', title: 'Flicker' },
  { id: 'plain', title: 'Plain' },
];
export const GLOWS = ['Soft', 'Normal', 'Bright', 'Max'];
// Other parts of the app that can wear the same animation mix.
export const FX_TARGETS = [
  { id: 'gauges', title: 'Engine gauges' },
  { id: 'speed', title: 'Speed gauge' },
  { id: 'buttons', title: 'Drive buttons' },
  { id: 'turn', title: 'Turn card' },
  { id: 'run', title: 'Tōge / Wangan card' },
  { id: 'go', title: 'Go buttons' },
];
// Gauge shapes. Non-round ones trace their progress glow around their own edge.
export const SHAPES = [
  { id: 'circle', title: 'Bubble' },
  { id: 'hex', title: 'Hexagon' },
  { id: 'octagon', title: 'Octagon' },
  { id: 'diamond', title: 'Diamond' },
  { id: 'cyber', title: 'Cyber square' },
  { id: 'shield', title: 'Shield' },
  { id: 'bar', title: 'Bar' },
];
// Stackable extras: each can be on with any animation style.
export const EXTRAS = [
  { id: 'neonRim', title: 'Neon rim' },
  { id: 'halo', title: 'Double halo' },
  { id: 'innerGlow', title: 'Inner glow' },
  { id: 'reactive', title: 'Glow grows with value' },
  { id: 'colorShift', title: 'Color shifts with value' },
  { id: 'tipSpark', title: 'Arc tip spark' },
  { id: 'ticks', title: 'Gauge ticks' },
  { id: 'shine', title: 'Glass shine' },
  { id: 'scanlines', title: 'Scanlines' },
  { id: 'float', title: 'Gentle float' },
  { id: 'shiftLight', title: 'Shift light (high RPM)' },
  { id: 'peaks', title: 'Show highest this session' },
];

export const WARN = '#FFB020';
export const HOT = '#FF3B3B';
export const SIZES = [64, 80, 100];

export { setObdPrefs, useObdPrefs, setObdDemo, useObdDemo, fxFor, fxListOf, samplePeaks, takePeaks } from '@/lib/obdPrefs';
import { useObdDemo } from '@/lib/obdPrefs';

// ---------------------------------------------------------------- native bridge (Android app)

const nat = () => (typeof window !== 'undefined' ? window.DrivezNative : null);
export const hasNativeObd = () => { try { return !!nat()?.obdState; } catch { return false; } };
const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
export const obdDevices = () => (hasNativeObd() ? parse(nat().obdDevices(), { devices: [] }) : { devices: [] });
export const obdConnect = (address, name) => nat()?.obdConnect(address, name);
export const obdDisconnect = () => nat()?.obdDisconnect();
export const obdLog = (on) => (hasNativeObd() ? nat().obdLog(on) : 'Needs the Android app');
export const obdAskBluetooth = () => { try { nat()?.requestBluetooth(); } catch { /* not in the app */ } };
// Tell the app which readings the shown bubbles need, so it skips the rest (saves battery and time).
export function obdWatch(ids) {
  try {
    const keys = new Set();
    ids.forEach((id) => { const m = METRICS.find((x) => x.id === id); (m?.needs || [id]).forEach((k) => keys.add(k)); });
    nat()?.obdWatch?.([...keys].join(','));
  } catch { /* older app */ }
}

// Demo values (a looping boost pull) for arranging bubbles without the car.
let demoPeak = null;
function demoState() {
  const t = performance.now() / 1000;
  const pull = Math.sin(t * 0.7);
  const w = (a, b, k = 0.2) => a + b * Math.sin(t * k);
  const boost = 7 + 12 * pull;
  demoPeak = demoPeak == null ? boost : Math.max(demoPeak, boost);
  const speed = w(48, 8);
  const maf = 90 + 80 * pull;
  return {
    status: 'demo',
    values: {
      boost, map: 101 + boost / 0.145, baro: 101, rpm: 3600 + 2600 * pull, timing: 14 - 6 * pull, load: 55 + 40 * pull, absLoad: 70 + 60 * pull, maf,
      throttle: Math.max(0, 50 + 50 * pull), relThrottle: Math.max(0, 45 + 45 * pull), cmdThrottle: Math.max(0, 48 + 48 * pull), pedal: Math.max(0, 50 + 50 * pull),
      demandTorque: 40 + 50 * pull, actualTorque: 38 + 48 * pull, runtime: t % 3600,
      lambda: 0.92 - 0.12 * Math.max(0, pull), cmdLambda: 0.9 - 0.12 * Math.max(0, pull), stft1: w(2, 4, 1.3), ltft1: w(-1.5, 1, 0.05), stft2: w(1, 4, 1.1), ltft2: w(-1, 1, 0.05),
      railPress: 1600 + 600 * pull, railRel: w(55, 3), fuelPress: w(58, 2), fuelLevel: w(62, 1, 0.01), fuelRate: Math.max(0.3, 2 + 3 * pull), ethanol: 10,
      coolant: w(196, 4, 0.1), iat: w(100, 16, 0.15), oil: w(212, 6, 0.08), catTemp: w(1250, 150, 0.3), ambient: 78,
      voltage: w(14.2, 0.2, 0.5), speed, egr: 0, evap: w(12, 10, 0.4), milDist: 0, clearDist: 812,
    },
    peakBoost: demoPeak,
  };
}

export const resetPeak = () => { demoPeak = null; try { nat()?.obdResetPeak(); } catch { /* ignore */ } };

// Gauges worked out on the phone from the raw readings.
function derive(s) {
  const v = s.values || {};
  const lam = v.lambda ?? v.lambdaW;
  if (lam != null) v.afr = lam * 14.7;
  if (v.cmdLambda != null) v.cmdAfr = v.cmdLambda * 14.7;
  if (v.speed != null && v.maf > 0.5) v.mpg = Math.min(99, (v.speed * 7.718) / v.maf); // gasoline, stoich
  return s;
}

// Live engine state. Polls while `active` and the screen is visible; only re-renders when something changed.
export function useObd(active = true, every = 250) {
  const isDemo = useObdDemo();
  const read = () => derive(isDemo ? demoState() : hasNativeObd() ? parse(nat().obdState(), { status: 'off' }) : { status: 'none' });
  const [s, setS] = useState(read);
  const last = useRef('');
  useEffect(() => {
    if (!active) return undefined;
    let t = null;
    const tick = () => {
      if (document.hidden) return;
      const next = read();
      const key = JSON.stringify(next.values) + next.status + next.peakBoost + next.logging + (next.supported || '');
      if (key !== last.current) { last.current = key; setS(next); }
    };
    const start = () => { clearInterval(t); t = setInterval(tick, isDemo || hasNativeObd() ? every : 3000); tick(); };
    start();
    const vis = () => (document.hidden ? clearInterval(t) : start());
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, [active, isDemo, every]); // eslint-disable-line react-hooks/exhaustive-deps
  return s;
}

// ---------------------------------------------------------------- display helpers (metric users get km/h, bar, L/100km; temps stay °F)

export function display(m, v) {
  if (v == null || Number.isNaN(v)) return { text: '--', unit: unitOf(m) };
  if (m.kind === 'time') { const mins = Math.floor(v / 60); return { text: `${mins}:${String(Math.floor(v % 60)).padStart(2, '0')}`, unit: 'min' }; }
  if (isMetric()) {
    switch (m.kind) {
      case 'speed': return { text: (v * 1.609344).toFixed(m.dec), unit: 'km/h' };
      case 'dist': return { text: (v * 1.609344).toFixed(m.dec), unit: 'km' };
      case 'boost': return { text: (v * 0.0689476).toFixed(2), unit: 'bar' };
      case 'psi': return { text: (v * 0.0689476).toFixed(v > 300 ? 0 : 1), unit: 'bar' };
      case 'galh': return { text: (v * 3.78541).toFixed(1), unit: 'L/h' };
      case 'mpg': return { text: v > 0.5 ? (235.215 / v).toFixed(1) : '--', unit: 'L/100km' };
      default: break;
    }
  }
  return { text: v.toFixed(m.dec), unit: m.unit };
}
const unitOf = (m) => (isMetric() ? ({ speed: 'km/h', dist: 'km', boost: 'bar', psi: 'bar', galh: 'L/h', mpg: 'L/100km' }[m.kind] || m.unit) : m.unit);
export function level(m, v) {
  if (v == null) return 0;
  const x = m.abs ? Math.abs(v) : v;
  if ((m.hot != null && x >= m.hot) || (m.hotLow != null && v <= m.hotLow)) return 2;
  if ((m.warn != null && x >= m.warn) || (m.warnLow != null && v <= m.warnLow)) return 1;
  return 0;
}
export const fraction = (m, v) => (v == null ? 0 : Math.max(0, Math.min(1, (v - m.min) / (m.max - m.min))));
