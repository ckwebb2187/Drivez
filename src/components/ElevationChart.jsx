import { useEffect, useState } from 'react';
import { Mountain } from 'lucide-react';
import { distM } from '@/lib/nav';

// Hills along a planned route. Samples ~50 points and asks the free Open-Meteo elevation API.
// Drawn as a small SVG (no chart library) so it stays light.
const cache = new Map();

async function elevationsFor(coords) {
  const n = Math.min(50, coords.length);
  const pts = Array.from({ length: n }, (_, i) => coords[Math.round((i * (coords.length - 1)) / Math.max(1, n - 1))]);
  const key = pts.map(([a, b]) => `${a.toFixed(3)},${b.toFixed(3)}`).join(';');
  if (cache.has(key)) return cache.get(key);
  const lat = pts.map((p) => p[0].toFixed(5)).join(',');
  const lng = pts.map((p) => p[1].toFixed(5)).join(',');
  const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`);
  const data = await res.json();
  if (!Array.isArray(data.elevation)) throw new Error('no elevation');
  // Distance along the route for each sample, so the x axis is true to scale.
  let d = 0;
  const out = pts.map((p, i) => { if (i) d += distM(pts[i - 1], p); return { d, e: data.elevation[i] }; });
  cache.set(key, out);
  return out;
}

export default function ElevationChart({ coords, metric = false }) {
  const [pts, setPts] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!coords?.length) return;
    let off = false;
    setPts(null); setErr(false);
    elevationsFor(coords).then((p) => !off && setPts(p)).catch(() => !off && setErr(true));
    return () => { off = true; };
  }, [coords]);

  if (err || !coords?.length) return null;
  const unit = metric ? 'm' : 'ft';
  const conv = (m) => Math.round(metric ? m : m * 3.281);
  if (!pts) return <div className="mt-3 h-[74px] rounded-2xl bg-secondary/50 animate-pulse" />;

  const es = pts.map((p) => p.e);
  const lo = Math.min(...es), hi = Math.max(...es);
  const span = Math.max(10, hi - lo);
  const total = pts[pts.length - 1].d || 1;
  let climb = 0;
  for (let i = 1; i < es.length; i++) if (es[i] > es[i - 1]) climb += es[i] - es[i - 1];
  const W = 300, H = 48;
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${((p.d / total) * W).toFixed(1)},${(H - ((p.e - lo) / span) * (H - 4) - 2).toFixed(1)}`).join(' ');

  return (
    <div className="mt-3 rounded-2xl bg-secondary/50 px-3 pt-2 pb-2">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
        <Mountain className="w-3.5 h-3.5" />
        <span className="font-semibold text-foreground">Elevation</span>
        <span className="ml-auto">↑ {conv(climb)} {unit} climb · {conv(lo)}–{conv(hi)} {unit}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-12" aria-label="Elevation profile">
        <defs>
          <linearGradient id="dz-elev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.45" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${line} L${W},${H} L0,${H} Z`} fill="url(#dz-elev)" />
        <path d={line} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
