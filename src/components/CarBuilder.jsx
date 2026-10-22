import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Check, ChevronDown } from 'lucide-react';
import CarPreview3D from '@/components/CarPreview3D';
import CarPictureEditor from '@/components/CarPictureEditor';
import { CATALOG, MAKES, SHAPES, WHEELS, WHEEL_COLORS, guessCatalog, carLook, displayMode } from '@/lib/carCatalog';
import { CAR_MODELS } from '@/lib/carModels';

// Same lists the 3D car uses (kept here so the garage doesn't load three.js just for labels).
const FINISHES = [['metallic', 'Metallic'], ['gloss', 'Gloss'], ['matte', 'Matte'], ['pearl', 'Pearl'], ['chrome', 'Chrome']];
const LIGHTS = [['stock', 'Stock'], ['led', 'LED'], ['halo', 'Halo rings'], ['yellow', 'JDM yellow']];
const DECALS = [['none', 'None'], ['stripes', 'Stripes'], ['rising', 'Rising sun'], ['number', 'Race number'], ['checker', 'Checkers'], ['flames', 'Flames'], ['sakura', 'Sakura']];
const PULSES = [['off', 'Steady'], ['breathe', 'Breathe'], ['strobe', 'Strobe'], ['rainbow', 'Rainbow']];
const DECAL_COLORS = ['#ffffff', '#111214', '#ff2d55', '#00e5ff', '#ffd400', '#ff8a3d', '#ff8fb3', '#39ff14'];
export const CHARMS = ['🌸', '🔰', '🎲', '🦊', '🐉', '🍥', '⭐', '🍀', '💀', '🧿', '🐱', '🎌'];

