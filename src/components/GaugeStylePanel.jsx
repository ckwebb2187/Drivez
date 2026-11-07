import { createPortal } from 'react-dom';
import { X, Shuffle, Play, Square } from 'lucide-react';
import { BUBBLE_THEMES, BUBBLE_FX, VALUE_FX, GLOWS, SHAPES, EXTRAS, useObdPrefs, setObdPrefs, useObdDemo, setObdDemo } from '@/lib/obd';
import { closeStylePanel } from '@/lib/obdPrefs';

// One-tap looks. Each sets shape, colors, animation mix, number effect, glow and extras together.
const PRESETS = [
  { name: 'Tokyo Neon', p: { theme: 'map', shape: 'circle', fxList: ['orbit', 'ripple'], valueFx: 'glow', glow: 2, extras: { neonRim: true, tipSpark: true, halo: true } } },
  { name: 'Cyber HUD', p: { theme: 'neon', shape: 'cyber', fxList: ['stream', 'holo'], valueFx: 'chroma', glow: 2, extras: { neonRim: true, ticks: true, scanlines: true } } },
  { name: 'Hex Reactor', p: { theme: 'map', shape: 'hex', fxList: ['tracer', 'reactor'], valueFx: 'outline', glow: 3, extras: { neonRim: true, tipSpark: true, innerGlow: true } } },
  { name: 'Rally Gold', p: { theme: 'rallygold', shape: 'shield', fxList: ['comet'], valueFx: 'glow', glow: 1, extras: { neonRim: true, peaks: true } } },
  { name: 'Dash Bars', p: { theme: 'wrblue', shape: 'bar', fxList: ['charge'], valueFx: 'glow', glow: 2, extras: { ticks: true, tipSpark: true, peaks: true } } },
  { name: 'Galaxy', p: { theme: 'map', shape: 'circle', fxList: ['starfield', 'aurora'], valueFx: 'glow', glow: 2, extras: { halo: true, float: true, tipSpark: true } } },
  { name: 'Matrix', p: { theme: 'map', shape: 'octagon', fxList: ['circuit', 'lattice'], valueFx: 'flicker', glow: 2, extras: { scanlines: true, neonRim: true } } },
  { name: 'Sunset Drift', p: { theme: 'sunset', shape: 'diamond', fxList: ['sonar', 'breathe'], valueFx: 'pulse', glow: 2, extras: { reactive: true, colorShift: true, neonRim: true } } },
  { name: 'Overdrive', p: { theme: 'map', shape: 'hex', fxList: ['plasma', 'sonar', 'tracer'], valueFx: 'chroma', glow: 3, extras: { neonRim: true, halo: true, tipSpark: true, reactive: true, shiftLight: true, shine: true } } },
  { name: 'Stealth', p: { theme: 'stealth', shape: 'circle', fxList: ['none'], valueFx: 'plain', glow: 0, extras: {} } },
];

const pick = (a) => a[Math.floor(Math.random() * a.length)];
function surprise() {
  const fx = BUBBLE_FX.filter((f) => f.id !== 'auto' && f.id !== 'none');
  const n = 1 + Math.floor(Math.random() * 3);
  const fxList = [...new Set(Array.from({ length: n }, () => pick(fx).id))];
  const extras = Object.fromEntries(EXTRAS.filter(() => Math.random() < 0.35).map((x) => [x.id, true]));
  setObdPrefs({ theme: pick(BUBBLE_THEMES).id, shape: pick(SHAPES).id, fxList, fx: fxList[0], valueFx: pick(VALUE_FX).id, glow: 1 + Math.floor(Math.random() * 3), extras, pos: {} });
}

const Chip = ({ on, onClick, children }) => (
  <button onClick={onClick} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary/80 text-foreground border-border'}`}>{children}</button>
);
const Row = ({ label, children }) => (
  <div>
    <div className="text-[10px] font-bold text-muted-foreground tracking-wider px-4 mb-1">{label}</div>
    <div className="flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">{children}</div>
  </div>
);

