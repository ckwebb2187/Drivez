// Pieces for the Leaflet maps (saved drives, friends live, routes): markers, follow/fit,
// weather and traffic overlays, alert areas. Kept apart so the home screen never loads Leaflet.
import { useEffect, useMemo, useState } from 'react';
import { Marker, Popup, Tooltip, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Loader2 } from 'lucide-react';
import { carMarkup } from '@/lib/cars';
import { REPORT_TYPES } from '@/lib/reports';
import { formatTimeAgo } from '@/lib/helpers';
import { useWeatherPrefs, useAccuAvailable, useRainViewer } from '@/components/Weather';
import { useLiveTraffic, trafficTileUrl } from '@/lib/traffic';
import { colorFor } from '@/components/WeatherAlerts';

function carIcon(car, heading, size = 1) {
  const w = Math.round(30 * size), h = Math.round(60 * size);
  return L.divIcon({
    className: '',
    iconSize: [h, h],
    iconAnchor: [h / 2, h / 2],
    html: `<div style="width:${h}px;height:${h}px;display:flex;align-items:center;justify-content:center;transform:rotate(${heading || 0}deg);transition:transform .4s ease;filter:drop-shadow(0 2px 3px rgba(0,0,0,.6))"><div style="display:flex;align-items:center;justify-content:center">${carMarkup(car, w, h)}</div></div>`,
  });
}

// A friend (or anyone) on the map as their car, with their name.
export function CarMarker({ pos, car, heading, label }) {
  const icon = useMemo(() => carIcon(car, heading, 0.85), [car?.body, car?.color, car?.image, heading]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Marker position={pos} icon={icon}>
      {label && <Tooltip permanent direction="top" offset={[0, -24]} className="dz-car-label">{label}</Tooltip>}
    </Marker>
  );
}

// Your position: your car when you've picked one, otherwise a blue dot with a pointer.
export function LocationMarker({ pos, heading, car }) {
  const icon = useMemo(() => car ? carIcon(car, heading, 1) : L.divIcon({
    className: '',
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    html: `<div style="position:relative;width:44px;height:44px">
      ${heading != null ? `<div style="position:absolute;inset:0;transform:rotate(${heading}deg)"><div style="position:absolute;left:50%;top:0;transform:translateX(-50%);width:0;height:0;border-left:9px solid transparent;border-right:9px solid transparent;border-bottom:16px solid rgba(66,133,244,.85)"></div></div>` : ''}
      <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:20px;height:20px;border-radius:50%;background:#4285F4;border:3px solid #fff;box-shadow:0 0 0 6px rgba(66,133,244,.25),0 1px 4px rgba(0,0,0,.5)"></div>
    </div>`,
  }), [heading, car?.body, car?.color, car?.image]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!pos) return null;
  return <Marker position={pos} icon={icon} interactive={false} zIndexOffset={1000} />;
}

export function PinMarker({ pos, color = '#EA4335' }) {
  const icon = useMemo(() => L.divIcon({
    className: '',
    iconSize: [32, 42],
    iconAnchor: [16, 40],
    html: `<svg width="32" height="42" viewBox="0 0 32 42"><path d="M16 1C7.7 1 1 7.6 1 15.8 1 27 16 41 16 41s15-14 15-25.2C31 7.6 24.3 1 16 1z" fill="${color}" stroke="#fff" stroke-width="2"/><circle cx="16" cy="15.5" r="5.5" fill="#fff"/></svg>`,
  }), [color]);
  if (!pos) return null;
  return <Marker position={pos} icon={icon} interactive={false} />;
}

// Keeps the map centred on you until you drag it.
// Leaving a screen while the map is still animating makes Leaflet throw; stop animations first.
function useStopOnUnmount(map) {
  useEffect(() => () => {
    try { map.stop(); clearTimeout(map._transitionEndTimer); map._animatingZoom = false; } catch { /* already gone */ }
  }, [map]);
}