const PAINTS = ['#1f4fbf', '#0b3d91', '#e8e8ea', '#111214', '#7a7f87', '#c1121f', '#ff6b00', '#ffd400', '#2f9e44', '#6a3cbc', '#ff4fa3', '#00bcd4'];
const GLOWS = ['#00e5ff', '#ff2d95', '#7c4dff', '#39ff14', '#ff3b30', '#ffffff', '#ffb300'];
const field = 'w-full bg-secondary rounded-xl px-3 py-2.5 text-sm text-foreground border border-border focus:border-primary outline-none';
const Chips = ({ items, value, onPick, cols = 'grid-cols-3' }) => (
  <div className={`grid ${cols} gap-1.5`}>
    {items.map(([k, l]) => <button key={k} onClick={() => onPick(k)} className={`text-xs py-2 rounded-lg border ${value === k ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border text-muted-foreground'}`}>{l}</button>)}
  </div>
);
const Label = ({ children }) => <div className="text-[11px] font-semibold text-muted-foreground mb-1.5">{children}</div>;
const Toggle = ({ on }) => (
  <span className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${on ? 'bg-[#34A853]' : 'bg-muted'}`}>
    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
  </span>
);
const Swatch = ({ color, on, onClick, label }) => (
  <button onClick={onClick} aria-label={label || color} className={`w-8 h-8 rounded-full shrink-0 border-2 transition-transform ${on ? 'border-white scale-110' : 'border-transparent'}`} style={{ background: color }} />
);

// Garage car builder: pick the car, how it shows on the map, paint, wheels, underglow and specs.
export default function CarBuilder({ vehicle: v, save }) {
  const look = carLook(v);
  const display = displayMode(v);
  const cat = guessCatalog(v);
  const [picEditor, setPicEditor] = useState(false);
  const [carOpen, setCarOpen] = useState(false);
  const [make, setMake] = useState(cat?.make || v.make || MAKES[0]);
  const [specsOpen, setSpecsOpen] = useState(false);

  // Paint picker: show the color right away, save once you stop dragging.
  const [paint, setPaint] = useState(v.color || '#1f5ad6');
  useEffect(() => setPaint(v.color || '#1f5ad6'), [v.color]);
  const paintTimer = useRef(null);
  const setPaintSoon = (c) => {
    setPaint(c);
    clearTimeout(paintTimer.current);
    paintTimer.current = setTimeout(() => save({ color: c, ...(display === 'model' ? { paint: c } : {}) }), 400);
  };
  const [glowColor, setGlowColor] = useState(v.glow_color || '#00e5ff');
  const glowTimer = useRef(null);
  const setGlowSoon = (c) => { setGlowColor(c); clearTimeout(glowTimer.current); glowTimer.current = setTimeout(() => save({ glow_on: true, glow_color: c }), 400); };

  const pickCatalog = (c) => {
    const year = Math.min(Math.max(+v.year || c.years[1], c.years[0]), c.years[1]);
    save({ catalog_id: c.id, make: c.make, model: c.model, year, shape: c.shape, scoop: null, wing: null, model3d: c.model3d || v.model3d || null });
    setCarOpen(false);
  };
  const years = cat ? Array.from({ length: cat.years[1] - cat.years[0] + 1 }, (_, i) => cat.years[1] - i) : [];
  const preview = { display, shape: look.shape, wheels: look.wheels, wheelColor: look.wheelColor, scoop: look.scoop, wing: look.wing, paint, glow: v.glow_on === false ? null : v.glow_color ? glowColor : undefined, model3d: look.model3d, style: look.style, image: v.image_url || null, modelPaint: display === 'model' ? (v.paint || null) : null };
  const specs = v.specs || {};
  const setSpec = (k, val) => save({ specs: { ...specs, [k]: val } });

  return (
    <section className="space-y-4">
      <CarPreview3D look={preview} />

      {/* The car */}
      <div className="bg-card rounded-2xl border border-border">
        <button onClick={() => setCarOpen((o) => !o)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-muted-foreground">Car</div>
            <div className="text-sm font-semibold text-foreground truncate">{v.year} {v.make} {v.model}{!cat && <span className="text-muted-foreground font-normal"> · pick from the list for the right shape</span>}</div>
          </div>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${carOpen ? 'rotate-180' : ''}`} />
        </button>
        {carOpen && (
          <div className="px-4 pb-4 space-y-3">
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {MAKES.map((m) => (
                <button key={m} onClick={() => setMake(m)} className={`shrink-0 text-xs px-3 py-1.5 rounded-full ${make === m ? 'bg-primary text-primary-foreground font-semibold' : 'bg-secondary text-muted-foreground'}`}>{m}</button>
              ))}
            </div>
            <div className="divide-y divide-border bg-secondary/40 rounded-xl">
              {CATALOG.filter((c) => c.make === make).map((c) => (
                <button key={c.id} onClick={() => pickCatalog(c)} className="w-full flex items-center gap-2 px-3 py-2.5 text-left">
                  <span className="flex-1 text-sm text-foreground">{c.model}</span>
                  <span className="text-[11px] text-muted-foreground">{c.years[0]}–{c.years[1]}</span>
                  {cat?.id === c.id && <Check className="w-4 h-4 text-primary" />}
                </button>
              ))}
            </div>
            <div>
              <Label>Not listed? Pick the closest shape</Label>
              <div className="grid grid-cols-5 gap-1.5">
                {SHAPES.map((sh) => (
                  <button key={sh.key} onClick={() => save({ shape: sh.key, catalog_id: null })} className={`text-[11px] py-2 rounded-lg border ${look.shape === sh.key ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border text-muted-foreground'}`}>{sh.label}</button>
                ))}
              </div>
            </div>
          </div>
        )}
        {cat && years.length > 1 && (
          <div className="px-4 pb-3 flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Year</span>
            <select value={v.year || ''} onChange={(e) => save({ year: +e.target.value })} className="bg-secondary rounded-lg px-2 py-1 text-sm text-foreground border border-border outline-none">
              {years.map((y) => <option key={y}>{y}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* How it shows on the map */}
      <div>
        <Label>Show it on the map as</Label>
        <div className="flex bg-secondary rounded-xl p-1 gap-1">
          {[
            ['model', 'Detailed 3D', !!look.model3d || Object.keys(CAR_MODELS).length > 0],
            ['build', 'Built 3D', true],
            ['picture', 'My picture', true],
          ].filter(([, , ok]) => ok).map(([k, l]) => (
            <button key={k} onClick={() => {
              if (k === 'picture' && !v.image_url) { save({ display: 'picture' }); setPicEditor(true); return; }
              if (k === 'model' && !look.model3d) { save({ display: 'model', model3d: Object.keys(CAR_MODELS)[0] }); return; }
              save({ display: k });
            }} className={`flex-1 text-xs py-2 rounded-lg ${display === k ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground'}`}>{l}</button>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          {display === 'model' ? `${CAR_MODELS[look.model3d]?.label || 'Detailed model'}: paint and underglow apply; wheels and shape come with the model.` : display === 'picture' ? 'Your own top-down photo, lying on the road.' : 'Built from your choices below.'}
          {' '}<button onClick={() => setPicEditor(true)} className="text-primary inline-flex items-center gap-1"><ImagePlus className="w-3 h-3" />{v.image_url ? 'Change picture' : 'Add a picture'}</button>
        </p>
      </div>

      {/* Paint */}
      <div>
        <Label>Paint</Label>
        <div className="flex gap-2 overflow-x-auto no-scrollbar items-center py-1">
          <label className="w-8 h-8 rounded-full shrink-0 border-2 border-dashed border-muted-foreground/60 overflow-hidden relative" aria-label="Any color">
            <input type="color" value={paint} onChange={(e) => setPaintSoon(e.target.value)} className="absolute inset-0 w-12 h-12 -translate-x-2 -translate-y-2 cursor-pointer" />
          </label>
          {PAINTS.map((c) => <Swatch key={c} color={c} on={paint.toLowerCase() === c} onClick={() => setPaintSoon(c)} />)}
        </div>
        {display === 'model' && v.paint && <button onClick={() => save({ paint: null })} className="text-[11px] text-primary mt-1">Use the model's own paint</button>}
        {display !== 'picture' && <div className="mt-2"><Chips items={FINISHES} value={look.style.finish} onPick={(k) => save({ finish: k })} cols="grid-cols-5" /></div>}
      </div>

      {/* Wheels */}
      <div className={display === 'build' ? '' : 'opacity-50'}>
        <Label>Wheels{display !== 'build' ? ' (built 3D car only)' : ''}</Label>
        <div className="grid grid-cols-3 gap-1.5">
          {WHEELS.map((wh) => (
            <button key={wh.key} onClick={() => save({ wheels: wh.key })} className={`text-xs py-2 rounded-lg border ${look.wheels === wh.key ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border text-muted-foreground'}`}>{wh.label}</button>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          {WHEEL_COLORS.map((c) => <Swatch key={c.key} color={c.key} label={c.label} on={look.wheelColor === c.key} onClick={() => save({ wheel_color: c.key })} />)}
        </div>
      </div>

      {/* Underglow */}
      <div className="bg-card rounded-2xl border border-border p-4">
        <button onClick={() => save(v.glow_color && v.glow_on !== false ? { glow_on: false } : { glow_on: true, glow_color: glowColor })} className="w-full flex items-center gap-3 text-left">
          <div className="flex-1"><div className="text-sm font-semibold text-foreground">Underglow</div><div className="text-[11px] text-muted-foreground">Neon light under the car on the map</div></div>
          <Toggle on={!!v.glow_color && v.glow_on !== false} />
        </button>
        {!!v.glow_color && v.glow_on !== false && (
          <div className="flex gap-2 mt-3 items-center">
            <label className="w-8 h-8 rounded-full shrink-0 border-2 border-dashed border-muted-foreground/60 overflow-hidden relative" aria-label="Any color">
              <input type="color" value={glowColor} onChange={(e) => setGlowSoon(e.target.value)} className="absolute inset-0 w-12 h-12 -translate-x-2 -translate-y-2 cursor-pointer" />
            </label>
            {GLOWS.map((c) => <Swatch key={c} color={c} on={glowColor.toLowerCase() === c} onClick={() => setGlowSoon(c)} />)}
          </div>
        )}
        {!!v.glow_color && v.glow_on !== false && <div className="mt-3"><Chips items={PULSES} value={look.style.pulse} onPick={(k) => save({ glow_pulse: k })} cols="grid-cols-4" /></div>}
      </div>

      {/* Details */}
      {display === 'build' && (
        <div className="flex gap-2">
          {[['scoop', 'Hood scoop'], ['wing', 'Rear wing']].map(([k, l]) => (
            <button key={k} onClick={() => save({ [k]: !look[k] })} className={`flex-1 text-xs py-2.5 rounded-xl border ${look[k] ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border text-muted-foreground'}`}>{l}</button>
          ))}
          <button onClick={() => save({ lowered: !v.lowered })} className={`flex-1 text-xs py-2.5 rounded-xl border ${v.lowered ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border text-muted-foreground'}`}>Lowered</button>
        </div>
      )}

      {/* Lights */}
      {display !== 'picture' && (
        <div>
          <Label>Headlights</Label>
          <Chips items={LIGHTS} value={look.style.lights} onPick={(k) => save({ lights: k })} cols="grid-cols-4" />
          {display === 'build' && (
            <button onClick={() => save({ lashes: !v.lashes })} className={`mt-1.5 w-full text-xs py-2 rounded-lg border ${v.lashes ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border text-muted-foreground'}`}>Headlight lashes</button>
          )}
        </div>
      )}

      {/* Decals */}
      {display === 'build' && (
        <div>
          <Label>Decals</Label>
          <Chips items={DECALS} value={look.style.decal} onPick={(k) => save({ decal: k })} cols="grid-cols-4" />
          {look.style.decal !== 'none' && (
            <div className="flex gap-2 mt-2 items-center overflow-x-auto no-scrollbar py-1">
              {DECAL_COLORS.map((c) => <Swatch key={c} color={c} on={look.style.decalColor === c} onClick={() => save({ decal_color: c })} />)}
              {look.style.decal === 'number' && (
                <input defaultValue={v.decal_text || ''} maxLength={3} inputMode="numeric" placeholder="86" onBlur={(e) => save({ decal_text: e.target.value.trim().slice(0, 3) || null })} className="w-16 shrink-0 bg-secondary rounded-lg px-2 py-1.5 text-sm text-foreground border border-border outline-none text-center" />
              )}
            </div>
          )}
        </div>
      )}

      {/* Mirror charm */}
      <div>
        <Label>Mirror charm (shows on your garage and profile)</Label>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-1">
          <button onClick={() => save({ charm: null })} className={`shrink-0 h-9 px-3 rounded-full border text-xs ${!v.charm ? 'border-primary text-primary font-semibold' : 'border-border text-muted-foreground'}`}>None</button>
          {CHARMS.map((c) => (
            <button key={c} onClick={() => save({ charm: c })} className={`shrink-0 w-9 h-9 rounded-full border text-lg ${v.charm === c ? 'border-primary bg-primary/10' : 'border-border'}`}>{c}</button>
          ))}
        </div>
      </div>

      {/* Specs */}
      <div className="bg-card rounded-2xl border border-border">
        <button onClick={() => setSpecsOpen((o) => !o)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-foreground">Specs</div>
            <div className="text-[11px] text-muted-foreground truncate">{[specs.hp && `${specs.hp} hp`, specs.torque && `${specs.torque} lb-ft`, specs.drivetrain, specs.trans, specs.engine].filter(Boolean).join(' · ') || 'Power, drivetrain, transmission, engine'}</div>
          </div>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${specsOpen ? 'rotate-180' : ''}`} />
        </button>
        {specsOpen && (
          <div className="px-4 pb-4 grid grid-cols-2 gap-2">
            <input defaultValue={specs.hp || ''} inputMode="numeric" placeholder="Horsepower" onBlur={(e) => setSpec('hp', parseInt(e.target.value, 10) || null)} className={field} />
            <input defaultValue={specs.torque || ''} inputMode="numeric" placeholder="Torque (lb-ft)" onBlur={(e) => setSpec('torque', parseInt(e.target.value, 10) || null)} className={field} />
            <select defaultValue={specs.drivetrain || ''} onChange={(e) => setSpec('drivetrain', e.target.value || null)} className={field}>
              <option value="">Drivetrain</option><option>AWD</option><option>RWD</option><option>FWD</option><option>4WD</option>
            </select>
            <select defaultValue={specs.trans || ''} onChange={(e) => setSpec('trans', e.target.value || null)} className={field}>
              <option value="">Transmission</option><option>Manual</option><option>Automatic</option><option>DCT</option><option>CVT</option>
            </select>
            <input defaultValue={specs.engine || ''} placeholder="Engine (e.g. EJ257 2.5L turbo)" onBlur={(e) => setSpec('engine', e.target.value.trim().slice(0, 60) || null)} className={`${field} col-span-2`} />
          </div>
        )}
      </div>

      {picEditor && <CarPictureEditor vehicle={v} onClose={() => setPicEditor(false)} />}
    </section>
  );
}
