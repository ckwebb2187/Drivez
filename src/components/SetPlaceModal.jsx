import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Loader2, LocateFixed, MapPin, Home, Briefcase } from 'lucide-react';
import { searchPlaces, formatNavDistance } from '@/lib/nav';
import { useApp } from '@/lib/AppContext';

// "Set Home" / "Set Work": search for the address or use where you are now.
export default function SetPlaceModal({ kind, pos, onClose, onSaved }) {
  const { setHomeWork, home, work } = useApp();
  const current = kind === 'home' ? home : work;
  const Icon = kind === 'home' ? Home : Briefcase;
  const label = kind === 'home' ? 'Home' : 'Work';
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50); }, []);
  useEffect(() => {
    const t = q.trim();
    if (t.length < 3) { setResults([]); return undefined; }
    let alive = true;
    setSearching(true);
    const id = setTimeout(() => {
      searchPlaces(t, pos)
        .then((r) => { if (alive) { setResults(r); setError(''); } })
        .catch((e) => { if (alive) { setResults([]); setError(e.message || 'Search failed. Try again.'); } })
        .finally(() => alive && setSearching(false));
    }, 300);
    return () => { alive = false; clearTimeout(id); };
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (place) => {
    setSaving(true); setError('');
    try {
      const rec = await setHomeWork(kind, place);
      onSaved?.(rec);
      onClose();
    } catch (e) {
      setError(e.message || 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const useHere = async () => {
    if (!pos) { setError('Waiting for your location…'); return; }
    let address = 'Current location';
    try {
      const d = await (await fetch(`https://photon.komoot.io/reverse?lat=${pos[0]}&lon=${pos[1]}&limit=1&lang=en`)).json();
      const p = d.features?.[0]?.properties;
      if (p) address = [[p.housenumber, p.street].filter(Boolean).join(' ') || p.name, p.city].filter(Boolean).join(', ') || address;
    } catch { /* keep generic name */ }
    save({ lat: pos[0], lng: pos[1], address });
  };

  return createPortal(
    <div className="fixed inset-0 z-[1600] bg-background flex flex-col">
      <div className="px-4 pt-[max(16px,env(safe-area-inset-top))] pb-3 flex items-center gap-3 border-b border-border">
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center" aria-label="Close"><X className="w-5 h-5" /></button>
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Icon className="w-5 h-5 text-primary" /> Set {label}</h2>
      </div>
      <div className="p-4">
        {current && <p className="text-xs text-muted-foreground mb-3">Now: {current.address || current.name}</p>}
        <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 h-12">
          {searching ? <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" /> : <Search className="w-4 h-4 text-muted-foreground" />}
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={`${label} address`} enterKeyHint="search"
            className="flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground" />
          {q && <button onClick={() => setQ('')} aria-label="Clear"><X className="w-4 h-4 text-muted-foreground" /></button>}
        </div>
        {error && <p className="text-xs text-destructive mt-2">{error}</p>}
      </div>
      <div className="flex-1 overflow-y-auto px-2">
        <button onClick={useHere} disabled={saving} className="w-full flex items-center gap-3 px-3 py-3 text-left rounded-xl active:bg-secondary">
          <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center"><LocateFixed className="w-4 h-4 text-primary" /></div>
          <div className="text-sm font-semibold text-foreground">Use my current location</div>
        </button>
        {results.map((r) => (
          <button key={r.id} onClick={() => save(r)} disabled={saving} className="w-full flex items-center gap-3 px-3 py-3 text-left rounded-xl active:bg-secondary">
            <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center shrink-0"><MapPin className="w-4 h-4 text-muted-foreground" /></div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground truncate">{r.name}</div>
              <div className="text-xs text-muted-foreground truncate">{r.address}</div>
            </div>
            {r.distance != null && <span className="text-[11px] text-muted-foreground shrink-0">{formatNavDistance(r.distance)}</span>}
          </button>
        ))}
        {q.trim().length >= 3 && !searching && !error && results.length === 0 && <p className="px-3 py-3 text-sm text-muted-foreground">No matches. Try adding the city and state, like “123 Main St, Dallas, TX”.</p>}
      </div>
      {saving && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-white" /></div>}
    </div>,
    document.body
  );
}
