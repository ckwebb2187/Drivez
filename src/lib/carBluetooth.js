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
    const on = (e) => setStatus(e.detail || readStatus());
    window.addEventListener('drivez-bt', on);
    const t = setInterval(() => setStatus(readStatus()), 20000); // safety net
    return () => { window.removeEventListener('drivez-bt', on); clearInterval(t); };
  }, []);
  const request = () => { try { window.DrivezNative.requestBluetooth(); } catch { /* not in the app */ } };
  return { supported: nativeBt(), status, request };
}

// The garage car whose linked Bluetooth device is connected right now (or null).
export function connectedCar(vehicles, status) {
  if (!status?.connected?.length) return null;
  const addrs = new Set(status.connected.map((d) => d.address));
  return vehicles.find((v) => v.bt_device && addrs.has(v.bt_device.address)) || null;
}

// How a car's miles are counted:
//  'bluetooth' — only drives while connected to its linked device
//  'all'       — every drive with this car selected (no Bluetooth linked yet)
//  'manual'    — app drives never count; you update the odometer yourself
export const mileageMode = (v) => (v?.mileage_mode === 'manual' ? 'manual' : v?.bt_device ? 'bluetooth' : 'all');
