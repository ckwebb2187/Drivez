import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Loader2, Trash2, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useApp } from '@/lib/AppContext';

// Shrink a photo to at most 1600px on its long side, as JPEG (base64, no prefix).
export async function shrink(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    let w = img.naturalWidth, h = img.naturalHeight;
    const k = Math.min(1, 1600 / Math.max(w, h));
    w = Math.round(w * k); h = Math.round(h * k);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    for (const q of [0.82, 0.7, 0.55]) {
      const b64 = c.toDataURL('image/jpeg', q).split(',')[1];
      if (b64.length * 0.75 < 850 * 1024) return b64;
    }
    throw new Error('That photo is too big.');
  } finally { URL.revokeObjectURL(url); }
}

// Photo gallery for a car. Editable for your own car; read-only (photos prop) for others.
export default function CarPhotos({ vehicle, photos: given, editable = true }) {
  const { addVehiclePhoto, removeVehiclePhoto } = useApp();
  const photos = given || vehicle?.photos || [];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null); // index of the photo shown full screen
  const input = useRef(null);

  const add = async (files) => {
    setBusy(true); setError('');
    try {
      for (const f of [...files].slice(0, 6)) await addVehiclePhoto(vehicle.id, await shrink(f));
    } catch (e) { setError(e.message || 'Could not add that photo.'); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  const remove = async (p) => {
    setBusy(true); setError('');
    try { await removeVehiclePhoto(vehicle.id, p.id); setOpen(null); } catch (e) { setError(e.message || 'Could not delete it.'); } finally { setBusy(false); }
  };

  if (!editable && !photos.length) return null;
  const cur = open != null ? photos[open] : null;

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2"><Camera className="w-4 h-4 text-primary" />Photos{photos.length ? <span className="text-muted-foreground font-normal">· {photos.length}</span> : null}</h3>
        {editable && (
          <button onClick={() => input.current?.click()} disabled={busy} className="text-xs font-semibold text-primary flex items-center gap-1">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}Add photos
          </button>
        )}
      </div>
      {editable && <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files?.length && add(e.target.files)} />}
      {error && <p className="text-xs text-destructive mb-2">{error}</p>}
      {photos.length ? (
        <div className="grid grid-cols-3 gap-1.5">
          {photos.map((p, i) => (
            <button key={p.id} onClick={() => setOpen(i)} className="aspect-square rounded-xl overflow-hidden bg-secondary">
              <img src={p.url} alt={p.caption || 'Car photo'} loading="lazy" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      ) : (
        <button onClick={() => input.current?.click()} className="w-full rounded-2xl border border-dashed border-border py-6 text-xs text-muted-foreground">Show off the build: add photos from your phone</button>
      )}

      {cur && createPortal(
        <div className="fixed inset-0 z-[1700] bg-black/95 flex flex-col" onClick={() => setOpen(null)}>
          <div className="flex items-center justify-between p-3 pt-[max(12px,env(safe-area-inset-top))]" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setOpen(null)} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center" aria-label="Close"><X className="w-5 h-5 text-white" /></button>
            <span className="text-xs text-white/60">{open + 1} / {photos.length}</span>
            {editable ? <button onClick={() => remove(cur)} disabled={busy} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center" aria-label="Delete photo"><Trash2 className="w-5 h-5 text-white" /></button> : <span className="w-10" />}
          </div>
          <div className="flex-1 flex items-center justify-center relative px-2" onClick={(e) => e.stopPropagation()}>
            <img src={cur.url} alt={cur.caption || 'Car photo'} className="max-w-full max-h-full object-contain rounded-lg" />
            {open > 0 && <button onClick={() => setOpen(open - 1)} className="absolute left-2 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center" aria-label="Previous"><ChevronLeft className="w-6 h-6 text-white" /></button>}
            {open < photos.length - 1 && <button onClick={() => setOpen(open + 1)} className="absolute right-2 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center" aria-label="Next"><ChevronRight className="w-6 h-6 text-white" /></button>}
          </div>
        </div>,
        document.body
      )}
    </section>
  );
}
