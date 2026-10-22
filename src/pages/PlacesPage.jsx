import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Search, Star, Trash2, Navigation, Upload, MapPin } from 'lucide-react';
import { useApp } from '@/lib/AppContext';

export default function PlacesPage() {
  const navigate = useNavigate();
  const { places, deletePlace } = useApp();
  const [q, setQ] = useState('');
  const [list, setList] = useState('All');

  const lists = useMemo(() => ['All', ...new Set(places.map((p) => p.list || 'Saved'))], [places]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return places
      .filter((p) => list === 'All' || (p.list || 'Saved') === list)
      .filter((p) => !s || `${p.name} ${p.address}`.toLowerCase().includes(s))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [places, q, list]);

  const go = (p) => navigate('/', { state: { go: { id: p.id, name: p.name, address: p.address, lat: p.lat, lng: p.lng } } });

  return (
    <div className="min-h-full pb-28">
      <div className="px-5 pt-12 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full glass border border-border flex items-center justify-center" aria-label="Back">
            <ChevronLeft className="w-5 h-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground">Saved places</h1>
            <p className="text-[11px] text-muted-foreground">{places.length.toLocaleString()} saved</p>
          </div>
        </div>
        <button onClick={() => navigate('/import')} className="bg-primary text-primary-foreground rounded-xl px-3 py-2 text-xs font-bold flex items-center gap-1">
          <Upload className="w-3.5 h-3.5" /> Import
        </button>
      </div>

      <div className="px-5">
        <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 h-10 mb-3">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your places" className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" />
        </div>
        {lists.length > 2 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar mb-3">
            {lists.map((l) => (
              <button key={l} onClick={() => setList(l)} className={`shrink-0 px-3 h-8 rounded-full text-xs font-semibold border ${list === l ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground border-border'}`}>{l}</button>
            ))}
          </div>
        )}

        {places.length === 0 ? (
          <div className="text-center py-12">
            <MapPin className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No saved places yet</p>
            <p className="text-xs text-muted-foreground mt-1">Tap the star after searching for a place, or import from Google Maps and Waze.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {shown.slice(0, 300).map((p) => (
              <div key={p.id} className="bg-card border border-border rounded-2xl flex items-center">
                <button onClick={() => go(p)} className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3 text-left">
                  <Star className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground truncate">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{p.address || p.list}</div>
                  </div>
                </button>
                <button onClick={() => go(p)} className="w-10 h-10 flex items-center justify-center" aria-label="Directions"><Navigation className="w-4 h-4 text-primary" /></button>
                <button onClick={() => deletePlace(p.id)} className="w-10 h-10 flex items-center justify-center mr-1" aria-label="Remove"><Trash2 className="w-4 h-4 text-muted-foreground" /></button>
              </div>
            ))}
            {shown.length > 300 && <p className="text-center text-[11px] text-muted-foreground py-2">Showing 300 of {shown.length.toLocaleString()}. Search to narrow it down.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
