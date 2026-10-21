import { useState } from 'react';
import { Plus, Trash2, X, Car as CarIcon, Loader2 } from 'lucide-react';
import { useApp } from '@/lib/AppContext';

function VehicleForm({ onSave, onClose, saving, error }) {
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [nickname, setNickname] = useState('');
  const [color, setColor] = useState('#00BFFF');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!make || !model) return;
    onSave({ make, model, year: parseInt(year) || new Date().getFullYear(), nickname, color });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card w-full max-w-md rounded-t-3xl p-6 border-t border-border" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-foreground">Add Vehicle</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Make</label>
            <input value={make} onChange={e => setMake(e.target.value)} placeholder="BMW"
              className="w-full bg-secondary rounded-xl px-4 py-3 text-foreground text-sm border border-border focus:border-primary outline-none" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Model</label>
            <input value={model} onChange={e => setModel(e.target.value)} placeholder="M3 Competition"
              className="w-full bg-secondary rounded-xl px-4 py-3 text-foreground text-sm border border-border focus:border-primary outline-none" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Year</label>
            <input value={year} onChange={e => setYear(e.target.value)} placeholder="2023" type="number"
              className="w-full bg-secondary rounded-xl px-4 py-3 text-foreground text-sm border border-border focus:border-primary outline-none" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Nickname (optional)</label>
            <input value={nickname} onChange={e => setNickname(e.target.value)} placeholder="e.g. Beast"
              className="w-full bg-secondary rounded-xl px-4 py-3 text-foreground text-sm border border-border focus:border-primary outline-none" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">Color</label>
            <div className="flex gap-2">
              {['#00BFFF', '#39FF14', '#FF4757', '#FF6B35', '#9B59B6', '#F39C12'].map(c => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-card' : ''}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <button type="submit" disabled={saving}
            className="w-full bg-primary text-primary-foreground rounded-xl py-3 font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-40">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Add to Garage
          </button>
        </form>
      </div>
    </div>
  );
}

export default function GarageManager({ compact = false }) {
  const { vehicles, trips, addVehicle, removeVehicle } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleAdd = async (v) => {
    setSaving(true);
    setError('');
    try {
      await addVehicle(v);
      setShowForm(false);
    } catch (err) {
      setError(err.message || 'Failed to add vehicle');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id) => {
    try {
      await removeVehicle(id);
    } catch (err) {
      setError(err.message || 'Failed to remove vehicle');
    }
  };

  const drivesFor = (id) => trips.filter(t => t.vehicleId === id).length;
  const milesFor = (id) => Math.round(trips.filter(t => t.vehicleId === id).reduce((s, t) => s + (t.distance || 0), 0));

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-foreground">Garage</h3>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1 text-xs text-primary font-medium">
          <Plus className="w-3.5 h-3.5" /> Add Vehicle
        </button>
      </div>
      {error && !showForm && <p className="text-xs text-destructive mb-2">{error}</p>}
      <div className="space-y-2">
        {vehicles.map(v => (
          <div key={v.id} className="bg-card rounded-2xl p-4 border border-border flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${v.color || '#00BFFF'}20` }}>
              <CarIcon className="w-5 h-5" style={{ color: v.color || '#00BFFF' }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-foreground">{v.make} {v.model}</span>
                {v.nickname && <span className="text-[11px] text-primary">"{v.nickname}"</span>}
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-[11px] text-muted-foreground">{v.year}</span>
                <span className="text-[11px] text-muted-foreground">{milesFor(v.id).toLocaleString()} mi</span>
                <span className="text-[11px] text-muted-foreground">{drivesFor(v.id)} drives</span>
              </div>
            </div>
            {!compact && (
              <button onClick={() => handleRemove(v.id)} className="text-muted-foreground hover:text-destructive p-1">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
        {vehicles.length === 0 && (
          <div className="bg-card rounded-2xl p-8 border border-border text-center">
            <CarIcon className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Your garage is empty</p>
            <p className="text-xs text-muted-foreground mt-1">Add your first vehicle to tag drives with it</p>
          </div>
        )}
      </div>
      {showForm && <VehicleForm onClose={() => setShowForm(false)} onSave={handleAdd} saving={saving} error={error} />}
    </div>
  );
}
