import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, RotateCw, Loader2, ImagePlus, Trash2, ArrowUp } from 'lucide-react';
import { cutOutCar, turnCar, canvasToPngBase64 } from '@/lib/carImage';
import { useApp } from '@/lib/AppContext';

// Upload your own top-down car picture: background removed, front turned to face up.
export default function CarPictureEditor({ vehicle, onClose }) {
  const { setVehicleImage } = useApp();
  const fileRef = useRef(null);
  const [cut, setCut] = useState(null);       // cut-out canvas
  const [turns, setTurns] = useState(0);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (!vehicle.image_url) setTimeout(() => fileRef.current?.click(), 50); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (cut) setPreview(turnCar(cut, turns).toDataURL('image/png')); }, [cut, turns]);

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true); setError('');
    try {
      const c = await cutOutCar(f);
      setCut(c);
      // Pictures of a car lying sideways usually have the front on the left: turn it to face up.
      setTurns(c.width > c.height ? 1 : 0);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true); setError('');
    try { await setVehicleImage(vehicle.id, canvasToPngBase64(turnCar(cut, turns))); onClose(); }
    catch (err) { setError(err.message || 'Could not save the picture.'); } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true); setError('');
    try { await setVehicleImage(vehicle.id, null); onClose(); }
    catch (err) { setError(err.message || 'Could not remove the picture.'); } finally { setBusy(false); }
  };
  const shown = preview || vehicle.image_url;

  return createPortal(
    <div className="fixed inset-0 z-[1600] bg-black/70 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-md bg-card border-t border-border rounded-t-3xl p-5 pb-8 dz-pop-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-foreground">Car picture · {vehicle.nickname || `${vehicle.make} ${vehicle.model}`}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">Use a picture of your car seen from above. A plain background works best; it gets removed automatically.</p>

        <div className="relative h-56 rounded-2xl overflow-hidden flex items-center justify-center" style={{ background: 'repeating-linear-gradient(0deg,#15161d 0 38px,#1d1f28 38px 40px), #15161d' }}>
          {busy && !shown && <Loader2 className="w-8 h-8 animate-spin text-white" />}
          {shown ? <img src={shown} alt="" className="max-h-48 max-w-[70%] object-contain" /> : !busy && (
            <button onClick={() => fileRef.current?.click()} className="flex flex-col items-center gap-2 text-muted-foreground text-sm"><ImagePlus className="w-8 h-8" /> Choose a picture</button>
          )}
          {cut && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full bg-black/60 text-white text-[11px] font-semibold flex items-center gap-1">
              <ArrowUp className="w-3 h-3" /> Front of the car goes up
            </div>
          )}
        </div>
        {error && <p className="text-xs text-destructive mt-2">{error}</p>}

        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
        <div className="flex gap-2 mt-3">
          <button onClick={() => fileRef.current?.click()} disabled={busy} className="flex-1 h-11 rounded-xl bg-secondary text-sm font-semibold text-foreground flex items-center justify-center gap-1.5">
            <ImagePlus className="w-4 h-4" /> {shown ? 'Another' : 'Choose'}
          </button>
          {cut && (
            <button onClick={() => setTurns((t) => t + 1)} disabled={busy} className="flex-1 h-11 rounded-xl bg-secondary text-sm font-semibold text-foreground flex items-center justify-center gap-1.5">
              <RotateCw className="w-4 h-4" /> Turn
            </button>
          )}
        </div>
        {cut && (
          <button onClick={save} disabled={busy} className="w-full mt-2 h-12 rounded-xl bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Use this picture
          </button>
        )}
        {vehicle.image_url && !cut && (
          <button onClick={remove} disabled={busy} className="w-full mt-2 h-11 rounded-xl text-sm font-semibold text-destructive flex items-center justify-center gap-2">
            <Trash2 className="w-4 h-4" /> Go back to the drawn car
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}
