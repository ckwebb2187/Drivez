import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Polyline, CircleMarker } from 'react-leaflet';
import { ChevronLeft, TrendingUp, Gauge, Clock, Route, MapPin, Play, Pause, Bookmark, Check, Loader2 } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, YAxis, XAxis, Tooltip } from 'recharts';
import DarkMap from '@/components/DarkMap';
import DiscordShareButton from '@/components/DiscordShareButton';
import { useApp } from '@/lib/AppContext';
import { formatDuration, formatTimeAgo } from '@/lib/helpers';

export default function TripDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { trips, vehicles, addRoute, loading } = useApp();
  const trip = trips.find(t => t.id === id);

  const [replayProgress, setReplayProgress] = useState(1);
  const [routeSaved, setRouteSaved] = useState(false);
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        setReplayProgress(prev => {
          if (prev >= 1) {
            setPlaying(false);
            return 1;
          }
          return Math.min(1, prev + 0.02);
        });
      }, 60);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [playing]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-sm text-muted-foreground">Trip not found</p>
      </div>
    );
  }

  const visibleCount = Math.max(2, Math.floor(trip.route.length * replayProgress));
  const visibleRoute = trip.route.slice(0, visibleCount);
  const currentPoint = trip.route[visibleCount - 1];
  const vehicle = vehicles.find(v => v.id === trip.vehicleId);
  const speedData = trip.speeds.map((s, i) => ({ time: i, speed: s }));

  const toggleReplay = () => {
    if (replayProgress >= 1) setReplayProgress(0);
    setPlaying(!playing);
  };

  return (
    <div className="min-h-screen bg-background pb-8">
      {/* Map */}
      <div className="relative h-[42vh]">
        <DarkMap center={currentPoint || trip.route[0]} zoom={14} follow>
          <Polyline positions={trip.route} pathOptions={{ color: trip.userColor || '#00BFFF', weight: 3, opacity: 0.2 }} />
          <Polyline positions={visibleRoute} pathOptions={{ color: trip.userColor || '#00BFFF', weight: 4, opacity: 0.9 }} />
          {currentPoint && (
            <CircleMarker center={currentPoint} radius={6} pathOptions={{ color: '#39FF14', fillColor: '#39FF14', fillOpacity: 1 }} />
          )}
        </DarkMap>
        <button
          onClick={() => navigate(-1)}
          className="absolute top-12 left-4 w-9 h-9 rounded-full glass border border-border flex items-center justify-center z-[500]"
        >
          <ChevronLeft className="w-5 h-5 text-foreground" />
        </button>
        <div className="absolute top-12 right-4 px-3 py-1.5 rounded-full glass border border-border z-[500]">
          <span className="text-xs font-medium text-foreground">{formatTimeAgo(trip.date)}</span>
        </div>
      </div>

      {/* Trip info */}
      <div className="px-5 -mt-4 relative z-10">
        <div className="bg-card rounded-2xl p-5 border border-border">
          <h1 className="text-lg font-bold text-foreground">{trip.title}</h1>
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
            <MapPin className="w-3 h-3" />
            <span>{trip.startLocation}{trip.endLocation ? ` → ${trip.endLocation}` : ''}</span>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="bg-secondary/50 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp className="w-3.5 h-3.5 text-primary" />
                <span className="text-[10px] text-muted-foreground">Top Speed</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold speed-font text-primary">{trip.topSpeed}</span>
                <span className="text-[10px] text-muted-foreground">mph</span>
              </div>
            </div>
            <div className="bg-secondary/50 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Gauge className="w-3.5 h-3.5 text-accent" />
                <span className="text-[10px] text-muted-foreground">Avg Speed</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold speed-font text-accent">{trip.avgSpeed}</span>
                <span className="text-[10px] text-muted-foreground">mph</span>
              </div>
            </div>
            <div className="bg-secondary/50 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Route className="w-3.5 h-3.5 text-foreground" />
                <span className="text-[10px] text-muted-foreground">Distance</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold speed-font text-foreground">{trip.distance}</span>
                <span className="text-[10px] text-muted-foreground">mi</span>
              </div>
            </div>
            <div className="bg-secondary/50 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Clock className="w-3.5 h-3.5 text-foreground" />
                <span className="text-[10px] text-muted-foreground">Duration</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold speed-font text-foreground">{formatDuration(trip.duration)}</span>
              </div>
            </div>
          </div>

          {vehicle && (
            <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: vehicle.color }} />
              <span className="text-xs text-muted-foreground">{vehicle.year} {vehicle.make} {vehicle.model}</span>
            </div>
          )}
          <button
            onClick={() => {
              if (!routeSaved) {
                addRoute({ name: trip.title, route: trip.route, distance: trip.distance, sharedWith: [] });
                setRouteSaved(true);
              }
            }}
            className="w-full mt-3 bg-secondary text-foreground rounded-xl py-2.5 text-xs font-bold flex items-center justify-center gap-1.5"
          >
            {routeSaved
              ? <><Check className="w-3.5 h-3.5 text-accent" /> Route Saved</>
              : <><Bookmark className="w-3.5 h-3.5" /> Save Route</>}
          </button>
          <DiscordShareButton tripId={trip.id} />
        </div>

        {/* Personal drive stats (just for you, no leaderboard) */}
        {(trip.smoothness != null || trip.max_g || trip.best_0_60) && (
          <div className="bg-card rounded-2xl p-4 border border-border mt-3">
            <div className="text-sm font-semibold text-foreground mb-3">Drive stats</div>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-secondary/50 rounded-xl p-2.5 text-center">
                <div className="text-lg font-bold speed-font text-[#34A853]">{trip.smoothness ?? '—'}</div>
                <div className="text-[10px] text-muted-foreground">Smoothness</div>
              </div>
              <div className="bg-secondary/50 rounded-xl p-2.5 text-center">
                <div className="text-lg font-bold speed-font text-foreground">{trip.max_g ? `${trip.max_g.toFixed(2)}g` : '—'}</div>
                <div className="text-[10px] text-muted-foreground">Peak g-force</div>
              </div>
              <div className="bg-secondary/50 rounded-xl p-2.5 text-center">
                <div className="text-lg font-bold speed-font text-foreground">{trip.best_0_60 ? `${trip.best_0_60}s` : '—'}</div>
                <div className="text-[10px] text-muted-foreground">0–60</div>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              {trip.hard_brakes || 0} hard brakes · {trip.hard_accels || 0} hard launches. These are only shown to you; drive safe and keep the fun for the track.
            </p>
          </div>
        )}

        {/* Route replay controls */}
        <div className="bg-card rounded-2xl p-4 border border-border mt-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-foreground">Route Replay</span>
            <button onClick={toggleReplay} className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
              {playing ? <Pause className="w-3.5 h-3.5 text-primary-foreground fill-primary-foreground" /> : <Play className="w-3.5 h-3.5 text-primary-foreground fill-primary-foreground" />}
            </button>
          </div>
          <input
            type="range" min="0" max="1" step="0.01" value={replayProgress}
            onChange={e => setReplayProgress(parseFloat(e.target.value))}
            className="w-full"
          />
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] text-muted-foreground">Start</span>
            <span className="text-[10px] text-muted-foreground">{Math.round(replayProgress * 100)}%{trip.speeds?.length ? ` · ${trip.speeds[Math.min(trip.speeds.length - 1, visibleCount - 1)]} mph` : ''}</span>
            <span className="text-[10px] text-muted-foreground">End</span>
          </div>
        </div>

        {/* Speed chart */}
        <div className="bg-card rounded-2xl p-4 border border-border mt-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-foreground">Speed Over Time</span>
            <span className="text-[10px] text-muted-foreground">mph</span>
          </div>
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={speedData} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
              <XAxis dataKey="time" tick={false} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6b6b80', fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#141420', border: '1px solid #1f1f2e', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#8b8b9f' }}
                formatter={(v) => [`${v} mph`, 'Speed']}
              />
              <Line type="monotone" dataKey="speed" stroke={trip.userColor || '#00BFFF'} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
