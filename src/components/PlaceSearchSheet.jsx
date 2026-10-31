import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Loader2, MapPin, Home, Briefcase, Star } from 'lucide-react';
import { searchPlaces, formatNavDistance, distM } from '@/lib/nav';
import { useApp } from '@/lib/AppContext';

// Full-screen "choose a place" search, with Home, Work and saved places as shortcuts.
export default function PlaceSearchSheet({ title = 'Add stop', pos, onPick, onClose }) {
  const { places } = useApp();
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50); }, []);
  useEffect(() => {
    const t = q.trim();
    if (t.length < 3) { setResults([]); return undefined; }
    let alive = true;
    setSearching(true);
    const id = setTimeout(() => {
      searchPlaces(t, pos)
        .then((r) => { if (alive) { setResults(r); setSearchError(''); } })
        .catch((e) => { if (alive) { setResults([]); setSearchError(e.message || 'Search failed. Try again.'); } })
        .finally(() => alive && setSearching(false));
    }, 300);
    return () => { alive = false; clearTimeout(id); };
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const s = q.trim().toLowerCase();
  const saved = places
    .filter((p) => !s || `${p.name} ${p.address}`.toLowerCase().includes(s))
    .map((p) => ({ ...p, name: p.kind === 'home' ? 'Home' : p.kind === 'work' ? 'Work' : p.name, distance: pos ? distM(pos, [p.lat, p.lng]) : null }))
    .sort((a, b) => (a.kind ? -1 : 0) - (b.kind ? -1 : 0) || (a.distance ?? 0) - (b.distance ?? 0))
    .slice(0, s ? 4 : 8);
  const pick = (p) => { onPick({ name: p.name, address: p.address || '', lat: p.lat, lng: p.lng }); onClose(); };
  const Row = ({ p, icon: Icon, tint }) => (
    <button onClick={() => pick(p)} className="w-full flex items-center gap-3 px-3 py-3 text-left rounded-xl active:bg-secondary">
      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${tint || 'bg-secondary'}`}><Icon className="w-4 h-4" /></div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-foreground truncate">{p.name}</div>
        <div className="text-xs text-muted-foreground truncate">{p.address}</div>
      </div>
      {p.distance != null && <span className="text-[11px] text-muted-foreground shrink-0">{formatNavDistance(p.distance)}</span>}
    </button>
  );

  return createPortal(
    <div className="fixed inset-0 z-[1600] bg-background flex flex-col">
      <div className="px-4 pt-[max(16px,env(safe-area-inset-top))] pb-3 flex items-center gap-3">
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center shrink-0" aria-label="Close"><X className="w-5 h-5" /></button>
        <div className="flex-1 flex items-center gap-2 bg-secondary rounded-xl px-3 h-11">
          {searching ? <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" /> : <Search className="w-4 h-4 text-muted-foreground" />}
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={title} enterKeyHint="search"
            className="flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground" />
          {q && <button onClick={() => setQ('')} aria-label="Clear"><X className="w-4 h-4 text-muted-foreground" /></button>}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-8">
        {saved.map((p) => (
          <Row key={`s-${p.id}`} p={p} icon={p.kind === 'home' ? Home : p.kind === 'work' ? Briefcase : Star}
            tint={p.kind ? 'bg-primary/15 text-primary' : 'bg-amber-400/15 text-amber-400'} />
        ))}
        {saved.length > 0 && results.length > 0 && <div className="h-px bg-border mx-3 my-1" />}
        {results.map((r) => <Row key={r.id} p={r} icon={MapPin} />)}
        {s.length >= 3 && !searching && searchError && <p className="px-3 py-3 text-sm text-destructive">{searchError}</p>}
        {s.length >= 3 && !searching && !searchError && results.length === 0 && saved.length === 0 && <p className="px-3 py-3 text-sm text-muted-foreground">No matches. Try adding the city and state, like “123 Main St, Dallas, TX”.</p>}
      </div>
    </div>,
    document.body
  );
}
