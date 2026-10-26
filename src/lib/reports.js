import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/api/base44Client';
import { distM, distToLineM, speak } from './nav';

export const REPORT_TYPES = {
  police: { label: 'Police', emoji: '👮', color: '#4285F4', say: 'Police reported ahead' },
  crash: { label: 'Crash', emoji: '💥', color: '#EA4335', say: 'Crash reported ahead' },
  hazard: { label: 'Hazard', emoji: '⚠️', color: '#F9AB00', say: 'Hazard reported ahead' },
  traffic: { label: 'Traffic jam', emoji: '🚦', color: '#FF6D00', say: 'Traffic jam reported ahead' },
  closure: { label: 'Road closed', emoji: '⛔', color: '#9AA0A6', say: 'Road closure reported ahead' },
  train: { label: 'Train on crossing', emoji: '🚂', color: '#795548', say: 'Train blocking the crossing ahead' },
  flood: { label: 'Flooded road', emoji: '🌊', color: '#1E88E5', say: 'Flooded road reported ahead. Turn around, don\'t drown' },
  bump: { label: 'Speed bump', emoji: '〰️', color: '#8E24AA', say: 'Speed bump ahead', low: true },
  pothole: { label: 'Pothole', emoji: '🕳️', color: '#6D4C41', say: 'Pothole ahead', low: true },
  dip: { label: 'Steep dip', emoji: '⤵️', color: '#5E35B1', say: 'Steep dip or driveway ahead', low: true },
};

// Loads road reports around `pos`, refreshing every minute or after moving 2 km.
export function useReports(pos) {
  // Last list is kept on the phone (12 h) so hazards still show after a restart with no signal.
  const [reports, setReports] = useState(() => {
    try { const c = JSON.parse(localStorage.getItem('dz-reports-cache') || 'null'); return c && Date.now() - c.at < 12 * 3600000 ? c.reports : []; } catch { return []; }
  });
  const last = useRef({ at: 0, pos: null });

  const load = useCallback(async (p = pos, force = false) => {
    if (!p) return;
    const moved = !last.current.pos || distM(last.current.pos, p) > 2000;
    if (!force && !moved && Date.now() - last.current.at < 60000) return;
    last.current = { at: Date.now(), pos: p };
    try {
      const list = (await api.get(`/reports?lat=${p[0]}&lng=${p[1]}&km=40`)).reports;
      setReports(list);
      try { localStorage.setItem('dz-reports-cache', JSON.stringify({ at: Date.now(), reports: list })); } catch { /* full or private */ }
    } catch { /* offline: keep old list */ }
  }, [pos]);

  useEffect(() => { load(pos); }, [pos, load]);
  useEffect(() => { const t = setInterval(() => load(last.current.pos, true), 60000); return () => clearInterval(t); }, [load]);

  const report = async (type, p) => { await api.post('/reports', { type, lat: p[0], lng: p[1] }); await load(p, true); };
  const voteOn = async (id, stillThere) => { await api.post(`/reports/${id}/vote`, { stillThere }); await load(last.current.pos, true); };
  const remove = async (id) => { await api.post(`/reports/${id}/delete`); await load(last.current.pos, true); };
  return { reports, report, vote: voteOn, remove, reload: () => load(last.current.pos, true) };
}

// Speed bumps and dips from OpenStreetMap around you (for lowered cars). Refreshes every few km.
export function useMappedBumps(pos, enabled) {
  const [items, setItems] = useState([]);
  const last = useRef(null);
  useEffect(() => {
    if (!enabled || !pos) return;
    if (last.current && distM(last.current, pos) < 2500) return;
    last.current = pos;
    const d = 0.03; // ~3 km box
    api.get(`/osm?kind=bumps&s=${pos[0] - d}&w=${pos[1] - d}&n=${pos[0] + d}&e=${pos[1] + d}`)
      .then((r) => setItems(r.items.map((b) => ({ ...b, by: 'map data', mapped: true }))))
      .catch(() => { last.current = null; });
  }, [enabled, pos?.[0], pos?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  return enabled ? items : [];
}

// While driving: warn once about each report within 500 m (and on the route, if navigating).
// Low-clearance types (bumps, potholes, dips) only warn when your car is marked as lowered, and closer (150 m).
export function useReportAlerts(reports, pos, routeCoords, voice, lowered = false) {
  const warned = useRef(new Set());
  const [alert, setAlert] = useState(null);
  useEffect(() => {
    if (!pos) return;
    for (const r of reports) {
      if (warned.current.has(r.id) || r.mine) continue;
      const low = REPORT_TYPES[r.type]?.low;
      if (low && !lowered) continue;
      const d = distM(pos, [r.lat, r.lng]);
      if (d > (low ? 150 : 500)) continue;
      if (routeCoords?.length && distToLineM([r.lat, r.lng], routeCoords) > 60) continue;
      warned.current.add(r.id);
      setAlert({ ...r, distance: d });
      if (voice) speak(REPORT_TYPES[r.type]?.say || 'Report ahead');
      setTimeout(() => setAlert((a) => (a?.id === r.id ? null : a)), 12000);
      break;
    }
  }, [pos, reports]); // eslint-disable-line react-hooks/exhaustive-deps
  return [alert, () => setAlert(null)];
}
