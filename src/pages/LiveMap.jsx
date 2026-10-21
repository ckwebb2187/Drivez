import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Radio } from 'lucide-react';
import { CircleMarker, Tooltip } from 'react-leaflet';
import DarkMap from '@/components/DarkMap';
import { useApp } from '@/lib/AppContext';
import { api } from '@/api/base44Client';
import { formatTimeAgo } from '@/lib/helpers';

export default function LiveMap() {
  const navigate = useNavigate();
  const { trips } = useApp();
  const [drivers, setDrivers] = useState([]);

  useEffect(() => {
    let alive = true;
    const load = () => api.get('/live').then((d) => alive && setDrivers(d.drivers)).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const lastTrip = trips[0];
  const center = drivers[0]
    ? [drivers[0].lat, drivers[0].lng]
    : lastTrip && lastTrip.route.length > 0
      ? lastTrip.route[Math.floor(lastTrip.route.length / 2)]
      : [37.7749, -122.4194];

  return (
    <div className="relative h-screen overflow-hidden">
      <div className="absolute inset-0">
        <DarkMap center={center} zoom={13} follow={drivers.length > 0}>
          {drivers.map((d) => (
            <CircleMarker key={d.userId} center={[d.lat, d.lng]} radius={9} pathOptions={{ color: '#fff', weight: 2, fillColor: d.color || '#39FF14', fillOpacity: 1 }}>
              <Tooltip permanent direction="top" offset={[0, -10]}>{d.name} · {d.speed} mph</Tooltip>
            </CircleMarker>
          ))}
        </DarkMap>
      </div>

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 p-4 pt-12 z-[500]">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full glass border border-border flex items-center justify-center"
        >
          <ChevronLeft className="w-5 h-5 text-foreground" />
        </button>
      </div>

      {/* Bottom panel */}
      <div className="absolute bottom-0 left-0 right-0 z-[500]">
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