export function FollowMe({ pos, follow, onUserMove, zoom }) {
  const map = useMap();
  useStopOnUnmount(map);
  useEffect(() => {
    const stop = () => onUserMove?.();
    map.on('dragstart', stop);
    return () => { map.off('dragstart', stop); };
  }, [map, onUserMove]);
  useEffect(() => {
    if (follow && pos) map.setView(pos, zoom ?? Math.max(map.getZoom(), 15), { animate: true });
  }, [pos, follow]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export function FitBounds({ points, padding = [60, 60], paddingBottom }) {
  const map = useMap();
  useStopOnUnmount(map);
  useEffect(() => {
    if (!points?.length) return;
    map.fitBounds(L.latLngBounds(points), {
      paddingTopLeft: [padding[0], padding[1]],
      paddingBottomRight: [padding[0], paddingBottom ?? padding[1]],
      animate: true,
    });
  }, [points]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}


function reportIcon(type) {
  const t = REPORT_TYPES[type] || REPORT_TYPES.hazard;
  return L.divIcon({
    className: '',
    iconSize: [38, 46],
    iconAnchor: [19, 44],
    html: `<div style="position:relative;width:38px;height:46px"><div style="width:38px;height:38px;border-radius:50%;background:${t.color};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;font-size:19px">${t.emoji}</div><div style="position:absolute;left:50%;bottom:0;transform:translateX(-50%);width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:10px solid #fff"></div></div>`,
  });
}

// Road reports on the map. Tap one to confirm it's still there or dismiss it.
export function ReportMarkers({ reports, onVote, onRemove }) {
  const icons = useMemo(() => Object.fromEntries(Object.keys(REPORT_TYPES).map((k) => [k, reportIcon(k)])), []);
  return reports.map((r) => (
    <Marker key={r.id} position={[r.lat, r.lng]} icon={icons[r.type] || icons.hazard}>
      <Popup closeButton={false} className="dz-popup">
        <ReportPopup r={r} onVote={onVote} onRemove={onRemove} />
      </Popup>
    </Marker>
  ));
}

function ReportPopup({ r, onVote, onRemove }) {
  const [busy, setBusy] = useState(false);
  const t = REPORT_TYPES[r.type] || REPORT_TYPES.hazard;
  const act = async (fn) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  return (
    <div style={{ minWidth: 190 }}>
      <div style={{ fontWeight: 700, fontSize: 15 }}>{t.emoji} {t.label}</div>
      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>Reported by {r.by} · {formatTimeAgo(r.created)}{r.confirms ? ` · ${r.confirms} confirmed` : ''}</div>
      {busy ? <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center' }}><Loader2 className="w-5 h-5 animate-spin" /></div> : r.mine ? (
        <button onClick={() => act(() => onRemove(r.id))} className="dz-pop-btn" style={{ marginTop: 10, width: '100%' }}>Remove my report</button>
      ) : (
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <button onClick={() => act(() => onVote(r.id, true))} className="dz-pop-btn dz-pop-yes" disabled={r.myVote === true}>{r.myVote === true ? 'Thanks!' : 'Still there'}</button>
          <button onClick={() => act(() => onVote(r.id, false))} className="dz-pop-btn" disabled={r.myVote === false}>Not there</button>
        </div>
      )}
    </div>
  );
}


function ensurePane(map) {
  if (!map.getPane('weather')) {
    const pane = map.createPane('weather');
    pane.style.zIndex = 350; // above the base map, below routes and markers
    pane.style.pointerEvents = 'none';
  }
}

// Live traffic colors on the roads (green / orange / red), when TomTom is set up.
export function TrafficLayer({ night = true }) {
  const map = useMap();
  const [prefs] = useWeatherPrefs();
  const live = useLiveTraffic();
  ensurePane(map);
  if (!live || prefs.traffic === false) return null;
  return <TileLayer url={trafficTileUrl(night)} pane="weather" zIndex={2} maxZoom={20} maxNativeZoom={18} attribution="Traffic &copy; TomTom" />;
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


// Alert areas drawn on the (Leaflet) map.
export function AlertAreas({ alerts }) {
  return alerts.filter((a) => a.geometry).map((a) => (
    <GeoJSON key={a.id} data={a.geometry} style={{ color: colorFor(a), weight: 2, fillColor: colorFor(a), fillOpacity: 0.12, dashArray: '6 4' }} />
  ));
}

