import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TileLayer, useMap } from 'react-leaflet';
import { CloudRain, X, Play, Pause, Check } from 'lucide-react';
import { api } from '@/api/base44Client';

// Weather overlays for the maps. AccuWeather tiles come through the Drivez server
// (which holds the API key); the free options load straight from their providers.
const KEY = 'dz_weather';
const EVT = 'dz-weather-change';

export const WEATHER_LAYERS = [
  { id: 'off', label: 'Off' },
  { id: 'accu-radar', label: 'AccuWeather radar', note: 'Live precipitation', accu: true },
  { id: 'accu-satellite', label: 'AccuWeather satellite', note: 'Cloud cover (infrared)', accu: true },
  { id: 'rv-radar', label: 'Radar (free)', note: 'Worldwide · last 2 hours, can play', animated: true },
  { id: 'nexrad', label: 'US radar · NOAA (free)', note: 'Most detailed in the US' },
  { id: 'goes-satellite', label: 'Satellite (free)', note: 'Clouds over the Americas · NASA/NOAA GOES' },
];

function readPrefs() {
  try { return { layer: 'off', opacity: 0.7, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { layer: 'off', opacity: 0.7 }; }
}

// Shared across every map screen, remembered on this phone.
export function useWeatherPrefs() {
  const [prefs, setPrefs] = useState(readPrefs);
  useEffect(() => {
    const on = () => setPrefs(readPrefs());
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);
  const update = (patch) => {
    const next = { ...readPrefs(), ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ }
    window.dispatchEvent(new Event(EVT));
  };
  return [prefs, update];
}

let accuPromise = null;
function useAccuAvailable() {
  const [ok, setOk] = useState(null);
  useEffect(() => {
    accuPromise = accuPromise || api.get('/wx/config').then((d) => !!d.accuweather).catch(() => false);
    accuPromise.then(setOk);
  }, []);
  return ok;
}

// RainViewer frames (past ~2 hours, every 10 minutes).
function useRainViewer(active) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    const load = () => fetch('https://api.rainviewer.com/public/weather-maps.json').then((r) => r.json()).then((d) => alive && setData(d)).catch(() => {});
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => { alive = false; clearInterval(t); };
  }, [active]);
  return data;
}

function ensurePane(map) {
  if (!map.getPane('weather')) {
    const pane = map.createPane('weather');
    pane.style.zIndex = 350; // above the base map, below routes and markers
    pane.style.pointerEvents = 'none';
  }
}

// Put inside a <MapContainer>.
export function WeatherLayer() {
  const map = useMap();
  const [prefs] = useWeatherPrefs();
  const accu = useAccuAvailable();
  const chosen = prefs.layer === 'rv-satellite' ? 'goes-satellite' : prefs.layer;
  const id = chosen === 'accu-radar' || chosen === 'accu-satellite' ? (accu ? chosen : accu === false ? 'rv-radar' : 'off') : chosen;
  const rv = useRainViewer(id === 'rv-radar');
  const [frame, setFrame] = useState(-1);
  const playing = id === 'rv-radar' && prefs.playing;
  ensurePane(map);

  const frames = useMemo(() => (id === 'rv-radar' ? rv?.radar?.past : null) || [], [rv, id]);
  useEffect(() => { setFrame(frames.length - 1); }, [frames.length]);
  useEffect(() => {
    if (!playing || frames.length < 2) { setFrame(frames.length - 1); return undefined; }
    const t = setInterval(() => setFrame((f) => (f + 1) % frames.length), 700);
    return () => clearInterval(t);
  }, [playing, frames.length]);

  // Tell the controls which time is showing.
  useEffect(() => {
    const f = frames[frame];
    window.__dzWeatherTime = f ? f.time * 1000 : null;
    window.dispatchEvent(new Event('dz-weather-frame'));
  }, [frame, frames]);

  const common = { pane: 'weather', opacity: prefs.opacity, zIndex: 1 };
  if (id === 'accu-radar' || id === 'accu-satellite') {
    const kind = id === 'accu-radar' ? 'radar' : 'satellite';
    return <TileLayer key={id} url={`/api/wx/accu/${kind}/{z}/{x}/{y}.png`} maxNativeZoom={10} maxZoom={20} attribution="Weather &copy; AccuWeather" {...common} />;
  }
  if (id === 'nexrad') {
    return <TileLayer key={id} url="https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/{z}/{x}/{y}.png" maxNativeZoom={12} maxZoom={20} attribution="Radar: NOAA via Iowa Environmental Mesonet" {...common} />;
  }
  if (id === 'goes-satellite') {
    return <TileLayer key={id} url="https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GOES-East_ABI_Band13_Clean_Infrared/default/default/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png" maxNativeZoom={6} maxZoom={20} attribution="Satellite: NASA GIBS / NOAA GOES" {...common} />;
  }
  if (id === 'rv-radar' && rv && frames[frame]) {
    // Keep every frame loaded and only show one, so playback doesn't flicker.
    const style = '2/1_1';
    return frames.map((f, i) => (
      <TileLayer key={`${id}-${f.path}`} url={`${rv.host}${f.path}/256/{z}/{x}/{y}/${style}.png`} maxNativeZoom={7} maxZoom={20}
        attribution={i === frames.length - 1 ? 'Weather: <a href="https://www.rainviewer.com" target="_blank">RainViewer</a>' : ''}
        {...common} opacity={i === frame ? prefs.opacity : 0} />
    ));
  }
  return null;
}

