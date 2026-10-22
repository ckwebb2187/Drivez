import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Loader2, MapPin, Users, Gauge, Route as RouteIcon, Lock, ArrowLeft } from 'lucide-react';
import { api } from '@/api/base44Client';
import { CarPic } from '@/components/GarageManager';
import { SOCIAL_LINKS } from '@/components/ProfileSharing';
import CarPhotos from '@/components/CarPhotos';
import { getInitials } from '@/lib/helpers';

// What someone sees when they scan your QR sticker or open your link.
export default function PublicProfile() {
  const { username } = useParams();
  const [sp] = useSearchParams();
  const asPublic = sp.get('as') === 'public';
  const [p, setP] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get(`/u/${encodeURIComponent(String(username).toLowerCase())}${asPublic ? '?as=public' : ''}`).then(setP).catch((e) => setError(e.message || 'Not found'));
  }, [username, asPublic]);

  if (error) return <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center"><p className="text-sm text-muted-foreground">{error}</p><Link to="/" className="text-sm text-primary">Open Kaido Maps</Link></div>;
  if (!p) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const socials = Object.entries(p.socials || {}).filter(([k, h]) => h && SOCIAL_LINKS[k]);
  const hiddenNote = !p.car && !p.mods && !socials.length && !(p.clubs || []).length && !p.stats;

  return (
    <div className="min-h-screen bg-background pb-16">
      <div className="h-40 relative" style={{ background: `linear-gradient(135deg, #0b1020 0%, ${p.car?.color || p.color || '#00BFFF'}55 100%)` }}>
        {asPublic && <div className="absolute top-[max(16px,env(safe-area-inset-top))] right-4 text-[11px] font-semibold bg-black/50 text-white rounded-full px-3 py-1.5">Preview: what strangers see</div>}
        {(p.signedIn || asPublic) && <Link to={asPublic ? '/profile' : '/'} className="absolute top-[max(16px,env(safe-area-inset-top))] left-4 w-9 h-9 rounded-full bg-black/40 flex items-center justify-center" aria-label="Back"><ArrowLeft className="w-5 h-5 text-white" /></Link>}
        {p.car && (
          <div className="absolute right-6 bottom-[-28px] w-24 h-40 rotate-90 origin-center flex items-center justify-center">
            <CarPic body={p.car.body || 'sedan'} color={p.car.color || '#00BFFF'} image={p.car.image_url} className="w-12 h-24" />
          </div>
        )}
      </div>
      <div className="px-5 -mt-10 relative">
        {p.avatarUrl
          ? <img src={p.avatarUrl} alt="" className="w-20 h-20 rounded-full object-cover border-4 border-background" />
          : <div className="w-20 h-20 rounded-full border-4 border-background flex items-center justify-center text-xl font-bold text-white" style={{ backgroundColor: p.color || '#00BFFF' }}>{getInitials(p.name || p.username)}</div>}
        <h1 className="text-xl font-bold text-foreground mt-2">{p.name}</h1>
        <p className="text-sm text-primary">@{p.username}{p.isFriend ? <span className="text-muted-foreground"> · friend</span> : null}</p>
        {p.location && <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1"><MapPin className="w-3 h-3" />{p.location}</p>}
        {p.bio && <p className="text-sm text-muted-foreground mt-2">{p.bio}</p>}
      </div>

      <div className="px-5 mt-5 space-y-4">
        {p.car && (
          <div className="bg-card rounded-2xl border border-border p-4">
            <div className="text-[11px] text-muted-foreground">Drives</div>
            <div className="text-lg font-bold text-foreground">{p.car.year} {p.car.make} {p.car.model}{p.car.charm ? ` ${p.car.charm}` : ''}</div>
            {p.car.nickname && <div className="text-xs text-primary">"{p.car.nickname}"</div>}
          </div>
        )}
        {p.car?.photos?.length > 0 && <CarPhotos photos={p.car.photos} editable={false} />}

        {p.stats && (
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-card rounded-2xl border border-border p-3"><Gauge className="w-4 h-4 text-primary mb-1" /><div className="text-lg font-bold text-foreground">{p.stats.miles.toLocaleString()}</div><div className="text-[11px] text-muted-foreground">miles logged</div></div>
            <div className="bg-card rounded-2xl border border-border p-3"><RouteIcon className="w-4 h-4 text-primary mb-1" /><div className="text-lg font-bold text-foreground">{p.stats.drives.toLocaleString()}</div><div className="text-[11px] text-muted-foreground">drives</div></div>
          </div>
        )}

        {p.mods && p.mods.length > 0 && (
          <div className="bg-card rounded-2xl border border-border p-4">
            <h3 className="text-sm font-bold text-foreground mb-2">Mods</h3>
            <div className="space-y-1.5">
              {p.mods.map((m, i) => (
                <div key={i} className="flex items-baseline gap-2">
                  <span className="text-sm text-foreground">{m.name}</span>
                  <span className="text-[11px] text-muted-foreground">{m.category}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {socials.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {socials.map(([k, h]) => {
              const S = SOCIAL_LINKS[k];
              return (
                <a key={k} href={S.url(h)} target="_blank" rel="noopener noreferrer" className="bg-card rounded-2xl border border-border p-3 flex items-center gap-2">
                  <S.icon className="w-5 h-5 text-primary" />
                  <div className="min-w-0"><div className="text-[11px] text-muted-foreground">{S.label}</div><div className="text-sm font-semibold text-foreground truncate">@{h}</div></div>
                </a>
              );
            })}
          </div>
        )}

        {(p.clubs || []).length > 0 && (
          <div className="bg-card rounded-2xl border border-border p-4">
            <h3 className="text-sm font-bold text-foreground mb-2 flex items-center gap-1.5"><Users className="w-4 h-4 text-primary" />Clubs & crews</h3>
            <div className="flex flex-wrap gap-1.5">{p.clubs.map((c, i) => <span key={i} className="text-xs bg-primary/10 text-primary rounded-full px-2.5 py-1">{c}</span>)}</div>
          </div>
        )}

        {hiddenNote && <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" />{p.isMe ? 'Everything is hidden from strangers. Change it in Profile → Driver profile.' : 'This driver keeps their profile private.'}</p>}

        {!p.signedIn && !asPublic && (
          <Link to="/register" className="block w-full text-center bg-primary text-primary-foreground rounded-xl py-3 text-sm font-semibold mt-4">Join Kaido Maps</Link>
        )}
      </div>
    </div>
  );
}
