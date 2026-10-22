import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapContainer, Polyline, CircleMarker, Tooltip } from 'react-leaflet';
import { Search, X, Loader2, LocateFixed, Navigation, Route as RouteIcon, Radio, Clock, ChevronUp, MapPin, Car, MapPinOff } from 'lucide-react';
import { BaseLayer } from '@/components/DarkMap';
import { LocationMarker, PinMarker, FollowMe, FitBounds, CarMarker, ReportMarkers, ReportButton } from '@/components/MapBits';
import { useReports } from '@/lib/reports';
import MusicButton from '@/components/MusicButton';
import TripCard from '@/components/TripCard';
import { useApp } from '@/lib/AppContext';
import { api } from '@/api/base44Client';
import { searchPlaces, getRoute, formatEta, arrivalTime, formatNavDistance } from '@/lib/nav';
import { getInitials } from '@/lib/helpers';

const FALLBACK_CENTER = [39.8283, -98.5795]; // middle of the US until we know where you are

export default function MapHome() {
  const navigate = useNavigate();
  const { user, stats, trips, vehicles, savedRoutes, myCar } = useApp();

  // Your location
  const [pos, setPos] = useState(null);
  const [heading, setHeading] = useState(null);
  const [locError, setLocError] = useState('');
  const [follow, setFollow] = useState(true);

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
  const [friends, setFriends] = useState([]);
  const inputRef = useRef(null);
  const roadReports = useReports(pos);

  useEffect(() => {
    if (!('geolocation' in navigator)) { setLocError('Your browser can’t share your location.'); return; }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setLocError('');
        setPos([p.coords.latitude, p.coords.longitude]);
        if (p.coords.heading != null && !Number.isNaN(p.coords.heading) && (p.coords.speed || 0) > 1) setHeading(p.coords.heading);
      },
      (e) => { if (e.code === 1) setLocError('Turn on location for Drivez to see where you are.'); },
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

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

  const choose = useCallback(async (place) => {
    setDest(place);
    setQuery(place.name);
    setResults([]);
    setFocused(false);
    inputRef.current?.blur();
    setRoute(null);
    setRouteErr('');
    if (!pos) { setRouteErr('Waiting for your location to plan the route…'); return; }
    setRouting(true);
    try {
      setRoute(await getRoute(pos, [place.lat, place.lng]));
      setFollow(false);
    } catch (e) {
      setRouteErr(e.message);
    } finally {
      setRouting(false);
    }
  }, [pos]);

  // If location arrives after a place was picked, plan the route then.
  useEffect(() => {
    if (dest && !route && !routing && pos && routeErr.startsWith('Waiting')) choose(dest);
  }, [pos]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearSearch = () => {
    setQuery(''); setDest(null); setRoute(null); setRouteErr(''); setResults([]); setFollow(true);
  };

  const go = () => navigate('/drive', { state: { nav: { dest, route } } });

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }, []);

  const showResults = focused && !dest && query.trim().length >= 3;
  const quickRoutes = savedRoutes.slice(0, 3);

  return (
    <div className="relative h-full overflow-hidden">
      {/* Map */}
      <div className="absolute inset-0 isolate">
        <MapContainer center={pos || FALLBACK_CENTER} zoom={pos ? 15 : 4} zoomControl={false} attributionControl style={{ height: '100%', width: '100%' }}>
          <BaseLayer />
          <FollowMe pos={pos} follow={follow && !route} onUserMove={() => setFollow(false)} />
          {route && <FitBounds points={route.coords} padding={[40, 150]} paddingBottom={280} />}
          {route && (
            <>
              <Polyline positions={route.coords} pathOptions={{ color: '#1a3d7a', weight: 10, opacity: 0.9 }} />
              <Polyline positions={route.coords} pathOptions={{ color: '#4285F4', weight: 6, opacity: 1 }} />
            </>
          )}
          {dest && <PinMarker pos={[dest.lat, dest.lng]} />}
          <ReportMarkers reports={roadReports.reports} onVote={roadReports.vote} onRemove={roadReports.remove} />
          {friends.map((f) => f.car ? (
            <CarMarker key={f.userId} pos={[f.lat, f.lng]} car={f.car} heading={f.heading} label={`${f.name} · ${f.speed} mph`} />
          ) : (
            <CircleMarker key={f.userId} center={[f.lat, f.lng]} radius={9} pathOptions={{ color: '#fff', weight: 2, fillColor: f.color || '#39FF14', fillOpacity: 1 }}>
              <Tooltip direction="top" offset={[0, -10]}>{f.name} · {f.speed} mph</Tooltip>
            </CircleMarker>
          ))}
          <LocationMarker pos={pos} heading={heading} car={myCar} />
        </MapContainer>
      </div>

      {/* Search bar */}
      <div className="absolute top-0 inset-x-0 z-10 px-3 pt-[max(12px,env(safe-area-inset-top))]">
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
            <Chip to="/routes" icon={RouteIcon} label="Saved routes" />
            <Chip to="/live-map" icon={Radio} label={friends.length ? `${friends.length} friend${friends.length > 1 ? 's' : ''} driving` : 'Friends live'} />
            <Chip to="/history" icon={Clock} label="Trips" />
          </div>
        )}

        {/* Search results */}
        {showResults && (
          <div className="mt-2 bg-card/98 backdrop-blur rounded-2xl shadow-2xl border border-border overflow-hidden max-h-[60vh] overflow-y-auto">
            {results.length === 0 && !searching && <p className="px-4 py-4 text-sm text-muted-foreground">No places found</p>}
            {results.map((r) => (
              <button key={r.id} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(r)} className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-border last:border-0 active:bg-secondary">
                <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center shrink-0"><MapPin className="w-4 h-4 text-muted-foreground" /></div>
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
      {locError && !route && (
        <div className="absolute inset-x-3 top-[124px] z-10 bg-destructive/15 border border-destructive/40 text-destructive rounded-xl px-3 py-2 text-xs flex items-center gap-2">
          <MapPinOff className="w-4 h-4 shrink-0" /> {locError}
        </div>
      )}

      {/* Floating buttons */}
      <div className={`absolute right-3 z-10 flex flex-col items-end gap-3 transition-all ${route || routing || routeErr ? 'bottom-[290px]' : sheetOpen ? 'bottom-[calc(62vh+92px)]' : 'bottom-[272px]'}`}>
        <MusicButton />
        <ReportButton onReport={(type) => roadReports.report(type, pos)} disabled={!pos} />
        {(!follow || route) && pos && (
          <button onClick={() => { setFollow(true); if (route) clearSearch(); }} className="w-12 h-12 rounded-full bg-card border border-border shadow-xl flex items-center justify-center" aria-label="Center on me">
            <LocateFixed className="w-5 h-5 text-[#4285F4]" />
          </button>
        )}
      </div>

      {/* Route preview card */}
      {(route || routing || routeErr) ? (
        <div className="absolute inset-x-0 bottom-20 z-10 px-3 pb-3">
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
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-[#34A853]">{formatEta(route.duration)}</span>
                  <span className="text-sm text-muted-foreground">({route.distance} mi)</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Arrive around {arrivalTime(route.duration)} · {dest.name}</p>
                <div className="flex gap-2 mt-4">
                  <button onClick={go} className="flex-1 h-12 rounded-full bg-[#4285F4] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#4285F4]/30">
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
          className={`absolute inset-x-0 bottom-0 z-10 bg-card rounded-t-3xl border-t border-border shadow-[0_-8px_30px_rgba(0,0,0,0.5)] transition-[height] duration-300 flex flex-col ${sheetOpen ? 'h-[calc(62vh+80px)]' : 'h-[260px]'}`}
        >
          <button onClick={() => setSheetOpen(!sheetOpen)} className="w-full pt-2.5 pb-1 flex flex-col items-center" aria-label={sheetOpen ? 'Collapse' : 'Expand'}>
            <div className="w-10 h-1.5 rounded-full bg-muted-foreground/40" />
          </button>
          <div className="px-5 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground">{greeting}</p>
              <h1 className="text-lg font-bold text-foreground leading-tight">{user?.displayName}</h1>
            </div>
            <button onClick={() => setSheetOpen(!sheetOpen)} className="text-xs text-primary font-medium flex items-center gap-1">
              {sheetOpen ? 'Less' : 'More'} <ChevronUp className={`w-3.5 h-3.5 transition-transform ${sheetOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>
          <div className="px-5 mt-3 grid grid-cols-3 gap-2">
            <Stat value={stats.thisWeekDrives} label="Drives this week" color="text-primary" />
            <Stat value={stats.thisWeekMiles} label="Miles this week" color="text-accent" />
            <Stat value={stats.bestTopSpeed} label="Top mph" color="text-foreground" />
          </div>
          <div className={`flex-1 overflow-y-auto no-scrollbar px-5 pt-4 pb-24 ${sheetOpen ? '' : 'pointer-events-none'}`}>
            {quickRoutes.length > 0 && (
              <>
                <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Saved routes</h2>
                <div className="space-y-2 mb-4">
                  {quickRoutes.map((r) => (
                    <button key={r.id} onClick={() => navigate(`/drive?route=${r.id}`)} className="w-full bg-secondary/60 rounded-2xl px-4 py-3 flex items-center gap-3 text-left">
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
                  <p className="text-sm text-muted-foreground">No drives yet. Search for a place or tap Drive to start.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
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
