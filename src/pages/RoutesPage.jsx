import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, Route as RouteIcon, X, Loader2, Play, Search } from 'lucide-react';
import { Polyline } from 'react-leaflet';
import DarkMap from '@/components/DarkMap';
import SavedRouteCard from '@/components/SavedRouteCard';
import ShareRouteModal from '@/components/ShareRouteModal';
import RouteThumbnail from '@/components/RouteThumbnail';
import { useApp } from '@/lib/AppContext';
import { searchPlaces } from '@/lib/nav';
import { dst, distUnit } from '@/lib/units';
import { LeaveLaterList } from '@/components/LeaveLater';


// Same search the map uses, so an address that works there also works when planning a route.
async function geocode(query) {
  const hits = await searchPlaces(query, null);
  if (!hits.length) throw new Error(`Couldn't find "${query}"`);
  const [hit] = hits;
  return {
    lat: hit.lat,
    lng: hit.lng,
    name: [hit.name, hit.address].filter(Boolean).join(', ') || query
  };
}

async function fetchRoadRoute(start, end) {
  const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`);
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes || !data.routes.length) throw new Error('No driving route found between those places');
  const coords = data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  const distance = Math.round((data.routes[0].distance / 1609.34) * 10) / 10;
  return { coords, distance };
}

export default function RoutesPage() {
  const navigate = useNavigate();
  const { user, savedRoutes, addRoute, deleteRoute, loading } = useApp();
  const [showPlanner, setShowPlanner] = useState(false);
  const [sharingRoute, setSharingRoute] = useState(null);
  const [startPlace, setStartPlace] = useState('');
  const [endPlace, setEndPlace] = useState('');
  const [routeName, setRouteName] = useState('');
  const [preview, setPreview] = useState(null);
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState('');
  const [savingRoute, setSavingRoute] = useState(false);
  const [saveError, setSaveError] = useState('');

  const myRoutes = savedRoutes.filter(r => r.created_by_id === (user && user.id));
  const sharedWithMe = savedRoutes.filter(r => r.created_by_id !== (user && user.id));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const closePlanner = () => {
    setShowPlanner(false);
    setStartPlace('');
    setEndPlace('');
    setRouteName('');
    setPreview(null);
    setPlanError('');
    setSaveError('');
  };

  const handlePlan = async () => {
    if (!startPlace || !endPlace || planning) return;
    setPlanning(true);
    setPlanError('');
    setPreview(null);
    try {
      const [s, e] = await Promise.all([geocode(startPlace), geocode(endPlace)]);
      const { coords, distance } = await fetchRoadRoute(s, e);
      const step = Math.ceil(coords.length / 400) || 1;
      const sampled = coords.filter((_, i) => i % step === 0 || i === coords.length - 1);
      setPreview({ points: sampled, distance });
      if (!routeName) setRouteName(`${s.name} → ${e.name}`);
    } catch (err) {
      setPlanError(err.message || 'Could not find a route. Try different places.');
    } finally {
      setPlanning(false);
    }
  };

  const handleSaveRoute = async () => {
    if (!preview || savingRoute) return;
    setSavingRoute(true);
    setSaveError('');
    try {
      await addRoute({ name: routeName, route: preview.points, distance: preview.distance });
      closePlanner();
    } catch (err) {
      setSaveError(err.message || 'Failed to save route');
    } finally {
      setSavingRoute(false);
    }
  };

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="px-5 pt-12 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full glass border border-border flex items-center justify-center">
            <ChevronLeft className="w-5 h-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground">Routes</h1>
            <p className="text-[11px] text-muted-foreground">{myRoutes.length} saved</p>
          </div>
        </div>
        <button
          onClick={() => setShowPlanner(true)}
          className="bg-primary text-primary-foreground rounded-xl px-3 py-2 text-xs font-bold flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> Plan
        </button>
      </div>

      <LeaveLaterList routes={myRoutes} />

      {/* My saved routes */}
      <div className="px-5 space-y-3 pb-2">
        {myRoutes.map(route => (
          <SavedRouteCard
            key={route.id}
            route={route}
            onShare={setSharingRoute}
            onDelete={deleteRoute}
          />
        ))}
        {myRoutes.length === 0 && (
          <div className="text-center py-12">
            <RouteIcon className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No saved routes yet</p>
            <p className="text-xs text-muted-foreground mt-1">Plan a route or save one from a trip</p>
          </div>
        )}
      </div>

      {/* Shared with me */}
      {sharedWithMe.length > 0 && (
        <div className="px-5 pb-4">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mt-4 mb-2">Shared with You</h2>
          <div className="space-y-3">
            {sharedWithMe.map(route => (
              <div key={route.id} className="bg-card rounded-2xl overflow-hidden border border-border">
                <div className="relative h-28 bg-secondary">
                  <RouteThumbnail route={route.route} className="w-full h-full" />
                </div>
                <div className="p-3.5 flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-foreground truncate">{route.name}</div>
                    <div className="text-[11px] text-muted-foreground">{dst(route.distance)} {distUnit()} • shared by {route.created_by}</div>
                  </div>
                  <button
                    onClick={() => (route.dest ? navigate('/', { state: { plan: { dest: route.dest, stops: route.stops || [] } } }) : navigate(`/?route=${route.id}`))}
                    className="bg-primary text-primary-foreground rounded-xl py-2 px-4 text-xs font-bold flex items-center gap-1 flex-shrink-0"
                  >
                    <Play className="w-3 h-3 fill-primary-foreground" /> Drive
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Route Planner */}
      {showPlanner && (
        <div className="fixed inset-0 z-[100] bg-background flex flex-col">
          <div className="px-5 pt-12 pb-3 flex items-center justify-between border-b border-border">
            <h2 className="text-lg font-bold text-foreground">Plan a Route</h2>
            <button onClick={closePlanner}><X className="w-5 h-5 text-muted-foreground" /></button>
          </div>

          <div className="h-44 bg-secondary relative">
            {preview ? (
              <DarkMap center={preview.points[0]} zoom={12}>
                <Polyline positions={preview.points} pathOptions={{ color: '#00BFFF', weight: 4, opacity: 0.9 }} />
              </DarkMap>
            ) : (
              <div className="flex items-center justify-center h-full px-8 text-center">
                <p className="text-sm text-muted-foreground">Enter a start and destination, then find a route along real roads</p>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar p-5">
            <label className="text-xs text-muted-foreground mb-1 block">Start</label>
            <input
              value={startPlace}
              onChange={e => setStartPlace(e.target.value)}
              className="w-full bg-secondary rounded-xl px-4 py-3 text-foreground text-sm border border-border focus:border-primary outline-none mb-3"
              placeholder="e.g. Navy Pier, Chicago"
            />
            <label className="text-xs text-muted-foreground mb-1 block">Destination</label>
            <input
              value={endPlace}
              onChange={e => setEndPlace(e.target.value)}
              className="w-full bg-secondary rounded-xl px-4 py-3 text-foreground text-sm border border-border focus:border-primary outline-none mb-3"
              placeholder="e.g. Wrigley Field"
            />


            {planError && <p className="text-xs text-destructive mb-3">{planError}</p>}

            <button
              onClick={handlePlan}
              disabled={planning || !startPlace || !endPlace}
              className="w-full bg-secondary text-foreground rounded-xl py-3 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 mb-5"
            >
              {planning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Find Route
            </button>

            {preview && (
              <div>
                <div className="text-[11px] text-muted-foreground mb-2">Found route: {dst(preview.distance)} {distUnit()}</div>
                <label className="text-xs text-muted-foreground mb-1 block">Route Name</label>
                <input
                  value={routeName}
                  onChange={e => setRouteName(e.target.value)}
                  className="w-full bg-secondary rounded-xl px-4 py-3 text-foreground text-sm border border-border focus:border-primary outline-none"
                  placeholder="My Custom Route"
                />
                {saveError && <p className="text-xs text-destructive mt-2">{saveError}</p>}
              </div>
            )}
          </div>

          <div className="p-5 border-t border-border">
            <button
              onClick={handleSaveRoute}
              disabled={!preview || !routeName || savingRoute}
              className="w-full bg-primary text-primary-foreground rounded-xl py-3 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {savingRoute && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Route
            </button>
          </div>
        </div>
      )}

      {/* Share modal */}
      {sharingRoute && (
        <ShareRouteModal route={sharingRoute} onClose={() => setSharingRoute(null)} />
      )}
    </div>
  );
}
