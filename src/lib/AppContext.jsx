import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from './AuthContext';
import { startOfWeek, subWeeks, format as formatDate } from 'date-fns';

const AppContext = createContext(null);

function mapTrip(t, color) {
  return {
    ...t,
    date: t.start_time,
    route: (t.route_points || []).map(p => [p.lat, p.lng]),
    speeds: (t.route_points || []).map(p => p.speed ?? 0),
    vehicleId: t.vehicle_id,
    topSpeed: t.top_speed,
    avgSpeed: t.avg_speed,
    startLocation: t.start_location || 'Start',
    endLocation: t.end_location || '',
    userColor: color || '#00BFFF'
  };
}

function mapRoute(r) {
  return {
    ...r,
    route: (r.points || []).map(p => Array.isArray(p) ? p : [p.lat, p.lng]),
    sharedWith: r.shared_with || []
  };
}

export function AppProvider({ children }) {
  const { user: authUser, checkUserAuth } = useAuth();
  const [vehicles, setVehicles] = useState([]);
  const [trips, setTrips] = useState([]);
  const [savedRoutes, setSavedRoutes] = useState([]);
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(true);

  const user = useMemo(() => {
    if (!authUser) return null;
    return {
      id: authUser.id,
      email: authUser.email,
      displayName: authUser.display_name || authUser.full_name || (authUser.email || 'Driver').split('@')[0],
      username: authUser.username || (authUser.email || 'driver').split('@')[0],
      bio: authUser.bio || '',
      location: authUser.location || '',
      ghostMode: !!authUser.ghost_mode,
      joinDate: authUser.created_date,
      avatarUrl: authUser.avatar_url || null,
      color: authUser.color || '#00BFFF',
      discordConnected: !!authUser.discord_connected,
      discordWebhookSet: !!authUser.discord_webhook_set,
      discordAuto: !!authUser.discord_auto
    };
  }, [authUser]);

  const color = user?.color;
  const loadData = useCallback(async () => {
    if (!authUser) {
      setVehicles([]); setTrips([]); setSavedRoutes([]); setPlaces([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [v, t, r, pl] = await Promise.all([
        base44.entities.Vehicle.list('-created_date', 100),
        base44.entities.Trip.list('-created_date', 200),
        base44.entities.Route.list('-created_date', 100),
        base44.entities.Place.list('-created_date', 5000).catch(() => [])
      ]);
      setVehicles(v);
      setTrips(t.map(x => mapTrip(x, color)));
      setSavedRoutes(r.map(mapRoute));
      setPlaces(pl);
    } finally {
      setLoading(false);
    }
  }, [authUser && authUser.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, [loadData]);

  // The car you're driving: the one marked "driving this", else your first car.
  const activeVehicle = useMemo(() => vehicles.find(v => v.is_primary) || vehicles[0] || null, [vehicles]);
  const myCar = useMemo(() => activeVehicle ? { body: activeVehicle.body || 'sedan', color: activeVehicle.color || '#00BFFF' } : null, [activeVehicle]);

  const setPrimaryVehicle = async (id) => {
    await Promise.all(vehicles.filter(v => !!v.is_primary !== (v.id === id)).map(v => base44.entities.Vehicle.update(v.id, { is_primary: v.id === id })));
    setVehicles(prev => prev.map(v => ({ ...v, is_primary: v.id === id })));
  };

  const stats = useMemo(() => {
    const lifetimeMiles = Math.round(trips.reduce((s, t) => s + (t.distance || 0), 0));
    const totalDrives = trips.length;
    const avgSpeed = totalDrives ? Math.round(trips.reduce((s, t) => s + (t.avg_speed || 0), 0) / totalDrives) : 0;
    const bestTopSpeed = totalDrives ? Math.max(...trips.map(t => t.top_speed || 0)) : 0;
    const weekAgo = new Date(Date.now() - 7 * 86400000);
    const weekTrips = trips.filter(t => new Date(t.start_time) >= weekAgo);
    return {
      lifetimeMiles,
      totalDrives,
      avgSpeed,
      bestTopSpeed,
      thisWeekDrives: weekTrips.length,
      thisWeekMiles: Math.round(weekTrips.reduce((s, t) => s + (t.distance || 0), 0))
    };
  }, [trips]);

  const weeklyStats = useMemo(() => {
    const weeks = [];
    for (let i = 7; i >= 0; i--) {
      const ws = startOfWeek(subWeeks(new Date(), i), { weekStartsOn: 1 });
      const we = new Date(ws);
      we.setDate(we.getDate() + 7);
      const inWeek = trips.filter(t => {
        const d = new Date(t.start_time);
        return d >= ws && d < we;
      });
      weeks.push({
        week: formatDate(ws, 'MMM d'),
        drives: inWeek.length,
        avgSpeed: inWeek.length ? Math.round(inWeek.reduce((s, t) => s + (t.avg_speed || 0), 0) / inWeek.length) : 0,
        miles: Math.round(inWeek.reduce((s, t) => s + (t.distance || 0), 0))
      });
    }
    return weeks;
  }, [trips]);

  const toggleGhostMode = async () => {
    await base44.auth.updateMe({ ghost_mode: !user.ghostMode });
    await checkUserAuth();
  };

  const updateUser = async (updates) => {
    const payload = {};
    if (updates.displayName != null) payload.display_name = updates.displayName;
    if (updates.username != null) payload.username = updates.username;
    if (updates.bio != null) payload.bio = updates.bio;
    if (updates.location != null) payload.location = updates.location;
    if (updates.discordWebhook !== undefined) payload.discord_webhook = updates.discordWebhook;
    if (updates.discordAuto != null) payload.discord_auto = updates.discordAuto;
    await base44.auth.updateMe(payload);
    await checkUserAuth();
  };

  const addVehicle = async (vehicle) => {
    const rec = await base44.entities.Vehicle.create(vehicle);
    setVehicles(prev => [rec, ...prev]);
  };

  const removeVehicle = async (id) => {
    await base44.entities.Vehicle.delete(id);
    setVehicles(prev => prev.filter(v => v.id !== id));
  };

  const addTrip = async (tripData) => {
    const rec = await base44.entities.Trip.create(tripData);
    const mapped = mapTrip(rec, color);
    setTrips(prev => [mapped, ...prev]);
    return mapped;
  };

  const addRoute = async (routeData) => {
    const rec = await base44.entities.Route.create({
      name: routeData.name,
      points: routeData.route,
      distance: routeData.distance,
      shared_with: []
    });
    const mapped = mapRoute(rec);
    setSavedRoutes(prev => [mapped, ...prev]);
    return mapped;
  };

  const deleteRoute = async (id) => {
    await base44.entities.Route.delete(id);
    setSavedRoutes(prev => prev.filter(r => r.id !== id));
  };

  const addPlace = async (p) => {
    const rec = await base44.entities.Place.create({ name: p.name, address: p.address || '', lat: p.lat, lng: p.lng, list: p.list || 'Saved', source: 'drivez' });
    setPlaces(prev => [rec, ...prev]);
    return rec;
  };

  const deletePlace = async (id) => {
    await base44.entities.Place.delete(id);
    setPlaces(prev => prev.filter(p => p.id !== id));
  };

  const shareRouteWithFriends = async (routeId, emails) => {
    const r = savedRoutes.find(x => x.id === routeId);
    const merged = [...new Set([...(r ? r.sharedWith : []), ...emails])];
    await base44.entities.Route.update(routeId, { shared_with: merged });
    setSavedRoutes(prev => prev.map(x => x.id === routeId ? { ...x, sharedWith: merged } : x));
  };

  return (
    <AppContext.Provider value={{
      user, stats, weeklyStats, vehicles, trips, savedRoutes, loading, activeVehicle, myCar, setPrimaryVehicle,
      toggleGhostMode, updateUser, addVehicle, removeVehicle, addTrip,
      addRoute, deleteRoute, shareRouteWithFriends, places, addPlace, deletePlace, refreshData: loadData
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
