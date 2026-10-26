import { createPortal } from 'react-dom';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useTrafficEta } from '@/lib/traffic';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Play, Square, Check, Clock, TrendingUp, Gauge, Route, Bookmark, MapPinOff, Loader2, Volume2, VolumeX, X, ChevronUp, Navigation2, SkipForward, MapPin, Settings } from 'lucide-react';
import { SettingsSheet } from '@/components/SettingsList';
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
import { useActiveLook, speedStyle } from '@/lib/mapTheme';
import DriverSheet from '@/components/DriverSheet';
import { api } from '@/api/base44Client';
import { mileageMode } from '@/lib/carBluetooth';
import { useConvoy, useOpenConvoys, joinConvoy, useGroupLive } from '@/lib/convoy';
import PushToTalk from '@/components/PushToTalk';
import FriendsHub from '@/components/FriendsHub';
import MeetRadar from '@/components/MeetRadar';
import AskGemini from '@/components/AskGemini';
import { say, getVoiceSettings, recapText, tripFacts } from '@/lib/voice';
import { searchPlaces, getRoute } from '@/lib/nav';
import { useTeenAlerts, useAllowed } from '@/lib/family';
import { useUnits, spd, dst, speedUnit, distUnit, distWord, isMetric } from '@/lib/units';

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

