import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Wrench, Cpu, QrCode, Users, Sparkles, Hand, Paintbrush, ChevronDown, Shuffle } from 'lucide-react';
import { useApp } from '@/lib/AppContext';
import GarageBay3D from '@/components/GarageBay3D';
import VehicleDetail from '@/components/VehicleDetail';
import ProfileSharing, { QrSheet, profileUrl, SOCIAL_LINKS } from '@/components/ProfileSharing';
import { carLook, displayMode } from '@/lib/carCatalog';
import { odometer } from '@/lib/maintenance';
import { WALL_STYLES, WALL_COLORS, MOD_BRANDS, FLOORS, FLOOR_COLORS, LIGHTS, NEON_COLORS, EFFECTS, GRAFFITI, CAR_TYPES, GARAGE_PRESETS, useGarageLook, setGarageLook } from '@/lib/garageLook';

// The theme's accent color as something three.js understands.
const accentColor = () => {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(); // "330 100% 59%"
  const [h, s, l] = v.split(/\s+/);
  return h ? `hsl(${h}, ${s}, ${l})` : '#00e5ff';
};

// "GARAGE" pull-tab on the right edge of the map (like the design boards).
// Slide-out garage over the live map: 3D showroom + quick actions.
export default function GarageDrawer({ open, onClose }) {
  const { user, vehicles, activeVehicle, trips, setPrimaryVehicle } = useApp();
  const garage = useGarageLook();
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
                <GarageBay3D look={look} accent={accentColor()} socials={socials} qrUrl={user ? profileUrl(user.username) : null} height={330} onProp={onProp} make={v.make || ''} carModel={v.model || ''} garage={garage} />
                {hint && <div className="absolute left-2 bottom-2 right-2 text-[10px] text-white/80 bg-black/50 rounded-lg px-2 py-1 flex items-center gap-1.5 pointer-events-none"><Hand className="w-3 h-3" />Drag to look around. Tap the tool chest, engine, QR sign or the social wall.</div>}
              </div>
              <GarageLookControls make={v.make} />
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

// Garage look: presets, floor, walls, lighting, effects, graffiti and banners, each folded away.
// Banners are brand names in brand-ish colors (text only, no logos).
function GarageLookControls({ make }) {
  const g = useGarageLook();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(g.grafText || 'KAIDO');
  const Chip = ({ on, onClick, children }) => (
    <button onClick={onClick} className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary text-foreground border-border'}`}>{children}</button>
  );
  const Dot = ({ hex, on, onClick }) => (
    <button onClick={onClick} aria-label={hex} className={`w-7 h-7 rounded-full border-2 ${on ? 'border-primary scale-110' : 'border-white/20'}`} style={{ background: hex, boxShadow: on ? `0 0 8px ${hex}` : undefined }} />
  );
  const Label = ({ children }) => <div className="text-[11px] font-bold text-muted-foreground tracking-wider mb-1.5">{children}</div>;
  const toggleIn = (key, id, max) => setGarageLook((p) => {
    const cur = p[key] || [];
    return { [key]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(-max) };
  });
  const fxOn = EFFECTS.filter((x) => g.fx?.[x.id]).length;
  const surprise = () => {
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    setGarageLook({
      wall: pick(WALL_STYLES).id, color: pick(WALL_COLORS).id, customWall: '', floor: pick(FLOORS).id, floorColor: pick(FLOOR_COLORS).id, floorColor2: pick(FLOOR_COLORS).id,
      light: pick(LIGHTS).id, neon: pick(NEON_COLORS), graffiti: pick(GRAFFITI).id,
      fx: Object.fromEntries(EFFECTS.filter(() => Math.random() < 0.3).map((x) => [x.id, true])),
      types: CAR_TYPES.filter(() => Math.random() < 0.25).map((x) => x.id).slice(0, 2), flags: Math.random() < 0.4,
    });
  };
  return (
    <div className="rounded-2xl border border-border bg-card">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-2.5 text-left">
        <Paintbrush className="w-4 h-4 text-primary" />
        <span className="flex-1 text-sm font-semibold text-foreground">Garage look</span>
        <span className="text-[11px] text-muted-foreground">Floor, walls, lights, effects</span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          <Fold title="PRESETS" hint="One-tap garages" start>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={surprise} className="px-3 py-1.5 rounded-full text-xs font-bold bg-primary text-primary-foreground flex items-center gap-1"><Shuffle className="w-3.5 h-3.5" />Surprise me</button>
              {GARAGE_PRESETS.map((x) => <Chip key={x.name} onClick={() => setGarageLook(x.p)}>{x.name}</Chip>)}
            </div>
          </Fold>
          <Fold title="FLOOR" hint={FLOORS.find((f) => f.id === g.floor)?.title}>
            <div className="flex flex-wrap gap-1.5">{FLOORS.map((f) => <Chip key={f.id} on={g.floor === f.id} onClick={() => setGarageLook({ floor: f.id })}>{f.title}</Chip>)}</div>
            <div><Label>COLOR</Label><div className="flex flex-wrap gap-2">{FLOOR_COLORS.map((c) => <Dot key={c.id} hex={c.hex} on={g.floorColor === c.id} onClick={() => setGarageLook({ floorColor: c.id })} />)}</div></div>
            {['checker', 'racedeck', 'resin'].includes(g.floor) && (
              <div><Label>SECOND COLOR</Label><div className="flex flex-wrap gap-2">{FLOOR_COLORS.map((c) => <Dot key={c.id} hex={c.hex} on={g.floorColor2 === c.id} onClick={() => setGarageLook({ floorColor2: c.id })} />)}</div></div>
            )}
          </Fold>
          <Fold title="WALLS" hint={WALL_STYLES.find((w) => w.id === g.wall)?.title}>
            <div className="flex flex-wrap gap-1.5">{WALL_STYLES.map((w) => <Chip key={w.id} on={g.wall === w.id} onClick={() => setGarageLook({ wall: w.id })}>{w.title}</Chip>)}</div>
            <div>
              <Label>COLOR</Label>
              <div className="flex flex-wrap items-center gap-2">
                {WALL_COLORS.map((c) => <Dot key={c.id} hex={c.hex} on={!g.customWall && g.color === c.id} onClick={() => setGarageLook({ color: c.id, customWall: '' })} />)}
                <label className="text-[11px] text-muted-foreground flex items-center gap-1">Custom <input type="color" value={g.customWall || '#23242b'} onChange={(e) => setGarageLook({ customWall: e.target.value })} className="w-7 h-7 rounded-full bg-transparent" /></label>
              </div>
            </div>
          </Fold>
          <Fold title="LIGHTING" hint={LIGHTS.find((l) => l.id === g.light)?.title}>
            <div className="flex flex-wrap gap-1.5">{LIGHTS.map((l) => <Chip key={l.id} on={g.light === l.id} onClick={() => setGarageLook({ light: l.id })}>{l.title}</Chip>)}</div>
            <div><Label>BRIGHTNESS</Label><div className="flex gap-1.5">{['Dim', 'Normal', 'Bright'].map((l, i) => <Chip key={l} on={(g.bright ?? 1) === i} onClick={() => setGarageLook({ bright: i })}>{l}</Chip>)}</div></div>
            <div><Label>NEON COLOR</Label><div className="flex flex-wrap gap-2"><Chip on={!g.neon} onClick={() => setGarageLook({ neon: '' })}>App color</Chip>{NEON_COLORS.map((c) => <Dot key={c} hex={c} on={g.neon === c} onClick={() => setGarageLook({ neon: c })} />)}</div></div>
            <div><Label>SHADOWS</Label><div className="flex gap-1.5">{[['off', 'Off'], ['soft', 'Soft'], ['sharp', 'Sharp']].map(([id, l]) => <Chip key={id} on={(g.shadows || 'off') === id} onClick={() => setGarageLook({ shadows: id })}>{l}</Chip>)}</div></div>
          </Fold>
          <Fold title="EFFECTS" hint={fxOn ? `${fxOn} on` : 'Off'}>
            <p className="text-[11px] text-muted-foreground">Mix and match. Paused in battery saver.</p>
            <div className="flex flex-wrap gap-1.5">{EFFECTS.map((x) => <Chip key={x.id} on={!!g.fx?.[x.id]} onClick={() => setGarageLook((p) => ({ fx: { ...p.fx, [x.id]: !p.fx?.[x.id] } }))}>{x.title}</Chip>)}</div>
          </Fold>
          <Fold title="GRAFFITI" hint={GRAFFITI.find((x) => x.id === (g.graffiti || 'off'))?.title}>
            <div className="flex flex-wrap gap-1.5">{GRAFFITI.map((x) => <Chip key={x.id} on={(g.graffiti || 'off') === x.id} onClick={() => setGarageLook({ graffiti: x.id })}>{x.title}</Chip>)}</div>
            <label className="block">
              <Label>YOUR WORD</Label>
              <input value={text} maxLength={10} onChange={(e) => setText(e.target.value)} onBlur={() => setGarageLook({ grafText: text })}
                className="w-full bg-secondary rounded-lg px-3 h-10 text-sm outline-none" placeholder="KAIDO" />
            </label>
          </Fold>
          <Fold title="BANNERS" hint={`${(g.mods || []).length + (g.types || []).length} up`}>
            <div className="flex flex-wrap gap-1.5">
              {make && <Chip on={g.makeBanner !== false} onClick={() => setGarageLook({ makeBanner: g.makeBanner === false })}>{make} banner</Chip>}
              <Chip on={!!g.flags} onClick={() => setGarageLook({ flags: !g.flags })}>Checkered flags</Chip>
            </div>
            <div><Label>CAR TYPE</Label><div className="flex flex-wrap gap-1.5">{CAR_TYPES.map((b) => <Chip key={b.id} on={(g.types || []).includes(b.id)} onClick={() => toggleIn('types', b.id, 3)}>{b.name}</Chip>)}</div></div>
            <div><Label>MOD BRANDS (UP TO 6)</Label><div className="flex flex-wrap gap-1.5">{MOD_BRANDS.map((b) => <Chip key={b.id} on={(g.mods || []).includes(b.id)} onClick={() => toggleIn('mods', b.id, 6)}>{b.name}</Chip>)}</div></div>
          </Fold>
        </div>
      )}
    </div>
  );
}

function Fold({ title, hint, start = false, children }) {
  const [open, setOpen] = useState(start);
  return (
    <div className="rounded-xl border border-border bg-secondary/40">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-2 text-left">
        <span className="flex-1 text-xs font-bold tracking-wider text-foreground">{title}</span>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-3 pb-3 space-y-2.5">{children}</div>}
    </div>
  );
}
