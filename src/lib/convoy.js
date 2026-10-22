import { useCallback, useEffect, useState } from 'react';
import { api } from '@/api/base44Client';

export const convoyUrl = (code) => `${window.location.origin}/convoy/${code}`;

// The group drive you're in (if any), refreshed every 10 s while `active`.
export function useConvoy(active = true) {
  const [convoy, setConvoy] = useState(null);
  const load = useCallback(() => api.get('/convoys/mine').then((d) => { setConvoy(d.convoy); return d.convoy; }).catch(() => null), []);
  useEffect(() => {
    if (!active) return undefined;
    load();
    const t = setInterval(load, 10000);
    const on = () => load();
    window.addEventListener('dz-convoy', on);
    return () => { clearInterval(t); window.removeEventListener('dz-convoy', on); };
  }, [active, load]);
  const leave = async () => { if (convoy) await api.post(`/convoys/${convoy.code}/leave`).catch(() => {}); setConvoy(null); window.dispatchEvent(new Event('dz-convoy')); };
  return { convoy, reload: load, leave };
}

// Start a group drive to `dest` and share the link (falls back to copying it).
export async function startConvoy(dest, name = '') {
  const c = await api.post('/convoys', { dest: { name: dest.name, lat: dest.lat, lng: dest.lng }, name });
  window.dispatchEvent(new Event('dz-convoy'));
  const url = convoyUrl(c.code);
  try { await navigator.share({ title: 'Group drive on Kaido Maps', text: `Roll with me to ${dest.name}`, url }); } catch { try { await navigator.clipboard.writeText(url); } catch { /* ignore */ } }
  return c;
}
