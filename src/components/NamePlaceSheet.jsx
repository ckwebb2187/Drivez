import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Star, Loader2, Trash2 } from 'lucide-react';

// Bottom sheet to name (or rename) a saved place, with an optional Remove button.
export default function NamePlaceSheet({ title, initialName = '', address = '', saveLabel = 'Save', onSave, onRemove, onClose }) {
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef(null);
  useEffect(() => { setTimeout(() => { ref.current?.focus(); ref.current?.select(); }, 50); }, []);

  const run = async (fn) => {
    setBusy(true); setError('');
    try { await fn(); onClose(); } catch (e) { setError(e.message || 'Something went wrong. Try again.'); } finally { setBusy(false); }
  };
  const submit = (e) => { e?.preventDefault(); const n = name.trim(); if (n) run(() => onSave(n)); };

  return createPortal(
    <div className="fixed inset-0 z-[1600] bg-black/60 flex items-end justify-center" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-card border-t border-border rounded-t-3xl p-5 pb-8 dz-pop-in">
        <div className="w-10 h-1 rounded-full bg-muted mx-auto mb-4" />
        <h3 className="text-base font-bold text-foreground flex items-center gap-2 mb-1"><Star className="w-4 h-4 text-amber-400 fill-amber-400" /> {title}</h3>
        {address && <p className="text-xs text-muted-foreground mb-3 truncate">{address}</p>}
        <input ref={ref} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Name, like “Mom’s house” or “Gym”" enterKeyHint="done"
          className="w-full bg-secondary rounded-xl px-4 py-3 text-[15px] text-foreground outline-none border border-border focus:border-primary placeholder:text-muted-foreground" />
        {error && <p className="text-xs text-destructive mt-2">{error}</p>}
        <button type="submit" disabled={busy || !name.trim()} className="w-full mt-3 bg-primary text-primary-foreground rounded-xl py-3 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} {saveLabel}
        </button>
        {onRemove && (
          <button type="button" disabled={busy} onClick={() => run(onRemove)} className="w-full mt-2 rounded-xl py-3 text-sm font-semibold text-destructive flex items-center justify-center gap-2">
            <Trash2 className="w-4 h-4" /> Remove from saved places
          </button>
        )}
      </form>
    </div>,
    document.body
  );
}
