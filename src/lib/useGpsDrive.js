import { useState, useRef, useCallback, useEffect } from 'react';
import { haversineMiles } from './helpers';
import { api } from '@/api/base44Client';

const MPS_TO_MPH = 2.23694;
const LIVE_EVERY_MS = 10000; // share position with friends every 10 s

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

    if (lastFixRef.current) {
      distRef.current += haversineMiles(lastFixRef.current.lat, lastFixRef.current.lng, latitude, longitude);
      setDistance(Math.round(distRef.current * 10) / 10);
    }
    lastFixRef.current = { lat: latitude, lng: longitude, timestamp: pos.timestamp };

    setCurrentPosition([latitude, longitude]);
    if (hd != null && !Number.isNaN(hd) && mph > 2) setHeading(hd);
    setCurrentSpeed(mph);
    setMaxSpeed(prev => Math.max(prev, mph));
    setSpeedHistory(prev => [...prev, mph]);
    setRoute(prev => [...prev, { lat: latitude, lng: longitude, speed: mph, t }]);

    // Share live position with friends (the server skips this in Ghost Mode)
    if (Date.now() - lastLiveRef.current > LIVE_EVERY_MS) {
      lastLiveRef.current = Date.now();
      api.post('/live', { lat: latitude, lng: longitude, speed: mph, heading: hd != null && !Number.isNaN(hd) ? hd : null, carBody: carRef.current?.body, carColor: carRef.current?.color }).catch(() => {});
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

  const start = useCallback(() => {
    setError(null);
    distRef.current = 0;
    lastFixRef.current = null;
    gotFixRef.current = false;
    setGpsWaiting(false);
    if (!('geolocation' in navigator)) {
      setError('unsupported');
      return;
    }
    // Start the timer immediately, before the first GPS fix arrives
    startedRef.current = true;
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => setElapsedTime(prev => prev + 1), 1000);
    acquireWakeLock();
    setStatus('acquiring');
    watchIdRef.current = navigator.geolocation.watchPosition(handleFix, handleError, {
      enableHighAccuracy: true,
      maximumAge: 0
    });
  }, [handleFix, handleError, acquireWakeLock]);

  const end = useCallback(() => {
    stopWatching();
    releaseWakeLock();
    stopLive();
    setStatus('ended');
  }, [stopWatching, releaseWakeLock, stopLive]);

  const reset = useCallback(() => {
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
  }, [stopWatching, releaseWakeLock, stopLive]);

  // Reacquire the wake lock when returning to the foreground mid-drive
  useEffect(() => {
    const onVisible = () => { if (startedRef.current) acquireWakeLock(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [acquireWakeLock]);

  useEffect(() => () => { stopWatching(); }, [stopWatching]);

  return {
    status, error, currentSpeed, distance, elapsedTime, route,
    currentPosition, heading, maxSpeed, speedHistory, gpsWaiting, start, end, reset
  };
}
