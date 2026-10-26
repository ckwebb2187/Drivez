// Units: miles + mph (default) or kilometers + km/h. Everything is stored in miles and mph;
// this only changes what's shown and spoken.
import { useEffect, useState } from 'react';

const KEY = 'dz-units';
const KM = 1.609344;
let metric = (() => { try { return localStorage.getItem(KEY) === 'metric'; } catch { return false; } })();

export const isMetric = () => metric;
export function setUnits(u) {
  metric = u === 'metric';
  try { localStorage.setItem(KEY, metric ? 'metric' : 'imperial'); } catch { /* ignore */ }
  window.dispatchEvent(new Event('dz-units'));
}
// Re-renders the component when the setting changes.
export function useUnits() {
  const [, bump] = useState(0);
  useEffect(() => { const on = () => bump((n) => n + 1); window.addEventListener('dz-units', on); return () => window.removeEventListener('dz-units', on); }, []);
  return metric ? 'metric' : 'imperial';
}

export const speedUnit = () => (metric ? 'km/h' : 'mph');
export const distUnit = () => (metric ? 'km' : 'mi');
export const distWord = () => (metric ? 'kilometers' : 'miles');
// mph -> shown number (whole)
export const spd = (mph) => (mph == null || mph === '' ? mph : Math.round(Number(mph) * (metric ? KM : 1)));
// miles -> shown number (1 decimal under 100, whole above)
export function dst(mi, digits) {
  if (mi == null || mi === '') return mi;
  const v = Number(mi) * (metric ? KM : 1);
  const d = digits ?? (Math.abs(v) < 100 ? 1 : 0);
  const r = Math.round(v * 10 ** d) / 10 ** d;
  return d === 0 ? r.toLocaleString() : r;
}
export const fmtSpeed = (mph) => `${spd(mph)} ${speedUnit()}`;
export const fmtDist = (mi, digits) => `${dst(mi, digits)} ${distUnit()}`;
// miles as a whole number with thousands separators (odometers, lifetime totals)
export const fmtBig = (mi) => `${Math.round(Number(mi || 0) * (metric ? KM : 1)).toLocaleString()} ${distUnit()}`;
