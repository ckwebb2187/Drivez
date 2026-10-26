import { useState } from 'react';
import { Star, Check } from 'lucide-react';
import { api } from '@/api/base44Client';

// Road scores: after a drive, rate the road's surface and how fun it was. Ratings are shared
// (anonymously) and feed the road score shown on planned routes.
function Stars({ value, onPick, label }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 text-[11px] text-muted-foreground">{label}</span>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} onClick={() => onPick(n)} aria-label={`${label} ${n} of 5`} className="w-8 h-8 flex items-center justify-center">
          <Star className={`w-5 h-5 ${n <= value ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground'}`} />
        </button>
      ))}
    </div>
  );
}

export default function RateRoad({ trip }) {
  const [surface, setSurface] = useState(0);
  const [fun, setFun] = useState(0);
  const [state, setState] = useState('');
  const send = async (s, f) => {
    if (!s && !f) return;
    setState('saving');
    const r = trip.route;
    const n = Math.min(25, r.length);
    const points = Array.from({ length: n }, (_, i) => r[Math.round((i * (r.length - 1)) / Math.max(1, n - 1))]);
    try { await api.post('/roads/rate', { points, surface: s || null, fun: f || null, tripId: trip.id }); setState('saved'); } catch { setState('err'); }
  };
  const pick = (k, v) => {
    const s = k === 's' ? v : surface, f = k === 'f' ? v : fun;
    if (k === 's') setSurface(v); else setFun(v);
    send(s, f);
  };
  return (
    <div className="mt-3 bg-card rounded-2xl p-4 border border-border">
      <div className="flex items-center mb-1">
        <span className="text-sm font-semibold text-foreground">Rate this road</span>
        {state === 'saved' && <span className="ml-auto text-[11px] text-primary flex items-center gap-1"><Check className="w-3.5 h-3.5" />Saved</span>}
        {state === 'err' && <span className="ml-auto text-[11px] text-destructive">Couldn't save</span>}
      </div>
      <Stars label="Surface" value={surface} onPick={(v) => pick('s', v)} />
      <Stars label="Fun" value={fun} onPick={(v) => pick('f', v)} />
      <p className="text-[10px] text-muted-foreground mt-1">Shared without your name. Helps everyone find good roads.</p>
    </div>
  );
}
