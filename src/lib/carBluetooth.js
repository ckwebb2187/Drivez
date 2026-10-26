import { useEffect, useState } from 'react';

// Car Bluetooth (Android app only): which devices are paired / connected right now.
// Miles count toward a car's odometer only while the phone is connected to that car.

export const nativeBt = () => {
  try { return !!(window.DrivezNative && JSON.parse(window.DrivezNative.info()).bluetooth); } catch { return false; }
};

const readStatus = () => {
  try { return JSON.parse(window.DrivezNative.bluetoothStatus()); } catch { return null; }
};

export function useCarBluetooth() {
  const [status, setStatus] = useState(() => (nativeBt() ? readStatus() : null));
  useEffect(() => {
    if (!nativeBt()) return undefined;
    // Only update when something actually changed, so the app doesn't redraw for nothing.
    const set = (next) => setStatus((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    const on = (e) => set(e.detail || readStatus());
    window.addEventListener('drivez-bt', on);
    const t = setInterval(() => set(readStatus()), 20000); // safety net
    return () => { window.removeEventListener('drivez-bt', on); clearInterval(t); };
  }, []);
  const request = () => { try { window.DrivezNative.requestBluetooth(); } catch { /* not in the app */ } };
  return { supported: nativeBt(), status, request };
}

// Android Auto (Android app 1.7+): is the phone on a car screen right now?
export const nativeAuto = () => {
  try { return !!(window.DrivezNative && JSON.parse(window.DrivezNative.info()).androidAuto); } catch { return false; }
};
const readAuto = () => { try { return JSON.parse(window.DrivezNative.androidAutoStatus()); } catch { return null; } };
export function useAndroidAuto() {
  const [status, setStatus] = useState(() => (nativeAuto() ? readAuto() : null));
  useEffect(() => {
    if (!nativeAuto()) return undefined;
    const set = (next) => setStatus((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    const on = (e) => set(e.detail || readAuto());
    window.addEventListener('drivez-auto', on);
    const t = setInterval(() => set(readAuto()), 20000);
    return () => { window.removeEventListener('drivez-auto', on); clearInterval(t); };
  }, []);
  return { supported: nativeAuto(), status };
}

// The garage car the phone is connected to right now (or null): its linked Bluetooth device,
// or Android Auto for a car linked to Android Auto (the selected car wins if several are).
export function connectedCar(vehicles, status, auto = null, active = null) {
  if (status?.connected?.length) {
    const addrs = new Set(status.connected.map((d) => d.address));
    const hit = vehicles.find((v) => v.bt_device && addrs.has(v.bt_device.address));
    if (hit) return hit;
  }
  if (auto?.connected) {
    const linked = vehicles.filter((v) => v.aa_link);
    return linked.find((v) => v.id === active?.id) || linked[0] || null;
  }
  return null;
}

// How a car's miles are counted:
//  'bluetooth' — only drives while connected to its linked Bluetooth device or Android Auto
//  'all'       — every drive with this car selected (nothing linked yet)
//  'manual'    — app drives never count; you update the odometer yourself
export const mileageMode = (v) => (v?.mileage_mode === 'manual' ? 'manual' : v?.bt_device || v?.aa_link ? 'bluetooth' : 'all');
