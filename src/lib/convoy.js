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

// Group drives you could join (friends' and ones you're invited to), refreshed every 20 s.
export function useOpenConvoys(active = true) {
  const [list, setList] = useState([]);
  const load = useCallback(() => api.get('/convoys/open').then((d) => setList(d.convoys || [])).catch(() => {}), []);
  useEffect(() => {
    if (!active) return undefined;
    load();
    const t = setInterval(load, 20000);
    window.addEventListener('dz-convoy', load);
    return () => { clearInterval(t); window.removeEventListener('dz-convoy', load); };
  }, [active, load]);
  return { open: list, reload: load };
}

export const joinConvoy = async (code) => { const c = await api.post(`/convoys/${code}/join`); window.dispatchEvent(new Event('dz-convoy')); return c; };
export const inviteToConvoy = (code, userIds) => api.post(`/convoys/${code}/invite`, { userIds });
export const convoySettings = (code, patch) => api.patch(`/convoys/${code}/settings`, patch);

// Group drive chat: polls every 5 s while open.
export function useConvoyChat(code, open) {
  const [msgs, setMsgs] = useState([]);
  useEffect(() => { setMsgs([]); }, [code]);
  useEffect(() => {
    if (!code || !open) return undefined;
    let alive = true, last = 0;
    const load = () => api.get(`/convoys/${code}/messages?after=${last}`).then((d) => {
      if (!alive || !d.messages?.length) return;
      last = d.messages[d.messages.length - 1].at;
      setMsgs((m) => [...m, ...d.messages.filter((x) => !m.some((y) => y.id === x.id))].slice(-100));
    }).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => { alive = false; clearInterval(t); };
  }, [code, open]);
  const send = async (text) => { await api.post(`/convoys/${code}/messages`, { text }); };
  return { msgs, send, setMsgs };
}
