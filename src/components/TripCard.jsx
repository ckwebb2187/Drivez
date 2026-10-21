import { useNavigate } from 'react-router-dom';
import { Gauge, MapPin, Clock, TrendingUp } from 'lucide-react';
import RouteThumbnail from './RouteThumbnail';
import { formatDuration, formatTimeAgo, getInitials } from '@/lib/helpers';

export default function TripCard({ trip, vehicle }) {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(`/trip/${trip.id}`)}
      className="bg-card rounded-2xl overflow-hidden border border-border active:scale-[0.98] transition-transform cursor-pointer"
    >
      <div className="relative h-32 bg-secondary">
        <RouteThumbnail route={trip.route} className="w-full h-full" color={trip.userColor || '#00BFFF'} />
        <div className="absolute top-3 left-3 px-2 py-0.5 rounded-full glass max-w-[70%]">
          <span className="text-[10px] font-medium text-foreground truncate block">{trip.startLocation}{trip.endLocation ? ` → ${trip.endLocation}` : ''}</span>
        </div>
        {trip.isFriendTrip && (
          <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2 py-1 rounded-full glass">
            <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ backgroundColor: trip.userColor }}>
              {getInitials(trip.userName)}
            </div>
            <span className="text-[10px] font-medium text-foreground">{trip.userName}</span>
          </div>
        )}
      </div>
      <div className="p-3.5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="w-3 h-3" />
            <span className="truncate max-w-[140px]">{trip.title}</span>
          </div>
          <span className="text-[10px] text-muted-foreground">{formatTimeAgo(trip.date)}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-primary" />
              <span className="text-sm font-bold text-primary">{trip.topSpeed}</span>
              <span className="text-[10px] text-muted-foreground">mph</span>
            </div>
            <div className="flex items-center gap-1">
              <Gauge className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">{trip.distance}</span>
              <span className="text-[10px] text-muted-foreground">mi</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">{formatDuration(trip.duration)}</span>
            </div>
          </div>
        </div>
        {vehicle && (
          <div className="mt-2 pt-2 border-t border-border">
            <span className="text-[10px] text-muted-foreground">{vehicle.year} {vehicle.make} {vehicle.model}</span>
          </div>
        )}
      </div>
    </div>
  );
}
