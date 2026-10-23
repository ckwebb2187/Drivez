import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Wrench, Cpu, QrCode, Users, ChevronLeft, Sparkles, Hand } from 'lucide-react';
import { useApp } from '@/lib/AppContext';
import GarageBay3D from '@/components/GarageBay3D';
import VehicleDetail from '@/components/VehicleDetail';
import ProfileSharing, { QrSheet, profileUrl, SOCIAL_LINKS } from '@/components/ProfileSharing';
import { carLook, displayMode } from '@/lib/carCatalog';
import { odometer } from '@/lib/maintenance';

// The theme's accent color as something three.js understands.
const accentColor = () => {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(); // "330 100% 59%"
  const [h, s, l] = v.split(/\s+/);
  return h ? `hsl(${h}, ${s}, ${l})` : '#00e5ff';
};

// "GARAGE" pull-tab on the right edge of the map (like the design boards).
export function GarageTab({ onOpen }) {
  return (
    <button onClick={onOpen} aria-label="Open garage"
      className="pointer-events-auto absolute right-0 top-1/2 -translate-y-1/2 z-20 bg-card/95 backdrop-blur border border-r-0 border-border rounded-l-xl shadow-xl py-3 pl-1 pr-1.5 flex flex-col items-center gap-1 text-primary">
      <ChevronLeft className="w-3.5 h-3.5" />
      <span className="text-[10px] font-black tracking-[0.2em]" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>GARAGE</span>
    </button>
  );
}

// Slide-out garage over the live map: 3D showroom + quick actions.
export default function GarageDrawer({ open, onClose }) {
  const { user, vehicles, activeVehicle, trips, setPrimaryVehicle } = useApp();
  const [carId, setCarId] = useState(activeVehicle?.id);
  const [detail, setDetail] = useState(null); // vehicle shown in the full car page
  const [qr, setQr] = useState(false);
  const [social, setSocial] = useState(false);
  const [hint, setHint] = useState(true);
  useEffect(() => { if (open) setCarId(activeVehicle?.id); }, [open, activeVehicle?.id]);
  if (!open) return null;
  const v = vehicles.find((x) => x.id === carId) || activeVehicle;
  const L = v ? carLook(v) : null;
  const disp = v ? displayMode(v) : null;
  const look = v ? { display: disp, shape: L.shape, wheels: L.wheels, wheelColor: L.wheelColor, scoop: L.scoop, wing: L.wing, paint: v.color || '#1f5ad6', glow: L.glow, model3d: L.model3d, style: L.style, image: v.image_url || null, modelPaint: disp === 'model' ? v.paint || null : null } : null;
  const socials = { ...(user?.profile?.socials || {}) };
  const odo = v ? odometer(v, trips) : null;

  const onProp = (p) => {
    setHint(false);
    if (p === 'chest' || p === 'car' || p === 'engine') setDetail(v);
    if (p === 'qr') setQr(true);
    if (p === 'social') setSocial(true);
  };

  return createPortal(
    <div className="fixed inset-0 z-[1550] flex justify-end bg-black/40" onClick={onClose}>
      <div className="h-full w-[min(94vw,440px)] bg-background border-l border-border shadow-2xl flex flex-col dz-slide-in" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 pt-[max(14px,env(safe-area-inset-top))] pb-2 flex items-center gap-2">
          <h2 className="flex-1 text-lg font-black tracking-wide text-foreground">GARAGE</h2>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center" aria-label="Close garage"><X className="w-4 h-4" /></button>
        </div>

        {vehicles.length > 1 && (
          <div className="px-4 pb-2 flex gap-1.5 overflow-x-auto no-scrollbar">
            {vehicles.map((x) => (
              <button key={x.id} onClick={() => setCarId(x.id)} className={`shrink-0 text-xs px-3 py-1.5 rounded-full ${x.id === v?.id ? 'bg-primary text-primary-foreground font-semibold' : 'bg-secondary text-muted-foreground'}`}>
                {x.nickname || `${x.make} ${x.model}`}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-3">
          {v ? (
            <>
              <div className="relative">
                <GarageBay3D look={look} accent={accentColor()} socials={socials} qrUrl={user ? profileUrl(user.username) : null} height={330} onProp={onProp} />
                {hint && <div className="absolute left-2 bottom-2 right-2 text-[10px] text-white/80 bg-black/50 rounded-lg px-2 py-1 flex items-center gap-1.5 pointer-events-none"><Hand className="w-3 h-3" />Drag to look around. Tap the tool chest, engine, QR sign or the social wall.</div>}
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-base font-bold text-foreground">{v.year} {v.make} {v.model}{L.charm ? ` ${L.charm}` : ''}</div>
                  <div className="text-[11px] text-muted-foreground">{v.nickname ? `"${v.nickname}" · ` : ''}{odo != null ? `${odo.toLocaleString()} mi` : 'Set your odometer'}{(v.mods || []).length ? ` · ${v.mods.length} mods` : ''}</div>
                </div>
                {activeVehicle?.id !== v.id
                  ? <button onClick={() => setPrimaryVehicle(v.id)} className="text-[11px] font-bold text-primary bg-primary/10 rounded-full px-3 py-1.5">Drive this</button>
                  : <span className="text-[11px] font-bold text-accent bg-accent/10 rounded-full px-3 py-1.5">Driving</span>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Action icon={Sparkles} title="Build & look" text="Paint, wheels, underglow" onClick={() => setDetail(v)} />
                <Action icon={Wrench} title="Mods & service" text="Build list, reminders" onClick={() => setDetail(v)} />
                <Action icon={Cpu} title="Specs" text="Power, drivetrain, engine" onClick={() => setDetail(v)} />
                <Action icon={QrCode} title="Window sticker" text="QR to your profile" onClick={() => setQr(true)} />
              </div>
              <button onClick={() => setSocial(true)} className="w-full bg-card rounded-2xl border border-border px-4 py-3 flex items-center gap-3 text-left">
                <Users className="w-4 h-4 text-primary" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground">Social wall</div>
                  <div className="text-[11px] text-muted-foreground truncate">{Object.keys(socials).length ? Object.entries(socials).map(([k, h]) => `${SOCIAL_LINKS[k]?.label || k} @${h}`).join(' · ') : 'Link Instagram, X, TikTok, YouTube, Facebook to light up the signs'}</div>
                </div>
              </button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground py-10 text-center">Add a car in Profile → Garage to fill your bay.</p>
          )}
        </div>
      </div>

      {detail && <div onClick={(e) => e.stopPropagation()}><VehicleDetail vehicle={detail} onClose={() => setDetail(null)} /></div>}
      {qr && user && <div onClick={(e) => e.stopPropagation()}><QrSheet username={user.username} name={user.displayName} onClose={() => setQr(false)} /></div>}
      {social && (
        <div className="fixed inset-0 z-[1600] bg-black/60 flex items-end justify-center" onClick={(e) => { e.stopPropagation(); setSocial(false); }}>
          <div className="w-full max-w-md max-h-[85vh] overflow-y-auto bg-background rounded-t-3xl p-4 pb-8" onClick={(e) => e.stopPropagation()}>
            <ProfileSharing />
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}

function Action({ icon: Icon, title, text, onClick }) {
  return (
    <button onClick={onClick} className="bg-card rounded-2xl border border-border p-3 text-left">
      <Icon className="w-4 h-4 text-primary mb-1" />
      <div className="text-sm font-semibold text-foreground leading-tight">{title}</div>
      <div className="text-[10px] text-muted-foreground leading-tight">{text}</div>
    </button>
  );
}
