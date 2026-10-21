import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Square, Check, Clock, TrendingUp, Gauge, Route, Bookmark, MapPinOff, Loader2 } from 'lucide-react';
import { Polyline, CircleMarker } from 'react-leaflet';
import DarkMap from '@/components/DarkMap';
import SpeedHUD from '@/components/SpeedHUD';
import { useGpsDrive } from '@/lib/useGpsDrive';
import { useApp } from '@/lib/AppContext';
import { formatDuration } from '@/lib/helpers';

const MAX_POINTS = 400;

async function reverseGeocode(lat, lng) {
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16`);
  if (!res.ok) throw new Error('geocode failed');
  const data = await res.json();
  const a = data.address || {};
  const label = [a.road || a.pedestrian, a.city || a.town || a.village || a.suburb]
    .filter(Boolean).join(', ');
  if (label) return label;
  if (data.display_name) return data.display_name.split(', ').slice(0, 2).join(', ');
  return `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
}

export default function LiveDrive() {
  const navigate = useNavigate();
  const { vehicles, savedRoutes, addTrip } = useApp();
  const drive = useGpsDrive();
  const [tripTitle, setTripTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const urlParams = new URLSearchParams(window.location.search);
  const routeId = urlParams.get('route');
  const guideRoute = routeId ? savedRoutes.find(r => r.id === routeId) : null;

  const center = drive.currentPosition || (guideRoute && guideRoute.route.length > 0 ? guideRoute.route[Math.floor(guideRoute.route.length / 2)] : [37.7749, -122.4194]);

  useEffect(() => {
    if (drive.status === 'ended' && !tripTitle) {
      setTripTitle(`Drive — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`);
    }
  }, [drive.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (!drive.route.length || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      const step = Math.ceil(drive.route.length / MAX_POINTS) || 1;
      const routePoints = drive.route.filter((_, i) => i % step === 0 || i === drive.route.length - 1);

      let startLocation = 'Start';
      let endLocation = '';
      try {
        const first = drive.route[0];
        const last = drive.route[drive.route.length - 1];
        [startLocation, endLocation] = await Promise.all([
          reverseGeocode(first.lat, first.lng),
          reverseGeocode(last.lat, last.lng)
        ]);
      } catch (e) { /* fall back to Start */ }

      const avg = drive.speedHistory.length
        ? Math.round(drive.speedHistory.reduce((a, b) => a + b, 0) / drive.speedHistory.length)
        : 0;

      const rec = await addTrip({
        title: tripTitle || 'Drive',
        start_time: new Date(Date.now() - drive.elapsedTime * 1000).toISOString(),
        end_time: new Date().toISOString(),
        distance: drive.distance,
        duration: drive.elapsedTime,
        top_speed: drive.maxSpeed,
        avg_speed: avg,
        vehicle_id: vehicles[0] ? vehicles[0].id : null,
        route_points: routePoints,
        start_location: startLocation,
        end_location: endLocation
      });
      drive.reset();
      navigate(`/trip/${rec.id}`);
    } catch (err) {
      setSaveError(err.message || 'Failed to save trip');
    } finally {
      setSaving(false);
    }
  };

  const avgSpeedNow = drive.speedHistory.length
    ? Math.round(drive.speedHistory.reduce((a, b) => a + b, 0) / drive.speedHistory.length)
    : 0;

  return (
    <div className="relative h-full overflow-hidden">
      {/* Map */}
      <div className="absolute inset-0">
        <DarkMap center={center} zoom={16} follow={drive.status === 'driving'}>
          {guideRoute && guideRoute.route.length > 1 && (
            <Polyline positions={guideRoute.route} pathOptions={{ color: '#6b6b9f', weight: 3, opacity: 0.6, dashArray: '6 8' }} />
          )}
          {drive.route.length > 1 && (
            <Polyline positions={drive.route.map(p => [p.lat, p.lng])} pathOptions={{ color: '#00BFFF', weight: 4, opacity: 0.9 }} />
          )}
          {drive.currentPosition && (
            <CircleMarker
              center={drive.currentPosition}
              radius={7}
              pathOptions={{ color: '#39FF14', fillColor: '#39FF14', fillOpacity: 1 }}
            />
          )}
        </DarkMap>
      </div>

      <AnimatePresence mode="wait">
        {/* Idle */}
        {drive.status === 'idle' && (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-end pb-28 z-[500]"
          >
            <div className="glass rounded-3xl p-6 mx-5 w-full max-w-md border border-border">
              <div className="flex items-center justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
                  <Gauge className="w-8 h-8 text-primary" />
                </div>
              </div>
              <h2 className="text-lg font-bold text-foreground text-center">Ready to Drive</h2>
              <p className="text-xs text-muted-foreground text-center mt-1 mb-5">
                Keep Drivez open while you drive. Your route, speed and distance are tracked with GPS.
              </p>

              {drive.error && (
                <div className="mb-4 p-3 rounded-xl bg-destructive/10 text-destructive text-xs flex items-start gap-2">
                  <MapPinOff className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    {drive.error === 'denied'
                      ? 'Location permission denied. Enable location for Drivez in your browser settings, then try again.'
                      : drive.error === 'unsupported'
                      ? 'Your browser does not support location tracking.'
                      : drive.error === 'timeout'
                      ? 'Could not get a GPS signal. Move somewhere with a clear view of the sky and try again.'
                      : 'Location is currently unavailable. Try again shortly.'}
                  </span>
                </div>
              )}

              {guideRoute && (
                <div className="mb-4 bg-secondary/50 rounded-xl p-3 border border-border">
                  <div className="flex items-center gap-2 mb-1">
                    <Bookmark className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs font-bold text-foreground">{guideRoute.name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span>{guideRoute.distance} mi</span>
                    <span>Shown as a dashed guide line</span>
                  </div>
                </div>
              )}

              <button
                onClick={drive.start}
                className="w-full bg-primary text-primary-foreground rounded-2xl py-3.5 font-bold text-sm flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4 fill-primary-foreground" />
                Start Drive
              </button>
              {!guideRoute && (
                <button
                  onClick={() => navigate('/routes')}
                  className="w-full mt-2 text-xs text-muted-foreground font-medium py-2"
                >
                  Use a Saved Route →
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* Acquiring GPS */}
        {drive.status === 'acquiring' && (
          <motion.div
            key="acquiring"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-end pb-28 z-[500]"
          >
            <div className="glass rounded-3xl p-6 mx-5 w-full max-w-md border border-border text-center">
              <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
              <h2 className="text-lg font-bold text-foreground">Waiting for GPS signal…</h2>
              <p className="text-xs text-muted-foreground mt-1 mb-2">
                Make sure location access is allowed for Drivez.
              </p>
              <p className="text-xs text-muted-foreground font-semibold mb-5 speed-font">
                {formatDuration(drive.elapsedTime)}
              </p>
              <button
                onClick={drive.reset}
                className="w-full bg-secondary text-foreground rounded-2xl py-3 font-semibold text-sm"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}

        {/* Driving */}
        {drive.status === 'driving' && (
          <motion.div
            key="driving"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-[500] pointer-events-none"
          >
            {/* Top bar */}
            <div className="absolute top-0 left-0 right-0 p-5 pt-12">
              <div className="glass rounded-2xl px-4 py-3 border border-border flex items-center justify-between pointer-events-auto">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                  <span className="text-xs font-medium text-accent">{drive.gpsWaiting ? 'Waiting for GPS…' : 'Recording'}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <div className="flex items-center gap-1 text-foreground">
                      <Route className="w-3 h-3" />
                      <span className="text-sm font-bold speed-font">{drive.distance}</span>
                      <span className="text-[10px] text-muted-foreground">mi</span>
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center gap-1 text-foreground">
                      <Clock className="w-3 h-3" />
                      <span className="text-sm font-bold speed-font">{formatDuration(drive.elapsedTime)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom HUD */}
            <div className="absolute bottom-0 left-0 right-0 p-5 pb-28">
              <div className="glass rounded-3xl p-6 border border-border pointer-events-auto">
                <SpeedHUD speed={drive.currentSpeed} maxSpeed={drive.maxSpeed} />
                <button
                  onClick={drive.end}
                  className="w-full mt-4 bg-destructive/90 text-destructive-foreground rounded-2xl py-3 font-bold text-sm flex items-center justify-center gap-2"
                >
                  <Square className="w-4 h-4 fill-current" />
                  End Drive
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Summary */}
        {drive.status === 'ended' && (
          <motion.div
            key="ended"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-[600] flex flex-col justify-end"
          >
            <div className="flex-1" />
            <div className="glass rounded-t-3xl p-6 border-t border-border mx-0">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto mb-4" />
              <h2 className="text-lg font-bold text-foreground text-center mb-1">Drive Complete</h2>
              <p className="text-xs text-muted-foreground text-center mb-5">
                {drive.distance} miles • {formatDuration(drive.elapsedTime)}
              </p>

              <input
                value={tripTitle}
                onChange={e => setTripTitle(e.target.value)}
                placeholder="Trip name"
                className="w-full bg-secondary/50 rounded-xl px-4 py-2.5 text-foreground text-sm border border-border focus:border-primary outline-none mb-4"
              />

              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="bg-card/80 rounded-2xl p-4 border border-border">
                  <div className="flex items-center gap-1.5 mb-1">
                    <TrendingUp className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[10px] text-muted-foreground">Top Speed</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold speed-font text-primary">{drive.maxSpeed}</span>
                    <span className="text-xs text-muted-foreground">mph</span>
                  </div>
                </div>
                <div className="bg-card/80 rounded-2xl p-4 border border-border">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Gauge className="w-3.5 h-3.5 text-accent" />
                    <span className="text-[10px] text-muted-foreground">Avg Speed</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold speed-font text-accent">{avgSpeedNow}</span>
                    <span className="text-xs text-muted-foreground">mph</span>
                  </div>
                </div>
                <div className="bg-card/80 rounded-2xl p-4 border border-border">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Route className="w-3.5 h-3.5 text-foreground" />
                    <span className="text-[10px] text-muted-foreground">Distance</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold speed-font text-foreground">{drive.distance}</span>
                    <span className="text-xs text-muted-foreground">mi</span>
                  </div>
                </div>
                <div className="bg-card/80 rounded-2xl p-4 border border-border">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Clock className="w-3.5 h-3.5 text-foreground" />
                    <span className="text-[10px] text-muted-foreground">Duration</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold speed-font text-foreground">{formatDuration(drive.elapsedTime)}</span>
                  </div>
                </div>
              </div>

              {saveError && <p className="text-xs text-destructive mb-3 text-center">{saveError}</p>}

              <div className="flex gap-3">
                <button
                  onClick={drive.reset}
                  disabled={saving}
                  className="flex-1 bg-secondary text-foreground rounded-2xl py-3 font-semibold text-sm disabled:opacity-40"
                >
                  Discard
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || drive.route.length < 2}
                  className="flex-1 bg-primary text-primary-foreground rounded-2xl py-3 font-bold text-sm flex items-center justify-center gap-1.5 disabled:opacity-40"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Save Trip
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