export default function LiveDrive({ active = true, peek = false }) {
  const navigate = useNavigate();
  const { activeVehicle, vehicles, myCar, savedRoutes, addTrip, scene, btCar } = useApp();
  const drive = useGpsDrive(myCar);
  useUnits();
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
  // Next turn: big street-name callout on the map, and turn lanes when the road data has them.
  const turnAhead = nav.active && !nav.arrived && !nav.rerouting && nav.step && !['depart', 'arrive'].includes(nav.step.type) && nav.distToStep < 1600;
  const calloutText = turnAhead ? (nav.step.name || (nav.step.toward ? String(nav.step.toward).split(/[,:]/).pop().trim() : '')) : '';
  const mapCallout = calloutText ? { lat: nav.step.lat, lng: nav.step.lng, text: calloutText, arrow: turnArrow(nav.step) } : null;
  const lanesAhead = turnAhead && nav.distToStep < 1200 && nav.step.lanes?.length > 1 && nav.step.lanes.some((l) => l.ok) && nav.step.lanes.some((l) => !l.ok) ? nav.step.lanes : null;
  const toggleVoice = () => { const v = !voiceOn; setVoiceOn(v); try { localStorage.setItem('dz_voice', v ? '1' : '0'); } catch { /* ignore */ } if (!v) window.speechSynthesis?.cancel(); };

  // Where you are before a drive starts (the map is the home screen now).
  // Opens at your last known spot right away, then a quick rough fix, then precise GPS.
  const [herePos, setHerePosState] = useState(() => { try { const p = JSON.parse(localStorage.getItem('dz-last-pos') || 'null'); return Array.isArray(p) ? p : null; } catch { return null; } });
  const hereSpeed = useRef({ fast: 0, moved: null });
  const setHerePos = (p, speedMs = null) => {
    setHerePosState(p);
    try { localStorage.setItem('dz-last-pos', JSON.stringify(p)); } catch { /* ignore */ }
    autoStartCheck(p, speedMs);
  };
  const [locError, setLocError] = useState('');
  useEffect(() => {
    if (drive.status !== 'idle' || !active) return undefined;
    if (!('geolocation' in navigator)) { setLocError('Your browser can’t share your location.'); return undefined; }
    const ok = (p) => { setLocError(''); setHerePos([p.coords.latitude, p.coords.longitude], p.coords.speed); };
    const bad = (e) => { if (e.code === 1) setLocError('Turn on location for Kaido Maps to see where you are.'); };
    navigator.geolocation.getCurrentPosition(ok, bad, { enableHighAccuracy: false, maximumAge: 600000, timeout: 8000 });
    const id = navigator.geolocation.watchPosition(ok, bad, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [drive.status, active]); // eslint-disable-line react-hooks/exhaustive-deps

  // Always on: a drive starts by itself once you're moving (about 10 mph for a few seconds,
  // or 250 m from where you were standing), and ends by itself after 4 minutes parked.
  const autoRef = useRef({ status: 'idle', start: () => {} });
  autoRef.current = { status: drive.status, start: () => drive.start() };
  function autoStartCheck(p, speedMs) {
    const a = hereSpeed.current, now = Date.now();
    if (autoRef.current.status !== 'idle') { a.fast = 0; a.moved = null; return; }
    if (!a.moved) a.moved = { p, at: now };
    const mph = speedMs != null && speedMs >= 0 ? speedMs * 2.237 : 0;
    a.fast = mph >= 10 ? (a.fast || now) : 0;
    const far = distM(a.moved.p, p) > 250 && now - a.moved.at < 120000;
    if (now - a.moved.at > 120000) a.moved = { p, at: now };
    if ((a.fast && now - a.fast > 5000) || far) { a.fast = 0; a.moved = null; autoRef.current.start(); }
  }
  const parkedSince = useRef(0);
  useEffect(() => {
    if (drive.status !== 'driving') { parkedSince.current = 0; return; }
    if ((drive.currentSpeed || 0) >= 3) { parkedSince.current = 0; return; }
    if (!parkedSince.current) parkedSince.current = Date.now();
  }, [drive.currentSpeed, drive.status]);
  useEffect(() => {
    if (drive.status !== 'driving') return undefined;
    const t = setInterval(() => {
      if (parkedSince.current && Date.now() - parkedSince.current > 4 * 60000 && !(nav.active && !nav.arrived)) { parkedSince.current = 0; drive.end(); }
    }, 15000);
    return () => clearInterval(t);
  }, [drive.status, nav.active, nav.arrived]); // eslint-disable-line react-hooks/exhaustive-deps
  // Arrived and stopped for ~8 s: end the drive by itself and show the summary card.
  const arrivedEnd = useRef(false);
  useEffect(() => {
    if (drive.status !== 'driving' || !nav.active || !nav.arrived) return undefined;
    const t = setInterval(() => {
      if (parkedSince.current && Date.now() - parkedSince.current > 8000) { parkedSince.current = 0; arrivedEnd.current = true; drive.end(); }
    }, 2000);
    return () => clearInterval(t);
  }, [drive.status, nav.active, nav.arrived]); // eslint-disable-line react-hooks/exhaustive-deps
  const roadReports = useReports(drive.currentPosition || herePos);
  const { look, key: themeKey } = useActiveLook();
  // Shared with the voice so it can follow your speed (speed-linked audio).
  useEffect(() => { window.__dzSpeed = drive.status === 'driving' ? drive.currentSpeed : 0; }, [drive.currentSpeed, drive.status]);
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
  // Passing pings: a small game-style tag when you pass a friend or group member (not tappable).
  const [passing, setPassing] = useState(null);
  const passedAt = useRef({});
  useEffect(() => {
    const me = drive.currentPosition;
    if (drive.status !== 'driving' || !me) return;
    const group = new Set(convoyDrivers.map((d) => d.userId));
    // Only when someone goes from far (400 m+) to close (150 m), so a group riding together doesn't keep pinging.
    for (const f of mapFriends) {
      if (f.lat == null) continue;
      const d = distM([me.lat, me.lng], [f.lat, f.lng]);
      const st = passedAt.current[f.userId] || (passedAt.current[f.userId] = { far: d > 400, at: 0 });
      if (d > 400) { st.far = true; continue; }
      if (d > 150 || !st.far || Date.now() - st.at < 5 * 60000) continue;
      st.far = false; st.at = Date.now();
      setPassing({ name: f.name.replace(/^👥 /, ''), group: group.has(f.userId), key: Date.now() });
      break;
    }
  }, [drive.currentPosition, mapFriends]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!passing) return undefined; const t = setTimeout(() => setPassing(null), 4500); return () => clearTimeout(t); }, [passing]);
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
    const m = Math.floor(Number(dst(drive.distance || 0, 2)) / 5) * 5;
    if (m > spoken.current.miles) {
      spoken.current.miles = m;
      const left = nav.active && !nav.arrived && nav.remainingM ? ` ${formatNavDistance(nav.remainingM).replace(/ mi$/, ' miles').replace(/ km$/, ' kilometers')} to go.` : '';
      say(`${m} ${distWord()} in.${left}`);
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
    trip: drive.status === 'driving' ? `${dst(drive.distance)} ${distUnit()}, ${Math.round(drive.elapsedTime / 60)} min` : '',
    units: isMetric() ? 'km and km/h' : 'miles and mph',
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
  // Radar: meets, friends driving and your group around you. "Go" routes there (or starts the drive).
  const radarGo = async (dest) => {
    const here = drive.currentPosition || herePos;
    if (!here) return;
    const r = await getRoute(here, [dest.lat, dest.lng], [], dest.name).catch(() => null);
    if (!r) return;
    const { alternatives, ...main } = r;
    setRouteId(null);
    setNavPlan({ dest, stops: [], route: main });
  };
  // Teen / kid accounts: parents get speeding, hard-braking and phone-use alerts; features they turned off are hidden.
  useTeenAlerts({ driving: drive.status === 'driving', speed: drive.currentSpeed, limit: speedLimit?.mph || null, hardBrakes: drive.stats?.hardBrakes, pos: drive.currentPosition });
  const canGroup = useAllowed('convoys');
  // Group drive: voice clips from the others play by themselves; on-the-way / halfway / arrived updates show and are spoken.
  const [groupNews, clearGroupNews] = useGroupLive(convoy?.code, active, { speak: (t) => { if (voiceOn) say(t); } });
  useEffect(() => { if (!groupNews) return undefined; const t = setTimeout(clearGroupNews, 7000); return () => clearTimeout(t); }, [groupNews?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const canMeets = useAllowed('meets');
  const radar = scene && canMeets ? (
    <MeetRadar here={drive.currentPosition || herePos} heading={drive.status === 'driving' ? drive.heading : null}
      meets={meets} friends={mapFriends} convoy={convoy} onDrive={radarGo} onDriver={setOpenDriver} />
  ) : null;
  const hub = canGroup && (
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
  // Bottom trip bar folded into a small pill (remembered).
  const [barMin, setBarMin] = useState(() => { try { return localStorage.getItem('dz-bar-min') === '1'; } catch { return false; } });
  const setBarMinSaved = (v) => { setBarMin(v); try { localStorage.setItem('dz-bar-min', v ? '1' : '0'); } catch { /* ignore */ } };
  // Turn card folded into a small pill (remembered), and the full turn-by-turn list.
  const [turnsMin, setTurnsMin] = useState(() => { try { return localStorage.getItem('dz-turns-min') === '1'; } catch { return false; } });
  const setMin = (v) => { setTurnsMin(v); try { localStorage.setItem('dz-turns-min', v ? '1' : '0'); } catch { /* ignore */ } };
  const [stepsOpen, setStepsOpen] = useState(false);
  const [endArmed, setEndArmed] = useState(false);
  const [settingsArmed, setSettingsArmed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  // Arrival time that keeps up with reality:
  // 1. Route time left (each road at its expected speed), scaled by live traffic when we have it.
  //    Traffic is kept as a ratio, so the time only drops as you actually make progress.
  // 2. Your actual pace over the last couple of minutes (stops at lights count), blended in more
  //    as the drive goes on, so the arrival time moves with how you're really driving.
  const trafficRatio = useRef(1);
  useEffect(() => {
    if (traffic && nav.remainingS) trafficRatio.current = Math.min(3, Math.max(0.7, traffic.travelTime / nav.remainingS));
    if (!traffic) trafficRatio.current = 1;
  }, [traffic]); // eslint-disable-line react-hooks/exhaustive-deps
  const pace = useRef({ f: 1, t: null, r: null, secs: 0 });
  const [paceF, setPaceF] = useState(1);
  useEffect(() => {
    const p = pace.current;
    if (!nav.active || nav.arrived || drive.status !== 'driving' || nav.remainingS == null) { p.t = null; p.r = null; return; }
    const now = Date.now();
    if (p.t != null) {
      const dt = (now - p.t) / 1000, done = p.r - nav.remainingS; // seconds of route covered
      if (dt > 0.5 && dt < 30 && done > -30) {
        const inst = Math.min(2.5, Math.max(0, done / dt));
        const w = Math.min(1, dt / 120); // ~2 minute memory
        p.f = p.f * (1 - w) + inst * w;
        p.secs += dt;
        setPaceF(Math.round(Math.min(1.8, Math.max(0.45, p.f)) * 50) / 50);
      }
    }
    p.t = now; p.r = nav.remainingS;
  }, [nav.remainingS]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!nav.active) { pace.current = { f: 1, t: null, r: null, secs: 0 }; setPaceF(1); } }, [nav.active]);
  const trust = Math.min(1, pace.current.secs / 180); // fully trusted after ~3 minutes of driving
  const remainingS = nav.remainingS != null
    ? (nav.remainingS * trafficRatio.current) / (1 + (paceF - 1) * trust)
    : nav.remainingS;

  // Camera follows you; if you pan the map it waits, then snaps back after a few seconds (like Waze).
  const [follow, setFollow] = useState(true);
  const backTimer = useRef(null);
  const onUserMove = () => {
    setFollow(false);
    clearTimeout(backTimer.current);
    backTimer.current = setTimeout(() => setFollow(true), 8000);
  };
  const recenter = () => { clearTimeout(backTimer.current); setFollow(true); };
  // Previewing a route: show the whole thing; clearing it snaps back to you.
  useEffect(() => { clearTimeout(backTimer.current); setFollow(!preview); }, [preview]);
  useEffect(() => { if (drive.status !== 'idle') setPreview(null); }, [drive.status]);
  useEffect(() => () => clearTimeout(backTimer.current), []);
  // Coming back to the app (or this screen): always snap to where you are.
  useEffect(() => {
    const back = () => { if (!document.hidden && !preview) { clearTimeout(backTimer.current); setFollow(true); } };
    document.addEventListener('visibilitychange', back);
    if (active && !preview) back();
    return () => document.removeEventListener('visibilitychange', back);
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

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
      best_60_100: drive.stats.best60100 ? Math.round(drive.stats.best60100 * 10) / 10 : null,
      best_30_70: drive.stats.best3070 ? Math.round(drive.stats.best3070 * 10) / 10 : null,
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
    setToast({ text: `Saving drive · ${dst(trip.distance)} ${distUnit()}…` });
    (async () => {
      const first = route[0], last = route[route.length - 1];
      try {
        const [a, b] = await Promise.all([reverseGeocode(first.lat, first.lng), reverseGeocode(last.lat, last.lng)]);
        trip.start_location = a; trip.end_location = b;
      } catch { trip.start_location = 'Start'; trip.end_location = ''; }
      try {
        const rec = await addTrip(trip);
        const summary = arrivedEnd.current ? [
          [`${dst(trip.distance)} ${distUnit()}`, 'distance'],
          [formatEta(trip.duration), 'time'],
          trip.smoothness != null && [`${Math.round(trip.smoothness)}`, 'flow'],
          trip.best_0_60 && [`${trip.best_0_60}s`, '0-60'],
          trip.max_g && [`${trip.max_g.toFixed(2)}g`, 'max g'],
        ].filter(Boolean) : null;
        arrivedEnd.current = false;
        setToast({ text: summary ? 'You made it · drive saved' : `Drive saved · ${dst(trip.distance)} ${distUnit()}${odoNote}`, id: rec.id, summary });
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
    <div className={`fixed inset-0 overflow-hidden ${peek ? 'dz-peek' : ''}`}>
      {/* Peek (another screen is open mid-drive): just speed and the next turn over the map */}
      {peek && (
        <div className="dz-peek-hud absolute left-3 right-3 top-[max(10px,env(safe-area-inset-top))] z-[600] flex items-start gap-2 pointer-events-none">
          <div className="rounded-2xl bg-card/90 backdrop-blur border border-border px-3 py-1.5 text-center shadow-xl">
            <div className="text-xl font-black leading-none speed-font text-foreground">{spd(Math.round(drive.currentSpeed))}</div>
            <div className="text-[9px] font-bold text-muted-foreground">{speedUnit()}</div>
          </div>
          {nav.active && !nav.arrived && nav.step && (
            <div className="flex-1 min-w-0 rounded-2xl bg-primary text-primary-foreground px-3 py-1.5 shadow-xl flex items-center gap-2">
              <TurnIcon step={nav.step} className="w-6 h-6 shrink-0" />
              <div className="min-w-0"><div className="text-sm font-black leading-none">{formatNavDistance(nav.distToStep)}</div><div className="text-[11px] font-semibold truncate">{nav.step.text}</div></div>
            </div>
          )}
        </div>
      )}
      {/* Map */}
      <div className="absolute inset-0 dz-map-layer">
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
          driveFx={{
            turn: nav.active && !nav.arrived && nav.distToStep < 160 && /left|right/.test(nav.step?.modifier || '') && nav.step?.type !== 'depart' ? (/left/.test(nav.step.modifier) ? 'left' : 'right') : null,
            alert: !!reportAlert,
          }}
          pins={canMeets ? meetPins : []}
          callout={mapCallout}
          highway={nav.active ? nav.route.highway : null}
          arrived={nav.active && nav.arrived}
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
          {radar}
          {convoy && canGroup && <PushToTalk code={convoy.code} />}
        </div>
      )}

      {/* Someone invited you to a group drive */}
      {inviteFor && inviteSeen !== inviteFor.code && active && (
        <div className={`absolute left-3 right-3 ${drive.status === 'idle' ? 'top-[calc(max(12px,env(safe-area-inset-top))+64px)]' : nav.active ? (turnsMin ? 'top-[140px]' : 'top-[210px]') : 'top-[64px]'} z-[690] pointer-events-auto dz-pop-in`}>
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
            {/* Turn card: tap it for every turn of the trip; the arrow folds it into a small pill. */}
            {nav.active && (() => {
              // Themed looks get the black animated wireframe header; Standard keeps the plain green card.
              const wire = !nav.arrived && look.theme !== 'standard';
              const bg = nav.arrived ? '#188038' : look.theme === 'standard' ? '#0F7B3F' : '#05070b';
              const fg = '#fff';
              if (turnsMin) return (
                <div className="absolute top-0 left-0 p-3 pt-[max(12px,env(safe-area-inset-top))] pointer-events-auto">
                  <div className={`rounded-full shadow-2xl flex items-center gap-2 pl-3 pr-1 h-[52px] ${wire ? 'dz-wire' : ''}`} style={{ background: bg, color: fg }}>
                    <button onClick={() => setStepsOpen(true)} className="flex items-center gap-2" aria-label="All turns">
                      {nav.arrived ? <Check className="w-6 h-6" /> : <TurnIcon step={nav.step} className="w-6 h-6" />}
                      <span className="text-lg font-bold">{nav.arrived ? 'Arrived' : nav.rerouting ? 'Rerouting…' : formatNavDistance(nav.distToStep)}</span>
                    </button>
                    <button onClick={() => setMin(false)} className="w-10 h-10 rounded-full bg-black/20 flex items-center justify-center" aria-label="Show directions"><ChevronDown className="w-5 h-5" /></button>
                  </div>
                </div>
              );
              return (
                <div className="absolute top-0 left-0 right-0 p-3 pt-[max(12px,env(safe-area-inset-top))] pointer-events-auto">
                  <div className={`rounded-2xl shadow-2xl overflow-hidden ${wire ? 'dz-wire' : ''}`} style={{ background: bg }}>
                    <div className="flex items-center gap-3 px-4 py-3.5" style={{ color: fg }}>
                      <button onClick={() => setStepsOpen(true)} className="flex-1 min-w-0 flex items-center gap-3 text-left" aria-label="All turns">
                        {nav.arrived ? <Check className="w-9 h-9" strokeWidth={2.6} /> : <TurnIcon step={nav.step} className="w-9 h-9 shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <div className="text-2xl font-bold leading-none">{nav.arrived ? 'Arrived' : nav.rerouting ? 'Rerouting…' : formatNavDistance(nav.distToStep)}</div>
                          <div className="text-[15px] font-semibold mt-1 leading-snug line-clamp-2">{nav.arrived ? navPlan.dest.name : nav.step.text}</div>
                        </div>
                      </button>
                      <button onClick={toggleVoice} className="w-10 h-10 rounded-full bg-black/20 flex items-center justify-center shrink-0" aria-label={voiceOn ? 'Mute directions' : 'Unmute directions'}>
                        {voiceOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                      </button>
                      <button onClick={() => setMin(true)} className="w-10 h-10 rounded-full bg-black/20 flex items-center justify-center shrink-0" aria-label="Fold directions"><ChevronUp className="w-5 h-5" /></button>
                    </div>
                    {lanesAhead && (
                      <div className="flex justify-center gap-1 px-3 py-1.5 bg-black/25" aria-label="Lanes">
                        {lanesAhead.map((l, i) => <LaneArrow key={i} lane={l} color={fg} />)}
                      </div>
                    )}
                    {!nav.arrived && nav.nextStep && nav.step.type !== 'arrive' && (
                      <button onClick={() => setStepsOpen(true)} className="w-full flex items-center gap-2 px-4 py-2 bg-black/20 text-xs font-medium opacity-90 text-left" style={{ color: fg }}>
                        Then <TurnIcon step={nav.nextStep} className="w-4 h-4" /><span className="truncate">{nav.nextStep.text}</span><span className="ml-auto opacity-80 shrink-0">All turns ›</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Reached a stop */}
            {nav.active && nav.justReached && !nav.arrived && (
              <div className={`absolute left-3 right-3 ${turnsMin ? 'top-[72px]' : 'top-[140px]'} pointer-events-none`}>
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
                <div key={reportAlert.id} className={`absolute left-3 right-[76px] ${nav.active ? (turnsMin ? 'top-[80px]' : 'top-[150px]') : 'top-[max(12px,env(safe-area-inset-top))]'} pointer-events-auto dz-pop-in`}>
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
            <div className={`absolute right-3 flex flex-col items-end gap-2 ${nav.active ? (turnsMin ? 'top-[80px]' : 'top-[150px]') : 'top-[max(12px,env(safe-area-inset-top))]'}`}>
              {hub}
              {radar}
              {convoy && canGroup && <PushToTalk code={convoy.code} />}
            </div>


            {/* Tōge / Wangan run card */}
            {driveMode !== 'cruise' && (() => {
              const toge = driveMode === 'toge';
              const st = speedStyle(themeKey);
              const top = nav.active ? (turnsMin ? (reportAlert ? 'top-[152px]' : 'top-[80px]') : (reportAlert ? 'top-[222px]' : 'top-[150px]')) : reportAlert ? 'top-[84px]' : 'top-[max(12px,env(safe-area-inset-top))]';
              const cells = toge
                ? [[cornerCount, 'corners'], [drive.stats.maxG ? drive.stats.maxG.toFixed(2) : '–', 'max G'], [formatDuration(drive.elapsedTime), 'run']]
                : [[spd(drive.maxSpeed || 0), `top ${speedUnit()}`], [drive.stats.best060 ? `${drive.stats.best060.toFixed(1)}s` : '–', '0-60'], [dst(drive.distance), distUnit()]];
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
              const st = speedStyle(themeKey);
              const mph = Math.round(drive.currentSpeed);
              const over = speedLimit?.mph && mph > speedLimit.mph + 5;
              const frac = Math.min(1, mph / 100);
              const R = 30, C = 2 * Math.PI * R;
              return (
                <div className={`absolute left-3 ${!nav.active ? 'bottom-[calc(16px+env(safe-area-inset-bottom))]' : barOpen ? 'bottom-[calc(134px+env(safe-area-inset-bottom))]' : 'bottom-[calc(76px+env(safe-area-inset-bottom))]'} transition-all pointer-events-none flex items-end gap-2`}>
                  <div className="relative w-[76px] h-[76px] rounded-full shadow-2xl flex flex-col items-center justify-center"
                    style={{ background: over ? '#d93025' : st.bg, boxShadow: st.glow && !over ? `0 0 18px ${st.glow}88, 0 8px 20px rgba(0,0,0,.4)` : '0 8px 20px rgba(0,0,0,.4)' }}>
                    <svg className="absolute inset-0" viewBox="0 0 76 76" aria-hidden="true">
                      <circle cx="38" cy="38" r={R} fill="none" stroke={over ? '#ffffff55' : st.ring} strokeOpacity="0.45" strokeWidth="5" />
                      <circle cx="38" cy="38" r={R} fill="none" stroke={over ? '#fff' : st.glow || st.sub} strokeWidth="5" strokeLinecap="round"
                        strokeDasharray={`${C * 0.75 * frac} ${C}`} transform="rotate(135 38 38)" style={{ transition: 'stroke-dasharray .4s' }} />
                    </svg>
                    <span className="relative text-[26px] leading-none font-bold speed-font" style={{ color: over ? '#fff' : st.text }}>{spd(mph)}</span>
                    <span className="relative text-[10px] font-bold" style={{ color: over ? '#fff' : st.sub }}>{speedUnit()}</span>
                  </div>
                  {speedLimit?.mph && (
                    (() => {
                      // Classic white sign on the standard map; themed colors everywhere else. Red edge when you're over.
                      const plain = look.theme === 'standard';
                      const edge = over ? '#ff3b30' : plain ? '#000' : (st.glow || st.ring);
                      if (isMetric()) {
                        // Round sign with a red ring, like metric countries use.
                        return (
                          <div className="w-[40px] h-[40px] rounded-full flex items-center justify-center"
                            style={{ background: plain ? '#fff' : st.bg, border: `4px solid ${over ? '#ff3b30' : plain ? '#d93025' : (st.glow || '#d93025')}`, boxShadow: !plain && (st.glow || over) ? `0 0 10px ${edge}99, 0 6px 14px rgba(0,0,0,.35)` : '0 6px 14px rgba(0,0,0,.35)' }}>
                            <span className="text-[14px] leading-none font-black speed-font" style={{ color: plain ? '#000' : st.text }}>{Math.round(spd(speedLimit.mph) / 5) * 5}</span>
                          </div>
                        );
                      }
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
              <div className="absolute bottom-[calc(20px+env(safe-area-inset-bottom))] left-[150px] right-[72px] flex justify-center pointer-events-none">
                <div className="max-w-full truncate rounded-full bg-primary text-primary-foreground text-sm font-bold px-4 py-2 shadow-xl">{speedLimit.name}</div>
              </div>
            )}

            {/* Re-center (shows after you move the map) */}
            {!follow && (
              <div className={`absolute left-1/2 -translate-x-1/2 ${!nav.active ? 'bottom-[calc(16px+env(safe-area-inset-bottom))]' : barOpen ? 'bottom-[calc(80px+env(safe-area-inset-bottom))]' : 'bottom-[calc(76px+env(safe-area-inset-bottom))]'} pointer-events-auto`}>
                <button onClick={recenter} className="h-11 px-5 rounded-full bg-card/95 backdrop-blur border border-border shadow-2xl text-sm font-bold text-[#8ab4f8] flex items-center gap-2">
                  <Navigation2 className="w-4 h-4 fill-[#8ab4f8]" /> Re-center
                </button>
              </div>
            )}

            {/* Music + report shortcuts */}
            <div className={`absolute right-3 ${!nav.active ? 'bottom-[calc(16px+env(safe-area-inset-bottom))]' : barOpen ? 'bottom-[calc(134px+env(safe-area-inset-bottom))]' : 'bottom-[calc(76px+env(safe-area-inset-bottom))]'} transition-all pointer-events-auto flex flex-col gap-3`}>
              <AskGemini size={50} context={askContext} onAction={onAskAction} />
              <button onClick={cycleMode} aria-label="Drive mode"
                className={`w-[50px] h-[50px] rounded-full shadow-xl border flex flex-col items-center justify-center leading-none ${driveMode === 'cruise' ? 'bg-card border-border text-muted-foreground' : 'bg-primary border-primary text-primary-foreground'}`}>
                <span className="text-base font-black">{driveMode === 'toge' ? '峠' : driveMode === 'wangan' ? '湾' : '巡'}</span>
                <span className="text-[8px] font-bold mt-0.5">{driveMode === 'toge' ? 'TŌGE' : driveMode === 'wangan' ? 'WANGAN' : 'CRUISE'}</span>
              </button>
              <WeatherButton className="!w-[50px] !h-[50px]" />
              <MusicButton size={50} />
              <ReportButton size={50} onReport={(type) => roadReports.report(type, drive.currentPosition)} disabled={!drive.currentPosition} />
              {/* Settings mid-drive. Moving: first tap asks for a second tap (meant for passengers). */}
              <button onClick={() => {
                  if ((drive.currentSpeed || 0) < 5 || settingsArmed) { setSettingsArmed(false); setSettingsOpen(true); return; }
                  setSettingsArmed(true); setTimeout(() => setSettingsArmed(false), 3500);
                }}
                className={`h-[50px] rounded-full shadow-xl border flex items-center justify-center gap-1.5 transition-all self-end ${settingsArmed ? 'w-[150px] bg-primary border-primary text-primary-foreground' : 'w-[50px] bg-card border-border text-foreground'}`}
                aria-label="Settings">
                <Settings className="w-5 h-5" />{settingsArmed && <span className="text-xs font-bold">Passenger? Tap</span>}
              </button>
              {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}
              {!nav.active && (
                <button onClick={() => { if (endArmed) { setEndArmed(false); drive.end(); } else { setEndArmed(true); setTimeout(() => setEndArmed(false), 3500); } }}
                  className={`h-[50px] rounded-full shadow-xl border flex items-center justify-center gap-1.5 transition-all ${endArmed ? 'w-[128px] bg-destructive border-destructive text-white' : 'w-[50px] bg-card border-border text-destructive'}`}
                  aria-label="End drive">
                  <Square className="w-4 h-4 fill-current" />{endArmed && <span className="text-xs font-bold">Tap to end</span>}
                </button>
              )}
            </div>

            {/* Slim bottom bar while following a route: ETA, then Skip stop / End route / End drive */}
            {/* Folded: a small glowing pill with the time left and arrival time. Tap to open. */}
            {nav.active && barMin && (
              <div className="absolute left-0 right-0 bottom-[calc(8px+env(safe-area-inset-bottom))] flex justify-center pointer-events-none">
                <button onClick={() => setBarMinSaved(false)} className="pointer-events-auto h-11 pl-4 pr-2 rounded-full bg-card/95 backdrop-blur border border-border shadow-2xl flex items-center gap-2 dz-eta-ring" aria-label="Show trip details">
                  {nav.arrived ? <span className="text-sm font-bold text-foreground">Arrived</span> : <>
                    <span className="text-base font-black dz-eta-glow">{formatEta(remainingS)}</span>
                    <span className="text-xs text-muted-foreground">· {arrivalTime(remainingS)}</span>
                  </>}
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            )}
            {nav.active && !barMin && <div className="absolute left-0 right-0 bottom-[calc(4px+env(safe-area-inset-bottom))] px-3 pointer-events-auto">
              <div className="bg-card/95 backdrop-blur rounded-2xl border border-border shadow-2xl overflow-hidden dz-eta-ring">
                <div className="w-full flex items-center gap-2 pr-2">
                <button onClick={() => setBarOpen((o) => !o)} className="flex-1 min-w-0 flex items-center gap-3 pl-4 h-[60px] text-left">
                  {nav.active && !nav.arrived ? (
                    <div className="flex-1 min-w-0">
                      <span className={`text-lg font-black ${traffic && traffic.delay > 300 ? 'text-[#F9AB00]' : 'dz-eta-glow'}`}>{formatEta(remainingS)}</span>
                      <span className="text-sm text-muted-foreground"> · {formatNavDistance(nav.remainingM)} · </span>
                      <span className="text-sm font-bold dz-eta-glow">{arrivalTime(remainingS)}</span>
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
                      <span className="text-sm text-muted-foreground speed-font">· {dst(drive.distance)} {distUnit()} · {formatDuration(drive.elapsedTime)}</span>
                    </div>
                  )}
                  <ChevronUp className={`w-5 h-5 text-muted-foreground transition-transform ${barOpen ? '' : 'rotate-180'}`} />
                </button>
                <button onClick={() => { setBarOpen(false); setBarMinSaved(true); }} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center shrink-0" aria-label="Fold trip bar"><ChevronDown className="w-4 h-4 text-muted-foreground" /></button>
                </div>
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

      {/* Every turn of the trip, step by step */}
      {stepsOpen && nav.active && active && createPortal(
        <div className="fixed inset-0 z-[1550] bg-black/50 flex items-end justify-center" onClick={() => setStepsOpen(false)}>
          <div className="w-full max-w-md max-h-[80vh] flex flex-col bg-card rounded-t-3xl border-t border-border dz-pop-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border">
              <div className="flex-1 min-w-0">
                <div className="text-base font-bold text-foreground truncate">To {navPlan?.dest?.name}</div>
                <div className="text-xs text-muted-foreground">{formatEta(remainingS)} · {formatNavDistance(nav.remainingM)} · arrive {arrivalTime(remainingS)}</div>
              </div>
              <button onClick={() => setStepsOpen(false)} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center" aria-label="Close"><X className="w-4 h-4" /></button>
            </div>
            <StepList steps={nav.route.steps} current={nav.stepIdx} distToStep={nav.distToStep} />
          </div>
        </div>,
        document.body
      )}

      {/* Unfinished drive from earlier */}
      {resumable && drive.status === 'idle' && active && (
        <div className="absolute left-3 right-3 top-[calc(max(12px,env(safe-area-inset-top))+108px)] z-[700] pointer-events-auto dz-pop-in">
          <div className="mx-auto max-w-md rounded-2xl bg-card border border-primary shadow-2xl p-3">
            <div className="text-sm font-bold text-foreground">Unfinished drive · {dst(resumable.snap.distance || 0)} {distUnit()}</div>
            <div className="text-[11px] text-muted-foreground">Started {new Date(resumable.snap.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}{resumable.nav ? ` · to ${resumable.nav.dest?.name}` : ''}</div>
            <div className="flex gap-2 mt-2">
              <button onClick={() => { const r = resumable; setResumable(null); drive.start(r.snap); if (r.nav) setNavPlan(r.nav); }} className="flex-1 h-10 rounded-xl dz-go text-sm font-bold">Resume drive</button>
              <button onClick={() => { clearPendingDrive(); setResumable(null); }} className="h-10 px-4 rounded-xl bg-secondary text-sm font-semibold text-foreground">Discard</button>
            </div>
          </div>
        </div>
      )}

      {/* "Drive saved" note */}
      {/* Latest from the group drive (voice clip playing, chat, on the way / halfway / arrived) */}
      {groupNews && active && !toast && (
        <div className="absolute left-3 right-3 top-[max(12px,env(safe-area-inset-top))] z-[690] pointer-events-auto dz-pop-in">
          <button onClick={clearGroupNews} className="mx-auto max-w-md w-full text-left rounded-2xl bg-card/95 backdrop-blur border border-primary/60 shadow-2xl px-4 py-2.5 text-sm font-semibold text-foreground block">
            {groupNews.kind === 'voice' ? `🎙️ ${groupNews.user?.name || 'Group'} is talking…` : groupNews.kind === 'system' ? groupNews.text : `💬 ${groupNews.user?.name}: ${groupNews.text}`}
          </button>
        </div>
      )}
      {passing && active && (
        <div key={passing.key} className="absolute left-1/2 -translate-x-1/2 top-[38%] z-[650] pointer-events-none dz-pop-in">
          <div className="relative flex items-center gap-2 rounded-full bg-black/75 backdrop-blur border border-primary/70 px-3 py-1.5 shadow-[0_0_18px_hsl(var(--primary)/.6)]">
            <span className="relative w-2.5 h-2.5"><span className="dz-ping" /><span className="absolute inset-0 rounded-full bg-primary" /></span>
            <span className="text-[11px] font-black tracking-widest text-primary">{passing.group ? 'GROUP' : 'FRIEND'}</span>
            <span className="text-sm font-bold text-white">{passing.name}</span>
          </div>
        </div>
      )}
      {toast && active && (
        <div className="absolute left-3 right-3 top-[max(12px,env(safe-area-inset-top))] z-[700] pointer-events-auto dz-pop-in">
          <div className="mx-auto max-w-md rounded-2xl bg-[#188038] text-white shadow-2xl pl-4 pr-1.5 py-1.5 flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-sm font-semibold truncate">{toast.text}</span>
            {toast.id && <button onClick={() => { setToast(null); navigate(`/trip/${toast.id}`); }} className="h-9 px-3 rounded-full bg-white/20 text-xs font-bold">View</button>}
            <button onClick={() => setToast(null)} className="w-8 h-8 flex items-center justify-center" aria-label="Close"><X className="w-4 h-4" /></button>
          </div>
          {toast.summary && (
            <div className="mx-auto max-w-md mt-1.5 rounded-2xl bg-card/95 backdrop-blur border border-border shadow-2xl grid gap-1 px-2 py-2" style={{ gridTemplateColumns: `repeat(${toast.summary.length}, 1fr)` }}>
              {toast.summary.map(([v, l]) => (
                <div key={l} className="text-center"><div className="text-base font-black text-foreground leading-tight">{v}</div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">{l}</div></div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Arrow for the map callout.
function turnArrow(step) {
  const m = step.modifier || '';
  if (step.type === 'roundabout' || step.type === 'rotary') return '⟳';
  if (/uturn/.test(m)) return '↶';
  if (/sharp left|^left/.test(m)) return '←';
  if (/slight left/.test(m)) return '↖';
  if (/sharp right|^right/.test(m)) return '→';
  if (/slight right/.test(m)) return '↗';
  return '↑';
}

// One lane: arrows for each way the lane goes; lit when it's a lane you can use.
const LANE_ANGLE = { 'sharp left': -135, left: -90, 'slight left': -45, straight: 0, 'slight right': 45, right: 90, 'sharp right': 135, uturn: -180 };
function LaneArrow({ lane, color }) {
  const ways = lane.ind.length && !lane.ind.includes('none') ? lane.ind : ['straight'];
  return (
    <svg viewBox="0 0 32 40" className="w-7 h-9" style={{ opacity: lane.ok ? 1 : 0.32 }} aria-label={`${ways.join(' or ')}${lane.ok ? ' (use this lane)' : ''}`}>
      {ways.map((w) => {
        const a = ((LANE_ANGLE[w] ?? 0) * Math.PI) / 180;
        if (w === 'uturn') return <path key={w} d="M20 37 V18 a6 6 0 0 0 -12 0 V25 M4 21 l4 6 4 -6" fill="none" stroke={color} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />;
        // Shaft up from the bottom, then bend toward the lane's direction, with an arrowhead.
        const ex = 16 + 13 * Math.sin(a), ey = 21 - 13 * Math.cos(a);
        const h = (d) => [ex - 6 * Math.sin(a + d), ey + 6 * Math.cos(a + d)];
        const [l1, l2] = [h(0.6), h(-0.6)];
        return <path key={w} d={`M16 37 V21 L${ex} ${ey} M${l1[0]} ${l1[1]} L${ex} ${ey} L${l2[0]} ${l2[1]}`} fill="none" stroke={color} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />;
      })}
      {lane.ok && <rect x="6" y="38.2" width="20" height="1.8" rx="0.9" fill={color} />}
    </svg>
  );
}

// The whole trip, one row per turn. Done turns are dimmed; distances count from where you are.
function StepList({ steps, current, distToStep }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.querySelector('[data-current]')?.scrollIntoView({ block: 'center' }); }, []);
  let ahead = distToStep;
  return (
    <div ref={ref} className="flex-1 overflow-y-auto px-2 py-2 pb-[max(12px,env(safe-area-inset-bottom))]">
      {steps.map((st, i) => {
        const past = i < current, now = i === current;
        const at = now ? distToStep : i > current ? (ahead += steps[i - 1].distance) : null;
        return (
          <div key={i} data-current={now ? '' : undefined}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${now ? 'bg-primary/15 border border-primary' : ''} ${past ? 'opacity-40' : ''}`}>
            <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${now ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'}`}>
              <TurnIcon step={st} className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-sm leading-snug ${now ? 'font-bold text-foreground' : 'text-foreground'}`}>{st.text}</div>
              {st.distance > 0 && st.type !== 'arrive' && <div className="text-[11px] text-muted-foreground">then {formatNavDistance(st.distance)}</div>}
            </div>
            <div className="text-xs font-semibold text-muted-foreground shrink-0 speed-font">{past ? 'done' : at != null ? formatNavDistance(at) : ''}</div>
          </div>
        );
      })}
    </div>
  );
}
