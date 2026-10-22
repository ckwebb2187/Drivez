// National Weather Service alerts (floods, hurricanes, tornadoes, evacuations) where you are.
import { useEffect, useState } from 'react';
import { api } from '@/api/base44Client';
import { distM } from './nav';

const SERIOUS = /Flood|Hurricane|Tropical Storm|Storm Surge|Tornado|Evacuation|Severe Thunderstorm|Blizzard|Ice Storm|Extreme Wind|Fire Warning|Civil Danger|Shelter In Place/i;
export const EVACUATE = /Hurricane|Storm Surge|Tropical Storm|Flood|Evacuation|Tsunami|Fire Warning|Civil Danger/i;

export function useWeatherAlerts(pos) {
  const [alerts, setAlerts] = useState([]);
  const key = pos ? `${pos[0].toFixed(2)},${pos[1].toFixed(2)}` : '';
  useEffect(() => {
    if (!pos) return undefined;
    let alive = true;
    const load = () => api.get(`/nws/alerts?lat=${pos[0]}&lng=${pos[1]}`)
      .then((d) => alive && setAlerts(d.alerts.filter((a) => SERIOUS.test(a.event) || /Extreme|Severe/.test(a.severity))))
      .catch(() => {});
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => { alive = false; clearInterval(t); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return alerts;
}

export async function alertsAlongRoute(coords) {
  const n = Math.min(10, Math.max(2, Math.ceil(coords.length / 80)));
  const pts = Array.from({ length: n }, (_, k) => coords[Math.round((k / (n - 1)) * (coords.length - 1))]);
  const d = await api.post('/nws/route', { points: pts });
  return d.alerts.filter((a) => SERIOUS.test(a.event));
}

// Point-in-polygon for GeoJSON Polygon/MultiPolygon ([lng,lat] rings).
export function insideGeometry(geom, [lat, lng]) {
  if (!geom) return false;
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  const inRing = (ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (((yi > lat) !== (yj > lat)) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  return polys.some((p) => inRing(p[0]) && !p.slice(1).some(inRing));
}

// Inland cities to head for when evacuating (Gulf Coast focus, works anywhere in the US South/East).
const SAFE_CITIES = [
  ['Baton Rouge, LA', 30.4515, -91.1871], ['Alexandria, LA', 31.3113, -92.4451], ['Shreveport, LA', 32.5252, -93.7502],
  ['Monroe, LA', 32.5093, -92.1193], ['Natchez, MS', 31.5604, -91.4032], ['Jackson, MS', 32.2988, -90.1848],
  ['Hattiesburg, MS', 31.3271, -89.2903], ['Lafayette, LA', 30.2241, -92.0198], ['Tyler, TX', 32.3513, -95.3011],
  ['Dallas, TX', 32.7767, -96.797], ['Austin, TX', 30.2672, -97.7431], ['Montgomery, AL', 32.3792, -86.3077],
  ['Birmingham, AL', 33.5186, -86.8104], ['Atlanta, GA', 33.749, -84.388], ['Macon, GA', 32.8407, -83.6324],
  ['Orlando, FL', 28.5383, -81.3792], ['Gainesville, FL', 29.6516, -82.3248], ['Columbia, SC', 34.0007, -81.0348],
  ['Raleigh, NC', 35.7796, -78.6382], ['Memphis, TN', 35.1495, -90.049], ['Little Rock, AR', 34.7465, -92.2896],
];

// Pick the nearest inland city that isn't under any of the active alerts and is at least ~60 km away.
export function pickEvacuationCity(pos, alerts) {
  const candidates = SAFE_CITIES
    .map(([name, lat, lng]) => ({ name, address: 'Evacuation destination', lat, lng, d: distM(pos, [lat, lng]) }))
    .filter((c) => c.d > 60000 && c.d < 700000 && !alerts.some((a) => insideGeometry(a.geometry, [c.lat, c.lng])))
    .sort((a, b) => (a.lat - pos[0] > 0 ? 0 : 1) - (b.lat - pos[0] > 0 ? 0 : 1) || a.d - b.d); // prefer inland (north), then nearest
  return candidates[0] || null;
}
