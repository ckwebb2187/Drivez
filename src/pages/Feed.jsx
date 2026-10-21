import { Link } from 'react-router-dom';
import { useApp } from '@/lib/AppContext';
import TripCard from '@/components/TripCard';
import { Navigation, Route as RouteIcon, ChevronRight, Car, Loader2, Radio } from 'lucide-react';

export default function Feed() {
  const { user, stats, vehicles, trips, loading } = useApp();
  const recentTrips = trips.slice(0, 5);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center h-full py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="px-5 pt-12 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{greeting}</p>
            <h1 className="text-2xl font-bold text-foreground mt-0.5">{user.displayName}</h1>
          </div>
          <Link to="/drive">
            <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
              <Navigation className="w-5 h-5 text-primary" />
            </div>
          </Link>
        </div>
      </div>

      {/* Saved routes quick access */}
      <div className="px-5 mb-4">
        <Link to="/routes" className="block bg-card rounded-2xl p-4 border border-border active:scale-[0.98] transition-transform">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <RouteIcon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="text-sm font-bold text-foreground">Saved Routes</div>
                <div className="text-[11px] text-muted-foreground">Plan, save & share routes</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
        </Link>
      </div>

      {/* Live map quick access */}
      <div className="px-5 mb-4">
        <Link to="/live-map" className="block bg-card rounded-2xl p-4 border border-border active:scale-[0.98] transition-transform">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
                <Radio className="w-5 h-5 text-accent" />
              </div>
              <div>
                <div className="text-sm font-bold text-foreground">Live Map</div>
                <div className="text-[11px] text-muted-foreground">See friends who are driving now</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
        </Link>
      </div>

      {/* Today's stats */}
      <div className="px-5 mb-4">
        <div className="bg-card rounded-2xl p-5 border border-border">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-xl font-bold speed-font text-primary">{stats.thisWeekDrives}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Drives this week</div>
            </div>
            <div>
              <div className="text-xl font-bold speed-font text-accent">{stats.thisWeekMiles}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Miles this week</div>
            </div>
            <div>
              <div className="text-xl font-bold speed-font text-foreground">{stats.lifetimeMiles.toLocaleString()}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Lifetime miles</div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div className="px-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-foreground">Recent Activity</h2>
          {trips.length > 0 && (
            <Link to="/history" className="text-xs text-primary font-medium">View all</Link>
          )}
        </div>
        <div className="space-y-3 pb-4">
          {recentTrips.map(trip => (
            <TripCard key={trip.id} trip={trip} vehicle={vehicles.find(v => v.id === trip.vehicleId)} />
          ))}
          {recentTrips.length === 0 && (
            <div className="bg-card rounded-2xl p-8 border border-border text-center">
              <Car className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No drives yet — tap Drive to start your first one</p>
              <Link to="/drive" className="inline-block mt-3 bg-primary text-primary-foreground rounded-xl px-4 py-2 text-xs font-bold">
                Start Drive
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
