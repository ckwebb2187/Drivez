import { useState, useRef, useCallback, useEffect } from 'react';
import { haversineMiles } from './helpers';
import { api } from '@/api/base44Client';

const MPS_TO_MPH = 2.23694;
const LIVE_EVERY_MS = 10000; // share position with friends every 10 s
const G_MPH_PER_S = 21.94;    // 1 g of acceleration = 21.94 mph per second

// Personal drive stats (no leaderboards, so they don't encourage racing):
// peak g-force from the phone's motion sensor, best 0-60, hard brakes / launches, smoothness.
function emptyStats() { return { maxG: 0, best060: null, hardBrakes: 0, hardAccels: 0 }; }
export function smoothnessScore(st) {
  return Math.max(0, Math.min(100, Math.round(100 - st.hardBrakes * 8 - st.hardAccels * 5 - (st.maxG > 0.7 ? 10 : 0))));
}

// A drive in progress is saved on the phone every few seconds, so if the app is closed or
// restarted mid-drive it picks up where it left off (same route, miles and time).
const LIVE_KEY = 'dz-live-drive';
export function pendingDrive(maxAgeMs = 2 * 3600000) {
  try {
    const d = JSON.parse(localStorage.getItem(LIVE_KEY) || 'null');
    return d && Date.now() - d.savedAt < maxAgeMs ? d : null;
  } catch { return null; }
}
export const clearPendingDrive = () => { try { localStorage.removeItem(LIVE_KEY); } catch { /* ignore */ } };

