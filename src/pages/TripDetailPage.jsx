import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Polyline, CircleMarker } from 'react-leaflet';
import { ChevronLeft, TrendingUp, Gauge, Clock, Route, MapPin, Play, Pause, Bookmark, Check, Loader2, Pencil, Trash2 } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, YAxis, XAxis, Tooltip } from 'recharts';
import DarkMap from '@/components/DarkMap';
import DiscordShareButton from '@/components/DiscordShareButton';
import NarrateButton from '@/components/NarrateButton';
import SectionSaver from '@/components/SectionSaver';
import RateRoad from '@/components/RateRoad';
import { useApp, mapTrip } from '@/lib/AppContext';
import { base44 } from '@/api/base44Client';
import { formatDuration, formatTimeAgo } from '@/lib/helpers';
import { spd, dst, speedUnit, distUnit } from '@/lib/units';

export default function TripDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { trips, vehicles, addRoute, loading, scene, updateTrip, deleteTrip } = useApp();
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const [section, setSection] = useState(null); // [startIdx, endIdx] of a Tōge section being picked
  const [busy, setBusy] = useState(false);
  const listed = trips.find(t => t.id === id);
  // The drive list only has a thinned-out route; fetch the full one for this drive
  // (the thin version shows right away, then sharpens).
  const [full, setFull] = useState(null);
  useEffect(() => {
    if (!listed?.lite || full?.id === id) return;
    let alive = true;
    base44.entities.Trip.get(id).then((r) => { if (alive) setFull(mapTrip(r, listed.userColor)); }).catch(() => {});
    return () => { alive = false; };
  }, [id, listed?.lite]); // eslint-disable-line react-hooks/exhaustive-deps
  const trip = listed && full?.id === id ? { ...listed, route: full.route, speeds: full.speeds, route_points: full.route_points, lite: false } : listed;

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
  const speedData = trip.speeds.map((s, i) => ({ time: i, speed: spd(s) }));

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
          {section && <Polyline positions={trip.route.slice(section[0], section[1] + 1)} pathOptions={{ color: '#FF9F0A', weight: 7, opacity: 0.95 }} />}
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
          {editing ? (
            <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); const t = titleDraft.trim(); if (t) { setBusy(true); try { await updateTrip(trip.id, { title: t.slice(0, 100) }); } finally { setBusy(false); } } setEditing(false); }}>
              <input autoFocus value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} className="flex-1 min-w-0 bg-secondary rounded-xl px-3 py-2 text-sm text-foreground border border-border focus:border-primary outline-none" />
              <button className="bg-primary text-primary-foreground rounded-xl px-3 text-sm font-semibold">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}</button>
            </form>
          ) : (
            <div className="flex items-start gap-2">
              <h1 className="flex-1 text-lg font-bold text-foreground">{trip.title}</h1>
              <button onClick={() => { setTitleDraft(trip.title || ''); setEditing(true); }} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0" aria-label="Rename drive"><Pencil className="w-3.5 h-3.5" /></button>
              <button onClick={() => setConfirmDel(true)} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0" aria-label="Delete drive"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
            </div>
          )}
          {confirmDel && (
            <div className="mt-3 rounded-xl bg-destructive/10 border border-destructive/30 p-3 flex items-center gap-2">
              <span className="flex-1 text-xs text-foreground">Delete this drive for good?</span>
              <button onClick={() => setConfirmDel(false)} className="text-xs text-muted-foreground px-2">Cancel</button>
              <button onClick={async () => { setBusy(true); try { await deleteTrip(trip.id); navigate('/history', { replace: true }); } finally { setBusy(false); } }} className="h-8 px-3 rounded-lg bg-destructive text-destructive-foreground text-xs font-bold">{busy ? '…' : 'Delete'}</button>
            </div>
          )}
          {scene && trip.vehicleId && (
            <button onClick={() => updateTrip(trip.id, { odo: trip.odo === false })} className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className={`w-4 h-4 rounded border flex items-center justify-center ${trip.odo !== false ? 'bg-primary border-primary' : 'border-border'}`}>{trip.odo !== false && <Check className="w-3 h-3 text-primary-foreground" />}</span>
              Count these miles toward {(() => { const v = vehicles.find((x) => x.id === trip.vehicleId); return v ? (v.nickname || v.model) : 'the car'; })()}'s odometer
            </button>
          )}
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
                <span className="text-xl font-bold speed-font text-primary">{spd(trip.topSpeed)}</span>
                <span className="text-[10px] text-muted-foreground">{speedUnit()}</span>
              </div>
            </div>
            <div className="bg-secondary/50 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Gauge className="w-3.5 h-3.5 text-accent" />
                <span className="text-[10px] text-muted-foreground">Avg Speed</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold speed-font text-accent">{spd(trip.avgSpeed)}</span>
                <span className="text-[10px] text-muted-foreground">{speedUnit()}</span>
              </div>
            </div>
            <div className="bg-secondary/50 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Route className="w-3.5 h-3.5 text-foreground" />
                <span className="text-[10px] text-muted-foreground">Distance</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold speed-font text-foreground">{dst(trip.distance)}</span>
                <span className="text-[10px] text-muted-foreground">{distUnit()}</span>
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
          <NarrateButton trip={trip} car={vehicle ? (vehicle.nickname || `${vehicle.make} ${vehicle.model}`) : ''} />
          <DiscordShareButton tripId={trip.id} />
        </div>

        {/* Personal drive stats (just for you, no leaderboard) */}
        {scene && (trip.smoothness != null || trip.max_g || trip.best_0_60) && (
          <div className="bg-card rounded-2xl p-4 border border-border mt-3">
            <div className="text-sm font-semibold text-foreground mb-3">Drive stats</div>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-secondary/50 rounded-xl p-2.5 text-center">
                <div className="text-lg font-bold speed-font text-[#34A853]">{trip.smoothness ?? '—'}</div>
                <div className="text-[10px] text-muted-foreground">Flow Score</div>
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
            {(trip.best_60_100 || trip.best_30_70) && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="bg-secondary/50 rounded-xl p-2.5 text-center">
                  <div className="text-lg font-bold speed-font text-foreground">{trip.best_30_70 ? `${trip.best_30_70}s` : '—'}</div>
                  <div className="text-[10px] text-muted-foreground">30 roll (30–70)</div>
                </div>
                <div className="bg-secondary/50 rounded-xl p-2.5 text-center">
                  <div className="text-lg font-bold speed-font text-foreground">{trip.best_60_100 ? `${trip.best_60_100}s` : '—'}</div>
                  <div className="text-[10px] text-muted-foreground">60–100</div>
                </div>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground mt-2">
              {trip.hard_brakes || 0} hard brakes · {trip.hard_accels || 0} hard launches. These are only shown to you; drive safe and keep the fun for the track.
            </p>
          </div>
        )}

        {scene && trip.route.length > 20 && <SectionSaver trip={trip} onChange={setSection} />}
        {trip.route.length > 5 && <RateRoad trip={trip} />}

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
            <span className="text-[10px] text-muted-foreground">{Math.round(replayProgress * 100)}%{trip.speeds?.length ? ` · ${spd(trip.speeds[Math.min(trip.speeds.length - 1, visibleCount - 1)])} ${speedUnit()}` : ''}</span>
            <span className="text-[10px] text-muted-foreground">End</span>
          </div>
        </div>

        {/* Speed chart */}
        <div className="bg-card rounded-2xl p-4 border border-border mt-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-foreground">Speed Over Time</span>
            <span className="text-[10px] text-muted-foreground">{speedUnit()}</span>
          </div>
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={speedData} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
              <XAxis dataKey="time" tick={false} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6b6b80', fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#141420', border: '1px solid #1f1f2e', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#8b8b9f' }}
                formatter={(v) => [`${v} ${speedUnit()}`, 'Speed']}
              />
              <Line type="monotone" dataKey="speed" stroke={trip.userColor || '#00BFFF'} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
