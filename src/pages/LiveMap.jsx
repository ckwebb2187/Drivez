import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, CircleMarker, Tooltip } from 'react-leaflet';
import { ChevronLeft, Radio, LocateFixed } from 'lucide-react';
import { BaseLayer } from '@/components/DarkMap';
import { CarMarker, LocationMarker, FollowMe, FitBounds } from '@/components/MapBits';
import { useApp } from '@/lib/AppContext';
import { api } from '@/api/base44Client';
import { formatTimeAgo } from '@/lib/helpers';

const FALLBACK_CENTER = [39.8283, -98.5795];

export default function LiveMap() {
  const navigate = useNavigate();
  const { myCar } = useApp();
  const [drivers, setDrivers] = useState([]);
  const [pos, setPos] = useState(null);
  const [heading, setHeading] = useState(null);
  const [follow, setFollow] = useState(true);
  const [fitted, setFitted] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => api.get('/live').then((d) => alive && setDrivers(d.drivers)).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setPos([p.coords.latitude, p.coords.longitude]);
        if (p.coords.heading != null && !Number.isNaN(p.coords.heading) && (p.coords.speed || 0) > 1) setHeading(p.coords.heading);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Once both you and driving friends are known, zoom to fit everyone (once).
  const fitPoints = useMemo(() => {
    if (fitted || !pos || !drivers.length) return null;
    return [pos, ...drivers.map((d) => [d.lat, d.lng])];
  }, [pos, drivers, fitted]);
  useEffect(() => { if (fitPoints) { setFollow(false); setFitted(true); } }, [fitPoints]);

  return (
    <div className="relative h-screen overflow-hidden">
      <div className="absolute inset-0 isolate">
        <MapContainer center={pos || FALLBACK_CENTER} zoom={pos ? 14 : 4} zoomControl={false} style={{ height: '100%', width: '100%' }}>
          <BaseLayer />
          <FollowMe pos={pos} follow={follow} onUserMove={() => setFollow(false)} />
          {fitPoints && <FitBounds points={fitPoints} padding={[60, 120]} paddingBottom={260} />}
          {drivers.map((d) => d.car ? (
            <CarMarker key={d.userId} pos={[d.lat, d.lng]} car={d.car} heading={d.heading} label={`${d.name} · ${d.speed} mph`} />
          ) : (
            <CircleMarker key={d.userId} center={[d.lat, d.lng]} radius={9} pathOptions={{ color: '#fff', weight: 2, fillColor: d.color || '#39FF14', fillOpacity: 1 }}>
              <Tooltip permanent direction="top" offset={[0, -10]}>{d.name} · {d.speed} mph</Tooltip>
            </CircleMarker>
          ))}
          <LocationMarker pos={pos} heading={heading} car={myCar} />
        </MapContainer>
      </div>

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 p-4 pt-12 z-10 flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full glass border border-border flex items-center justify-center"
          aria-label="Back"
        >
          <ChevronLeft className="w-5 h-5 text-foreground" />
        </button>
        {pos && !follow && (
          <button onClick={() => setFollow(true)} className="w-10 h-10 rounded-full glass border border-border flex items-center justify-center" aria-label="Center on me">
            <LocateFixed className="w-5 h-5 text-[#4285F4]" />
          </button>
        )}
      </div>

      {/* Bottom panel */}
      <div className="absolute bottom-0 left-0 right-0 z-10">
        <div className="glass rounded-t-3xl border-t border-border p-6 pb-10">
          {drivers.length === 0 ? (
            <div className="text-center">
              <Radio className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-semibold text-foreground">No friends driving right now</p>
              <p className="text-xs text-muted-foreground mt-1">Friends who are driving (and not in Ghost Mode) show up here live</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-bold text-foreground mb-1">{drivers.length} driving now</p>
              {drivers.map((d) => (
                <div key={d.userId} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-accent animate-pulse" />{d.name}</span>
                  <span className="text-muted-foreground text-xs"><b className="text-foreground speed-font">{d.speed}</b> mph · {formatTimeAgo(d.updated)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