export function useGpsDrive(car) {
  const carRef = useRef(car);
  carRef.current = car;
  const [status, setStatus] = useState('idle'); // idle | acquiring | driving | ended
  const [error, setError] = useState(null); // 'denied' | 'unsupported'
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [distance, setDistance] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [route, setRoute] = useState([]); // {lat, lng, speed, t}
  const [currentPosition, setCurrentPosition] = useState(null);
  const [maxSpeed, setMaxSpeed] = useState(0);
  const [speedHistory, setSpeedHistory] = useState([]);
  const [gpsWaiting, setGpsWaiting] = useState(false);
  const [heading, setHeading] = useState(null);
  const [stats, setStats] = useState(emptyStats);
  const statsRef = useRef(emptyStats());
  const kin = useRef({ lastMph: null, lastT: null, stopAt: null, cool: 0, g: 0 });
  const motionOn = useRef(false);

  const watchIdRef = useRef(null);
  const timerRef = useRef(null);
  const startedRef = useRef(false);
  const gotFixRef = useRef(false);
  const startTimeRef = useRef(null);
  const lastFixRef = useRef(null);
  const distRef = useRef(0);
  const wakeLockRef = useRef(null);
  const lastLiveRef = useRef(0);

  const stopLive = useCallback(() => {
    if (lastLiveRef.current) { lastLiveRef.current = 0; api.post('/live/stop').catch(() => {}); }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    try { window.DrivezNative?.keepScreenOn(false); } catch (e) { /* not in the Android app */ }
    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    } catch (e) { /* already released */ }
  }, []);

  const acquireWakeLock = useCallback(async () => {
    try { window.DrivezNative?.keepScreenOn(true); } catch (e) { /* not in the Android app */ }
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        wakeLockRef.current.addEventListener('release', () => { wakeLockRef.current = null; });
      }
    } catch (e) { /* wake lock unsupported */ }
  }, []);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleFix = useCallback((pos) => {
    const { latitude, longitude, speed, accuracy, heading: hd } = pos.coords;
    if (accuracy > 50) { setGpsWaiting(true); return; } // ignore GPS points with accuracy worse than 50 m

    if (!gotFixRef.current) {
      gotFixRef.current = true;
      setStatus('driving');
    }
    setGpsWaiting(false);

    const t = Math.round((Date.now() - startTimeRef.current) / 1000);

    // Speed: GPS-reported value if present, else distance/time since last fix
    let mph = 0;
    if (speed != null && !Number.isNaN(speed)) {
      mph = Math.round(speed * MPS_TO_MPH);
    } else if (lastFixRef.current) {
      const dt = (pos.timestamp - lastFixRef.current.timestamp) / 1000;
      if (dt > 0) {
        mph = Math.round((haversineMiles(lastFixRef.current.lat, lastFixRef.current.lng, latitude, longitude) / dt) * 3600);
      }
    }
    mph = Math.max(0, Math.min(mph, 200));

    // Distance: skip GPS wobble while stopped (tiny jumps within the fix's own accuracy),
    // so parked time doesn't add miles. Moving fixes always count.
    const step = lastFixRef.current ? haversineMiles(lastFixRef.current.lat, lastFixRef.current.lng, latitude, longitude) : 0;
    const wobble = mph < 3 && step * 1609.34 < Math.max(8, accuracy * 0.6);
    if (lastFixRef.current && !wobble) {
      distRef.current += step;
      setDistance(Math.round(distRef.current * 10) / 10);
    }
    if (!lastFixRef.current || !wobble) lastFixRef.current = { lat: latitude, lng: longitude, timestamp: pos.timestamp };

    // Hard brakes / launches (from speed change) and 0-60 timing.
    const k = kin.current, st = statsRef.current, now = pos.timestamp;
    if (k.lastT != null) {
      const dt = (now - k.lastT) / 1000;
      if (dt > 0.3 && dt < 5) {
        const gLong = (mph - k.lastMph) / dt / G_MPH_PER_S;
        if (now > k.cool && gLong <= -0.4) { st.hardBrakes++; k.cool = now + 5000; }
        else if (now > k.cool && gLong >= 0.35) { st.hardAccels++; k.cool = now + 5000; }
      }
    }
    if (mph < 3) k.stopAt = now;
    else if (k.stopAt && mph >= 60 && k.lastMph < 60) {
      const frac = k.lastMph != null && mph !== k.lastMph ? (60 - k.lastMph) / (mph - k.lastMph) : 1;
      const tHit = k.lastT + frac * (now - k.lastT);
      const secs = (tHit - k.stopAt) / 1000;
      if (secs > 2.5 && secs < 25) st.best060 = st.best060 == null ? secs : Math.min(st.best060, secs);
      k.stopAt = null;
    } else if (k.stopAt && now - k.stopAt > 30000) k.stopAt = null;
    k.lastMph = mph; k.lastT = now;
    setStats({ ...st, maxG: Math.max(st.maxG, k.g) });

    setCurrentPosition([latitude, longitude]);
    if (hd != null && !Number.isNaN(hd) && mph > 2) setHeading(hd);
    setCurrentSpeed(mph);
    setMaxSpeed(prev => Math.max(prev, mph));
    setSpeedHistory(prev => [...prev, mph]);
    setRoute(prev => [...prev, { lat: latitude, lng: longitude, speed: mph, t }]);

    // Share live position with friends (the server skips this in Ghost Mode)
    if (Date.now() - lastLiveRef.current > LIVE_EVERY_MS) {
      lastLiveRef.current = Date.now();
      api.post('/live', { lat: latitude, lng: longitude, speed: mph, heading: hd != null && !Number.isNaN(hd) ? hd : null, carBody: carRef.current?.body, carColor: carRef.current?.color, carImage: carRef.current?.image || undefined }).catch(() => {});
    }
  }, []);

  const handleError = useCallback((err) => {
    if (err.code === err.PERMISSION_DENIED) {
      // Only a permission denial stops the drive
      stopWatching();
      startedRef.current = false;
      setGpsWaiting(false);
      setError('denied');
      setStatus('idle');
      return;
    }
    // TIMEOUT or POSITION_UNAVAILABLE: transient — keep watching and wait for the next fix
    setGpsWaiting(true);
  }, [stopWatching]);

  // Peak g-force from the motion sensor (smoothed; ignores phone drops/bumps above 2 g).
  const onMotion = useCallback((e) => {
    const a = e.acceleration;
    if (!a || a.x == null) return;
    const g = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z) / 9.81;
    const k = kin.current;
    k.g = k.g * 0.8 + g * 0.2;
    if (k.g < 2 && k.g > statsRef.current.maxG) statsRef.current.maxG = Math.round(k.g * 100) / 100;
  }, []);
  const startMotion = useCallback(async () => {
    try {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        if ((await DeviceMotionEvent.requestPermission()) !== 'granted') return;
      }
      window.addEventListener('devicemotion', onMotion);
      motionOn.current = true;
    } catch { /* no motion sensor: g-force just stays 0 */ }
  }, [onMotion]);
  const stopMotion = useCallback(() => { window.removeEventListener('devicemotion', onMotion); motionOn.current = false; }, [onMotion]);

  const start = useCallback((snap = null) => {
    setError(null);
    statsRef.current = snap?.stats ? { ...emptyStats(), ...snap.stats } : emptyStats();
    kin.current = { lastMph: null, lastT: null, stopAt: null, cool: 0, g: 0 };
    setStats({ ...statsRef.current });
    startMotion();
    distRef.current = snap?.distance || 0;
    lastFixRef.current = null;
    gotFixRef.current = false;
    setGpsWaiting(false);
    if (snap) {
      setDistance(Math.round(distRef.current * 10) / 10);
      setRoute(snap.route || []);
      setMaxSpeed(snap.maxSpeed || 0);
      setSpeedHistory(snap.speedHistory || []);
    }
    if (!('geolocation' in navigator)) {
      setError('unsupported');
      return;
    }
    // Start the timer immediately, before the first GPS fix arrives
    startedRef.current = true;
    startTimeRef.current = snap?.startTime || Date.now();
    setElapsedTime(Math.round((Date.now() - startTimeRef.current) / 1000));
    timerRef.current = setInterval(() => setElapsedTime(Math.round((Date.now() - startTimeRef.current) / 1000)), 1000);
    acquireWakeLock();
    setStatus('acquiring');
    watchIdRef.current = navigator.geolocation.watchPosition(handleFix, handleError, {
      enableHighAccuracy: true,
      maximumAge: 0
    });
  }, [handleFix, handleError, acquireWakeLock, startMotion]);

  const end = useCallback(() => {
    stopMotion();
    setStats({ ...statsRef.current });
    stopWatching();
    releaseWakeLock();
    stopLive();
    setStatus('ended');
  }, [stopWatching, releaseWakeLock, stopLive, stopMotion]);

  const reset = useCallback(() => {
    clearPendingDrive();
    stopMotion();
    statsRef.current = emptyStats();
    setStats(emptyStats());
    stopWatching();
    releaseWakeLock();
    stopLive();
    startedRef.current = false;
    startTimeRef.current = null;
    lastFixRef.current = null;
    distRef.current = 0;
    setStatus('idle');
    setError(null);
    setCurrentSpeed(0);
    setDistance(0);
    setElapsedTime(0);
    setRoute([]);
    setCurrentPosition(null);
    setMaxSpeed(0);
    setSpeedHistory([]);
    setGpsWaiting(false);
    setHeading(null);
  }, [stopWatching, releaseWakeLock, stopLive, stopMotion]);

  // Save the drive in progress (every 5 s, and right away when the app goes to the background).
  const snapRef = useRef(null);
  snapRef.current = status === 'driving' || status === 'acquiring'
    ? { startTime: startTimeRef.current, distance: distRef.current, route, maxSpeed, speedHistory: speedHistory.slice(-1500), stats: statsRef.current }
    : null;
  useEffect(() => {
    if (status !== 'driving' && status !== 'acquiring') return undefined;
    const save = () => {
      const s = snapRef.current;
      if (!s?.startTime) return;
      const step = Math.ceil((s.route.length || 1) / 1500);
      try { localStorage.setItem(LIVE_KEY, JSON.stringify({ ...s, route: s.route.filter((_, i) => i % step === 0 || i === s.route.length - 1), savedAt: Date.now() })); } catch { /* storage full */ }
    };
    save();
    const t = setInterval(save, 5000);
    const onHide = () => { if (document.visibilityState === 'hidden') save(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', save);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', save); };
  }, [status]);

  // Reacquire the wake lock when returning to the foreground mid-drive
  useEffect(() => {
    const onVisible = () => { if (startedRef.current) acquireWakeLock(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [acquireWakeLock]);

  useEffect(() => () => { stopWatching(); }, [stopWatching]);

  return {
    status, error, currentSpeed, distance, elapsedTime, route,
    currentPosition, heading, maxSpeed, speedHistory, gpsWaiting, start, end, reset,
    stats: { ...stats, smoothness: smoothnessScore(stats) },
  };
}
