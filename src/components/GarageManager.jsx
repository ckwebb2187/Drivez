import { useState } from 'react';
import { Plus, Trash2, X, Car as CarIcon, Loader2, ImagePlus, ChevronRight } from 'lucide-react';
import CarPictureEditor from '@/components/CarPictureEditor';
import VehicleDetail from '@/components/VehicleDetail';
import { odometer, reminders } from '@/lib/maintenance';
import { useApp } from '@/lib/AppContext';
import { BODY_TYPES, carSvg } from '@/lib/cars';

export function CarPic({ body, color, image, className = 'w-6 h-12' }) {
  if (image) return <img src={image} alt="" className={`${className} object-contain scale-125`} />;
  return <span className={`inline-block ${className}`} dangerouslySetInnerHTML={{ __html: carSvg(body, color).replace('width="40" height="80"', 'width="100%" height="100%"') }} />;
}

function VehicleForm({ onSave, onClose, saving, error }) {
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [nickname, setNickname] = useState('');
  const [color, setColor] = useState('#00BFFF');
  const [body, setBody] = useState('sedan');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!make || !model) return;
    onSave({ make, model, year: parseInt(year) || new Date().getFullYear(), nickname, color, body });
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
            <label className="text-xs text-muted-foreground mb-2 block">Shown on the map as</label>
            <div className="grid grid-cols-5 gap-2">
              {BODY_TYPES.map(b => (
                <button key={b.key} type="button" onClick={() => setBody(b.key)}
                  className={`flex flex-col items-center gap-1 py-2 rounded-xl border ${body === b.key ? 'border-primary bg-primary/10' : 'border-border bg-secondary'}`}>
                  <CarPic body={b.key} color={color} className="w-5 h-10" />
                  <span className="text-[9px] text-muted-foreground leading-tight text-center">{b.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">Color</label>
            <div className="flex gap-2 flex-wrap">
              {['#00BFFF', '#39FF14', '#FF4757', '#FF6B35', '#9B59B6', '#F39C12', '#F5F5F5', '#2B2B2B'].map(c => (
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
  const { vehicles, trips, addVehicle, removeVehicle, activeVehicle, setPrimaryVehicle } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [picFor, setPicFor] = useState(null);
  const [openId, setOpenId] = useState(null);

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
      {picFor && <CarPictureEditor vehicle={picFor} onClose={() => setPicFor(null)} />}
      {openId && vehicles.some(v => v.id === openId) && <VehicleDetail vehicle={vehicles.find(v => v.id === openId)} onClose={() => setOpenId(null)} />}
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
            <button onClick={() => setPicFor(v)} className="relative w-12 h-14 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${v.color || '#00BFFF'}18` }} aria-label="Car picture">
              <CarPic body={v.body || 'sedan'} color={v.color || '#00BFFF'} image={v.image_url} className="w-6 h-12" />
              <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-primary border-2 border-card flex items-center justify-center"><ImagePlus className="w-2.5 h-2.5 text-primary-foreground" /></span>
            </button>
            <button onClick={() => setOpenId(v.id)} className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-foreground truncate">{v.make} {v.model}</span>
                {v.nickname && <span className="text-[11px] text-primary truncate">"{v.nickname}"</span>}
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-[11px] text-muted-foreground">{v.year}</span>
                {odometer(v, trips) != null
                  ? <span className="text-[11px] text-muted-foreground">{odometer(v, trips).toLocaleString()} mi</span>
                  : <span className="text-[11px] text-muted-foreground">{milesFor(v.id).toLocaleString()} mi in app</span>}
                <span className="text-[11px] text-muted-foreground">{drivesFor(v.id)} drives</span>
              </div>
              {(() => { const due = reminders(v, trips).filter(r => r.status === 'overdue' || r.status === 'soon'); return due.length > 0 && (
                <div className={`text-[10px] font-semibold mt-1 ${due.some(r => r.status === 'overdue') ? 'text-destructive' : 'text-amber-400'}`}>🔧 {due.map(r => r.label).join(', ')} due</div>
              ); })()}
              <div className="text-[10px] text-primary mt-1 flex items-center">Service, mods & odometer <ChevronRight className="w-3 h-3" /></div>
            </button>
            {activeVehicle?.id === v.id ? (
              <span className="text-[10px] font-bold text-accent bg-accent/10 rounded-full px-2 py-1">Driving</span>
            ) : (
              <button onClick={() => setPrimaryVehicle(v.id).catch(e => setError(e.message))} className="text-[10px] font-bold text-primary bg-primary/10 rounded-full px-2 py-1">Drive this</button>
            )}
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
            <p className="text-xs text-muted-foreground mt-1">Add your car to show it on the map instead of a dot. Tap its picture to use your own.</p>
          </div>
        )}
      </div>
      {showForm && <VehicleForm onClose={() => setShowForm(false)} onSave={handleAdd} saving={saving} error={error} />}
    </div>
  );
}
