import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { X, Loader2, Users, Lock, ChevronRight } from 'lucide-react';
import { api } from '@/api/base44Client';
import { SOCIAL_LINKS } from '@/components/ProfileSharing';
import CarPreview3D from '@/components/CarPreview3D';
import { carLook, displayMode } from '@/lib/carCatalog';
import { getInitials } from '@/lib/helpers';

// Quick look at another driver (tap their car on the map): car, specs, mods, socials, clubs.
// Only shows what they've allowed. While you're moving, it waits until you've stopped.
export default function DriverSheet({ driver, moving = false, onClose }) {
  const [p, setP] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (moving || !driver?.username) return;
    api.get(`/u/${encodeURIComponent(driver.username)}`).then(setP).catch((e) => setError(e.message || 'Could not load the profile.'));
  }, [driver?.username, moving]);

  const v = p?.car;
  const look = v ? carLook(v) : null;
  const disp = v ? displayMode(v) : null;
  const socials = Object.entries(p?.socials || {}).filter(([k, h]) => h && SOCIAL_LINKS[k]);
  const specs = v?.specs || {};

  return createPortal(
    <div className="fixed inset-0 z-[1600] bg-black/50 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-md bg-card rounded-t-3xl border-t border-border p-5 pb-8 max-h-[80vh] overflow-y-auto dz-pop-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          {driver.avatarUrl
            ? <img src={driver.avatarUrl} alt="" className="w-11 h-11 rounded-full object-cover" />
            : <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ background: driver.color || '#00BFFF' }}>{getInitials(driver.name || driver.username)}</div>}
          <div className="flex-1 min-w-0">
            <div className="text-base font-bold text-foreground truncate">{driver.name}</div>
            <div className="text-xs text-muted-foreground">@{driver.username}{driver.speed != null ? ` · ${driver.speed} mph` : ''}</div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>

        {moving ? (
          <div className="rounded-2xl bg-secondary/60 p-4 flex items-center gap-3 text-sm text-muted-foreground"><Lock className="w-4 h-4 shrink-0" />Profiles open once you've stopped. Eyes on the road.</div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !p ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4">
            {v && (
              <>
                <CarPreview3D height={170} look={{ display: disp, shape: look.shape, wheels: look.wheels, wheelColor: look.wheelColor, scoop: look.scoop, wing: look.wing, paint: v.color || '#1f5ad6', glow: look.glow, model3d: look.model3d, image: v.image_url, modelPaint: disp === 'model' ? v.paint : null }} />
                <div>
                  <div className="text-lg font-bold text-foreground">{v.year} {v.make} {v.model}</div>
                  {v.nickname && <div className="text-xs text-primary">"{v.nickname}"</div>}
                  {(specs.hp || specs.drivetrain || specs.trans || specs.engine) && (
                    <div className="text-xs text-muted-foreground mt-1">{[specs.hp && `${specs.hp} hp`, specs.torque && `${specs.torque} lb-ft`, specs.drivetrain, specs.trans, specs.engine].filter(Boolean).join(' · ')}</div>
                  )}
                </div>
              </>
            )}
            {p.mods?.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold text-muted-foreground mb-1.5">Mods</div>
                <div className="flex flex-wrap gap-1.5">{p.mods.slice(0, 12).map((m, i) => <span key={i} className="text-xs bg-secondary rounded-full px-2.5 py-1 text-foreground">{m.name}</span>)}</div>
              </div>
            )}
            {socials.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {socials.map(([k, h]) => { const S = SOCIAL_LINKS[k]; return (
                  <a key={k} href={S.url(h)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 bg-secondary rounded-full px-3 py-1.5 text-xs font-semibold text-foreground"><S.icon className="w-3.5 h-3.5 text-primary" />@{h}</a>
                ); })}
              </div>
            )}
            {p.clubs?.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap"><Users className="w-3.5 h-3.5 text-primary" />{p.clubs.map((c, i) => <span key={i} className="text-xs text-primary bg-primary/10 rounded-full px-2.5 py-0.5">{c}</span>)}</div>
            )}
            {!v && !p.mods && !socials.length && <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" />This driver keeps their profile private.</p>}
            <Link to={`/u/${driver.username}`} onClick={onClose} className="flex items-center justify-center gap-1 text-sm font-semibold text-primary pt-1">Full profile <ChevronRight className="w-4 h-4" /></Link>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
