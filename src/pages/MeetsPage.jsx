import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus, MapPin, Clock, Users, Navigation, Trash2, X, Wrench, Fuel, Phone, Globe, Search } from 'lucide-react';
import { api } from '@/api/base44Client';
import { searchPlaces, distM } from '@/lib/nav';

const field = 'w-full bg-secondary rounded-xl px-3 py-2.5 text-sm text-foreground border border-border focus:border-primary outline-none';
const SHOP_KINDS = [['all', 'All'], ['tuner', 'Tuners'], ['mechanic', 'Mechanics'], ['parts', 'Parts'], ['tires', 'Tires'], ['fuel', '93 / E0 gas']];
const SHOP_ICON = { tuner: '🏎️', mechanic: '🔧', parts: '📦', tires: '🛞', fuel: '⛽' };

function useHere() {
  const [pos, setPos] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!navigator.geolocation) { setErr('Location is off.'); return; }
    navigator.geolocation.getCurrentPosition((p) => setPos([p.coords.latitude, p.coords.longitude]), () => setErr('Turn on location to see what is near you.'), { maximumAge: 60000, timeout: 15000 });
  }, []);
  return [pos, err];
}
const miles = (pos, lat, lng) => (pos ? `${(distM(pos, [lat, lng]) / 1609.34).toFixed(1)} mi` : '');
const when = (iso) => new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// Car meets (post one, RSVP) and car shops near you (tuners, mechanics, parts, tires, good gas).
export default function MeetsPage() {
  const [tab, setTab] = useState('meets');
  const [pos, posErr] = useHere();
  const navigate = useNavigate();
  const driveTo = (dest) => navigate('/', { state: { plan: { dest, stops: [] } } });
  return (
    <div className="px-4 pt-[max(16px,env(safe-area-inset-top))] pb-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-foreground">{tab === 'meets' ? 'Meets' : 'Shops'}</h1>
        <div className="flex bg-secondary rounded-xl p-1">
          {[['meets', 'Meets'], ['shops', 'Shops']].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`text-xs px-4 py-1.5 rounded-lg ${tab === k ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground'}`}>{l}</button>
          ))}
        </div>
      </div>
      {posErr && <p className="text-xs text-muted-foreground">{posErr}</p>}
      {tab === 'meets' ? <Meets pos={pos} driveTo={driveTo} /> : <Shops pos={pos} driveTo={driveTo} />}
    </div>
  );
}

let lastMeets = null; // shown instantly when you come back, then refreshed
function Meets({ pos, driveTo }) {
  const [meets, setMeetsState] = useState(lastMeets);
  const setMeets = (v) => setMeetsState((prev) => { const next = typeof v === 'function' ? v(prev) : v; lastMeets = next; return next; });
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const load = () => api.get(`/meets${pos ? `?lat=${pos[0]}&lng=${pos[1]}` : ''}`).then((d) => setMeets(d.meets)).catch((e) => setError(e.message || 'Could not load meets.'));
  useEffect(() => { load(); }, [pos?.[0]]); // eslint-disable-line react-hooks/exhaustive-deps
  const rsvp = async (m) => {
    setMeets((list) => list.map((x) => (x.id === m.id ? { ...x, imGoing: !m.imGoing, going: x.going + (m.imGoing ? -1 : 1) } : x)));
    await api.post(`/meets/${m.id}/rsvp`, { going: !m.imGoing }).catch(load);
  };
  const cancel = async (m) => { await api.post(`/meets/${m.id}/delete`).catch(() => {}); load(); };

  return (
    <div className="space-y-3">
      <button onClick={() => setCreating(true)} className="w-full dz-go rounded-2xl py-3 text-sm font-bold flex items-center justify-center gap-2"><Plus className="w-4 h-4" />Post a meet</button>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!meets ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto" /> : !meets.length ? (
        <p className="text-sm text-muted-foreground text-center py-8">No meets coming up near you. Post one and your friends will see it.</p>
      ) : meets.map((m) => (
        <div key={m.id} className="bg-card rounded-2xl border border-border p-4">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-base font-bold text-foreground">{m.title}</div>
              <div className="text-xs text-primary font-semibold flex items-center gap-1 mt-0.5"><Clock className="w-3.5 h-3.5" />{when(m.starts)}</div>
              <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate"><MapPin className="w-3.5 h-3.5 shrink-0" />{m.place || 'Pinned spot'}{pos ? ` · ${miles(pos, m.lat, m.lng)}` : ''}</div>
              {m.about && <p className="text-xs text-foreground/80 mt-2">{m.about}</p>}
              <div className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1"><Users className="w-3.5 h-3.5" />{m.going} going · hosted by {m.mine ? 'you' : m.host.name} · {m.visibility === 'public' ? 'public' : 'friends'}</div>
            </div>
            {m.mine && <button onClick={() => cancel(m)} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center" aria-label="Cancel meet"><Trash2 className="w-4 h-4 text-muted-foreground" /></button>}
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={() => rsvp(m)} className={`flex-1 h-10 rounded-xl text-sm font-semibold ${m.imGoing ? 'bg-primary/15 text-primary' : 'bg-secondary text-foreground'}`}>{m.imGoing ? "✓ I'm going" : "I'm going"}</button>
            <button onClick={() => driveTo({ name: m.place || m.title, lat: m.lat, lng: m.lng })} className="flex-1 h-10 rounded-xl dz-go text-sm font-bold flex items-center justify-center gap-1.5"><Navigation className="w-4 h-4" />Drive there</button>
          </div>
        </div>
      ))}
      {creating && <NewMeet pos={pos} onClose={() => setCreating(false)} onDone={() => { setCreating(false); load(); }} />}
    </div>
  );
}

