import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Flame, MapPin, Clock, Gauge, Navigation } from 'lucide-react';
import { api } from '@/api/base44Client';
import { getInitials, formatDuration } from '@/lib/helpers';

const ago = (iso) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
};
const MODE = { toge: '峠 Tōge run', wangan: '湾岸 Wangan run' };

// Tiny line drawing of a drive (the start and end are trimmed off by the server for privacy).
function PathArt({ path }) {
  if (!path?.length) return null;
  const lats = path.map((p) => p[0]), lngs = path.map((p) => p[1]);
  const [a, b, c, d] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const k = Math.cos(((a + b) / 2) * Math.PI / 180);
  const w = Math.max((d - c) * k, 1e-4), h = Math.max(b - a, 1e-4);
  const s = 280 / Math.max(w, h);
  const pts = path.map(([la, ln]) => `${(((ln - c) * k) * s + (300 - w * s) / 2).toFixed(1)},${((b - la) * s + (300 - h * s) / 2).toFixed(1)}`).join(' ');
  return (
    <svg viewBox="0 0 300 300" className="w-full h-44 rounded-xl bg-secondary/60" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <polyline points={pts} fill="none" stroke="hsl(var(--primary))" strokeWidth="9" strokeOpacity="0.25" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={pts} fill="none" stroke="hsl(var(--primary))" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// What you and your friends have been up to: drives, build photos, meets.
export default function FeedPage() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  useEffect(() => { api.get('/feed').then((d) => setItems(d.items)).catch((e) => setError(e.message || 'Could not load the feed.')); }, []);
  const like = async (it) => {
    setItems((list) => list.map((x) => (x.id === it.id ? { ...x, liked: !it.liked, likes: x.likes + (it.liked ? -1 : 1) } : x)));
    await api.post(`/feed/${it.id}/like`, { like: !it.liked }).catch(() => {});
  };

  return (
    <div className="px-4 pt-[max(16px,env(safe-area-inset-top))] pb-6 space-y-3">
      <h1 className="text-2xl font-black text-foreground">Feed</h1>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!items && !error ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto mt-10" /> : items && !items.length ? (
        <p className="text-sm text-muted-foreground text-center py-10">Nothing yet. Add friends (Profile → Friends) and their drives, build photos and meets show up here.</p>
      ) : items?.map((it) => (
        <article key={it.id} className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <header className="flex items-center gap-3">
            <Link to={`/u/${it.user.username}`}>
              {it.user.avatarUrl ? <img src={it.user.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover" /> : <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: it.user.color || '#00BFFF' }}>{getInitials(it.user.name || it.user.username)}</div>}
            </Link>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-foreground truncate"><span className="font-bold">{it.user.name}</span> <span className="text-muted-foreground">{it.kind === 'drive' ? (it.convoy ? 'went on a group drive' : 'went for a drive') : it.kind === 'photo' ? `added a photo of the ${it.car}` : 'is hosting a meet'}</span></div>
              <div className="text-[11px] text-muted-foreground">{ago(it.at)} ago{it.kind === 'drive' && it.car ? ` · ${it.car}` : ''}</div>
            </div>
          </header>

          {it.kind === 'drive' && (
            <>
              {it.mode && <div className="text-xs font-black tracking-wide text-primary">{MODE[it.mode]}{it.corners ? ` · ${it.corners} corners` : ''}</div>}
              <PathArt path={it.path} />
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><div className="text-base font-bold speed-font text-foreground">{it.distance}</div><div className="text-[10px] text-muted-foreground">miles</div></div>
                <div><div className="text-base font-bold speed-font text-foreground">{formatDuration(it.duration)}</div><div className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5"><Clock className="w-3 h-3" />time</div></div>
                <div><div className="text-base font-bold speed-font text-foreground">{Math.round(it.topSpeed)}</div><div className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5"><Gauge className="w-3 h-3" />top mph</div></div>
              </div>
              {it.end && <div className="text-[11px] text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />Ended near {it.end}</div>}
            </>
          )}
          {it.kind === 'photo' && (
            <>
              <img src={it.url} alt={it.caption || it.car} loading="lazy" className="w-full max-h-96 object-cover rounded-xl" />
              {it.caption && <p className="text-sm text-foreground">{it.caption}</p>}
            </>
          )}
          {it.kind === 'meet' && (
            <div className="bg-secondary/60 rounded-xl p-3">
              <div className="text-base font-bold text-foreground">{it.title}</div>
              <div className="text-xs text-primary font-semibold mt-0.5">{new Date(it.starts).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
              {it.place && <div className="text-xs text-muted-foreground truncate">{it.place}</div>}
              <div className="flex gap-2 mt-2">
                <button onClick={() => navigate('/meets')} className="flex-1 h-9 rounded-xl bg-card text-xs font-semibold text-foreground">Details</button>
                <button onClick={() => navigate('/', { state: { plan: { dest: { name: it.place || it.title, lat: it.lat, lng: it.lng }, stops: [] } } })} className="flex-1 h-9 rounded-xl dz-go text-xs font-bold flex items-center justify-center gap-1"><Navigation className="w-3.5 h-3.5" />Drive there</button>
              </div>
            </div>
          )}

          <footer className="flex items-center">
            <button onClick={() => like(it)} className={`flex items-center gap-1.5 text-sm font-semibold ${it.liked ? 'text-[#ff6b35]' : 'text-muted-foreground'}`} aria-label="Like">
              <Flame className={`w-5 h-5 ${it.liked ? 'fill-[#ff6b35]' : ''}`} />{it.likes || ''}
            </button>
          </footer>
        </article>
      ))}
    </div>
  );
}
