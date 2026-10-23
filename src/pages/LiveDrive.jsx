import { useState, useEffect, useRef, useMemo } from 'react';
import { useTrafficEta } from '@/lib/traffic';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Square, Check, Clock, TrendingUp, Gauge, Route, Bookmark, MapPinOff, Loader2, Volume2, VolumeX, X, ChevronUp, Navigation2, SkipForward, MapPin } from 'lucide-react';
import DriveMap from '@/components/DriveMap';
import { useGpsDrive, pendingDrive, clearPendingDrive } from '@/lib/useGpsDrive';
import { useApp } from '@/lib/AppContext';
import { formatDuration } from '@/lib/helpers';
import { useNavigation } from '@/lib/useNavigation';
import { formatNavDistance, formatEta, arrivalTime, distM } from '@/lib/nav';
import { TurnIcon, ReportButton } from '@/components/MapBits';
import { useReports, useReportAlerts, useMappedBumps, REPORT_TYPES } from '@/lib/reports';
import MusicButton from '@/components/MusicButton';
import { WeatherButton } from '@/components/Weather';
import TripPlanner from '@/components/TripPlanner';
import { useSpeedLimit } from '@/lib/speedLimit';
import { useMapLook, speedStyle } from '@/lib/mapTheme';
import DriverSheet from '@/components/DriverSheet';
import { api } from '@/api/base44Client';
import { mileageMode } from '@/lib/carBluetooth';
import { useConvoy, useOpenConvoys, joinConvoy } from '@/lib/convoy';
import FriendsHub from '@/components/FriendsHub';
import AskGemini from '@/components/AskGemini';
import { say, getVoiceSettings, recapText, tripFacts } from '@/lib/voice';
import { searchPlaces, getRoute } from '@/lib/nav';

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
  const [look] = useMapLook();
  const speedLimit = useSpeedLimit(drive.status === 'driving' ? drive.currentPosition : null, drive.heading, drive.status === 'driving');
  // Friends driving right now (shown on the map; tap one for their profile).
  const [friends, setFriends] = useState([]);
  const [openDriver, setOpenDriver] = useState(null);
  useEffect(() => {
    if (!active) return undefined;
    let alive = true;
    const load = () => api.get('/live').then((d) => alive && setFriends(d.drivers || [])).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => { alive = false; clearInterval(t); };
  }, [active]);
  // Group drive: the others in your convoy show on the map like friends (even if they aren't friends yet).
  const { convoy, leave: leaveConvoy } = useConvoy(active);
  const { open: openConvoys } = useOpenConvoys(active);
  const inviteFor = !convoy ? openConvoys.find((c) => c.invited) : null;
  const [inviteSeen, setInviteSeen] = useState(null);
  const convoyDrivers = useMemo(() => (convoy?.members || []).filter((m) => !m.me && m.live).map((m) => ({ ...m, ...m.live, name: `👥 ${m.name}` })), [convoy]);
  const mapFriends = useMemo(() => {
    const ids = new Set(convoyDrivers.map((d) => d.userId));
    return [...convoyDrivers, ...friends.filter((f) => !ids.has(f.userId))];
  }, [friends, convoyDrivers]);
  // Upcoming car meets near you, pinned on the map (scene mode).
  const [meets, setMeets] = useState([]);
  const meetsAt = useRef(null);
  useEffect(() => {
    const p = drive.currentPosition || herePos;
    if (!active || !scene || !p) return;
    if (meetsAt.current && Date.now() - meetsAt.current < 5 * 60000) return;
    meetsAt.current = Date.now();
    api.get(`/meets?lat=${p[0]}&lng=${p[1]}`).then((d) => setMeets(d.meets || [])).catch(() => {});
  }, [active, scene, herePos, drive.currentPosition]); // eslint-disable-line react-hooks/exhaustive-deps
  const meetPins = useMemo(() => meets.filter((m) => new Date(m.starts).getTime() - Date.now() < 7 * 86400000)
    .map((m) => ({ id: m.id, lat: m.lat, lng: m.lng, emoji: '🏁', label: `${m.title} · ${new Date(m.starts).toLocaleDateString([], { weekday: 'short' })}` })), [meets]);
  // Co-driver narration during a drive: every 5 miles, and every 10 corners in Tōge mode.
  const spoken = useRef({ miles: 0, corners: 0 });
  useEffect(() => { if (drive.status !== 'driving') spoken.current = { miles: 0, corners: 0 }; }, [drive.status]);
  useEffect(() => {
    if (drive.status !== 'driving' || !voiceOn || !getVoiceSettings().narrate) return;
    const m = Math.floor((drive.distance || 0) / 5) * 5;
    if (m > spoken.current.miles) {
      spoken.current.miles = m;
      const left = nav.active && !nav.arrived && nav.remainingM ? ` ${formatNavDistance(nav.remainingM).replace('mi', 'miles')} to go.` : '';
      say(`${m} miles in.${left}`);
    }
  }, [drive.distance]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ask Gemini: what it knows about right now, and what it can do.
  const askContext = () => ({
    time: new Date().toLocaleString([], { weekday: 'long', hour: 'numeric', minute: '2-digit' }),
    lat: (drive.currentPosition || herePos)?.[0], lng: (drive.currentPosition || herePos)?.[1],
    driving: drive.status === 'driving', speed: drive.currentSpeed, road: speedLimit?.name || '', limit: speedLimit?.mph || null,
    dest: navPlan?.dest?.name || '', etaMin: nav.active && remainingS ? remainingS / 60 : null,
    car: activeVehicle ? `${activeVehicle.year || ''} ${activeVehicle.make} ${activeVehicle.model}`.trim() : '',
    mode: driveMode,
    trip: drive.status === 'driving' ? `${drive.distance} mi, ${Math.round(drive.elapsedTime / 60)} min` : '',
  });
  const onAskAction = async ({ name, args }) => {
    const here = drive.currentPosition || herePos;
    if (name === 'navigate_to') {
      if (!here) throw new Error('I need your location first.');
      const hits = await searchPlaces(String(args.query || ''), here);
      if (!hits.length) throw new Error(`I couldn't find ${args.query} nearby.`);
      const dest = { name: hits[0].name, lat: hits[0].lat, lng: hits[0].lng };
      const route = await getRoute(here, [dest.lat, dest.lng], [], dest.name);
      const { alternatives, ...main } = route;
      setRouteId(null);
      setNavPlan({ dest, stops: [], route: main });
    } else if (name === 'report_road') {
      if (!here) throw new Error('I need your location to report that.');
      await roadReports.report(args.type, here);
    } else if (name === 'set_drive_mode' && ['cruise', 'toge', 'wangan'].includes(args.mode)) {
      setDriveMode(args.mode); try { localStorage.setItem('dz-drive-mode', args.mode); } catch { /* ignore */ }
    } else if (name === 'end_route') {
      setNavPlan(null);
    }
  };

  // Join a group drive and head to its destination (works mid-drive too).
  const onJoinConvoy = async (code) => {
    const c = await joinConvoy(code);
    const here = drive.currentPosition || herePos;
    if (!here || !c?.dest) return;
    const r = await getRoute(here, [c.dest.lat, c.dest.lng], [], c.dest.name);
    const { alternatives, ...main } = r;
    setRouteId(null);
    setNavPlan({ dest: c.dest, stops: [], route: main });
  };
  const hub = (
    <FriendsHub live={friends} convoy={convoy} openConvoys={openConvoys} here={drive.currentPosition || herePos}
      dest={navPlan?.dest || null} onJoin={onJoinConvoy} onLeave={leaveConvoy} onDriver={setOpenDriver} />
  );

  // Route being previewed on the map before you tap Go.
  const [preview, setPreview] = useState(null);
  // Lowered car: also warn about speed bumps and dips mapped in OpenStreetMap.
  const mappedBumps = useMappedBumps(drive.status === 'driving' ? drive.currentPosition : null, !!myCar?.lowered);
  const alertReports = useMemo(() => [...roadReports.reports, ...mappedBumps], [roadReports.reports, mappedBumps]);
  const [reportAlert, dismissAlert] = useReportAlerts(alertReports, drive.status === 'driving' ? drive.currentPosition : null, nav.active ? nav.route.coords : null, voiceOn, !!myCar?.lowered);

  // Picking up a drive that was interrupted (app closed, phone restarted the app, graphics reset).
  // Recent ones (under 30 min) resume on their own; older ones ask first.
  const [resumable, setResumable] = useState(null);
  useEffect(() => {
    const snap = pendingDrive();
    if (!snap || drive.status !== 'idle') return;
    let nav = null;
    try { nav = JSON.parse(localStorage.getItem('dz-live-nav') || 'null'); } catch { /* ignore */ }
    if (Date.now() - snap.savedAt < 30 * 60000) { drive.start(snap); if (nav) setNavPlan(nav); }
    else setResumable({ snap, nav });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    try {
      if (navPlan && drive.status !== 'idle') localStorage.setItem('dz-live-nav', JSON.stringify(navPlan));
      else if (drive.status === 'idle') localStorage.removeItem('dz-live-nav');
    } catch { /* storage full: the drive still resumes, just without the route */ }
  }, [navPlan, drive.status]);

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
  useEffect(() => () => { window.__dzDriveStatus = 'idle'; window.dispatchEvent(new Event('dz-drive-status')); }, []);
  // Drive mode: normal cruising, Tōge (mountain roads: corner count + G) or Wangan (highway: top speed + 0-60).
  const [driveMode, setDriveMode] = useState(() => { try { return localStorage.getItem('dz-drive-mode') || 'cruise'; } catch { return 'cruise'; } });
  const cycleMode = () => {
    const next = { cruise: 'toge', toge: 'wangan', wangan: 'cruise' }[driveMode] || 'cruise';
    setDriveMode(next);
    try { localStorage.setItem('dz-drive-mode', next); } catch { /* ignore */ }
  };
  const corners = useRef({ n: 0, acc: 0, last: null, at: 0 });
  const [cornerCount, setCornerCount] = useState(0);
  useEffect(() => { if (drive.status !== 'driving') { corners.current = { n: 0, acc: 0, last: null, at: 0 }; setCornerCount(0); } }, [drive.status]);
  useEffect(() => {
    // A corner = at least 45° of turning within a few seconds while moving.
    const c = corners.current, h = drive.heading;
    if (drive.status !== 'driving' || h == null || drive.currentSpeed < 12) { c.last = h; c.acc = 0; return; }
    if (c.last != null) {
      let d = h - c.last; if (d > 180) d -= 360; if (d < -180) d += 360;
      c.acc = Math.sign(d) === Math.sign(c.acc) || !c.acc ? c.acc + d : d;
      if (Math.abs(c.acc) >= 45 && Date.now() - c.at > 3000) { c.n += 1; c.at = Date.now(); c.acc = 0; setCornerCount(c.n); if (driveMode === 'toge' && c.n % 10 === 0 && voiceOn && getVoiceSettings().narrate) say(`${c.n} corners.`); }
    }
    c.last = h;
  }, [drive.heading]); // eslint-disable-line react-hooks/exhaustive-deps
  const [barOpen, setBarOpen] = useState(false);
  const [endArmed, setEndArmed] = useState(false);
  // Free drive (no route): end and save on its own after 10 minutes parked.
  const lastMoving = useRef(Date.now());
  useEffect(() => { if (drive.currentSpeed > 3 || drive.status !== 'driving') lastMoving.current = Date.now(); }, [drive.currentSpeed, drive.status]);
  useEffect(() => {
    if (drive.status !== 'driving') return undefined;
    const t = setInterval(() => { if (!nav.active && Date.now() - lastMoving.current > 10 * 60000) drive.end(); }, 30000);
    return () => clearInterval(t);
  }, [drive.status, nav.active]); // eslint-disable-line react-hooks/exhaustive-deps

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
      ...(driveMode !== 'cruise' ? { mode: driveMode } : {}),
      ...(convoy ? { convoy: convoy.code } : {}),
      ...(driveMode === 'toge' ? { corners: corners.current.n } : {}),
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
        // Co-driver recap, spoken.
        const vs = getVoiceSettings();
        if (vs.narrate && voiceOn) {
          const carName = tripCar ? (tripCar.nickname || `${tripCar.make} ${tripCar.model}`) : '';
          recapText({ ...tripFacts(trip, carName), justSaved: true }, { ai: vs.style === 'gemini' }).then((txt) => say(txt)).catch(() => {});
        }
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
          friends={mapFriends}
          pins={meetPins}
          onPinTap={() => navigate('/meets')}
          onFriendTap={setOpenDriver}
          guide={guideRoute ? guideRoute.route : null}
          trail={drive.route}
          reports={roadReports.reports}
          follow={follow}
          onUserMove={onUserMove}
          active={active}
        />
      </div>

      {/* Ask Gemini on the home map (top right, under the search bar). Kept outside the
          screen animations: anything inside them that comes and goes resets the trip planner. */}
      {drive.status === 'idle' && !preview && (
        <div className="absolute right-3 top-[calc(max(12px,env(safe-area-inset-top))+108px)] z-[520] flex flex-col items-end gap-2">
          <AskGemini size={46} context={askContext} onAction={onAskAction} />
          {hub}
        </div>
      )}

      {/* Someone invited you to a group drive */}
      {inviteFor && inviteSeen !== inviteFor.code && active && (
        <div className={`absolute left-3 right-3 ${drive.status === 'idle' ? 'top-[calc(max(12px,env(safe-area-inset-top))+64px)]' : nav.active ? 'top-[210px]' : 'top-[64px]'} z-[690] pointer-events-auto dz-pop-in`}>
          <div className="mx-auto max-w-md rounded-2xl bg-primary text-primary-foreground shadow-2xl pl-4 pr-1.5 py-1.5 flex items-center gap-2">
            <span className="flex-1 text-sm font-semibold truncate">👥 {inviteFor.leader?.name || 'A friend'} invited you · {inviteFor.dest.name}</span>
            <button onClick={() => { setInviteSeen(inviteFor.code); onJoinConvoy(inviteFor.code).catch(() => {}); }} className="h-9 px-3 rounded-full bg-black/20 text-xs font-bold">Join</button>
            <button onClick={() => setInviteSeen(inviteFor.code)} className="w-8 h-8 flex items-center justify-center" aria-label="Not now"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

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
              onStartDrive={() => drive.start()}
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
                <div className="rounded-2xl shadow-2xl overflow-hidden" style={{ background: nav.arrived ? '#188038' : look.theme === 'standard' ? '#0F7B3F' : 'hsl(var(--primary))' }}>
                  <div className="flex items-center gap-3 px-4 py-3.5" style={{ color: nav.arrived || look.theme === 'standard' ? '#fff' : 'hsl(var(--primary-foreground))' }}>
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
                    <div className="flex items-center gap-2 px-4 py-2 bg-black/20 text-xs font-medium opacity-90">
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

            {/* Report warning: themed card with live distance, a countdown bar and "still there?" votes */}
            {reportAlert && (() => {
              const t = REPORT_TYPES[reportAlert.type] || { label: 'Report', emoji: '⚠️', color: '#F9AB00' };
              const here = drive.currentPosition;
              const left = here ? Math.max(0, distM(here, [reportAlert.lat, reportAlert.lng])) : reportAlert.distance;
              const voteAndClose = (yes) => { roadReports.vote(reportAlert.id, yes).catch(() => {}); dismissAlert(); };
              return (
                <div key={reportAlert.id} className={`absolute left-3 right-[76px] ${nav.active ? 'top-[150px]' : 'top-[max(12px,env(safe-area-inset-top))]'} pointer-events-auto dz-pop-in`}>
                  <div className="rounded-2xl shadow-2xl overflow-hidden bg-card/95 backdrop-blur border border-border" style={{ boxShadow: `0 0 0 2px ${t.color}, 0 10px 30px rgba(0,0,0,.45), 0 0 18px ${t.color}55` }}>
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl shrink-0" style={{ background: `${t.color}26` }}>{t.emoji}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-foreground truncate">{t.label} ahead</div>
                        <div className="text-xs text-muted-foreground truncate"><span className="font-bold speed-font" style={{ color: t.color }}>{formatNavDistance(left)}</span> · {reportAlert.mapped ? 'from map data' : `reported by ${reportAlert.by}`}</div>
                      </div>
                      {!reportAlert.mapped ? (
                        <div className="flex gap-1.5 shrink-0">
                          <button onClick={() => voteAndClose(true)} className="w-10 h-10 rounded-xl bg-secondary text-lg" aria-label="Still there">👍</button>
                          <button onClick={() => voteAndClose(false)} className="w-10 h-10 rounded-xl bg-secondary text-lg" aria-label="Not there">👎</button>
                        </div>
                      ) : (
                        <button onClick={dismissAlert} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center shrink-0" aria-label="Dismiss"><X className="w-4 h-4 text-muted-foreground" /></button>
                      )}
                    </div>
                    <div className="h-1 bg-secondary"><div className="h-full dz-alert-timer" style={{ background: t.color }} /></div>
                  </div>
                </div>
              );
            })()}

            {/* Friends & group drive (top right): live friends, invite, join, group chat */}
            <div className={`absolute right-3 ${nav.active ? 'top-[150px]' : 'top-[max(12px,env(safe-area-inset-top))]'}`}>
              {hub}
            </div>

            {/* Tōge / Wangan run card */}
            {driveMode !== 'cruise' && (() => {
              const toge = driveMode === 'toge';
              const st = speedStyle(look.theme);
              const top = nav.active ? (reportAlert ? 'top-[222px]' : 'top-[150px]') : reportAlert ? 'top-[84px]' : 'top-[max(12px,env(safe-area-inset-top))]';
              const cells = toge
                ? [[cornerCount, 'corners'], [drive.stats.maxG ? drive.stats.maxG.toFixed(2) : '–', 'max G'], [formatDuration(drive.elapsedTime), 'run']]
                : [[Math.round(drive.maxSpeed || 0), 'top mph'], [drive.stats.best060 ? `${drive.stats.best060.toFixed(1)}s` : '–', '0-60'], [drive.distance, 'mi']];
              return (
                <div className={`absolute left-3 ${top} pointer-events-none`}>
                  <div className="rounded-2xl shadow-2xl px-3 py-2 border" style={{ background: st.bg, borderColor: st.glow || st.ring, boxShadow: st.glow ? `0 0 14px ${st.glow}66` : undefined }}>
                    <div className="text-[10px] font-black tracking-[0.2em]" style={{ color: st.glow || st.sub }}>{toge ? '峠 TŌGE' : '湾岸 WANGAN'}</div>
                    <div className="flex gap-3 mt-0.5">
                      {cells.map(([v, l]) => (
                        <div key={l} className="text-center">
                          <div className="text-base font-black leading-none speed-font" style={{ color: st.text }}>{v}</div>
                          <div className="text-[9px] font-semibold" style={{ color: st.sub }}>{l}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Speed gauge (themed ring) + posted speed limit, bottom left */}
            {(() => {
              const st = speedStyle(look.theme);
              const mph = Math.round(drive.currentSpeed);
              const over = speedLimit?.mph && mph > speedLimit.mph + 5;
              const frac = Math.min(1, mph / 100);
              const R = 30, C = 2 * Math.PI * R;
              return (
                <div className={`absolute left-3 ${!nav.active ? 'bottom-[96px]' : barOpen ? 'bottom-[214px]' : 'bottom-[156px]'} transition-all pointer-events-none flex items-end gap-2`}>
                  <div className="relative w-[76px] h-[76px] rounded-full shadow-2xl flex flex-col items-center justify-center"
                    style={{ background: over ? '#d93025' : st.bg, boxShadow: st.glow && !over ? `0 0 18px ${st.glow}88, 0 8px 20px rgba(0,0,0,.4)` : '0 8px 20px rgba(0,0,0,.4)' }}>
                    <svg className="absolute inset-0" viewBox="0 0 76 76" aria-hidden="true">
                      <circle cx="38" cy="38" r={R} fill="none" stroke={over ? '#ffffff55' : st.ring} strokeOpacity="0.45" strokeWidth="5" />
                      <circle cx="38" cy="38" r={R} fill="none" stroke={over ? '#fff' : st.glow || st.sub} strokeWidth="5" strokeLinecap="round"
                        strokeDasharray={`${C * 0.75 * frac} ${C}`} transform="rotate(135 38 38)" style={{ transition: 'stroke-dasharray .4s' }} />
                    </svg>
                    <span className="relative text-[26px] leading-none font-bold speed-font" style={{ color: over ? '#fff' : st.text }}>{mph}</span>
                    <span className="relative text-[10px] font-bold" style={{ color: over ? '#fff' : st.sub }}>mph</span>
                  </div>
                  {speedLimit?.mph && (
                    (() => {
                      // Classic white sign on the standard map; themed colors everywhere else. Red edge when you're over.
                      const plain = look.theme === 'standard';
                      const edge = over ? '#ff3b30' : plain ? '#000' : (st.glow || st.ring);
                      return (
                        <div className="w-[38px] rounded-md border-2 flex flex-col items-center py-0.5"
                          style={{ background: plain ? '#fff' : st.bg, borderColor: edge, boxShadow: !plain && (st.glow || over) ? `0 0 10px ${edge}99, 0 6px 14px rgba(0,0,0,.35)` : '0 6px 14px rgba(0,0,0,.35)' }}>
                          <span className="text-[6px] font-black leading-[7px] text-center" style={{ color: plain ? '#000' : st.sub }}>SPEED<br />LIMIT</span>
                          <span className="text-[16px] leading-none font-black speed-font" style={{ color: plain ? '#000' : st.text }}>{speedLimit.mph}</span>
                        </div>
                      );
                    })()
                  )}
                </div>
              );
            })()}

            {/* Road you're on (like the design: a pill at the bottom) */}
            {speedLimit?.name && !nav.active && (
              <div className="absolute bottom-[100px] left-[150px] right-[72px] flex justify-center pointer-events-none">
                <div className="max-w-full truncate rounded-full bg-primary text-primary-foreground text-sm font-bold px-4 py-2 shadow-xl">{speedLimit.name}</div>
              </div>
            )}

            {/* Re-center (shows after you move the map) */}
            {!follow && (
              <div className={`absolute left-1/2 -translate-x-1/2 ${!nav.active ? 'bottom-[96px]' : barOpen ? 'bottom-[160px]' : 'bottom-[156px]'} pointer-events-auto`}>
                <button onClick={recenter} className="h-11 px-5 rounded-full bg-card/95 backdrop-blur border border-border shadow-2xl text-sm font-bold text-[#8ab4f8] flex items-center gap-2">
                  <Navigation2 className="w-4 h-4 fill-[#8ab4f8]" /> Re-center
                </button>
              </div>
            )}

            {/* Music + report shortcuts */}
            <div className={`absolute right-3 ${!nav.active ? 'bottom-[96px]' : barOpen ? 'bottom-[214px]' : 'bottom-[156px]'} transition-all pointer-events-auto flex flex-col gap-3`}>
              <AskGemini size={50} context={askContext} onAction={onAskAction} />
              <button onClick={cycleMode} aria-label="Drive mode"
                className={`w-[50px] h-[50px] rounded-full shadow-xl border flex flex-col items-center justify-center leading-none ${driveMode === 'cruise' ? 'bg-card border-border text-muted-foreground' : 'bg-primary border-primary text-primary-foreground'}`}>
                <span className="text-base font-black">{driveMode === 'toge' ? '峠' : driveMode === 'wangan' ? '湾' : '巡'}</span>
                <span className="text-[8px] font-bold mt-0.5">{driveMode === 'toge' ? 'TŌGE' : driveMode === 'wangan' ? 'WANGAN' : 'CRUISE'}</span>
              </button>
              <WeatherButton className="!w-[50px] !h-[50px]" />
              <MusicButton size={50} />
              <ReportButton size={50} onReport={(type) => roadReports.report(type, drive.currentPosition)} disabled={!drive.currentPosition} />
              {!nav.active && (
                <button onClick={() => { if (endArmed) { setEndArmed(false); drive.end(); } else { setEndArmed(true); setTimeout(() => setEndArmed(false), 3500); } }}
                  className={`h-[50px] rounded-full shadow-xl border flex items-center justify-center gap-1.5 transition-all ${endArmed ? 'w-[128px] bg-destructive border-destructive text-white' : 'w-[50px] bg-card border-border text-destructive'}`}
                  aria-label="End drive">
                  <Square className="w-4 h-4 fill-current" />{endArmed && <span className="text-xs font-bold">Tap to end</span>}
                </button>
              )}
            </div>

            {/* Slim bottom bar while following a route: ETA, then Skip stop / End route / End drive */}
            {nav.active && <div className="absolute left-0 right-0 bottom-[84px] px-3 pointer-events-auto">
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
            </div>}
          </motion.div>
        )}

      </AnimatePresence>

      {openDriver && active && <DriverSheet driver={openDriver} moving={drive.status === 'driving' && drive.currentSpeed > 8} onClose={() => setOpenDriver(null)} />}

      {/* Unfinished drive from earlier */}
      {resumable && drive.status === 'idle' && active && (
        <div className="absolute left-3 right-3 top-[calc(max(12px,env(safe-area-inset-top))+108px)] z-[700] pointer-events-auto dz-pop-in">
          <div className="mx-auto max-w-md rounded-2xl bg-card border border-primary shadow-2xl p-3">
            <div className="text-sm font-bold text-foreground">Unfinished drive · {Math.round((resumable.snap.distance || 0) * 10) / 10} mi</div>
            <div className="text-[11px] text-muted-foreground">Started {new Date(resumable.snap.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}{resumable.nav ? ` · to ${resumable.nav.dest?.name}` : ''}</div>
            <div className="flex gap-2 mt-2">
              <button onClick={() => { const r = resumable; setResumable(null); drive.start(r.snap); if (r.nav) setNavPlan(r.nav); }} className="flex-1 h-10 rounded-xl dz-go text-sm font-bold">Resume drive</button>
              <button onClick={() => { clearPendingDrive(); setResumable(null); }} className="h-10 px-4 rounded-xl bg-secondary text-sm font-semibold text-foreground">Discard</button>
            </div>
          </div>
        </div>
      )}

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
