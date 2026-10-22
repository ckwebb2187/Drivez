import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Square, Check, Clock, TrendingUp, Gauge, Route, Bookmark, MapPinOff, Loader2, Volume2, VolumeX, X, ChevronUp } from 'lucide-react';
import { Polyline } from 'react-leaflet';
import DarkMap from '@/components/DarkMap';
import { useGpsDrive } from '@/lib/useGpsDrive';
import { useApp } from '@/lib/AppContext';
import { formatDuration } from '@/lib/helpers';
import { useNavigation } from '@/lib/useNavigation';
import { formatNavDistance, formatEta, arrivalTime } from '@/lib/nav';
import { LocationMarker, PinMarker, TurnIcon, ReportMarkers, ReportButton } from '@/components/MapBits';
import { useReports, useReportAlerts, REPORT_TYPES } from '@/lib/reports';
import MusicButton from '@/components/MusicButton';

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
  const { activeVehicle, myCar, savedRoutes, addTrip } = useApp();
  const drive = useGpsDrive(myCar);
  const location = useLocation();
  const navPlan = location.state?.nav || null;
  const [voiceOn, setVoiceOn] = useState(() => { try { return localStorage.getItem('dz_voice') !== '0'; } catch { return true; } });
  const nav = useNavigation(navPlan, drive.currentPosition, voiceOn && drive.status === 'driving');
  const toggleVoice = () => { const v = !voiceOn; setVoiceOn(v); try { localStorage.setItem('dz_voice', v ? '1' : '0'); } catch { /* ignore */ } if (!v) window.speechSynthesis?.cancel(); };

  const roadReports = useReports(drive.currentPosition);
  const [reportAlert, dismissAlert] = useReportAlerts(roadReports.reports, drive.status === 'driving' ? drive.currentPosition : null, nav.active ? nav.route.coords : null, voiceOn);

  // Tapping "Go" on the home map starts the drive straight away.
  useEffect(() => { if (navPlan && drive.status === 'idle') drive.start(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [tripTitle, setTripTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [barOpen, setBarOpen] = useState(false);

  const urlParams = new URLSearchParams(window.location.search);
  const routeId = urlParams.get('route');
  const guideRoute = routeId ? savedRoutes.find(r => r.id === routeId) : null;

  // Show where you are on the map even before the drive starts.
  const [herePos, setHerePos] = useState(null);
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition((p) => setHerePos([p.coords.latitude, p.coords.longitude]), () => {}, { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 });
  }, []);

  const center = drive.currentPosition || herePos || (navPlan ? [navPlan.dest.lat, navPlan.dest.lng] : null) || (guideRoute && guideRoute.route.length > 0 ? guideRoute.route[Math.floor(guideRoute.route.length / 2)] : [39.8283, -98.5795]);

  useEffect(() => {
    if (drive.status === 'ended' && !tripTitle) {
      setTripTitle(navPlan ? `Drive to ${navPlan.dest.name}` : `Drive — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`);
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
        vehicle_id: activeVehicle ? activeVehicle.id : null,
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
    <div className="fixed inset-0 overflow-hidden">
      {/* Map */}
      <div className="absolute inset-0">
        <DarkMap center={center} zoom={navPlan ? 17 : 16} follow={drive.status === 'driving' || (!!herePos && drive.status === 'idle')}>
          {nav.active && (
            <>
              <Polyline positions={nav.route.coords} pathOptions={{ color: '#1a3d7a', weight: 11, opacity: 0.9 }} />
              <Polyline positions={nav.route.coords} pathOptions={{ color: '#4285F4', weight: 7, opacity: 1 }} />
            </>
          )}
          {navPlan && <PinMarker pos={[navPlan.dest.lat, navPlan.dest.lng]} />}
          {guideRoute && guideRoute.route.length > 1 && (
            <Polyline positions={guideRoute.route} pathOptions={{ color: '#6b6b9f', weight: 3, opacity: 0.6, dashArray: '6 8' }} />
          )}
          {drive.route.length > 1 && (
            <Polyline positions={drive.route.map(p => [p.lat, p.lng])} pathOptions={{ color: '#00BFFF', weight: 4, opacity: 0.9 }} />
          )}
          <ReportMarkers reports={roadReports.reports} onVote={roadReports.vote} onRemove={roadReports.remove} />
          <LocationMarker pos={drive.currentPosition || herePos} heading={drive.heading} car={myCar} />
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
            {nav.active && (
              <div className="absolute top-0 left-0 right-0 p-3 pt-[max(12px,env(safe-area-inset-top))] pointer-events-auto">
                <div className="rounded-2xl shadow-2xl overflow-hidden" style={{ background: nav.arrived ? '#188038' : '#0F7B3F' }}>
                  <div className="flex items-center gap-3 px-4 py-3.5 text-white">
                    {nav.arrived ? <Check className="w-9 h-9" strokeWidth={2.6} /> : <TurnIcon step={nav.step} className="w-9 h-9 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-2xl font-bold leading-none">{nav.arrived ? 'Arrived' : nav.rerouting ? 'Rerouting…' : formatNavDistance(nav.distToStep)}</div>
                      <div className="text-[15px] font-semibold mt-1 leading-snug line-clamp-2">{nav.arrived ? navPlan.dest.name : nav.step.text}</div>
                    </div>
                    <button onClick={toggleVoice} className="w-10 h-10 rounded-full bg-black/20 flex items-center justify-center shrink-0" aria-label={voiceOn ? 'Mute directions' : 'Unmute directions'}>
                      {voiceOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                    </button>
                  </div>
                  {!nav.arrived && nav.nextStep && nav.step.type !== 'arrive' && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-black/20 text-white/90 text-xs font-medium">
                      Then <TurnIcon step={nav.nextStep} className="w-4 h-4" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Report warning */}
            {reportAlert && (
              <div className={`absolute left-3 right-[76px] ${nav.active ? 'top-[150px]' : 'top-[max(12px,env(safe-area-inset-top))]'} pointer-events-auto`}>
                <button onClick={dismissAlert} className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 shadow-2xl text-left" style={{ background: REPORT_TYPES[reportAlert.type]?.color || '#F9AB00' }}>
                  <span className="text-2xl">{REPORT_TYPES[reportAlert.type]?.emoji}</span>
                  <span className="flex-1 text-white">
                    <span className="block text-sm font-bold">{REPORT_TYPES[reportAlert.type]?.label} ahead</span>
                    <span className="block text-xs opacity-90">{formatNavDistance(reportAlert.distance)} · reported by {reportAlert.by}</span>
                  </span>
                  <X className="w-4 h-4 text-white/80" />
                </button>
              </div>
            )}

            {/* Speed bubble (bottom left, like Waze) */}
            <div className={`absolute left-3 ${barOpen ? 'bottom-[214px]' : 'bottom-[156px]'} transition-all pointer-events-none`}>
              <div className="w-[68px] h-[68px] rounded-full bg-white shadow-2xl flex flex-col items-center justify-center border-4 border-[#1f1f2e]">
                <span className="text-[26px] leading-none font-bold speed-font text-[#111]">{Math.round(drive.currentSpeed)}</span>
                <span className="text-[10px] font-bold text-[#555] -mt-0.5">mph</span>
              </div>
            </div>

            {/* Music + report shortcuts */}
            <div className={`absolute right-3 ${barOpen ? 'bottom-[214px]' : 'bottom-[156px]'} transition-all pointer-events-auto flex flex-col gap-3`}>
              <MusicButton size={50} />
              <ReportButton size={50} onReport={(type) => roadReports.report(type, drive.currentPosition)} disabled={!drive.currentPosition} />
            </div>

            {/* Slim bottom bar: tap to show End route / End Drive */}
            <div className="absolute left-0 right-0 bottom-[84px] px-3 pointer-events-auto">
              <div className="bg-card/95 backdrop-blur rounded-2xl border border-border shadow-2xl overflow-hidden">
                <button onClick={() => setBarOpen((o) => !o)} className="w-full flex items-center gap-3 px-4 h-[60px] text-left">
                  {nav.active && !nav.arrived ? (
                    <div className="flex-1 min-w-0">
                      <span className="text-lg font-bold text-[#34A853]">{formatEta(nav.remainingS)}</span>
                      <span className="text-sm text-muted-foreground"> · {formatNavDistance(nav.remainingM)} · {arrivalTime(nav.remainingS)}</span>
                    </div>
                  ) : (
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                      <span className="text-sm font-semibold text-foreground">{drive.gpsWaiting ? 'Waiting for GPS…' : nav.arrived ? 'Arrived' : 'Recording'}</span>
                      <span className="text-sm text-muted-foreground speed-font">· {drive.distance} mi · {formatDuration(drive.elapsedTime)}</span>
                    </div>
                  )}
                  <ChevronUp className={`w-5 h-5 text-muted-foreground transition-transform ${barOpen ? '' : 'rotate-180'}`} />
                </button>
                {barOpen && (
                  <div className="flex gap-2 px-3 pb-3">
                    {nav.active && (
                      <button onClick={() => { setBarOpen(false); navigate('/drive', { replace: true, state: null }); }} className="flex-1 h-11 rounded-xl bg-secondary text-sm font-semibold text-foreground flex items-center justify-center gap-1.5">
                        <X className="w-4 h-4" /> End route
                      </button>
                    )}
                    <button onClick={drive.end} className="flex-1 h-11 rounded-xl bg-destructive/90 text-destructive-foreground text-sm font-bold flex items-center justify-center gap-1.5">
                      <Square className="w-3.5 h-3.5 fill-current" /> End Drive
                    </button>
                  </div>
                )}
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
