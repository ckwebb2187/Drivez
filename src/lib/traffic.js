// Live traffic from TomTom (through the Drivez server, which holds the key).
// Everything here quietly does nothing when no key is set up.
import { useEffect, useState } from 'react';
import { api } from '@/api/base44Client';

let cfg = null;
export function useLiveTraffic() {
  const [live, setLive] = useState(null);
  useEffect(() => {
    cfg = cfg || api.get('/traffic/config').then((d) => !!d.live).catch(() => false);
    cfg.then(setLive);
  }, []);
  return live;
}

// Traffic-aware travel time for start → stops → destination ([lat, lng] points).
export async function trafficEta(points) {
  const d = await api.post('/traffic/eta', { points });
  return d.live ? d : null;
}

// Keeps a traffic ETA fresh (every `every` ms) for the given points.
export function useTrafficEta(points, enabled, every = 180000) {
  const live = useLiveTraffic();
  const [eta, setEta] = useState(null);
  const key = points ? points.map((p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).join('|') : '';
  useEffect(() => {
    setEta(null);
    if (!live || !enabled || !points || points.length < 2) return undefined;
    let alive = true;
    const load = () => trafficEta(points).then((d) => alive && setEta(d)).catch(() => {});
    load();
    const t = setInterval(load, every);
    return () => { alive = false; clearInterval(t); };
  }, [live, enabled, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return eta;
}

export const trafficTileUrl = (night) => `${window.location.origin}/api/traffic/tile/${night ? 'night' : 'day'}/{z}/{x}/{y}.png`;
