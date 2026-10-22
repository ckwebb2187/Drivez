import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/api/base44Client';
import { distM, distToLineM, speak } from './nav';

export const REPORT_TYPES = {
  police: { label: 'Police', emoji: '👮', color: '#4285F4', say: 'Police reported ahead' },
  crash: { label: 'Crash', emoji: '💥', color: '#EA4335', say: 'Crash reported ahead' },
  hazard: { label: 'Hazard', emoji: '⚠️', color: '#F9AB00', say: 'Hazard reported ahead' },
  traffic: { label: 'Traffic jam', emoji: '🚦', color: '#FF6D00', say: 'Traffic jam reported ahead' },
  closure: { label: 'Road closed', emoji: '⛔', color: '#9AA0A6', say: 'Road closure reported ahead' },
};

// Loads road reports around `pos`, refreshing every minute or after moving 2 km.
export function useReports(pos) {
  const [reports, setReports] = useState([]);
  const last = useRef({ at: 0, pos: null });

  const load = useCallback(async (p = pos, force = false) => {
    if (!p) return;
    const moved = !last.current.pos || distM(last.current.pos, p) > 2000;
    if (!force && !moved && Date.now() - last.current.at < 60000) return;
    last.current = { at: Date.now(), pos: p };
    try { setReports((await api.get(`/reports?lat=${p[0]}&lng=${p[1]}&km=40`)).reports); } catch { /* keep old list */ }
  }, [pos]);

  useEffect(() => { load(pos); }, [pos, load]);
  useEffect(() => { const t = setInterval(() => load(last.current.pos, true), 60000); return () => clearInterval(t); }, [load]);

  const report = async (type, p) => { await api.post('/reports', { type, lat: p[0], lng: p[1] }); await load(p, true); };
  const voteOn = async (id, stillThere) => { await api.post(`/reports/${id}/vote`, { stillThere }); await load(last.current.pos, true); };
  const remove = async (id) => { await api.post(`/reports/${id}/delete`); await load(last.current.pos, true); };
  return { reports, report, vote: voteOn, remove, reload: () => load(last.current.pos, true) };
}

// While driving: warn once about each report within 500 m (and on the route, if navigating).
export function useReportAlerts(reports, pos, routeCoords, voice) {
  const warned = useRef(new Set());
  const [alert, setAlert] = useState(null);
  useEffect(() => {
    if (!pos) return;
    for (const r of reports) {
      if (warned.current.has(r.id) || r.mine) continue;
      const d = distM(pos, [r.lat, r.lng]);
      if (d > 500) continue;
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
