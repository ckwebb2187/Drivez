import { useEffect, useState } from 'react';
import { Mountain, Check, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { distM } from '@/lib/nav';
import { dst, distUnit } from '@/lib/units';

// Tōge sections: save a stretch of road from a past drive. Later passes get scored on it
// (smoothness and control, never speed).
export const MAX_SECTION_POINTS = 120;

export function sectionLengthM(pts) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += distM(pts[i - 1], pts[i]);
  return d;
}

export default function SectionSaver({ trip, onChange }) {
  const n = trip.route.length;
  const [open, setOpen] = useState(false);
  const [a, setA] = useState(Math.round(n * 0.25));
  const [b, setB] = useState(Math.round(n * 0.6));
  const [name, setName] = useState('');
  const [state, setState] = useState('');
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const pts = trip.route.slice(lo, hi + 1);
  const len = sectionLengthM(pts);

  useEffect(() => { onChange?.(open ? [lo, hi] : null); }, [open, lo, hi]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setState('saving');
    const step = Math.ceil(pts.length / MAX_SECTION_POINTS) || 1;
    const points = pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map(([lat, lng]) => [Math.round(lat * 1e6) / 1e6, Math.round(lng * 1e6) / 1e6]);
    try {
      await base44.entities.Sector.create({ name: name.trim() || `${trip.title || 'Drive'} section`, points, length_m: Math.round(len), from_trip: trip.id });
      setState('saved');
      setTimeout(() => { setOpen(false); setState(''); setName(''); }, 1500);
    } catch { setState('err'); }
  };

  if (!open) return (
    <button onClick={() => setOpen(true)} className="w-full mt-3 bg-card rounded-2xl p-4 border border-border flex items-center gap-3 text-left">
      <Mountain className="w-5 h-5 text-primary" />
      <div className="flex-1"><div className="text-sm font-semibold text-foreground">Save a Tōge section</div><div className="text-[11px] text-muted-foreground">Pick a stretch of this drive to score future runs on</div></div>
    </button>
  );

  return (
    <div className="mt-3 bg-card rounded-2xl p-4 border border-border">
      <div className="flex items-center gap-2 mb-2"><Mountain className="w-4 h-4 text-primary" /><span className="text-sm font-semibold text-foreground">New Tōge section</span><span className="ml-auto text-[11px] text-muted-foreground">{dst(len / 1609.34)} {distUnit()} · orange on the map</span></div>
      <label className="text-[11px] text-muted-foreground">Start</label>
      <input type="range" min="0" max={n - 1} value={a} onChange={(e) => setA(+e.target.value)} className="w-full accent-[#FF9F0A]" />
      <label className="text-[11px] text-muted-foreground">End</label>
      <input type="range" min="0" max={n - 1} value={b} onChange={(e) => setB(+e.target.value)} className="w-full accent-[#FF9F0A]" />
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Name (e.g. Tunica Hills climb)" className="w-full mt-2 bg-secondary rounded-xl px-3 py-2 text-sm text-foreground" />
      <div className="flex gap-2 mt-3">
        <button onClick={() => setOpen(false)} className="flex-1 h-10 rounded-xl bg-secondary text-sm font-semibold text-foreground">Cancel</button>
        <button onClick={save} disabled={state === 'saving' || pts.length < 5 || len < 300} className="flex-1 h-10 rounded-xl dz-go text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-40">
          {state === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : state === 'saved' ? <Check className="w-4 h-4" /> : null}
          {state === 'saved' ? 'Saved' : state === 'err' ? 'Try again' : 'Save section'}
        </button>
      </div>
      {len < 300 && <p className="text-[10px] text-muted-foreground mt-2">Sections need at least 300 m of road.</p>}
    </div>
  );
}
