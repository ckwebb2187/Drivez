import { Polyline } from 'react-leaflet';
import { MapPin } from 'lucide-react';
import DarkMap from './DarkMap';
import { useApp } from '@/lib/AppContext';

export default function HeatMapSection() {
  const { trips } = useApp();
  const allPoints = trips.flatMap(t => t.route);
  const center = allPoints.length > 0
    ? [allPoints.reduce((s, p) => s + p[0], 0) / allPoints.length,
       allPoints.reduce((s, p) => s + p[1], 0) / allPoints.length]
    : [37.7749, -122.4194];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-foreground">Drive Heat Map</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">Roads you've covered across {trips.length} {trips.length === 1 ? 'trip' : 'trips'}</p>
        </div>
      </div>
      <div className="bg-card rounded-2xl overflow-hidden border border-border">
        {trips.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center text-center px-6">
            <MapPin className="w-8 h-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Your driven roads will show up here</p>
          </div>
        ) : (
          <div className="h-64">
            <DarkMap center={center} zoom={12}>
              {trips.map(trip => (
                <Polyline
                  key={trip.id}
                  positions={trip.route}
                  pathOptions={{
                    color: '#00BFFF',
                    weight: 2.5,
                    opacity: Math.min(0.85, 0.25 + ((trip.topSpeed || 0) / 100) * 0.4)
                  }}
                />
              ))}
            </DarkMap>
          </div>
        )}
      </div>
    </div>
  );
}
