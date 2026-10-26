import { isMetric } from '@/lib/units';
// Weather along a route: the forecast for each part of the drive at the time
// you'll be there (Open-Meteo, free, no key).
import { distM } from './nav';

const CODES = [
  [[95, 96, 99], 'Thunderstorms', '⛈️', 5],
  [[56, 57, 66, 67], 'Freezing rain', '🧊', 5],
  [[71, 73, 75, 77, 85, 86], 'Snow', '🌨️', 4],
  [[65, 82], 'Heavy rain', '🌧️', 4],
  [[45, 48], 'Fog', '🌫️', 3],
  [[61, 63, 80, 81], 'Rain', '🌧️', 2],
  [[51, 53, 55], 'Drizzle', '🌦️', 1],
  [[3], 'Cloudy', '☁️', 0],
  [[2], 'Partly cloudy', '⛅', 0],
  [[0, 1], 'Clear', '☀️', 0],
];
export function describeCode(code, isNight = false) {
  for (const [list, label, emoji, level] of CODES) if (list.includes(code)) return { label, emoji: isNight && level === 0 && code <= 1 ? '🌙' : emoji, level };
  return { label: 'Clear', emoji: '☀️', level: 0 };
}

// route: { coords: [[lat,lng]...], duration (s) } ; departAt: Date
export async function weatherAlongRoute(route, departAt = new Date()) {
  const coords = route.coords;
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + distM(coords[i - 1], coords[i]));
  const total = cum[cum.length - 1] || 1;
  const n = Math.max(2, Math.min(8, Math.ceil(route.duration / 1800) + 1));
  const samples = [];
  for (let k = 0; k < n; k++) {
    const frac = k / (n - 1), target = frac * total;
    let i = cum.findIndex((c) => c >= target); if (i < 0) i = coords.length - 1;
    samples.push({ frac, lat: coords[i][0], lng: coords[i][1], miles: target / 1609.34, eta: new Date(departAt.getTime() + frac * route.duration * 1000) });
  }
  const q = new URLSearchParams({
    latitude: samples.map((s) => s.lat.toFixed(3)).join(','), longitude: samples.map((s) => s.lng.toFixed(3)).join(','),
    hourly: 'temperature_2m,precipitation_probability,weather_code,wind_gusts_10m,visibility,is_day',
    temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', forecast_days: '3', timeformat: 'unixtime', timezone: 'GMT',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`);
  if (!res.ok) throw new Error('Weather unavailable');
  let data = await res.json();
  if (!Array.isArray(data)) data = [data];
  const points = samples.map((s, i) => {
    const h = data[i]?.hourly; if (!h) return null;
    const t = s.eta.getTime() / 1000;
    let j = 0, best = Infinity;
    h.time.forEach((x, k) => { const dd = Math.abs(x - t); if (dd < best) { best = dd; j = k; } });
    const desc = describeCode(h.weather_code[j], h.is_day?.[j] === 0);
    return {
      ...s, temp: Math.round(h.temperature_2m[j]), rainChance: h.precipitation_probability?.[j] ?? null,
      gusts: Math.round(h.wind_gusts_10m?.[j] ?? 0), visibility: h.visibility?.[j] ?? null, ...desc,
      level: desc.level + ((h.wind_gusts_10m?.[j] ?? 0) > 45 ? 2 : 0) + ((h.visibility?.[j] ?? 99999) < 1000 ? 1 : 0),
    };
  }).filter(Boolean);
  const worst = points.reduce((a, b) => (b.level > a.level ? b : a), points[0]);
  const end = points[points.length - 1];
  const time = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  let summary;
  if (!worst || worst.level === 0) summary = `${end.emoji} ${end.label} the whole way · ${end.temp}°F when you arrive`;
  else if (worst.frac === 0) summary = `${worst.emoji} ${worst.label} where you are now · ${end.label.toLowerCase()} at arrival (${end.temp}°F)`;
  else summary = `${worst.emoji} ${worst.label} around ${isMetric() ? 'km' : 'mile'} ${Math.round(worst.miles * (isMetric() ? 1.609344 : 1))} (~${time(worst.eta)})`;
  return { points, worst, summary };
}