// Quick style switcher that sits low on the screen, so the gauges stay visible above it while you try looks.
export default function GaugeStylePanel() {
  const prefs = useObdPrefs();
  const demo = useObdDemo();
  const fxSel = prefs.fxList?.length ? prefs.fxList : [prefs.fx || 'auto'];
  const pickFx = (id) => {
    if (id === 'auto' || id === 'none') return setObdPrefs({ fxList: [id], fx: id });
    const cur = fxSel.filter((x) => x !== 'auto' && x !== 'none');
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    setObdPrefs({ fxList: next.length ? next : ['none'], fx: next[0] || 'none' });
  };
  const applyPreset = (p) => setObdPrefs({ ...p, fx: p.fxList[0], pos: p.shape !== prefs.shape ? {} : prefs.pos });

  return createPortal(
    <div className="fixed inset-x-0 bottom-0 z-[1550] pointer-events-auto">
      <div className="mx-2 mb-[max(8px,env(safe-area-inset-bottom))] rounded-2xl border border-border bg-card/90 backdrop-blur-md shadow-2xl pt-2 pb-3 space-y-2.5 max-h-[46vh] overflow-y-auto">
        <div className="flex items-center gap-2 px-4">
          <div className="flex-1 text-sm font-bold text-foreground">Gauge style</div>
          <button onClick={surprise} className="h-8 px-3 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1"><Shuffle className="w-3.5 h-3.5" /> Surprise me</button>
          <button onClick={() => setObdDemo(!demo)} className="h-8 px-3 rounded-full bg-secondary text-xs font-semibold text-foreground flex items-center gap-1">
            {demo ? <><Square className="w-3 h-3" /> Demo</> : <><Play className="w-3 h-3" /> Demo</>}
          </button>
          <button onClick={closeStylePanel} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <Row label="PRESETS">{PRESETS.map((x) => <Chip key={x.name} onClick={() => applyPreset(x.p)}>{x.name}</Chip>)}</Row>
        <Row label="SHAPE">{SHAPES.map((x) => <Chip key={x.id} on={(prefs.shape || 'circle') === x.id} onClick={() => setObdPrefs({ shape: x.id, pos: {} })}>{x.title}</Chip>)}</Row>
        <Row label="ANIMATIONS (TAP SEVERAL TO MIX)">{BUBBLE_FX.map((f) => <Chip key={f.id} on={fxSel.includes(f.id)} onClick={() => pickFx(f.id)}>{f.title}</Chip>)}</Row>
        <Row label="COLORS">
          {BUBBLE_THEMES.map((t) => (
            <Chip key={t.id} on={prefs.theme === t.id} onClick={() => setObdPrefs({ theme: t.id })}>
              {t.accent && <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle" style={{ background: t.accent, boxShadow: `0 0 6px ${t.accent}` }} />}{t.title}
            </Chip>
          ))}
        </Row>
        <Row label="NUMBERS">{VALUE_FX.map((f) => <Chip key={f.id} on={prefs.valueFx === f.id} onClick={() => setObdPrefs({ valueFx: f.id })}>{f.title}</Chip>)}</Row>
        <Row label="GLOW">
          {GLOWS.map((l, i) => <Chip key={l} on={(prefs.glow ?? 1) === i} onClick={() => setObdPrefs({ glow: i })}>{l}</Chip>)}
          {['Small', 'Medium', 'Large'].map((l, i) => <Chip key={l} on={prefs.size === i} onClick={() => setObdPrefs({ size: i })}>{l}</Chip>)}
        </Row>
        <Row label="EXTRAS">{EXTRAS.map((x) => <Chip key={x.id} on={!!prefs.extras?.[x.id]} onClick={() => setObdPrefs((p) => ({ extras: { ...p.extras, [x.id]: !p.extras?.[x.id] } }))}>{x.title}</Chip>)}</Row>
      </div>
    </div>,
    document.body
  );
}
