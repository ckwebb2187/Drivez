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
import { mileageMode } from '@/lib/carBluetooth';

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
  const { activeVehicle, vehicles, myCar, savedRoutes, addTrip, scene, btCar } = useApp();
  const drive = useGpsDrive(myCar);
  const location = useLocation();
  // This screen stays alive in the background while you visit other tabs, so the
  // route only changes when you tap Go, End route, or open a saved plan.
  const [navPlan, setNavPlan] = useState(location.state?.nav || null);
  const [routeId, setRouteId] = useState(() => new URLSearchParams(window.location.search).get('route'));
  const lastKey = useRef(location.key);
  useEffect(() => {
    if ((location.pathname !== '/drive' && location.pathname !== '/') || location.key === lastKey.current) return;
    lastKey.current = location.key;
    if (location.state?.go || location.state?.plan) return; // handled by the planner on the map
    // Only change the route when we're actually given a new one. Coming back to the map
    // from another screen (tab bar, back button) must never cancel the route you're on.
    if (location.state?.nav) setNavPlan(location.state.nav);
    const rid = new URLSearchParams(location.search).get('route');
    if (rid) setRouteId(rid);
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

  // Which car's Bluetooth the phone was on during this drive (Android app).
  const btSeen = useRef(null);
  useEffect(() => { if (drive.status === 'acquiring' || drive.status === 'idle') btSeen.current = null; }, [drive.status]);
  useEffect(() => { if (btCar && (drive.status === 'driving' || drive.status === 'acquiring')) btSeen.current = btCar; }, [btCar, drive.status]);
  const tripCar = btSeen.current || activeVehicle;
  const countsMiles = !!tripCar && (btSeen.current ? true : mileageMode(tripCar) === 'all');

  // Drives save themselves when they end (no full-screen summary). A small note confirms it,
  // with a link to the drive to view, rename or delete it. Offline? It's kept and sent later.
  const [toast, setToast] = useState(null);
  const savedOnce = useRef(false);
  useEffect(() => { if (drive.status !== 'ended') savedOnce.current = false; }, [drive.status]);
  useEffect(() => {
    if (drive.status !== 'ended' || savedOnce.current) return;
    savedOnce.current = true;
    const route = drive.route;
    // Too short to be a real drive (started by accident): just drop it.
    if (route.length < 2 || (drive.distance < 0.05 && drive.elapsedTime < 60)) {
      drive.reset();
      setToast({ text: 'Drive too short to save' });
      return;
    }
    const step = Math.ceil(route.length / MAX_POINTS) || 1;
    const trip = {
      title: navPlan ? `Drive to ${navPlan.dest.name}` : `Drive — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      start_time: new Date(Date.now() - drive.elapsedTime * 1000).toISOString(),
      end_time: new Date().toISOString(),
      distance: drive.distance,
      duration: drive.elapsedTime,
      top_speed: drive.maxSpeed,
      avg_speed: drive.speedHistory.length ? Math.round(drive.speedHistory.reduce((a, b) => a + b, 0) / drive.speedHistory.length) : 0,
      vehicle_id: tripCar ? tripCar.id : null,
      odo: countsMiles,
      route_points: route.filter((_, i) => i % step === 0 || i === route.length - 1),
      max_g: drive.stats.maxG || null,
      best_0_60: drive.stats.best060 ? Math.round(drive.stats.best060 * 10) / 10 : null,
      hard_brakes: drive.stats.hardBrakes,
      hard_accels: drive.stats.hardAccels,
      smoothness: drive.stats.smoothness,
    };
    const odoNote = tripCar && scene && !countsMiles
      ? (mileageMode(tripCar) === 'manual' ? '' : ` · not added to ${tripCar.nickname || tripCar.model} miles`)
      : '';
    drive.reset();
    navigate('/', { replace: true, state: null });
    setToast({ text: `Saving drive · ${trip.distance} mi…` });
    (async () => {
      const first = route[0], last = route[route.length - 1];
      try {
        const [a, b] = await Promise.all([reverseGeocode(first.lat, first.lng), reverseGeocode(last.lat, last.lng)]);
        trip.start_location = a; trip.end_location = b;
      } catch { trip.start_location = 'Start'; trip.end_location = ''; }
      try {
        const rec = await addTrip(trip);
        setToast({ text: `Drive saved · ${trip.distance} mi${odoNote}`, id: rec.id });
      } catch {
        try {
          const q = JSON.parse(localStorage.getItem('dz-pending-trips') || '[]');
          localStorage.setItem('dz-pending-trips', JSON.stringify([...q, trip]));
        } catch { /* storage full */ }
        setToast({ text: 'No connection: drive kept on this phone and will upload later' });
      }
    })();
  }, [drive.status]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), toast.id ? 7000 : 4000); return () => clearTimeout(t); }, [toast]);

  // Upload drives that were kept while offline.
  useEffect(() => {
    const flush = async () => {
      let q = [];
      try { q = JSON.parse(localStorage.getItem('dz-pending-trips') || '[]'); } catch { return; }
      if (!q.length) return;
      const left = [];
      for (const t of q) { try { await addTrip(t); } catch { left.push(t); } }
      try { localStorage.setItem('dz-pending-trips', JSON.stringify(left)); } catch { /* ignore */ }
      if (left.length < q.length) setToast({ text: `${q.length - left.length} saved drive${q.length - left.length > 1 ? 's' : ''} uploaded` });
    };
    flush();
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

      </AnimatePresence>

      {/* "Drive saved" note */}
      {toast && active && (
        <div className="absolute left-3 right-3 top-[max(12px,env(safe-area-inset-top))] z-[700] pointer-events-auto dz-pop-in">
          <div className="mx-auto max-w-md rounded-2xl bg-[#188038] text-white shadow-2xl pl-4 pr-1.5 py-1.5 flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-sm font-semibold truncate">{toast.text}</span>
            {toast.id && <button onClick={() => { setToast(null); navigate(`/trip/${toast.id}`); }} className="h-9 px-3 rounded-full bg-white/20 text-xs font-bold">View</button>}
            <button onClick={() => setToast(null)} className="w-8 h-8 flex items-center justify-center" aria-label="Close"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
