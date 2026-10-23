import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Radar, X, Navigation } from 'lucide-react';
import { distM, formatNavDistance } from '@/lib/nav';

const MAX_MI = 50; // edge of the radar
const RINGS = [1, 5, 20];
const toRad = (d) => (d * Math.PI) / 180;
function bearing(a, b) {
  const y = Math.sin(toRad(b[1] - a[1])) * Math.cos(toRad(b[0]));
  const x = Math.cos(toRad(a[0])) * Math.sin(toRad(b[0])) - Math.sin(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.cos(toRad(b[1] - a[1]));
  return (Math.atan2(y, x) * 180) / Math.PI;
}
// Distance is drawn on a log scale so close things spread out and far things still fit.
const radius = (mi, R) => (R * Math.log1p(Math.min(mi, MAX_MI))) / Math.log1p(MAX_MI);
const when = (iso) => {
  const h = (new Date(iso).getTime() - Date.now()) / 3600000;
  if (h < -1) return 'happening now';
  if (h < 1) return h < 0 ? 'starting now' : `in ${Math.max(1, Math.round(h * 60))} min`;
  if (h < 24) return `in ${Math.round(h)} h`;
  return new Date(iso).toLocaleDateString([], { weekday: 'short', hour: 'numeric' });
};

// "Meet radar": upcoming meets, friends driving now and your group drive around you.
export default function MeetRadar({ here, heading = null, meets = [], friends = [], convoy = null, onDrive, onDriver, className = '' }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(null);
  const blips = useMemo(() => {
    if (!here) return [];
    const out = [];
    for (const m of meets) out.push({ id: `m${m.id}`, kind: 'meet', label: m.title, sub: `${when(m.starts)} · ${m.place || 'meet'}`, lat: m.lat, lng: m.lng, soon: new Date(m.starts) - Date.now() < 3 * 3600000, raw: m });
    const group = new Set((convoy?.members || []).map((m) => m.id));
    for (const f of friends) out.push({ id: `f${f.userId}`, kind: group.has(f.userId) ? 'group' : 'friend', label: f.name, sub: `${f.speed || 0} mph`, lat: f.lat, lng: f.lng, raw: f, color: f.color });
    return out.map((b) => ({ ...b, mi: distM(here, [b.lat, b.lng]) / 1609.34, brg: bearing(here, [b.lat, b.lng]) })).sort((a, b) => a.mi - b.mi);
  }, [here, meets, friends, convoy]);
  const near = blips.filter((b) => b.mi <= MAX_MI);
  const up = heading != null ? heading : 0; // heading-up while driving, north-up otherwise
  const R = 130;
  const icon = { meet: '🏁', friend: '🚗', group: '👥' };
  const cur = blips.find((b) => b.id === sel);

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Meet radar"
        className={`relative h-11 pl-3 pr-3.5 rounded-full shadow-xl border bg-card/95 backdrop-blur border-border text-foreground flex items-center gap-1.5 text-xs font-bold pointer-events-auto ${className}`}>
        <Radar className="w-4 h-4 text-primary" />Radar{near.length ? <span className="opacity-80">· {near.length}</span> : null}
        {near.some((b) => b.kind === 'meet' && b.soon) && <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-primary border-2 border-background animate-pulse" />}
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[1550] bg-black/60 flex items-end justify-center" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-card rounded-t-3xl border-t border-border pb-[max(16px,env(safe-area-inset-bottom))] dz-pop-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 pt-4">
              <div><div className="text-base font-black text-foreground">Meet radar</div><div className="text-[11px] text-muted-foreground">Meets, friends driving and your group within {MAX_MI} mi{heading != null ? ' · your direction is up' : ' · north is up'}</div></div>
              <button onClick={() => setOpen(false)} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center" aria-label="Close"><X className="w-4 h-4" /></button>
            </div>

            <div className="flex justify-center py-4">
              <div className="relative" style={{ width: R * 2 + 20, height: R * 2 + 20 }}>
                <svg viewBox={`${-R - 10} ${-R - 10} ${R * 2 + 20} ${R * 2 + 20}`} className="absolute inset-0 w-full h-full">
                  <circle r={R} fill="hsl(var(--primary) / 0.06)" stroke="hsl(var(--primary) / 0.5)" strokeWidth="1.5" />
                  {RINGS.map((mi) => (
                    <g key={mi}>
                      <circle r={radius(mi, R)} fill="none" stroke="hsl(var(--primary) / 0.25)" strokeDasharray="3 4" />
                      <text x="3" y={-radius(mi, R) - 3} fontSize="9" fill="hsl(var(--muted-foreground))">{mi} mi</text>
                    </g>
                  ))}
                  <line x1={-R} x2={R} y1="0" y2="0" stroke="hsl(var(--primary) / 0.15)" />
                  <line y1={-R} y2={R} x1="0" x2="0" stroke="hsl(var(--primary) / 0.15)" />
                  <circle r="5" fill="hsl(var(--primary))" />
                </svg>
                {/* sweep */}
                <div className="absolute rounded-full pointer-events-none dz-radar-sweep" style={{ left: 10, top: 10, width: R * 2, height: R * 2 }} />
                {near.map((b) => {
                  const a = toRad(b.brg - up), r = radius(b.mi, R);
                  const x = R + 10 + Math.sin(a) * r, y = R + 10 - Math.cos(a) * r;
                  return (
                    <button key={b.id} onClick={() => setSel(b.id)} className={`absolute -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-base ${sel === b.id ? 'ring-2 ring-primary' : ''} ${b.kind === 'meet' && b.soon ? 'animate-pulse' : ''}`}
                      style={{ left: x, top: y, background: b.kind === 'meet' ? 'hsl(var(--primary) / 0.25)' : 'hsl(var(--card))', boxShadow: '0 0 10px hsl(var(--primary) / 0.5)' }} aria-label={b.label}>
                      {icon[b.kind]}
                    </button>
                  );
                })}
              </div>
            </div>

            {cur && (
              <div className="mx-4 mb-3 rounded-2xl border border-primary bg-primary/10 p-3 flex items-center gap-3">
                <div className="text-2xl">{icon[cur.kind]}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-foreground truncate">{cur.label}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{formatNavDistance(cur.mi * 1609.34)} · {cur.sub}</div>
                </div>
                {cur.kind === 'meet'
                  ? <button onClick={() => { setOpen(false); onDrive?.({ name: cur.raw.place || cur.label, lat: cur.lat, lng: cur.lng }); }} className="h-9 px-3 rounded-full dz-go text-xs font-bold flex items-center gap-1"><Navigation className="w-3.5 h-3.5" />Go</button>
                  : <button onClick={() => { setOpen(false); onDriver?.(cur.raw); }} className="h-9 px-3 rounded-full bg-secondary text-xs font-bold text-foreground">Profile</button>}
              </div>
            )}

            <div className="px-4 space-y-1.5">
              {!here ? <p className="text-sm text-muted-foreground text-center py-4">Waiting for your location…</p>
                : !blips.length ? <p className="text-sm text-muted-foreground text-center py-4">Nothing nearby yet. Post a meet in the Meets tab, or add friends to see them here.</p>
                : blips.slice(0, 20).map((b) => (
                  <button key={b.id} onClick={() => setSel(b.id)} className={`w-full flex items-center gap-3 rounded-xl px-3 py-2 text-left ${sel === b.id ? 'bg-primary/10' : 'bg-secondary/40'}`}>
                    <span className="text-lg">{icon[b.kind]}</span>
                    <span className="flex-1 min-w-0"><span className="block text-sm font-semibold text-foreground truncate">{b.label}</span><span className="block text-[11px] text-muted-foreground truncate">{b.sub}</span></span>
                    <span className="text-xs font-semibold text-muted-foreground speed-font">{formatNavDistance(b.mi * 1609.34)}</span>
                  </button>
                ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
