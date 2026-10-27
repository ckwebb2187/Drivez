import { useEffect, useMemo, useState } from 'react';
import SetPlaceModal from '@/components/SetPlaceModal';
import NamePlaceSheet from '@/components/NamePlaceSheet';
import AddPlaceSheet from '@/components/AddPlaceSheet';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Search, Star, Navigation, Upload, MapPin, Home, Briefcase, Pencil, Plus } from 'lucide-react';
import { useApp } from '@/lib/AppContext';

export default function PlacesPage() {
  const navigate = useNavigate();
  const { places, deletePlace, renamePlace, home, work } = useApp();
  const [renaming, setRenaming] = useState(null);
  const [setting, setSetting] = useState(null);
  const [adding, setAdding] = useState(false);
  const [pos, setPos] = useState(null);
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition((p) => setPos([p.coords.latitude, p.coords.longitude]), () => {}, { maximumAge: 60000 });
  }, []);
  const [q, setQ] = useState('');
  const [list, setList] = useState('All');

  const lists = useMemo(() => ['All', ...new Set(places.filter((p) => !p.kind).map((p) => p.list || 'Saved'))], [places]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return places
      .filter((p) => !p.kind)
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
        <div className="flex gap-2">
          <button onClick={() => navigate('/import')} className="bg-secondary text-foreground rounded-xl px-3 py-2 text-xs font-bold flex items-center gap-1">
            <Upload className="w-3.5 h-3.5" /> Import
          </button>
          <button onClick={() => setAdding(true)} className="bg-primary text-primary-foreground rounded-xl px-3 py-2 text-xs font-bold flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> Add address
          </button>
        </div>
      </div>

      <div className="px-5">
        <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 h-10 mb-3">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your places" className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" />
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {[['home', home, Home, 'Home'], ['work', work, Briefcase, 'Work']].map(([k, p, Icon, label]) => (
            <div key={k} className="bg-card border border-border rounded-2xl p-3">
              <button onClick={() => (p ? go({ ...p, name: label }) : setSetting(k))} className="w-full text-left">
                <Icon className="w-5 h-5 text-primary mb-1" />
                <div className="text-sm font-bold text-foreground">{label}</div>
                <div className="text-[11px] text-muted-foreground truncate">{p ? p.address : 'Not set'}</div>
              </button>
              <button onClick={() => setSetting(k)} className="text-[11px] text-primary font-semibold mt-1">{p ? 'Change' : 'Set'}</button>
            </div>
          ))}
        </div>

        {lists.length > 2 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar mb-3">
            {lists.map((l) => (
              <button key={l} onClick={() => setList(l)} className={`shrink-0 px-3 h-8 rounded-full text-xs font-semibold border ${list === l ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground border-border'}`}>{l}</button>
            ))}
          </div>
        )}

        {renaming && (
          <NamePlaceSheet title="Rename place" initialName={renaming.name} address={renaming.address}
            onSave={(n) => renamePlace(renaming.id, n)} onRemove={() => deletePlace(renaming.id)} onClose={() => setRenaming(null)} />
        )}
        {adding && <AddPlaceSheet pos={pos} lists={lists.filter((l) => l !== 'All')} onClose={() => setAdding(false)} />}
        {setting && <SetPlaceModal kind={setting} pos={pos} onClose={() => setSetting(null)} />}
        {places.filter((p) => !p.kind).length === 0 ? (
          <div className="text-center py-12">
            <MapPin className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No saved places yet</p>
            <p className="text-xs text-muted-foreground mt-1">Tap “Add address” to type one in, tap the star after searching on the map, or import from Google Maps and Waze.</p>
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
                <button onClick={() => setRenaming(p)} className="w-10 h-10 flex items-center justify-center mr-1" aria-label="Rename"><Pencil className="w-4 h-4 text-muted-foreground" /></button>
              </div>
            ))}
            {shown.length > 300 && <p className="text-center text-[11px] text-muted-foreground py-2">Showing 300 of {shown.length.toLocaleString()}. Search to narrow it down.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
