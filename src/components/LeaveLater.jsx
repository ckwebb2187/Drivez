// "Leave later" for planned routes: pick a time to leave (or a time to arrive by), see how long
// the drive takes and the weather along the way at that time, and get a heads-up when it's time to go.
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Clock, Loader2, X, Navigation, Pencil, Trash2, Bell } from 'lucide-react';
import { getRoute, formatEta } from '@/lib/nav';
import { weatherAlongRoute } from '@/lib/routeWeather';
import { useApp } from '@/lib/AppContext';

const here = () => new Promise((resolve) => {
  if (!('geolocation' in navigator)) return resolve(null);
  navigator.geolocation.getCurrentPosition((p) => resolve([p.coords.latitude, p.coords.longitude]), () => resolve(null), { maximumAge: 120000, timeout: 10000 });
});
const pad = (n) => String(n).padStart(2, '0');
const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmtTime = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fmtDay = (d) => {
  const today = new Date(); const t = new Date(today); t.setDate(t.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === t.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
};
export const planOf = (r) => (r.dest ? { dest: r.dest, stops: r.stops || [] } : null);
const endOf = (r) => (r.dest ? [r.dest.lat, r.dest.lng] : r.route?.[r.route.length - 1]);

// Drive time for a saved route, from its start (or from where you are, for a plan to a place).
async function estimate(r) {
  const to = endOf(r);
  if (!to) throw new Error('This route has no destination.');
  const from = r.dest ? (await here()) || r.route?.[0] : r.route?.[0];
  if (!from) throw new Error('Turn on location to work out the drive time.');
  const res = await getRoute(from, to, r.dest ? (r.stops || []) : [], r.dest?.name || r.name);
  const { alternatives, ...main } = res; // eslint-disable-line no-unused-vars
  return main;
}

export function LeaveLaterSheet({ route, onClose }) {
  const { updateRoute } = useApp();
  const [mode, setMode] = useState(route.leave_mode || 'leave');
  const [when, setWhen] = useState(() => {
    const t = route.leave_mode === 'arrive' && route.arrive_at ? new Date(route.arrive_at) : route.leave_at ? new Date(route.leave_at) : new Date(Math.ceil((Date.now() + 3600000) / 900000) * 900000);
    return toLocalInput(t);
  });
  const [trip, setTrip] = useState(null);
  const [wx, setWx] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { estimate(route).then(setTrip).catch((e) => setErr(e.message)); }, [route.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // A little cushion on top of the typical drive time when you need to arrive by a set time.
  const plan = useMemo(() => {
    if (!trip) return null;
    const t = new Date(when);
    if (Number.isNaN(+t)) return null;
    const secs = trip.duration * 1.1 + 120;
    const leave = mode === 'arrive' ? new Date(+t - secs * 1000) : t;
    return { leave, arrive: new Date(+leave + secs * 1000), secs };
  }, [trip, when, mode]);
  useEffect(() => {
    if (!plan || !trip) return undefined;
    let alive = true;
    setWx(null);
    const id = setTimeout(() => weatherAlongRoute(trip, plan.leave).then((w) => alive && setWx(w)).catch(() => {}), 400);
    return () => { alive = false; clearTimeout(id); };
  }, [plan?.leave?.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!plan) return;
    setBusy(true); setErr('');
    try {
      await updateRoute(route.id, { leave_at: plan.leave.toISOString(), arrive_at: plan.arrive.toISOString(), leave_mode: mode, leave_secs: Math.round(plan.secs) });
      try { if (window.Notification?.permission === 'default') await Notification.requestPermission(); } catch { /* fine */ }
      onClose();
    } catch (e) { setErr(e.message || 'Could not save.'); } finally { setBusy(false); }
  };
  const clear = async () => { setBusy(true); try { await updateRoute(route.id, { leave_at: null, arrive_at: null, leave_mode: null }); onClose(); } finally { setBusy(false); } };

  return createPortal(
    <div className="fixed inset-0 z-[1600] bg-black/60 flex items-end justify-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-card border-t border-border rounded-t-3xl p-5 pb-[max(24px,env(safe-area-inset-bottom))] dz-pop-in">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2"><Clock className="w-4 h-4 text-primary" /> Leave later</h3>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="text-sm font-semibold text-foreground truncate mb-3">{route.name}</div>
        <div className="grid grid-cols-2 gap-1 bg-secondary rounded-xl p-1 mb-3">
          {[['leave', 'Leave at'], ['arrive', 'Arrive by']].map(([k, l]) => (
            <button key={k} onClick={() => setMode(k)} className={`h-9 rounded-lg text-sm font-bold ${mode === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{l}</button>
          ))}
        </div>
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="w-full bg-secondary rounded-xl px-4 h-12 text-[15px] text-foreground outline-none border border-border focus:border-primary" />
        <div className="mt-3 rounded-2xl bg-secondary/50 border border-border p-3 min-h-[86px]">
          {!trip && !err && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Working out the drive…</div>}
          {plan && (
            <>
              <div className="grid grid-cols-3 text-center">
                <div><div className="text-[10px] text-muted-foreground font-semibold">LEAVE</div><div className="text-base font-black text-primary">{fmtTime(plan.leave)}</div><div className="text-[10px] text-muted-foreground">{fmtDay(plan.leave)}</div></div>
                <div><div className="text-[10px] text-muted-foreground font-semibold">DRIVE</div><div className="text-base font-black text-foreground">{formatEta(plan.secs)}</div><div className="text-[10px] text-muted-foreground">incl. a cushion</div></div>
                <div><div className="text-[10px] text-muted-foreground font-semibold">ARRIVE</div><div className="text-base font-black text-foreground">{fmtTime(plan.arrive)}</div><div className="text-[10px] text-muted-foreground">{fmtDay(plan.arrive)}</div></div>
              </div>
              <div className="text-[11px] text-muted-foreground mt-2 text-center">{wx?.summary ? `Weather then: ${wx.summary}` : 'Checking the weather for that time…'}</div>
            </>
          )}
          {err && <p className="text-xs text-destructive">{err}</p>}
        </div>
        <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1"><Bell className="w-3 h-3" />You'll get a heads-up 10 minutes before it's time to leave (while Kaido Maps is open or in the background).</p>
        <button onClick={save} disabled={!plan || busy} className="w-full mt-3 dz-go rounded-xl py-3 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}{mode === 'arrive' ? 'Plan to arrive on time' : 'Schedule this drive'}
        </button>
        {route.leave_at && <button onClick={clear} disabled={busy} className="w-full mt-2 py-2.5 text-sm font-semibold text-muted-foreground">Clear the scheduled time</button>}
      </div>
    </div>,
    document.body
  );
}

// "Leave later" list at the top of Routes: what's coming up, with a countdown.
export function LeaveLaterList({ routes }) {
  const navigate = useNavigate();
  const { updateRoute } = useApp();
  const [editing, setEditing] = useState(null);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(t); }, []);
  const soon = routes.filter((r) => r.leave_at && Date.parse(r.leave_at) > Date.now() - 2 * 3600000).sort((a, b) => Date.parse(a.leave_at) - Date.parse(b.leave_at));
  if (!soon.length) return null;
  const go = (r) => (r.dest ? navigate('/', { state: { plan: planOf(r) } }) : navigate(`/?route=${r.id}`));
  const left = (ms) => { if (ms <= 0) return 'Time to go'; const m = Math.round(ms / 60000); if (m < 60) return `Leave in ${m} min`; const h = Math.floor(m / 60); return h < 24 ? `Leave in ${h} h ${m % 60} min` : `Leave ${fmtDay(new Date(Date.now() + ms))}`; };
  return (
    <div className="px-5 pb-3">
      <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Leave later</h2>
      <div className="space-y-2">
        {soon.map((r) => {
          const ms = Date.parse(r.leave_at) - Date.now();
          const due = ms < 10 * 60000;
          return (
            <div key={r.id} className={`relative rounded-2xl border p-3 bg-card ${due ? 'border-primary dz-glow' : 'border-border'}`}>
              {due && <span className="dz-sweep" aria-hidden="true" />}
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-foreground truncate">{r.name}</div>
                  <div className={`text-xs font-semibold ${due ? 'text-primary' : 'text-foreground'}`}>{left(ms)}</div>
                  <div className="text-[11px] text-muted-foreground">{r.leave_mode === 'arrive' ? 'Arrive by' : 'Leave'} {fmtTime(new Date(r.leave_mode === 'arrive' ? r.arrive_at : r.leave_at))} · {fmtDay(new Date(r.leave_at))}{r.arrive_at && r.leave_mode !== 'arrive' ? ` · arrive ~${fmtTime(new Date(r.arrive_at))}` : ''}</div>
                </div>
                <button onClick={() => go(r)} className="h-9 px-3 rounded-full dz-go text-xs font-bold flex items-center gap-1"><Navigation className="w-3.5 h-3.5" />Go</button>
                <button onClick={() => setEditing(r)} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center" aria-label="Change time"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => updateRoute(r.id, { leave_at: null, arrive_at: null, leave_mode: null })} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center" aria-label="Clear"><Trash2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
              </div>
            </div>
          );
        })}
      </div>
      {editing && <LeaveLaterSheet route={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

// App-wide: "time to leave" heads-up 10 minutes before a scheduled drive.
export function useLeaveReminder() {
  const { savedRoutes } = useApp();
  const [due, setDue] = useState(null);
  useEffect(() => {
    const check = () => {
      const now = Date.now();
      for (const r of savedRoutes || []) {
        if (!r.leave_at) continue;
        const t = Date.parse(r.leave_at);
        if (now < t - 10 * 60000 || now > t + 30 * 60000) continue;
        const key = `dz-left-${r.id}-${r.leave_at}`;
        try { if (localStorage.getItem(key)) continue; localStorage.setItem(key, '1'); } catch { /* ignore */ }
        setDue(r);
        const text = `Leave by ${fmtTime(new Date(t))}${r.leave_mode === 'arrive' && r.arrive_at ? ` to arrive by ${fmtTime(new Date(r.arrive_at))}` : ''}`;
        try { if (window.Notification?.permission === 'granted') new Notification(`Time to head out: ${r.name}`, { body: text, tag: key, icon: '/icon-192.png' }); } catch { /* ignore */ }
        break;
      }
    };
    check();
    const id = setInterval(check, 30000);
    return () => clearInterval(id);
  }, [savedRoutes]);
  return [due, () => setDue(null)];
}
export { fmtTime as leaveTimeText };
