// Family on the phone: the shared state, the background check-in (location + battery),
// and alerts when someone arrives, leaves, checks in or needs help.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';

export const ROLE_LABEL = { parent: 'Parent', adult: 'Adult', teen: 'Teen', kid: 'Kid' };
export const CONTROL_LABELS = [
  ['meets', 'Car meets & events', 'See and RSVP to meets'],
  ['social', 'Social features', 'Feed, chat, public profile, socials links'],
  ['mapVisible', 'Visible to others on the map', 'Off = only family sees where they are'],
  ['convoys', 'Group drives & friend requests', 'Join convoys, add friends'],
  ['purchases', 'Themes & purchases', 'Buy premium themes without asking'],
];
export const EVENT_ICON = { arrive: '🏠', leave: '👋', checkin: '✅', sos: '🚨', speeding: '⚠️', hard_brake: '🛑', phone: '📱', join: '🎉', leave_family: '👋' };

// The family brief from /auth/me: { id, name, role, controls, locked, sharing } or null.
export function useFamilyBrief() {
  const { user } = useAuth();
  return user?.family || null;
}
// Is a feature allowed for this account? (Adults: always.)
export function useAllowed(key) {
  const f = useFamilyBrief();
  return !f?.controls || f.controls[key] !== false;
}
export const isYoung = (f) => f?.role === 'teen' || f?.role === 'kid';

export function useFamily(active = true) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => api.get('/family').then((d) => { setData(d); return d; }).catch(() => null).finally(() => setLoading(false)), []);
  useEffect(() => {
    if (!active) return undefined;
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [active, load]);
  return { data, loading, reload: load };
}

async function battery() {
  try { const b = await navigator.getBattery?.(); return b ? { battery: b.level, charging: b.charging } : {}; } catch { return {}; }
}
function position() {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition((p) => resolve(p.coords), () => resolve(null), { enableHighAccuracy: false, maximumAge: 30000, timeout: 15000 });
  });
}
export async function familyHere() {
  const c = await position();
  return c ? { lat: c.latitude, lng: c.longitude } : {};
}

// Runs app-wide while signed in and in a family: checks in every minute (every 20 s while
// driving) and shows new family alerts. Returns the latest alert for an in-app toast.
export function useFamilyPing() {
  const fam = useFamilyBrief();
  const [toast, setToast] = useState(null);
  const since = useRef(Date.now());
  useEffect(() => {
    if (!fam) return undefined;
    let alive = true, timer;
    const tick = async () => {
      const driving = (window.__dzSpeed || 0) > 5;
      try {
        const c = await position();
        const d = await api.post(`/family/ping?since=${since.current}`, {
          ...(c ? { lat: c.latitude, lng: c.longitude } : {}), speed: Math.round(window.__dzSpeed || 0), driving, ...(await battery()),
        });
        if (d?.now) since.current = d.now;
        for (const e of d?.events || []) {
          if (!alive) break;
          setToast({ ...e, key: e.id });
          try { if (document.hidden && window.Notification?.permission === 'granted') new Notification('Kaido Maps · Family', { body: e.text, tag: e.id }); } catch { /* ignore */ }
        }
      } catch { /* try again next time */ }
      if (alive) timer = setTimeout(tick, driving ? 20000 : 60000);
    };
    tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [fam?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return [toast, () => setToast(null)];
}

// Teen-driver alerts while driving: speeding (10+ over for 15 s), hard braking, and lots of
// screen taps at speed (phone use). The server keeps it to one alert of each kind per 5 minutes.
export function useTeenAlerts({ driving, speed, limit, hardBrakes, pos }) {
  const fam = useFamilyBrief();
  const young = isYoung(fam);
  const over = useRef(0);
  const brakes = useRef(hardBrakes || 0);
  const taps = useRef([]);
  const send = (kind, extra = {}) => api.post('/family/alert', { kind, speed: Math.round(speed || 0), limit, lat: pos?.[0], lng: pos?.[1], ...extra }).catch(() => {});
  useEffect(() => {
    if (!young || !driving) { over.current = 0; return; }
    if (limit && speed > limit + 10) {
      if (!over.current) over.current = Date.now();
      else if (Date.now() - over.current > 15000) { send('speeding'); over.current = Date.now() + 5 * 60000; }
    } else if (over.current && over.current < Date.now()) over.current = 0;
  }, [young, driving, speed, limit]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!young || !driving) { brakes.current = hardBrakes || 0; return; }
    if ((hardBrakes || 0) > brakes.current) send('hard_brake');
    brakes.current = hardBrakes || 0;
  }, [young, driving, hardBrakes]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!young || !driving) return undefined;
    const on = () => {
      if ((window.__dzSpeed || 0) < 15) return;
      const t = Date.now();
      taps.current = [...taps.current.filter((x) => t - x < 30000), t];
      if (taps.current.length >= 8) { taps.current = []; send('phone'); }
    };
    window.addEventListener('pointerdown', on, true);
    return () => window.removeEventListener('pointerdown', on, true);
  }, [young, driving]); // eslint-disable-line react-hooks/exhaustive-deps
}
