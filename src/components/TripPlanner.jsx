import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Search, X, Loader2, LocateFixed, Navigation, Route as RouteIcon, Radio, Clock, ChevronUp, MapPin, Car, MapPinOff, Star, Home, Briefcase, Sparkles, Plus, ArrowUp, ArrowDown, Shuffle, Save, TrafficCone, Play, Bookmark, Trophy } from 'lucide-react';
import { ReportButton } from '@/components/MapBits';
import MusicButton from '@/components/MusicButton';
import { WeatherButton, WeatherTimeBadge } from '@/components/Weather';
import SetPlaceModal from '@/components/SetPlaceModal';
import NamePlaceSheet from '@/components/NamePlaceSheet';
import { suggestDrives } from '@/lib/predict';
import ServiceDueCard from '@/components/ServiceDueCard';
import ParkedCard from '@/components/ParkedCard';
import TripCard from '@/components/TripCard';
import { useApp } from '@/lib/AppContext';
import { api } from '@/api/base44Client';
import { searchPlaces, getRoute, optimizeStops, MAX_STOPS, formatEta, arrivalTime, formatNavDistance, distM } from '@/lib/nav';
import PlaceSearchSheet from '@/components/PlaceSearchSheet';
import { AlertsBanner, RouteConditions } from '@/components/WeatherAlerts';
import { useWeatherAlerts } from '@/lib/alerts';
import { useTrafficEta } from '@/lib/traffic';
import { getInitials } from '@/lib/helpers';

const DRIVE_ERRORS = {
  denied: 'Location permission denied. Turn on location for Kaido Maps in your settings, then try again.',
  unsupported: 'This browser does not support location tracking.',
  timeout: 'Could not get a GPS signal. Move somewhere with a clear view of the sky and try again.',
};

