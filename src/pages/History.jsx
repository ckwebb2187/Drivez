import { useState } from 'react';
import { useApp } from '@/lib/AppContext';
import TripCard from '@/components/TripCard';
import { Car, Loader2 } from 'lucide-react';

function groupByDate(trips) {
  const groups = {};
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  trips.forEach(t => {
    const d = new Date(t.start_time);
    d.setHours(0, 0, 0, 0);
    const diff = Math.round((todayStart - d) / 86400000);
    let label;
    if (diff === 0) label = 'Today';
    else if (diff === 1) label = 'Yesterday';
    else label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!groups[label]) groups[label] = [];
    groups[label].push(t);
  });
  return Object.entries(groups);
}

export default function History() {
  const { trips, vehicles, loading } = useApp();
  const [filter, setFilter] = useState('all');
  const filtered = filter === 'all' ? trips : trips.filter(t => t.vehicleId === filter);
  const grouped = groupByDate(filtered);
  const totalMiles = Math.round(trips.reduce((s, t) => s + (t.distance || 0), 0)).toLocaleString();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <div className="px-5 pt-12 pb-3">
        <h1 className="text-2xl font-bold text-foreground">History</h1>
        <p className="text-xs text-muted-foreground mt-0.5">{trips.length} drives • {totalMiles} total miles</p>
      </div>

      {/* Vehicle filter */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar px-5 mb-4">
        <button
          onClick={() => setFilter('all')}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
        >
          All
        </button>
        {vehicles.map(v => (
          <button
            key={v.id}
            onClick={() => setFilter(v.id)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filter === v.id ? 'text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
            style={filter === v.id ? { backgroundColor: v.color || '#00BFFF' } : {}}
          >
            {v.make} {v.model}
          </button>
        ))}
      </div>

      <div className="px-5 space-y-5 pb-4">
        {grouped.map(([label, groupTrips]) => (
          <div key={label}>
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{label}</h2>
              <div className="flex-1 h-px bg-border" />
              <span className="text-[10px] text-muted-foreground">{groupTrips.length}</span>
            </div>
            <div className="space-y-3">
              {groupTrips.map(trip => (
                <TripCard key={trip.id} trip={trip} vehicle={vehicles.find(v => v.id === trip.vehicleId)} />
              ))}
            </div>
          </div>
        ))}

        {trips.length === 0 && (
          <div className="text-center py-12">
            <Car className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No drives yet — tap Drive to start your first one</p>
          </div>
        )}
        {trips.length > 0 && filtered.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm text-muted-foreground">No drives for this vehicle yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
