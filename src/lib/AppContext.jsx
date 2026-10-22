import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { base44, api } from '@/api/base44Client';
import { useAuth } from './AuthContext';
import { startOfWeek, subWeeks, format as formatDate } from 'date-fns';
import { useCarBluetooth, connectedCar } from './carBluetooth';
import { carLook, displayMode, iconBody } from './carCatalog';

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
      discordAuto: !!authUser.discord_auto,
      creator: !!authUser.creator,
      premium: !!authUser.premium,               // creators always have it
      appMode: authUser.app_mode || null,          // null until they pick on first launch
      profile: authUser.profile || { socials: {}, clubs: [], show: {} }
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
  const myCar = useMemo(() => {
    if (!activeVehicle) return null;
    const look = carLook(activeVehicle);
    const display = displayMode(activeVehicle);
    return {
      ...look,
      display,
      body: iconBody(look.shape),           // flat map icon
      color: activeVehicle.color || '#00BFFF',
      image: display === 'picture' || display === 'model' ? activeVehicle.image_url || null : null,
      model3d: display === 'model' ? look.model3d : null,
      paint: activeVehicle.paint || null,    // repaint for the detailed model (null = its own paint)
      lowered: !!activeVehicle.lowered,
    };
  }, [activeVehicle]);

  // Android app: when the phone connects to a car's Bluetooth, that car becomes the one you're driving.
  const carBt = useCarBluetooth();
  const btCar = useMemo(() => connectedCar(vehicles, carBt.status), [vehicles, carBt.status]);
  useEffect(() => {
    if (btCar && activeVehicle && btCar.id !== activeVehicle.id) setPrimaryVehicle(btCar.id).catch(() => {});
  }, [btCar && btCar.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const setPrimaryVehicle = async (id) => {
    await Promise.all(vehicles.filter(v => !!v.is_primary !== (v.id === id)).map(v => base44.entities.Vehicle.update(v.id, { is_primary: v.id === id })));
    setVehicles(prev => prev.map(v => ({ ...v, is_primary: v.id === id })));
  };

  const updateVehicle = async (id, patch) => {
    await base44.entities.Vehicle.update(id, patch);
    setVehicles(prev => prev.map(v => v.id === id ? { ...v, ...patch } : v));
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

  // "Car scene" turns on the enthusiast features; "Just navigation" hides them.
  const scene = user ? user.appMode !== 'nav' : true;
  const setAppMode = async (mode) => { await base44.auth.updateMe({ app_mode: mode }); await checkUserAuth(); };
  const saveProfile = async (profile) => { await base44.auth.updateMe({ profile }); await checkUserAuth(); };

  const addVehicle = async (vehicle) => {
    const rec = await base44.entities.Vehicle.create(vehicle);
    setVehicles(prev => [rec, ...prev]);
  };

  // Your own picture of the car (already cut out and facing up), or null to remove it.
  const setVehicleImage = async (id, pngBase64) => {
    const rec = pngBase64 ? await api.post(`/vehicles/${id}/image`, { mime: 'image/png', data: pngBase64 }) : await api.del(`/vehicles/${id}/image`);
    setVehicles(prev => prev.map(v => v.id === id ? { ...v, ...rec } : v));
    return rec;
  };

  // Gallery photos for a car: add one (base64 JPEG) or delete one by id.
  const addVehiclePhoto = async (id, data, caption = '') => {
    const rec = await api.post(`/vehicles/${id}/photos`, { mime: 'image/jpeg', data, caption });
    setVehicles(prev => prev.map(v => v.id === id ? { ...v, ...rec } : v));
  };
  const removeVehiclePhoto = async (id, photoId) => {
    const rec = await api.del(`/vehicles/${id}/photos/${photoId}`);
    setVehicles(prev => prev.map(v => v.id === id ? { ...v, ...rec } : v));
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

  const updateTrip = async (id, patch) => {
    await base44.entities.Trip.update(id, patch);
    setTrips(prev => prev.map(t => t.id === id ? mapTrip({ ...t, ...patch }, color) : t));
  };
  const deleteTrip = async (id) => {
    await base44.entities.Trip.delete(id);
    setTrips(prev => prev.filter(t => t.id !== id));
  };

  const addRoute = async (routeData) => {
    const rec = await base44.entities.Route.create({
      name: routeData.name,
      points: routeData.route,
      distance: routeData.distance,
      shared_with: [],
      ...(routeData.stops ? { stops: routeData.stops, dest: routeData.dest } : {})
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
    const rec = await base44.entities.Place.create({ name: p.name, address: p.address || '', lat: p.lat, lng: p.lng, list: p.list || 'Saved', source: 'drivez', ...(p.kind ? { kind: p.kind } : {}) });
    setPlaces(prev => [rec, ...prev]);
    return rec;
  };

  const deletePlace = async (id) => {
    await base44.entities.Place.delete(id);
    setPlaces(prev => prev.filter(p => p.id !== id));
  };

  const renamePlace = async (id, name) => {
    const rec = await base44.entities.Place.update(id, { name });
    setPlaces(prev => prev.map(p => p.id === id ? { ...p, name: rec.name ?? name } : p));
    return rec;
  };

  // Home and Work (like Waze): one of each, stored as saved places.
  const home = useMemo(() => places.find(p => p.kind === 'home') || null, [places]);
  const work = useMemo(() => places.find(p => p.kind === 'work') || null, [places]);
  const setHomeWork = async (kind, p) => {
    const old = places.filter(x => x.kind === kind);
    const rec = await addPlace({ name: kind === 'home' ? 'Home' : 'Work', address: p.name && p.address && !p.address.startsWith(p.name) ? `${p.name}, ${p.address}` : (p.address || p.name || ''), lat: p.lat, lng: p.lng, list: kind === 'home' ? 'Home' : 'Work', kind });
    for (const o of old) { try { await deletePlace(o.id); } catch { /* already gone */ } }
    return rec;
  };

  const shareRouteWithFriends = async (routeId, emails) => {
    const r = savedRoutes.find(x => x.id === routeId);
    const merged = [...new Set([...(r ? r.sharedWith : []), ...emails])];
    await base44.entities.Route.update(routeId, { shared_with: merged });
    setSavedRoutes(prev => prev.map(x => x.id === routeId ? { ...x, sharedWith: merged } : x));
  };

  return (
    <AppContext.Provider value={{
      user, scene, setAppMode, carBt, btCar, saveProfile, stats, weeklyStats, vehicles, trips, savedRoutes, loading, activeVehicle, myCar, setPrimaryVehicle,
      toggleGhostMode, updateUser, addVehicle, updateTrip, deleteTrip, removeVehicle, setVehicleImage, addVehiclePhoto, removeVehiclePhoto, updateVehicle, addTrip,
      addRoute, deleteRoute, shareRouteWithFriends, places, addPlace, deletePlace, renamePlace, home, work, setHomeWork, refreshData: loadData
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