// Everything you see on the map before a drive: search, Home/Work, suggestions, and the
// route preview with Go. It sits on top of the drive map; the map itself lives in LiveDrive.
export default function TripPlanner({ pos, locError = '', roadReports, onPreview, onGo, onStartDrive, onRecenter, following = true, driveError, guideRoute, onClearGuide }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, scene, activeVehicle, stats, trips, vehicles, savedRoutes, myCar, places, addPlace, deletePlace, renamePlace, home, work, addRoute } = useApp();
  const [naming, setNaming] = useState(false);
  const [setting, setSetting] = useState(null); // 'home' | 'work' while choosing the address


  // Search + route preview
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [dest, setDest] = useState(null);
  const [route, setRoute] = useState(null);
  const [routing, setRouting] = useState(false);
  const [routeErr, setRouteErr] = useState('');

  const [sheetOpen, setSheetOpen] = useState(false);
  const touchY = useRef(0);
  const [friends, setFriends] = useState([]);
  const inputRef = useRef(null);
  const weatherAlerts = useWeatherAlerts(pos);

  useEffect(() => {
    let alive = true;
    const load = () => api.get('/live').then((d) => alive && setFriends(d.drivers)).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // Type-ahead search
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3 || dest) { setResults([]); return; }
    let alive = true;
    setSearching(true);
    const t = setTimeout(() => {
      searchPlaces(q, pos).then((r) => alive && setResults(r)).catch(() => alive && setResults([])).finally(() => alive && setSearching(false));
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [query, dest]); // eslint-disable-line react-hooks/exhaustive-deps

  // Route planning: `dest` is the final destination, `stops` the places before it (up to MAX_STOPS in total).
  const [stops, setStops] = useState([]);
  const [addingStop, setAddingStop] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const plan = useCallback(async (place, stopList = []) => {
    setDest(place);
    setStops(stopList);
    setQuery(place.name);
    setResults([]);
    setFocused(false);
    inputRef.current?.blur();
    setRoute(null);
    setRouteErr('');
    if (!pos) { setRouteErr('Waiting for your location to plan the route…'); return; }
    setRouting(true);
    try {
      setRoute(await getRoute(pos, [place.lat, place.lng], stopList, place.name));
    } catch (e) {
      setRouteErr(e.message);
    } finally {
      setRouting(false);
    }
  }, [pos]);
  const choose = useCallback((place) => plan(place, []), [plan]);
  const allStops = dest ? [...stops, dest] : [];
  const addStop = (place) => { if (dest) plan(place, [...stops, dest]); else plan(place, []); };
  const removeStop = (i) => {
    const list = allStops.filter((_, j) => j !== i);
    if (!list.length) { clearSearch(); return; }
    plan(list[list.length - 1], list.slice(0, -1));
  };
  const moveStop = (i, dir) => {
    const list = [...allStops];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    plan(list[list.length - 1], list.slice(0, -1));
  };
  const bestOrder = async () => {
    if (!pos || stops.length < 2) return;
    setOptimizing(true);
    try { plan(dest, await optimizeStops(pos, stops, [dest.lat, dest.lng])); } catch (e) { setRouteErr(e.message); } finally { setOptimizing(false); }
  };

  // If location arrives after a place was picked, plan the route then.
  useEffect(() => {
    if (dest && !route && !routing && pos && routeErr.startsWith('Waiting')) plan(dest, stops);
  }, [pos]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearSearch = () => {
    setQuery(''); setDest(null); setStops([]); setRoute(null); setRouteErr(''); setResults([]);
  };

  // Tell the map what to preview, and start navigating right here on Go.
  useEffect(() => { onPreview?.(route && dest ? { route, dest, stops } : null); }, [route]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = () => { const p = { dest, stops, route }; clearSearch(); onGo(p); };

  // Live traffic ETA for the planned route (TomTom, when set up).
  const trafficPoints = useMemo(() => (route && pos && dest ? [pos, ...stops.map((x) => [x.lat, x.lng]), [dest.lat, dest.lng]] : null), [route]); // eslint-disable-line react-hooks/exhaustive-deps
  const traffic = useTrafficEta(trafficPoints, !!route);
  const routeSeconds = traffic?.travelTime ?? route?.duration;

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }, []);

  // Your saved places: matching ones go first in search; nearest ones show when the box is empty.
  const savedMatches = useMemo(() => {
    const s = query.trim().toLowerCase();
    const withDist = (p) => ({ ...p, distance: pos ? distM(pos, [p.lat, p.lng]) : null, saved: true });
    if (!s) return places.filter((p) => !p.kind).map(withDist).sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0)).slice(0, 6);
    return places.filter((p) => `${p.name} ${p.address}`.toLowerCase().includes(s)).map(withDist)
      .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0)).slice(0, 5);
  }, [places, query, pos]);
  const savedHere = dest ? places.find((p) => Math.abs(p.lat - dest.lat) < 1e-4 && Math.abs(p.lng - dest.lng) < 1e-4) : null;
  const toggleSave = () => { if (dest) setNaming(true); };

  const goHomeWork = (kind) => {
    const p = kind === 'home' ? home : work;
    if (!p) { setSetting(kind); return; }
    choose({ ...p, name: kind === 'home' ? 'Home' : 'Work' });
  };

  // Suggested drive (like Waze): where you usually go around this time.
  const posKey = pos ? `${pos[0].toFixed(3)},${pos[1].toFixed(3)}` : '';
  const suggestion = useMemo(() => suggestDrives({ trips, places, pos })[0] || null, [trips, places, posKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [dismissed, setDismissed] = useState(() => { try { return sessionStorage.getItem('dz_sugg_off') || ''; } catch { return ''; } });
  const [suggEta, setSuggEta] = useState(null);
  const suggKey = suggestion ? `${suggestion.lat.toFixed(4)},${suggestion.lng.toFixed(4)}` : '';
  useEffect(() => {
    setSuggEta(null);
    if (!suggestion || !pos) return undefined;
    let alive = true;
    getRoute(pos, [suggestion.lat, suggestion.lng]).then((r) => alive && setSuggEta(r.duration)).catch(() => {});
    return () => { alive = false; };
  }, [suggKey, !!pos]); // eslint-disable-line react-hooks/exhaustive-deps
  const dismissSuggestion = () => { setDismissed(suggKey); try { sessionStorage.setItem('dz_sugg_off', suggKey); } catch { /* ignore */ } };

  // Opened from Saved places: route straight there.
  useEffect(() => {
    const g = location.state?.go;
    if (g) { navigate('.', { replace: true, state: null }); choose(g); }
    const pl = location.state?.plan; // a saved multi-stop drive plan
    if (pl?.dest) { navigate('.', { replace: true, state: null }); plan(pl.dest, pl.stops || []); }
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const showResults = focused && !dest && (query.trim().length >= 3 || query.trim().length === 0);
  const searchList = [...savedMatches, ...(query.trim().length >= 3 ? results.filter((r) => !savedMatches.some((m) => Math.abs(m.lat - r.lat) < 1e-4 && Math.abs(m.lng - r.lng) < 1e-4)) : [])];
  const quickRoutes = savedRoutes.slice(0, 3);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-[500]">
      {/* Search bar */}
      <div className="absolute top-0 inset-x-0 z-10 px-3 pt-[max(12px,env(safe-area-inset-top))] [&>*]:pointer-events-auto">
        <div className="flex items-center gap-2 bg-card/95 backdrop-blur rounded-full shadow-2xl border border-border pl-4 pr-1.5 h-12">
          {searching ? <Loader2 className="w-5 h-5 text-muted-foreground animate-spin shrink-0" /> : <Search className="w-5 h-5 text-muted-foreground shrink-0" />}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); if (dest) { setDest(null); setRoute(null); setRouteErr(''); } }}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder="Where to?"
            enterKeyHint="search"
            className="flex-1 min-w-0 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground outline-none"
          />
          {query ? (
            <button onClick={clearSearch} className="w-9 h-9 rounded-full flex items-center justify-center" aria-label="Clear search">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          ) : (
            <Link to="/profile" className="shrink-0" aria-label="Profile">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover" />
              ) : (
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: user?.color || '#00BFFF' }}>
                  {getInitials(user?.displayName)}
                </div>
              )}
            </Link>
          )}
        </div>

        {/* Quick chips (like Google Maps) */}
        {!showResults && !route && (
          <div className="flex gap-2 mt-2 overflow-x-auto no-scrollbar">
            <ChipButton onClick={() => goHomeWork('home')} icon={Home} label={home ? 'Home' : 'Set home'} />
            <ChipButton onClick={() => goHomeWork('work')} icon={Briefcase} label={work ? 'Work' : 'Set work'} />
            <Chip to="/places" icon={Star} label="Saved" />
            <Chip to="/routes" icon={RouteIcon} label="Routes" />
            <Chip to="/live-map" icon={Radio} label={friends.length ? `${friends.length} friend${friends.length > 1 ? 's' : ''} driving` : 'Friends live'} />
            <Chip to="/history" icon={Clock} label="Trips" />
            {scene && <Chip to="/leaderboard" icon={Trophy} label="Ranks" />}
          </div>
        )}

        {/* Weather / flood / hurricane alerts where you are */}
        {!showResults && !route && !routing && !routeErr && weatherAlerts.length > 0 && (
          <AlertsBanner alerts={weatherAlerts} pos={pos} onRoute={(city) => plan(city, [])} className="mt-2" />
        )}

        {/* Where you parked */}
        {!showResults && !route && !routing && !routeErr && <ParkedCard pos={pos} />}

        {/* Car service due (oil change etc.) */}
        {scene && !showResults && !route && !routing && !routeErr && activeVehicle && <ServiceDueCard vehicle={activeVehicle} trips={trips} />}

        {/* Suggested drive */}
        {!showResults && !route && !routing && !routeErr && suggestion && dismissed !== suggKey && (
          <div className="mt-2 bg-card/95 backdrop-blur rounded-2xl border border-border shadow-xl flex items-center gap-3 pl-3 pr-1.5 py-2 dz-pop-in">
            <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
              {suggestion.kind === 'home' ? <Home className="w-4 h-4 text-primary" /> : suggestion.kind === 'work' ? <Briefcase className="w-4 h-4 text-primary" /> : <Sparkles className="w-4 h-4 text-primary" />}
            </div>
            <button onClick={() => choose(suggestion)} className="flex-1 min-w-0 text-left">
              <div className="text-sm font-semibold text-foreground truncate">
                {suggestion.kind === 'home' ? 'Home' : suggestion.kind === 'work' ? 'Work' : suggestion.name}{suggEta != null ? ` · ${formatEta(suggEta)}` : ''}
              </div>
              <div className="text-[11px] text-muted-foreground truncate">{suggestion.reason}{suggEta != null ? ` · arrive ${arrivalTime(suggEta)}` : ''}</div>
            </button>
            <button onClick={() => choose(suggestion)} className="h-9 px-4 rounded-full dz-go text-xs font-bold flex items-center gap-1"><Navigation className="w-3.5 h-3.5 fill-white" /> Go</button>
            <button onClick={dismissSuggestion} className="w-8 h-8 flex items-center justify-center" aria-label="Hide suggestion"><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
        )}

        {/* Search results */}
        {showResults && (
          <div className="mt-2 bg-card/98 backdrop-blur rounded-2xl shadow-2xl border border-border overflow-hidden max-h-[60vh] overflow-y-auto">
            {query.trim().length === 0 && (['home', 'work']).map((k) => {
              const p = k === 'home' ? home : work;
              const KIcon = k === 'home' ? Home : Briefcase;
              return (
                <button key={k} onMouseDown={(e) => e.preventDefault()} onClick={() => goHomeWork(k)} className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-border active:bg-secondary">
                  <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0"><KIcon className="w-4 h-4 text-primary" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground">{k === 'home' ? 'Home' : 'Work'}</div>
                    <div className="text-xs text-muted-foreground truncate">{p ? p.address : 'Tap to set'}</div>
                  </div>
                  {p && <button onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); setSetting(k); }} className="text-[11px] text-primary font-semibold px-2">Edit</button>}
                </button>
              );
            })}
            {searchList.length === 0 && !searching && query.trim().length >= 3 && <p className="px-4 py-4 text-sm text-muted-foreground">No places found</p>}
            {searchList.map((r) => (
              <button key={r.id} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(r)} className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-border last:border-0 active:bg-secondary">
                <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center shrink-0">{r.saved ? <Star className="w-4 h-4 text-amber-400 fill-amber-400" /> : <MapPin className="w-4 h-4 text-muted-foreground" />}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground truncate">{r.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{r.address}</div>
                </div>
                {r.distance != null && <span className="text-[11px] text-muted-foreground shrink-0">{formatNavDistance(r.distance)}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Location problem */}
      {(locError || driveError) && !route && (
        <div className="absolute inset-x-3 top-[124px] z-10 pointer-events-auto bg-destructive/15 border border-destructive/40 text-destructive rounded-xl px-3 py-2 text-xs flex items-center gap-2">
          <MapPinOff className="w-4 h-4 shrink-0" /> {driveError ? (DRIVE_ERRORS[driveError] || 'Location is unavailable right now. Try again shortly.') : locError}
        </div>
      )}

      {/* Floating buttons */}
      <div className={`absolute right-3 z-10 flex flex-col items-end gap-3 transition-all pointer-events-auto ${route || routing || routeErr ? 'bottom-[290px]' : 'bottom-[180px]'} ${sheetOpen && !route && !routing && !routeErr ? 'opacity-0 pointer-events-none' : ''}`}>
        <WeatherTimeBadge />
        <WeatherButton />
        <MusicButton />
        <ReportButton onReport={(type) => roadReports.report(type, pos)} disabled={!pos} />
        {(!following || route) && pos && (
          <button onClick={() => { if (route) clearSearch(); onRecenter?.(); }} className="w-12 h-12 rounded-full bg-card border border-border shadow-xl flex items-center justify-center" aria-label="Center on me">
            <LocateFixed className="w-5 h-5 text-[#4285F4]" />
          </button>
        )}
      </div>

      {/* Route preview card */}
      {(route || routing || routeErr) ? (
        <div className="absolute inset-x-0 bottom-20 z-10 px-3 pb-3 pointer-events-auto">
          <div className="bg-card rounded-3xl border border-border shadow-2xl p-5">
            {routing ? (
              <div className="flex items-center gap-3 text-sm text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /> Finding the best route…</div>
            ) : routeErr ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-destructive">{routeErr}</p>
                <button onClick={clearSearch} className="text-xs text-muted-foreground">Close</button>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className={`text-2xl font-bold ${traffic && traffic.delay > 300 ? 'text-[#F9AB00]' : 'text-[#34A853]'}`}>{formatEta(routeSeconds)}</span>
                      <span className="text-sm text-muted-foreground">({route.distance} mi)</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      Arrive around {arrivalTime(routeSeconds)} · {stops.length ? `${stops.length + 1} stops` : dest.name}
                    </p>
                    <RouteConditions route={route} />
                    {traffic && (
                      <p className={`text-[11px] mt-0.5 font-semibold flex items-center gap-1 ${traffic.delay > 300 ? 'text-[#F9AB00]' : traffic.delay > 60 ? 'text-[#FBBC04]' : 'text-[#34A853]'}`}>
                        <TrafficCone className="w-3 h-3" />
                        {traffic.delay > 60 ? `+${Math.round(traffic.delay / 60)} min because of traffic` : 'Traffic is light'}
                      </p>
                    )}
                  </div>
                  <button onClick={toggleSave} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center shrink-0 -mt-1" aria-label={savedHere ? 'Remove from saved places' : 'Save this place'}>
                    <Star className={`w-4 h-4 ${savedHere ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground'}`} />
                  </button>
                </div>

                {stops.length > 0 && (
                  <div className="mt-3 max-h-[30vh] overflow-y-auto no-scrollbar rounded-2xl bg-secondary/50 divide-y divide-border">
                    {allStops.map((st, i) => (
                      <div key={`${st.lat},${st.lng},${i}`} className="flex items-center gap-2 pl-3 pr-1 py-2">
                        <span className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 ${i === allStops.length - 1 ? 'bg-[#EA4335] text-white' : 'dz-go'}`}>{i === allStops.length - 1 ? <MapPin className="w-3.5 h-3.5" /> : i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-foreground truncate">{st.name}</div>
                          {route.legs?.[i] && <div className="text-[10px] text-muted-foreground">{formatEta(route.legs[i].duration)} · {(route.legs[i].distance / 1609.34).toFixed(1)} mi</div>}
                        </div>
                        <button onClick={() => moveStop(i, -1)} disabled={i === 0} className="w-8 h-8 flex items-center justify-center disabled:opacity-25" aria-label="Move up"><ArrowUp className="w-4 h-4" /></button>
                        <button onClick={() => moveStop(i, 1)} disabled={i === allStops.length - 1} className="w-8 h-8 flex items-center justify-center disabled:opacity-25" aria-label="Move down"><ArrowDown className="w-4 h-4" /></button>
                        <button onClick={() => removeStop(i)} className="w-8 h-8 flex items-center justify-center" aria-label="Remove stop"><X className="w-4 h-4 text-muted-foreground" /></button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar">
                  <button onClick={() => setAddingStop(true)} disabled={allStops.length >= MAX_STOPS + 1} className="shrink-0 h-9 px-3 rounded-full bg-secondary text-xs font-semibold text-foreground flex items-center gap-1.5 disabled:opacity-40">
                    <Plus className="w-3.5 h-3.5" /> {allStops.length >= MAX_STOPS + 1 ? `${MAX_STOPS} stops max` : 'Add stop'}
                  </button>
                  {stops.length >= 2 && (
                    <button onClick={bestOrder} disabled={optimizing} className="shrink-0 h-9 px-3 rounded-full bg-secondary text-xs font-semibold text-foreground flex items-center gap-1.5">
                      {optimizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shuffle className="w-3.5 h-3.5" />} Best order
                    </button>
                  )}
                  {stops.length > 0 && (
                    <button onClick={() => setSavingPlan(true)} className="shrink-0 h-9 px-3 rounded-full bg-secondary text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Save className="w-3.5 h-3.5" /> Save plan
                    </button>
                  )}
                </div>

                <div className="flex gap-2 mt-3">
                  <button onClick={go} className="flex-1 h-12 rounded-full dz-go font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#4285F4]/30">
                    <Navigation className="w-4 h-4 fill-white" /> Go
                  </button>
                  <button onClick={clearSearch} className="h-12 px-5 rounded-full bg-secondary text-foreground font-semibold text-sm">Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        /* Bottom sheet */
        <div
          className={`absolute inset-x-0 bottom-20 z-10 pointer-events-auto bg-card rounded-t-3xl border-t border-border shadow-[0_-8px_30px_rgba(0,0,0,0.5)] transition-[height] duration-300 flex flex-col overflow-hidden ${sheetOpen ? 'h-[62vh]' : 'h-[84px]'}`}
          onTouchStart={(e) => { touchY.current = e.touches[0].clientY; }}
          onTouchEnd={(e) => {
            const dy = e.changedTouches[0].clientY - touchY.current;
            if (dy < -30) setSheetOpen(true);
            if (dy > 30 && !(e.target.closest('[data-sheet-scroll]')?.scrollTop > 0)) setSheetOpen(false);
          }}
        >
          <button onClick={() => setSheetOpen(!sheetOpen)} className="w-full pt-2 pb-2 flex flex-col items-center shrink-0" aria-label={sheetOpen ? 'Collapse' : 'Show your stats and drives'}>
            <div className="w-10 h-1.5 rounded-full bg-muted-foreground/50" />
          </button>
          <div className="px-5 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground">{greeting}</p>
              <h1 className="text-lg font-bold text-foreground leading-tight">{user?.displayName}</h1>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setSheetOpen(!sheetOpen)} className="text-xs text-primary font-medium flex items-center gap-1 px-1">
                {sheetOpen ? 'Less' : 'More'} <ChevronUp className={`w-3.5 h-3.5 transition-transform ${sheetOpen ? 'rotate-180' : ''}`} />
              </button>
              <button onClick={onStartDrive} className="h-10 px-4 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center gap-1.5 shadow-lg shadow-primary/30" aria-label="Start a drive without a destination">
                <Play className="w-4 h-4 fill-primary-foreground" /> Drive
              </button>
            </div>
          </div>
          <div className="px-5 mt-3 grid grid-cols-3 gap-2">
            <Stat value={stats.thisWeekDrives} label="Drives this week" color="text-primary" />
            <Stat value={stats.thisWeekMiles} label="Miles this week" color="text-accent" />
            <Stat value={stats.bestTopSpeed} label="Top mph" color="text-foreground" />
          </div>
          <div data-sheet-scroll className={`flex-1 overflow-y-auto no-scrollbar px-5 pt-4 pb-6 ${sheetOpen ? '' : 'pointer-events-none'}`}>
            {quickRoutes.length > 0 && (
              <>
                <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Saved routes</h2>
                <div className="space-y-2 mb-4">
                  {quickRoutes.map((r) => (
                    <button key={r.id} onClick={() => (r.dest ? navigate('/', { state: { plan: { dest: r.dest, stops: r.stops || [] } } }) : navigate(`/?route=${r.id}`))} className="w-full bg-secondary/60 rounded-2xl px-4 py-3 flex items-center gap-3 text-left">
                      <RouteIcon className="w-4 h-4 text-primary shrink-0" />
                      <span className="flex-1 text-sm font-semibold text-foreground truncate">{r.name}</span>
                      <span className="text-xs text-muted-foreground">{r.distance} mi</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Recent drives</h2>
            <div className="space-y-3">
              {trips.slice(0, 5).map((t) => <TripCard key={t.id} trip={t} vehicle={vehicles.find((v) => v.id === t.vehicleId)} />)}
              {trips.length === 0 && (
                <div className="bg-secondary/40 rounded-2xl p-6 text-center">
                  <Car className="w-7 h-7 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No drives yet. Search for a place, or tap Drive to just start recording.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {guideRoute && !route && !routing && !routeErr && (
        <div className={`absolute inset-x-3 z-10 pointer-events-auto transition-all ${sheetOpen ? 'opacity-0 pointer-events-none' : ''}`} style={{ bottom: 176 }}>
          <div className="bg-card/95 backdrop-blur rounded-2xl border border-border shadow-xl flex items-center gap-3 pl-3 pr-1.5 py-2 mr-16">
            <Bookmark className="w-4 h-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground truncate">{guideRoute.name}</div>
              <div className="text-[11px] text-muted-foreground">{guideRoute.distance} mi · dashed guide line</div>
            </div>
            <button onClick={onStartDrive} className="h-9 px-3 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1"><Play className="w-3.5 h-3.5 fill-primary-foreground" />Drive</button>
            <button onClick={onClearGuide} className="w-8 h-8 flex items-center justify-center" aria-label="Remove guide"><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
        </div>
      )}
      {addingStop && <PlaceSearchSheet title={`Add stop ${allStops.length + 1}`} pos={pos} onPick={addStop} onClose={() => setAddingStop(false)} />}
      {savingPlan && route && (
        <NamePlaceSheet
          title="Save drive plan"
          initialName={allStops.map((x) => x.name).slice(0, 3).join(' → ') + (allStops.length > 3 ? ' …' : '')}
          address={`${allStops.length} stops · ${route.distance} mi`}
          saveLabel="Save plan"
          onSave={(n) => addRoute({ name: n, route: route.coords.filter((_, i) => i % Math.ceil(route.coords.length / 400) === 0), distance: route.distance, stops, dest })}
          onClose={() => setSavingPlan(false)}
        />
      )}
      {naming && dest && (
        <NamePlaceSheet
          title={savedHere ? 'Saved place' : 'Save this place'}
          initialName={savedHere ? savedHere.name : dest.name}
          address={dest.address}
          saveLabel={savedHere ? 'Save name' : 'Save place'}
          onSave={async (n) => {
            if (savedHere) await renamePlace(savedHere.id, n); else await addPlace({ ...dest, name: n });
            setDest((d) => (d ? { ...d, name: n } : d)); setQuery(n);
          }}
          onRemove={savedHere && !savedHere.kind ? () => deletePlace(savedHere.id) : undefined}
          onClose={() => setNaming(false)}
        />
      )}
      {setting && <SetPlaceModal kind={setting} pos={pos} onClose={() => setSetting(null)} />}
    </div>
  );
}

function ChipButton({ onClick, icon: Icon, label }) {
  return (
    <button onClick={onClick} className="shrink-0 flex items-center gap-1.5 bg-card/95 backdrop-blur border border-border rounded-full px-3.5 h-9 text-xs font-semibold text-foreground shadow-lg">
      <Icon className="w-3.5 h-3.5 text-primary" /> {label}
    </button>
  );
}

function Chip({ to, icon: Icon, label }) {
  return (
    <Link to={to} className="shrink-0 flex items-center gap-1.5 bg-card/95 backdrop-blur border border-border rounded-full px-3.5 h-9 text-xs font-semibold text-foreground shadow-lg">
      <Icon className="w-3.5 h-3.5 text-primary" /> {label}
    </Link>
  );
}

function Stat({ value, label, color }) {
  return (
    <div className="bg-secondary/60 rounded-2xl px-3 py-2.5">
      <div className={`text-lg font-bold speed-font ${color}`}>{Number(value || 0).toLocaleString()}</div>
      <div className="text-[10px] text-muted-foreground leading-tight">{label}</div>
    </div>
  );
}
