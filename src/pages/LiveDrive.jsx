import { useState, useEffect, useRef, useMemo } from 'react';
import { useTrafficEta } from '@/lib/traffic';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Square, Check, Clock, TrendingUp, Gauge, Route, Bookmark, MapPinOff, Loader2, Volume2, VolumeX, X, ChevronUp, Navigation2, SkipForward, MapPin } from 'lucide-react';
import DriveMap from '@/components/DriveMap';
import { useGpsDrive } from '@/lib/useGpsDrive';
import { useApp } from '@/lib/AppContext';
import { formatDuration } from '@/lib/helpers';
import { useNavigation } from '@/lib/useNavigation';
import { formatNavDistance, formatEta, arrivalTime } from '@/lib/nav';
import { TurnIcon, ReportButton } from '@/components/MapBits';
import { useReports, useReportAlerts, useMappedBumps, REPORT_TYPES } from '@/lib/reports';
import MusicButton from '@/components/MusicButton';
import { WeatherButton } from '@/components/Weather';
import TripPlanner from '@/components/TripPlanner';

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

export default function LiveDrive({ active = true }) {
  const navigate = useNavigate();
  const { activeVehicle, myCar, savedRoutes, addTrip, scene } = useApp();
  const drive = useGpsDrive(myCar);
  const location = useLocation();
  // This screen stays alive in the background while you visit other tabs, so the
  // route only changes when you're actually sent to /drive (e.g. "Go" or "End route").
  const [navPlan, setNavPlan] = useState(location.state?.nav || null);
  const [routeId, setRouteId] = useState(() => new URLSearchParams(window.location.search).get('route'));
  const lastKey = useRef(location.key);
  useEffect(() => {
    if ((location.pathname !== '/drive' && location.pathname !== '/') || location.key === lastKey.current) return;
    lastKey.current = location.key;
    if (location.state?.go || location.state?.plan) return; // handled by the planner on the map
    setNavPlan(location.state?.nav || null);
    setRouteId(new URLSearchParams(location.search).get('route'));
  }, [location.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const [voiceOn, setVoiceOn] = useState(() => { try { return localStorage.getItem('dz_voice') !== '0'; } catch { return true; } });
  const nav = useNavigation(navPlan, drive.currentPosition, voiceOn && drive.status === 'driving');
  const toggleVoice = () => { const v = !voiceOn; setVoiceOn(v); try { localStorage.setItem('dz_voice', v ? '1' : '0'); } catch { /* ignore */ } if (!v) window.speechSynthesis?.cancel(); };

  // Where you are before a drive starts (the map is the home screen now).
  const [herePos, setHerePos] = useState(null);
  const [locError, setLocError] = useState('');
  useEffect(() => {
    if (drive.status !== 'idle' || !active) return undefined;
    if (!('geolocation' in navigator)) { setLocError('Your browser can’t share your location.'); return undefined; }
    const id = navigator.geolocation.watchPosition(
      (p) => { setLocError(''); setHerePos([p.coords.latitude, p.coords.longitude]); },
      (e) => { if (e.code === 1) setLocError('Turn on location for Kaido Maps to see where you are.'); },
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [drive.status, active]);
  const roadReports = useReports(drive.currentPosition || herePos);
  // Route being previewed on the map before you tap Go.
  const [preview, setPreview] = useState(null);
  // Lowered car: also warn about speed bumps and dips mapped in OpenStreetMap.
  const mappedBumps = useMappedBumps(drive.status === 'driving' ? drive.currentPosition : null, !!myCar?.lowered);
  const alertReports = useMemo(() => [...roadReports.reports, ...mappedBumps], [roadReports.reports, mappedBumps]);
  const [reportAlert, dismissAlert] = useReportAlerts(alertReports, drive.status === 'driving' ? drive.currentPosition : null, nav.active ? nav.route.coords : null, voiceOn, !!myCar?.lowered);

  // Tapping "Go" on the home map starts the drive straight away.
  useEffect(() => { if (navPlan && drive.status === 'idle') drive.start(); }, [navPlan]); // eslint-disable-line react-hooks/exhaustive-deps
  // Back to the map after a drive (saved, discarded or cancelled): forget the old destination.
  const prevStatus = useRef(drive.status);
  useEffect(() => {
    if (drive.status === 'idle' && prevStatus.current !== 'idle') { setNavPlan(null); setRouteId(null); }
    prevStatus.current = drive.status;
  }, [drive.status]);

  // Let the rest of the app know a drive is going (for the "Return to drive" bar).
  useEffect(() => {
    window.__dzDriveStatus = drive.status;
    window.dispatchEvent(new Event('dz-drive-status'));
  }, [drive.status]);
  const [tripTitle, setTripTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [barOpen, setBarOpen] = useState(false);

  const guideRoute = routeId ? savedRoutes.find(r => r.id === routeId) : null;


  // Live traffic: re-check the arrival time every 3 minutes while navigating.
  const [trafficTick, setTrafficTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTrafficTick((n) => n + 1), 180000); return () => clearInterval(t); }, []);
  const trafficPoints = useMemo(() => {
    const here = drive.currentPosition;
    if (!nav.active || nav.arrived || !here) return null;
    return [here, ...nav.stops.slice(nav.stopIdx).map((x) => [x.lat, x.lng]), [navPlan.dest.lat, navPlan.dest.lng]];
  }, [trafficTick, nav.active, nav.stopIdx, !!drive.currentPosition]); // eslint-disable-line react-hooks/exhaustive-deps
  const traffic = useTrafficEta(trafficPoints, !!trafficPoints, 600000);
  // TomTom's time is measured from the moment it was fetched; take off the time spent driving since.
  const [trafficAt, setTrafficAt] = useState(0);
  useEffect(() => { if (traffic) setTrafficAt(Date.now()); }, [traffic]);
  const remainingS = traffic && nav.remainingS != null
    ? Math.max(nav.remainingS * 0.5, traffic.travelTime - (Date.now() - trafficAt) / 1000)
    : nav.remainingS;

  // Camera follows you; if you pan the map it waits, then snaps back after a few seconds (like Waze).
  const [follow, setFollow] = useState(true);
  const backTimer = useRef(null);
  const onUserMove = () => {
    setFollow(false);
    clearTimeout(backTimer.current);
    backTimer.current = setTimeout(() => setFollow(true), 12000);
  };
  const recenter = () => { clearTimeout(backTimer.current); setFollow(true); };
  // Previewing a route: show the whole thing; clearing it snaps back to you.
  useEffect(() => { clearTimeout(backTimer.current); setFollow(!preview); }, [preview]);
  useEffect(() => { if (drive.status !== 'idle') setPreview(null); }, [drive.status]);
  useEffect(() => () => clearTimeout(backTimer.current), []);

  useEffect(() => {
    if (drive.status === 'ended' && !tripTitle) {
      setTripTitle(navPlan ? `Drive to ${navPlan.dest.name}` : `Drive — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`);
    }
  }, [drive.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Remember where you parked when a drive ends; forget it when the next one starts.
  useEffect(() => {
    try {
      if (drive.status === 'driving') localStorage.removeItem('dz-parked');
      if (drive.status === 'ended') {
        const last = drive.route[drive.route.length - 1];
        if (last) localStorage.setItem('dz-parked', JSON.stringify({ lat: last.lat, lng: last.lng, at: Date.now(), car: activeVehicle ? (activeVehicle.nickname || `${activeVehicle.make} ${activeVehicle.model}`) : null }));
      }
    } catch { /* private mode */ }
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
        end_location: endLocation,
        max_g: drive.stats.maxG || null,
        best_0_60: drive.stats.best060 ? Math.round(drive.stats.best060 * 10) / 10 : null,
        hard_brakes: drive.stats.hardBrakes,
        hard_accels: drive.stats.hardAccels,
        smoothness: drive.stats.smoothness,
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
        <DriveMap
          pos={drive.currentPosition || herePos}
          heading={drive.heading}
          speed={drive.currentSpeed}
          car={myCar}
          driving={drive.status === 'driving'}
          routeCoords={nav.active ? nav.route.coords : preview ? preview.route.coords : null}
          dest={navPlan ? navPlan.dest : preview ? preview.dest : null}
          stops={nav.active ? nav.stops.slice(nav.stopIdx) : preview ? preview.stops : []}
          fitCoords={drive.status === 'idle' && preview ? preview.route.coords : null}
          guide={guideRoute ? guideRoute.route : null}
          trail={drive.route}
          reports={roadReports.reports}
          follow={follow}
          onUserMove={onUserMove}
          active={active}
        />
      </div>

      <AnimatePresence mode="wait">
        {/* Idle: the map is the home screen — search, plan and go from here */}
        {drive.status === 'idle' && (
          <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-[500] pointer-events-none">
            <TripPlanner
              pos={herePos}
              locError={locError}
              roadReports={roadReports}
              onPreview={setPreview}
              onGo={(p) => { setRouteId(null); setNavPlan(p); }}
              onStartDrive={drive.start}
              onRecenter={recenter}
              following={follow}
              driveError={drive.error}
              guideRoute={guideRoute}
              onClearGuide={() => { setRouteId(null); navigate('/', { replace: true }); }}
            />
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
                Make sure location access is allowed for Kaido Maps.
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

            {/* Reached a stop */}
            {nav.active && nav.justReached && !nav.arrived && (
              <div className="absolute left-3 right-3 top-[140px] pointer-events-none">
                <div className="mx-auto max-w-sm rounded-2xl bg-[#188038] text-white px-4 py-2.5 shadow-2xl flex items-center gap-2 text-sm font-semibold">
                  <MapPin className="w-4 h-4" /> Reached {nav.justReached.name}
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

            {/* Re-center (shows after you move the map) */}
            {!follow && (
              <div className={`absolute left-1/2 -translate-x-1/2 ${barOpen ? 'bottom-[160px]' : 'bottom-[156px]'} pointer-events-auto`}>
                <button onClick={recenter} className="h-11 px-5 rounded-full bg-card/95 backdrop-blur border border-border shadow-2xl text-sm font-bold text-[#8ab4f8] flex items-center gap-2">
                  <Navigation2 className="w-4 h-4 fill-[#8ab4f8]" /> Re-center
                </button>
              </div>
            )}

            {/* Music + report shortcuts */}
            <div className={`absolute right-3 ${barOpen ? 'bottom-[214px]' : 'bottom-[156px]'} transition-all pointer-events-auto flex flex-col gap-3`}>
              <WeatherButton className="!w-[50px] !h-[50px]" />
              <MusicButton size={50} />
              <ReportButton size={50} onReport={(type) => roadReports.report(type, drive.currentPosition)} disabled={!drive.currentPosition} />
            </div>

            {/* Slim bottom bar: tap to show End route / End Drive */}
            <div className="absolute left-0 right-0 bottom-[84px] px-3 pointer-events-auto">
              <div className="bg-card/95 backdrop-blur rounded-2xl border border-border shadow-2xl overflow-hidden">
                <button onClick={() => setBarOpen((o) => !o)} className="w-full flex items-center gap-3 px-4 h-[60px] text-left">
                  {nav.active && !nav.arrived ? (
                    <div className="flex-1 min-w-0">
                      <span className={`text-lg font-bold ${traffic && traffic.delay > 300 ? 'text-[#F9AB00]' : 'text-[#34A853]'}`}>{formatEta(remainingS)}</span>
                      <span className="text-sm text-muted-foreground"> · {formatNavDistance(nav.remainingM)} · {arrivalTime(remainingS)}</span>
                      {(nav.nextStop || (traffic && traffic.delay > 60)) && (
                        <div className="text-[11px] text-muted-foreground truncate -mt-0.5">
                          {nav.nextStop ? `Next: stop ${nav.stopIdx + 1} · ${nav.nextStop.name}` : ''}
                          {nav.nextStop && traffic && traffic.delay > 60 ? ' · ' : ''}
                          {traffic && traffic.delay > 60 ? <span className="text-[#F9AB00] font-semibold">+{Math.round(traffic.delay / 60)} min traffic</span> : null}
                        </div>
                      )}
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
                    {nav.active && nav.nextStop && (
                      <button onClick={() => { setBarOpen(false); nav.skipStop(); }} className="flex-1 h-11 rounded-xl bg-secondary text-sm font-semibold text-foreground flex items-center justify-center gap-1.5">
                        <SkipForward className="w-4 h-4" /> Skip stop
                      </button>
                    )}
                    {nav.active && (
                      <button onClick={() => { setBarOpen(false); setNavPlan(null); navigate('/', { replace: true, state: null }); }} className="flex-1 h-11 rounded-xl bg-secondary text-sm font-semibold text-foreground flex items-center justify-center gap-1.5">
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
            <div className="glass rounded-t-3xl p-6 pb-28 border-t border-border mx-0 max-h-[85vh] overflow-y-auto no-scrollbar">
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

              {/* Personal drive stats (just for you; no leaderboard) */}
              {scene && <>
              <div className="grid grid-cols-3 gap-2 mb-5">
                <div className="bg-card/80 rounded-2xl p-3 border border-border text-center">
                  <div className="text-xl font-bold speed-font text-[#34A853]">{drive.stats.smoothness}</div>
                  <div className="text-[10px] text-muted-foreground">Smoothness</div>
                </div>
                <div className="bg-card/80 rounded-2xl p-3 border border-border text-center">
                  <div className="text-xl font-bold speed-font text-foreground">{drive.stats.maxG ? drive.stats.maxG.toFixed(2) : '—'}<span className="text-xs">g</span></div>
                  <div className="text-[10px] text-muted-foreground">Peak g-force</div>
                </div>
                <div className="bg-card/80 rounded-2xl p-3 border border-border text-center">
                  <div className="text-xl font-bold speed-font text-foreground">{drive.stats.best060 ? `${drive.stats.best060.toFixed(1)}s` : '—'}</div>
                  <div className="text-[10px] text-muted-foreground">0–60</div>
                </div>
              </div>
              {(drive.stats.hardBrakes > 0 || drive.stats.hardAccels > 0) && (
                <p className="text-[11px] text-muted-foreground text-center -mt-3 mb-4">{drive.stats.hardBrakes} hard brake{drive.stats.hardBrakes === 1 ? '' : 's'} · {drive.stats.hardAccels} hard launch{drive.stats.hardAccels === 1 ? '' : 'es'}</p>
              )}
              </>}

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