function NewMeet({ pos, onClose, onDone }) {
  const soon = new Date(Date.now() + 86400000); soon.setHours(20, 0, 0, 0);
  const local = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [f, setF] = useState({ title: '', about: '', starts: local(soon), visibility: 'friends' });
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  const [place, setPlace] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const find = async () => { if (!q.trim()) return; try { setHits((await searchPlaces(q, pos)).slice(0, 5)); } catch (e) { setError(e.message); } };
  const save = async () => {
    setBusy(true); setError('');
    try {
      if (!place) throw new Error('Search for where the meet is.');
      await api.post('/meets', { ...f, starts: new Date(f.starts).toISOString(), place: place.name, lat: place.lat, lng: place.lng });
      onDone();
    } catch (e) { setError(e.message || 'Could not post it.'); setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[1600] bg-black/60 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-card rounded-t-3xl p-5 pb-8 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h3 className="text-base font-bold text-foreground">Post a meet</h3><button onClick={onClose} aria-label="Close"><X className="w-5 h-5 text-muted-foreground" /></button></div>
        <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Name (e.g. Friday night JDM meet)" className={field} />
        <input type="datetime-local" value={f.starts} onChange={(e) => setF({ ...f, starts: e.target.value })} className={field} />
        {place ? (
          <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2.5 text-sm"><MapPin className="w-4 h-4 text-primary" /><span className="flex-1 truncate text-foreground">{place.name}</span><button onClick={() => setPlace(null)} className="text-xs text-primary">Change</button></div>
        ) : (
          <div className="space-y-1.5">
            <div className="flex gap-2"><input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && find()} placeholder="Where? (parking lot, address…)" className={field} /><button onClick={find} className="bg-secondary rounded-xl px-3 border border-border" aria-label="Search"><Search className="w-4 h-4" /></button></div>
            {hits.map((h, i) => <button key={i} onClick={() => { setPlace(h); setHits([]); }} className="w-full text-left text-sm px-3 py-2 rounded-xl bg-secondary/60 truncate text-foreground">{h.name}<span className="text-muted-foreground text-xs"> {h.address || ''}</span></button>)}
          </div>
        )}
        <textarea value={f.about} onChange={(e) => setF({ ...f, about: e.target.value })} placeholder="Details (optional): theme, rules, cruise after…" rows={3} className={field} />
        <div className="flex bg-secondary rounded-xl p-1">
          {[['friends', 'Friends only'], ['public', 'Anyone nearby']].map(([k, l]) => (
            <button key={k} onClick={() => setF({ ...f, visibility: k })} className={`flex-1 text-xs py-2 rounded-lg ${f.visibility === k ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground'}`}>{l}</button>
          ))}
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <button onClick={save} disabled={busy} className="w-full dz-go rounded-2xl py-3 text-sm font-bold flex items-center justify-center gap-2">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Post meet</button>
      </div>
    </div>
  );
}

function Shops({ pos, driveTo }) {
  const [items, setItems] = useState(null);
  const [kind, setKind] = useState('all');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!pos) return;
    const d = 0.25; // about 17 miles each way
    api.get(`/osm?kind=shops&s=${pos[0] - d}&w=${pos[1] - d}&n=${pos[0] + d}&e=${pos[1] + d}`)
      .then((r) => setItems(r.items.sort((a, b) => distM(pos, [a.lat, a.lng]) - distM(pos, [b.lat, b.lng]))))
      .catch((e) => setError(e.message || 'Could not load shops.'));
  }, [pos?.[0]]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = (items || []).filter((x) => kind === 'all' || x.category === kind).slice(0, 80);
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {SHOP_KINDS.map(([k, l]) => <button key={k} onClick={() => setKind(k)} className={`shrink-0 text-xs px-3 py-1.5 rounded-full ${kind === k ? 'bg-primary text-primary-foreground font-semibold' : 'bg-secondary text-muted-foreground'}`}>{l}</button>)}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!items && !error ? <div className="flex items-center gap-2 text-sm text-muted-foreground justify-center py-8"><Loader2 className="w-4 h-4 animate-spin" />Finding shops near you…</div> : !shown.length ? (
        <p className="text-sm text-muted-foreground text-center py-8">Nothing like that on the map near you.</p>
      ) : (
        <div className="bg-card rounded-2xl border border-border divide-y divide-border">
          {shown.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-3">
              <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-lg shrink-0">{SHOP_ICON[s.category] || <Wrench className="w-4 h-4" />}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-foreground truncate">{s.name}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {miles(pos, s.lat, s.lng)}{s.address ? ` · ${s.address}` : ''}{s.category === 'fuel' ? ` · ${[s.octane93 && '93', s.ethanolFree && 'E0'].filter(Boolean).join(' / ')}` : ''}
                </div>
                <div className="flex gap-3 mt-0.5">
                  {s.phone && <a href={`tel:${s.phone}`} className="text-[11px] text-primary flex items-center gap-1"><Phone className="w-3 h-3" />Call</a>}
                  {s.website && <a href={s.website} target="_blank" rel="noreferrer" className="text-[11px] text-primary flex items-center gap-1"><Globe className="w-3 h-3" />Website</a>}
                </div>
              </div>
              <button onClick={() => driveTo({ name: s.name, lat: s.lat, lng: s.lng })} className="w-10 h-10 rounded-full dz-go flex items-center justify-center shrink-0" aria-label={`Drive to ${s.name}`}>{s.category === 'fuel' ? <Fuel className="w-4 h-4" /> : <Navigation className="w-4 h-4" />}</button>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-muted-foreground text-center">Shop data from OpenStreetMap.</p>
    </div>
  );
}
