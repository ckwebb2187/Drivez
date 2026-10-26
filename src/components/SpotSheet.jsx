import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Eye, Loader2, ShieldCheck } from 'lucide-react';
import { api } from '@/api/base44Client';
import { getInitials } from '@/lib/helpers';
import { formatNavDistance } from '@/lib/nav';

const NOTES = ['Clean build! 🔥', 'Saw you on the road 👋', 'Nice wheels', 'That sound though 🔊'];
const here = () => new Promise((resolve) => {
  if (!('geolocation' in navigator)) return resolve(null);
  navigator.geolocation.getCurrentPosition((p) => resolve([p.coords.latitude, p.coords.longitude]), () => resolve(null), { maximumAge: 60000, timeout: 12000 });
});

// "Spot a car": see Kaido drivers who passed near you lately (opt-in, delayed, rounded),
// and send them an "I saw you!". Also where you turn your own spotted mode on or off.
export default function SpotSheet({ onClose }) {
  const [on, setOn] = useState(null);
  const [cars, setCars] = useState(null);
  const [pos, setPos] = useState(null);
  const [sent, setSent] = useState({});
  const [pick, setPick] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.get('/spot/settings').then((d) => setOn(d.on)).catch(() => setOn(false));
    here().then((p) => {
      setPos(p);
      if (!p) { setCars([]); setErr('Turn on location to see cars near you.'); return; }
      api.get(`/spot/nearby?lat=${p[0]}&lng=${p[1]}`).then((d) => setCars(d.cars)).catch((e) => { setCars([]); setErr(e.message); });
    });
  }, []);
  const toggle = async () => { setErr(''); try { setOn((await api.post('/spot/settings', { on: !on })).on); } catch (e) { setErr(e.message); } };
  const spot = async (c, note) => {
    setErr('');
    try { await api.post('/spot', { userId: c.userId, note, lat: pos?.[0], lng: pos?.[1] }); setSent((s) => ({ ...s, [c.userId]: true })); setPick(null); }
    catch (e) { setErr(e.message); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[1600] bg-black/60 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-md max-h-[88vh] overflow-y-auto bg-card rounded-t-3xl border-t border-border p-4 pb-[max(20px,env(safe-area-inset-bottom))] dz-pop-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div><div className="text-base font-black text-foreground flex items-center gap-2"><Eye className="w-5 h-5 text-primary" />Spotted</div><div className="text-[11px] text-muted-foreground">Saw a Kaido driver on the road? Let them know.</div></div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>

        <button onClick={toggle} disabled={on == null} className="w-full rounded-2xl border border-border bg-secondary/40 px-3 py-3 flex items-center gap-3 text-left">
          <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-foreground">Let others spot me</div>
            <div className="text-[10px] text-muted-foreground">Off by default. Others only see roughly where you were 10–40 min ago, never live, and never near your saved Home.</div>
          </div>
          <span className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${on ? 'bg-primary' : 'bg-muted'}`}><span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} /></span>
        </button>

        <div className="text-xs font-black tracking-wider text-muted-foreground uppercase mt-4 mb-2 px-1">Passed near you lately</div>
        {err && <p className="text-xs text-destructive mb-2">{err}</p>}
        {cars == null ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto my-6" />
          : !cars.length ? <p className="text-sm text-muted-foreground text-center py-6">No spotted-mode drivers near you in the last 40 minutes.</p>
          : (
            <div className="space-y-2">
              {cars.map((c) => (
                <div key={c.userId} className="rounded-2xl border border-border bg-secondary/30 p-3">
                  <div className="flex items-center gap-3">
                    {c.avatarUrl ? <img src={c.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover" /> : <div className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: c.color || '#00BFFF' }}>{getInitials(c.name || c.username)}</div>}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-foreground truncate">{c.car?.name || 'Kaido driver'}{c.car?.color && <span className="inline-block w-2.5 h-2.5 rounded-full ml-1.5 align-middle border border-white/40" style={{ background: c.car.color }} />}</div>
                      <div className="text-[11px] text-muted-foreground truncate">@{c.username} · {formatNavDistance(c.distanceM)} away · {c.minutesAgo} min ago</div>
                    </div>
                    {sent[c.userId] ? <span className="text-xs font-bold text-green-400">Sent 👀</span>
                      : <button onClick={() => setPick(pick === c.userId ? null : c.userId)} className="h-9 px-3 rounded-full dz-go text-xs font-bold">I saw you!</button>}
                  </div>
                  {pick === c.userId && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {NOTES.map((n) => <button key={n} onClick={() => spot(c, n)} className="text-xs px-3 py-1.5 rounded-full bg-card border border-border text-foreground">{n}</button>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        <p className="text-[10px] text-muted-foreground text-center mt-4">Never spot while driving. Passengers welcome.</p>
      </div>
    </div>,
    document.body
  );
}
