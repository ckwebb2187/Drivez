// OBD2 auto-connect (Android app): when the phone joins your car's Bluetooth, connect the
// adapter you used last; when you leave the car, let it go. Driven by Bluetooth events, no polling.
import { getObdPrefs } from '@/lib/obdPrefs';

const nat = () => window.DrivezNative;
const obdStatus = () => { try { return JSON.parse(nat().obdState()).status; } catch { return 'off'; } };
const btStatus = () => { try { return JSON.parse(nat().bluetoothStatus()); } catch { return null; } };
// Your car's Bluetooth: the one picked in settings, else one that looks like the Subaru.
export const autoCarMatch = (car, d) => (car
  ? (car.address ? d.address === car.address : d.name?.toLowerCase() === car.name?.toLowerCase())
  : /boo?baru|subaru/i.test(d.name || ''));

let inCar = false, ours = false, timers = [], started = false;
const clear = () => { timers.forEach(clearTimeout); timers = []; };

function tryConnect() {
  clear();
  // The adapter wakes with the ignition, so give it a few chances over a few minutes.
  [1500, 12000, 35000, 80000, 180000].forEach((ms) => timers.push(setTimeout(() => {
    const p = getObdPrefs(), s = obdStatus();
    if (!inCar || !p.autoConnect || !p.device || s === 'live' || s === 'connecting') return;
    ours = true;
    try { nat().obdConnect(p.device.address, p.device.name); } catch { /* not in the app */ }
  }, ms)));
}

export function checkObdAuto(st = btStatus()) {
  const p = getObdPrefs();
  const here = !!(p.autoConnect && p.device && st?.connected?.some((d) => d.address !== p.device.address && autoCarMatch(p.autoCar, d)));
  if (here && !inCar) { inCar = true; tryConnect(); }
  else if (!here && inCar) {
    inCar = false; clear();
    const s = obdStatus();
    if (ours && (s === 'live' || s === 'connecting')) { try { nat().obdDisconnect(); } catch { /* ignore */ } }
    ours = false;
  }
}

export function startObdAuto() {
  if (started || !nat()?.obdState || !nat()?.bluetoothStatus) return;
  started = true;
  window.addEventListener('drivez-bt', (e) => checkObdAuto(e.detail || btStatus()));
  checkObdAuto();
}

// You tapped Disconnect: stop the pending retries until you next get in the car.
export const holdObdAuto = () => { clear(); ours = false; };
