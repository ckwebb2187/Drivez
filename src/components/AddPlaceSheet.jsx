import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Loader2, Star, LocateFixed, Search, Check } from 'lucide-react';
import { searchPlaces, formatNavDistance } from '@/lib/nav';
import { useApp } from '@/lib/AppContext';

// Save a place by typing its address (or using where you are now), then giving it a name.
export default function AddPlaceSheet({ pos, lists = [], onClose }) {
  const { addPlace } = useApp();
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [pick, setPick] = useState(null);
  const [name, setName] = useState('');
  const [list, setList] = useState('Saved');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ref = useRef(null);
  useEffect(() => { setTimeout(() => ref.current?.focus(), 60); }, []);
  useEffect(() => {
    const t = q.trim();
    if (pick || t.length < 3) { setResults([]); return undefined; }
    let alive = true;
    setSearching(true);
    const id = setTimeout(() => {
      searchPlaces(t, pos)
        .then((r) => { if (alive) { setResults(r); setErr(''); } })
        .catch((e) => { if (alive) { setResults([]); setErr(e.message || 'Search failed. Try again.'); } })
        .finally(() => alive && setSearching(false));
    }, 300);
    return () => { alive = false; clearTimeout(id); };
  }, [q, pick]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (r) => { setPick(r); setQ(r.address || r.name); if (!name) setName(r.address && r.name && !r.address.startsWith(r.name) ? r.name : ''); };
  const here = () => {
    setErr('');
    navigator.geolocation?.getCurrentPosition(
      (p) => choose({ name: 'Current location', address: `Pinned spot (${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)})`, lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setErr('Turn on location to use where you are.'), { enableHighAccuracy: true, timeout: 10000 });
  };
  const save = async () => {
    if (!pick || !name.trim()) return;
    setBusy(true); setErr('');
    try {
      const address = pick.address && pick.name && !pick.address.startsWith(pick.name) && pick.name !== 'Current location' ? `${pick.name}, ${pick.address}` : (pick.address || pick.name || '');
      await addPlace({ name: name.trim(), address, lat: pick.lat, lng: pick.lng, list: list.trim() || 'Saved' });
      onClose();
    } catch (e) { setErr(e.message || 'Could not save. Try again.'); } finally { setBusy(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[1600] bg-black/60 flex items-end justify-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-card border-t border-border rounded-t-3xl p-5 pb-[max(24px,env(safe-area-inset-bottom))] dz-pop-in">
        <div className="w-10 h-1 rounded-full bg-muted mx-auto mb-4" />
        <h3 className="text-base font-bold text-foreground flex items-center gap-2 mb-3"><Star className="w-4 h-4 text-amber-400 fill-amber-400" /> Add a place</h3>

        <label className="text-[11px] font-semibold text-muted-foreground">Address</label>
        <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 mt-1 border border-border focus-within:border-primary">
          {pick ? <Check className="w-4 h-4 text-green-400 shrink-0" /> : <Search className="w-4 h-4 text-muted-foreground shrink-0" />}
          <input ref={ref} value={q} onChange={(e) => { setQ(e.target.value); setPick(null); }} placeholder="123 Main St, City, State" autoComplete="street-address"
            className="flex-1 h-11 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground" />
          {searching && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        </div>
        {!pick && (
          <div className="mt-1">
            <button onClick={here} className="w-full flex items-center gap-3 px-2 py-2.5 text-left rounded-xl active:bg-secondary">
              <LocateFixed className="w-4 h-4 text-primary" /><span className="text-sm font-semibold text-foreground">Use where I am now</span>
            </button>
            {results.map((r, i) => (
              <button key={i} onClick={() => choose(r)} className="w-full flex items-center gap-3 px-2 py-2.5 text-left rounded-xl active:bg-secondary">
                <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="flex-1 min-w-0"><span className="block text-sm font-semibold text-foreground truncate">{r.name}</span><span className="block text-xs text-muted-foreground truncate">{r.address}</span></span>
                {r.distance != null && <span className="text-[11px] text-muted-foreground shrink-0">{formatNavDistance(r.distance)}</span>}
              </button>
            ))}
            {q.trim().length >= 3 && !searching && !err && !results.length && <p className="text-xs text-muted-foreground px-2 py-2">No match yet. Try adding the city and state.</p>}
          </div>
        )}

        {pick && (
          <>
            <label className="text-[11px] font-semibold text-muted-foreground mt-3 block">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Like “Mom’s house” or “Gym”"
              className="w-full mt-1 bg-secondary rounded-xl px-4 h-11 text-[15px] text-foreground outline-none border border-border focus:border-primary placeholder:text-muted-foreground" />
            <label className="text-[11px] font-semibold text-muted-foreground mt-3 block">List</label>
            <div className="flex gap-2 overflow-x-auto no-scrollbar mt-1">
              {[...new Set(['Saved', ...lists])].map((l) => (
                <button key={l} onClick={() => setList(l)} className={`shrink-0 px-3 h-8 rounded-full text-xs font-semibold border ${list === l ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary text-foreground border-border'}`}>{l}</button>
              ))}
            </div>
          </>
        )}
        {err && <p className="text-xs text-destructive mt-2">{err}</p>}
        <button onClick={save} disabled={!pick || !name.trim() || busy} className="w-full mt-4 bg-primary text-primary-foreground rounded-xl py-3 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save place
        </button>
      </div>
    </div>,
    document.body
  );
}
