import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import RouteThumbnail from './RouteThumbnail';
import { formatDuration } from '@/lib/helpers';
import { spd, dst, speedUnit, distUnit } from '@/lib/units';

// One compact row per drive: little route sketch, where, when, miles, time, top speed.
function TripCard({ trip, vehicle }) {
  const navigate = useNavigate();
  const where = trip.imported && !trip.start_location
    ? `From ${trip.source === 'waze' ? 'Waze' : trip.source === 'gpx' ? 'GPX file' : 'Google Maps'}`
    : `${trip.startLocation}${trip.endLocation ? ` → ${trip.endLocation}` : ''}`;
  const time = new Date(trip.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (
    <button onClick={() => navigate(`/trip/${trip.id}`)}
      className="w-full bg-card rounded-xl border border-border flex items-center gap-3 p-2 pr-3 text-left active:bg-secondary">
      <div className="w-14 h-14 rounded-lg bg-secondary overflow-hidden shrink-0">
        <RouteThumbnail route={trip.route} className="w-full h-full" color={trip.userColor || '#00BFFF'} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-foreground truncate">{where || trip.title}</div>
        <div className="text-[11px] text-muted-foreground truncate">
          {time} · {dst(trip.distance)} {distUnit()} · {formatDuration(trip.duration)}{vehicle ? ` · ${vehicle.nickname || vehicle.model}` : ''}{trip.isFriendTrip ? ` · ${trip.userName}` : ''}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-bold text-primary leading-none">{spd(trip.imported ? trip.avgSpeed : trip.topSpeed)}</div>
        <div className="text-[9px] text-muted-foreground">{trip.imported ? 'avg' : 'top'} {speedUnit()}</div>
      </div>
    </button>
  );
}

// Cards only redraw when their own drive changes.
export default memo(TripCard);