// The round map button plus its picker.
export function WeatherButton({ className = '' }) {
  const [open, setOpen] = useState(false);
  const [prefs, update] = useWeatherPrefs();
  const accu = useAccuAvailable();
  const on = prefs.layer !== 'off';
  const [, force] = useState(0);
  const timeRef = useRef(null);
  useEffect(() => {
    const t = () => { timeRef.current = window.__dzWeatherTime; force((n) => n + 1); };
    window.addEventListener('dz-weather-frame', t);
    return () => window.removeEventListener('dz-weather-frame', t);
  }, []);
  const time = timeRef.current ? new Date(timeRef.current).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Weather radar"
        className={`w-12 h-12 rounded-full shadow-xl border flex items-center justify-center active:scale-95 transition-transform ${on ? 'bg-[#1e88e5] border-[#64b5f6]' : 'bg-card border-border'} ${className}`}>
        <CloudRain className={`w-5 h-5 ${on ? 'text-white' : 'text-foreground'}`} />
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[1500] bg-black/50 flex items-end justify-center" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md bg-card border-t border-border rounded-t-3xl p-5 pb-8 dz-pop-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2"><CloudRain className="w-5 h-5 text-[#64b5f6]" /> Weather on the map</h3>
              <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center" aria-label="Close"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-1.5 max-h-[50vh] overflow-y-auto no-scrollbar">
              {WEATHER_LAYERS.filter((l) => !l.accu || accu).map((l) => {
                            const selected = prefs.layer === l.id;
                return (
                  <button key={l.id} onClick={() => update({ layer: l.id })}
                    className={`w-full rounded-xl px-4 py-3 flex items-center gap-3 text-left border ${selected ? 'border-[#64b5f6] bg-[#1e88e5]/15' : 'border-transparent bg-secondary/60'}`}>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-foreground">{l.label}</div>
                      {l.note && <div className="text-[11px] text-muted-foreground">{l.note}</div>}
                    </div>
                    {selected && <Check className="w-4 h-4 text-[#64b5f6]" />}
                  </button>
                );
              })}
            </div>
            {on && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>See-through</span><span>{Math.round(prefs.opacity * 100)}%</span>
                </div>
                <input type="range" min="0.2" max="1" step="0.05" value={prefs.opacity} onChange={(e) => update({ opacity: +e.target.value })} className="w-full accent-[#1e88e5]" />
              </div>
            )}
            {prefs.layer === 'rv-radar' && (
              <button onClick={() => update({ playing: !prefs.playing })} className="mt-3 w-full h-11 rounded-xl bg-secondary text-sm font-semibold text-foreground flex items-center justify-center gap-2">
                {prefs.playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {prefs.playing ? 'Stop' : 'Play the last 2 hours'}{time ? ` · ${time}` : ''}
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// Small time label shown on the map while radar is animating.
export function WeatherTimeBadge({ className = '' }) {
  const [prefs] = useWeatherPrefs();
  const [time, setTime] = useState(null);
  useEffect(() => {
    const t = () => setTime(window.__dzWeatherTime);
    window.addEventListener('dz-weather-frame', t);
    return () => window.removeEventListener('dz-weather-frame', t);
  }, []);
  if (prefs.layer !== 'rv-radar' || !prefs.playing || !time) return null;
  return (
    <div className={`px-2.5 py-1 rounded-full bg-black/70 text-white text-[11px] font-semibold ${className}`}>
      Radar · {new Date(time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
    </div>
  );
}

// Tile settings for the chosen overlay, for the 3D drive map (MapLibre). Radar shows the latest frame.
export function useWeatherTiles() {
  const [prefs] = useWeatherPrefs();
  const accu = useAccuAvailable();
  const chosen = prefs.layer === 'rv-satellite' ? 'goes-satellite' : prefs.layer;
  const id = chosen === 'accu-radar' || chosen === 'accu-satellite' ? (accu ? chosen : accu === false ? 'rv-radar' : 'off') : chosen;
  const rv = useRainViewer(id === 'rv-radar');
  const opacity = prefs.opacity;
  if (id === 'accu-radar' || id === 'accu-satellite') {
    return { key: id, url: `${window.location.origin}/api/wx/accu/${id === 'accu-radar' ? 'radar' : 'satellite'}/{z}/{x}/{y}.png`, maxzoom: 10, opacity };
  }
  if (id === 'nexrad') return { key: id, url: 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/{z}/{x}/{y}.png', maxzoom: 12, opacity };
  if (id === 'goes-satellite') return { key: id, url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GOES-East_ABI_Band13_Clean_Infrared/default/default/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png', maxzoom: 6, opacity };
  const last = rv?.radar?.past?.[rv.radar.past.length - 1];
  if (id === 'rv-radar' && last) return { key: `rv-${last.path}`, url: `${rv.host}${last.path}/256/{z}/{x}/{y}/2/1_1.png`, maxzoom: 7, opacity };
  return null;
}
