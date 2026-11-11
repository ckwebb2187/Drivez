import { useState } from 'react';
import { useCarBluetooth } from '@/lib/carBluetooth';
import { checkObdAuto, holdObdAuto, autoCarMatch } from '@/lib/obdAuto';
import { knockLog, knockForget, knockLearned } from '@/lib/knockWatch';
import { useNavigate } from 'react-router-dom';
import { openStylePanel, fxTargetOn, toggleFxTarget, setAllFxTargets } from '@/lib/obdPrefs';
import { Bluetooth, Loader2, RefreshCw, Play, Square, Circle, Lock, Unlock, RotateCcw, ChevronDown, Palette } from 'lucide-react';
import { METRICS, GROUPS, BUBBLE_THEMES, BUBBLE_FX, VALUE_FX, GLOWS, EXTRAS, SHAPES, FX_TARGETS, useObd, useObdPrefs, setObdPrefs, hasNativeObd, obdDevices, obdConnect, obdDisconnect, obdLog, obdAskBluetooth, useObdDemo, setObdDemo, resetPeak } from '@/lib/obd';

const Chip = ({ on, off, onClick, children }) => (
  <button onClick={onClick} className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary text-foreground border-border'} ${off ? 'opacity-40' : ''}`}>{children}</button>
);

// A small fold-out section, so the panel stays short.
function Section({ title, hint, open: start = false, children }) {
  const [open, setOpen] = useState(start);
  return (
    <div className="rounded-xl border border-border bg-secondary/40">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-2.5 text-left">
        <span className="flex-1 text-xs font-bold tracking-wider text-foreground">{title}</span>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-3 pb-3 space-y-3">{children}</div>}
    </div>
  );
}

// Engine gauges (OBD-II): connect a Bluetooth adapter and set up the map bubbles.
export default function EngineSettings() {
  const prefs = useObdPrefs();
  const demo = useObdDemo();
  const s = useObd(true, 600);
  const native = hasNativeObd();
  const [list, setList] = useState(null);
  const [msg, setMsg] = useState('');
  const supported = s.status === 'live' && s.supported ? new Set(s.supported) : null;
  const onCar = (m) => !supported || (m.needs || [m.id]).some((k) => supported.has(k));

  const refresh = () => { obdAskBluetooth(); setList(obdDevices()); };
  const connect = (d) => { setObdDemo(false); obdConnect(d.address, d.name); setObdPrefs({ show: true, device: { name: d.name, address: d.address } }); };
  const status = demo ? 'Demo values (no car needed)' : !native ? 'Live data needs the newest Kaido Maps Android app'
    : s.status === 'live' ? `Live · ${s.device || 'adapter'} · ${Math.round(s.rate || 0)} updates/s`
    : s.status === 'connecting' ? s.message || 'Connecting…'
    : s.status === 'error' ? s.message || 'Connection failed' : 'Not connected';
  const bt = useCarBluetooth();
  const setAuto = (patch) => { setObdPrefs(patch); setTimeout(() => checkObdAuto(), 0); };
  const cars = (bt.status?.paired || []).filter((d) => d.address !== prefs.device?.address);
  const autoCar = prefs.autoCar || cars.find((d) => autoCarMatch(null, d)) || null;
  const toggleLog = () => { const err = obdLog(!s.logging); setMsg(err || ''); };
  const toggle = (id) => setObdPrefs((p) => ({ metrics: { ...p.metrics, [id]: !p.metrics[id] } }));
  const onCount = METRICS.filter((m) => prefs.metrics[m.id]).length;
  const navigate = useNavigate();
  // Animation mix: "auto" and "still" are on their own; anything else stacks.
  const fxSel = prefs.fxList?.length ? prefs.fxList : [prefs.fx || 'auto'];
  const pickFx = (id) => {
    if (id === 'auto' || id === 'none') return setObdPrefs({ fxList: [id], fx: id });
    const cur = fxSel.filter((x) => x !== 'auto' && x !== 'none');
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    setObdPrefs({ fxList: next.length ? next : ['none'], fx: next[0] || 'none' });
  };

  return (
    <div className="space-y-3">
      <div className="bg-secondary rounded-xl p-3 text-sm">
        <div className={`font-semibold ${s.status === 'error' ? 'text-destructive' : 'text-foreground'}`}>{status}</div>
        {s.adapter && s.status === 'live' && <div className="text-[11px] text-muted-foreground mt-0.5">{s.adapter}{supported ? ` · your car shares ${supported.size} readings` : ''}</div>}
      </div>

      <label className="flex items-center justify-between text-sm font-semibold text-foreground px-1">
        Show engine bubbles while driving
        <input type="checkbox" className="w-5 h-5 accent-primary" checked={prefs.show} onChange={(e) => setObdPrefs({ show: e.target.checked })} />
      </label>

      <label className="flex items-center justify-between gap-3 text-sm font-semibold text-foreground px-1">
        <span>Keep them on when parked<span className="block text-[11px] font-normal text-muted-foreground">Bubbles stay on the map with no drive running. Uses a bit more battery.</span></span>
        <input type="checkbox" className="w-5 h-5 accent-primary shrink-0" checked={!!prefs.always} onChange={(e) => setObdPrefs({ always: e.target.checked, show: e.target.checked || prefs.show })} />
      </label>

      <button onClick={() => { openStylePanel(s.status === 'live'); navigate('/'); }}
        className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-2">
        <Palette className="w-4 h-4" /> Style them on the map
      </button>

      <button onClick={() => { setObdDemo(!demo); if (!demo) setObdPrefs({ show: true }); }}
        className="w-full h-10 rounded-xl bg-secondary text-sm font-semibold text-foreground flex items-center justify-center gap-2">
        {demo ? <><Square className="w-4 h-4" /> Stop demo</> : <><Play className="w-4 h-4" /> Preview with demo values</>}
      </button>

      {native && (
        <Section title="ADAPTER" hint={s.status === 'live' ? 'Live' : prefs.device?.name || ''} open={s.status !== 'live'}>
          <div className="flex items-center justify-end">
            {(s.status === 'live' || s.status === 'connecting') ? (
              <button onClick={() => { holdObdAuto(); obdDisconnect(); }} className="text-xs font-bold text-destructive">Disconnect</button>
            ) : (
              <button onClick={refresh} className="text-xs font-bold text-primary flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Find adapters</button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">Plug in the adapter, turn the ignition on, and pair it in your phone's Bluetooth settings first (PIN is usually 1234 or 0000).</p>
          <div className="rounded-xl border border-border bg-card px-3 py-2.5 space-y-2">
            <button onClick={() => setAuto({ autoConnect: !prefs.autoConnect, autoCar: prefs.autoCar || autoCar })} className="w-full flex items-center justify-between gap-3 text-left">
              <div>
                <div className="text-sm font-semibold text-foreground">Auto-connect in the car</div>
                <div className="text-[11px] text-muted-foreground">
                  {!prefs.device ? 'Connect to your adapter once first.' : autoCar ? `When your phone joins ${autoCar.name}, connect to ${prefs.device.name}. Lets go when you leave.` : 'Pick your car\'s Bluetooth below.'}
                </div>
              </div>
              <span className={`shrink-0 w-10 h-6 rounded-full p-0.5 transition-colors ${prefs.autoConnect ? 'bg-primary' : 'bg-secondary'}`}>
                <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${prefs.autoConnect ? 'translate-x-4' : ''}`} />
              </span>
            </button>
            {prefs.autoConnect && cars.length > 0 && (
              <div>
                <div className="text-[10px] font-bold text-muted-foreground tracking-wider mb-1">MY CAR'S BLUETOOTH</div>
                <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
                  {cars.map((d) => (
                    <button key={d.address} onClick={() => setAuto({ autoCar: { name: d.name, address: d.address } })}
                      className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap ${autoCar?.address === d.address ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary/80 text-foreground border-border'}`}>{d.name}</button>
                  ))}
                </div>
              </div>
            )}
            {prefs.autoConnect && !bt.status?.permission && (
              <button onClick={bt.request} className="text-xs font-bold text-primary">Allow Bluetooth to see your car</button>
            )}
          </div>
          {prefs.device && s.status !== 'live' && s.status !== 'connecting' && (
            <button onClick={() => connect(prefs.device)} className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-2">
              <Bluetooth className="w-4 h-4" /> Connect to {prefs.device.name}
            </button>
          )}
          {s.status === 'connecting' && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> {s.message}</div>}
          {list && s.status !== 'live' && (
            <div className="space-y-1.5">
              {!list.permission && <p className="text-xs text-foreground">Allow Bluetooth for Kaido Maps, then tap Find adapters again.</p>}
              {list.permission && !list.on && <p className="text-xs text-foreground">Bluetooth is off. Turn it on, then tap Find adapters.</p>}
              {list.permission && list.on && !list.devices.length && <p className="text-xs text-muted-foreground">No paired devices yet.</p>}
              {list.devices.map((d) => (
                <button key={d.address} onClick={() => connect(d)} className="w-full text-left rounded-xl border border-border bg-card px-3 py-2">
                  <div className={`text-sm font-semibold ${d.obd ? 'text-primary' : 'text-foreground'}`}>{d.name}</div>
                  <div className="text-[10px] text-muted-foreground">{d.address}{d.obd ? ' · looks like an OBD adapter' : ''}</div>
                </button>
              ))}
            </div>
          )}
          {s.status === 'live' && (
            <div className="space-y-1.5">
              <button onClick={toggleLog} className={`w-full h-11 rounded-xl text-sm font-bold flex items-center justify-center gap-2 ${s.logging ? 'bg-destructive text-white' : 'bg-card text-foreground border border-border'}`}>
                {s.logging ? <><Square className="w-4 h-4 fill-current" /> Stop logging</> : <><Circle className="w-4 h-4 fill-destructive text-destructive" /> Start logging (CSV)</>}
              </button>
              <p className="text-[11px] text-muted-foreground">
                {s.logging ? `Logging to ${s.logFile}` : s.lastSaved ? `Saved ${s.lastSaved}` : 'Saves to Downloads/KaidoMaps. Opens in Datazap and Virtual Dyno.'}
              </p>
              {msg && <p className="text-[11px] text-destructive">{msg}</p>}
            </div>
          )}
        </Section>
      )}

      <Section title="KNOCK WATCH" hint={s.values?.knockScore != null ? `${s.values.knockScore}% health` : ''}>
        <p className="text-[11px] text-muted-foreground">Your WRX only shares the real DAM through Subaru's private tools, so this watches ignition timing instead: it learns the timing your ECU normally runs, and flags when it suddenly pulls timing under load (what it does when it hears knock). DAM (est.) reads 0.00–1.00 like your Accessport: 1.00 is happy, it drops on pulls and recovers with clean driving. It's an estimate, not the ECU's own DAM.</p>
        <div className="grid grid-cols-3 gap-1.5 text-center">
          {[['Health', s.values?.knockScore != null ? `${s.values.knockScore}%` : '--'], ['Pulls this drive', s.values?.knockEvents ?? 0], ['Learned', `${knockLearned()} cells`]].map(([l, v]) => (
            <div key={l} className="rounded-xl bg-card border border-border py-2"><div className="text-base font-bold text-foreground">{v}</div><div className="text-[10px] text-muted-foreground">{l}</div></div>
          ))}
        </div>
        {knockLog().length > 0 && (
          <div className="space-y-1">
            {knockLog().slice(0, 5).map((e) => (
              <div key={e.at} className="flex items-center justify-between text-xs rounded-lg bg-secondary/70 px-2.5 py-1.5">
                <span className="font-semibold text-foreground">−{e.max}° pull</span>
                <span className="text-muted-foreground">{Math.round(e.rpm / 100) * 100} rpm{e.boost != null ? ` · ${e.boost.toFixed(1)} psi` : ''} · {new Date(e.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-1.5">
          <button onClick={() => setObdPrefs((p) => ({ show: true, metrics: { ...p.metrics, dam: true, pull: true } }))} className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-xs font-bold">Show on the map</button>
          <button onClick={() => setObdPrefs({ show: true, layout: 'ap', metrics: { dam: true, pull: true, boost: true, afr: true, iat: true, coolant: true } })} className="flex-1 h-10 rounded-xl bg-secondary text-foreground text-xs font-bold border border-border">Accessport screen</button>
          <button onClick={() => { if (window.confirm('Forget the learned timing? It relearns over the next few drives.')) knockForget(); }} className="h-10 px-3 rounded-xl bg-secondary text-foreground text-xs font-semibold">Relearn</button>
        </div>
        <details className="rounded-xl bg-card border border-border px-3 py-2">
          <summary className="text-xs font-bold text-foreground cursor-pointer">What to watch (same as your Accessport)</summary>
          <ul className="mt-2 space-y-1.5 text-[11px] text-muted-foreground">
            <li><b className="text-foreground">DAM</b> should sit at 1.00. Anything lower means the ECU heard knock and pulled timing everywhere; amber below 1.00, red below 0.75.</li>
            <li><b className="text-foreground">Feedback Knock</b> should read 0. An occasional −1 to −1.4 is normal; repeated −2 or more under boost (amber), or −4 (red), means back off and check fuel, plugs, intake temps.</li>
            <li><b className="text-foreground">AF Ratio</b> under boost should be rich, about 10.5–11.5. Leaner than 11.8 under boost turns amber, 12.3 red. Cruising near 14.7 is normal.</li>
            <li><b className="text-foreground">AF Learning 1</b> within ±8% is healthy; past ±10% points at a vacuum/boost leak or fueling issue. <b className="text-foreground">AF Correction</b> moves around more; past ±10–15% is worth a look.</li>
            <li><b className="text-foreground">Intake Temp</b> under 120°F is happy; hot intake air makes knock more likely. <b className="text-foreground">Coolant Temp</b> around 190–215°F; amber at 220°F. <b className="text-foreground">Oil Temp</b> amber at 240°F.</li>
            <li>DAM and Feedback Knock here are estimates from timing pulls (the real ones need Subaru's tools). Fine Knock Learn can't be read over OBD-II.</li>
          </ul>
        </details>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground flex-1">Gauge style</span>
          {[['bubbles', 'Bubbles'], ['ap', 'Accessport']].map(([id, t]) => (
            <button key={id} onClick={() => setObdPrefs({ layout: id })} className={`px-3 h-8 rounded-full text-xs font-semibold border ${(prefs.layout || 'bubbles') === id ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary/80 text-foreground border-border'}`}>{t}</button>
          ))}
        </div>
        {prefs.layout === 'ap' && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground flex-1">Screen position</span>
            {[['top', 'Top'], ['bottom', 'Bottom']].map(([id, t]) => (
              <button key={id} onClick={() => setObdPrefs({ apPos: id })} className={`px-3 h-8 rounded-full text-xs font-semibold border ${(prefs.apPos || 'top') === id ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary/80 text-foreground border-border'}`}>{t}</button>
            ))}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground">Needs a few drives with some boost to learn your car first. A bigger drop or several pulls in a row is worth a closer look (fuel quality, plugs, intake temps).</p>
      </Section>
      <Section title="GAUGES" hint={`${onCount} on`}>
        <p className="text-[11px] text-muted-foreground">Every standard OBD-II reading. Once connected, ones your car doesn't share are dimmed. Fewer bubbles = less battery.</p>
        {GROUPS.map((g) => {
          const ms = METRICS.filter((m) => m.g === g.id);
          const n = ms.filter((m) => prefs.metrics[m.id]).length;
          return (
            <Section key={g.id} title={g.title.toUpperCase()} hint={n ? `${n} on` : ''}>
              <div className="flex flex-wrap gap-1.5">
                {ms.map((m) => <Chip key={m.id} on={!!prefs.metrics[m.id]} off={!onCar(m)} onClick={() => toggle(m.id)}>{m.label}</Chip>)}
              </div>
            </Section>
          );
        })}
      </Section>

      <Section title="LOOK & ANIMATIONS" hint={fxSel.length > 1 ? `${fxSel.length} mixed` : BUBBLE_FX.find((f) => f.id === fxSel[0])?.title}>
        <div>
          <div className="text-[11px] font-bold text-muted-foreground tracking-wider mb-1.5">COLORS</div>
          <div className="flex flex-wrap gap-1.5">
            {BUBBLE_THEMES.map((t) => (
              <Chip key={t.id} on={prefs.theme === t.id} onClick={() => setObdPrefs({ theme: t.id })}>
                {t.accent && <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle" style={{ background: t.accent, boxShadow: `0 0 6px ${t.accent}` }} />}{t.title}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-muted-foreground tracking-wider mb-1.5">SHAPE</div>
          <div className="flex flex-wrap gap-1.5">{SHAPES.map((x) => <Chip key={x.id} on={(prefs.shape || 'circle') === x.id} onClick={() => setObdPrefs({ shape: x.id, pos: {} })}>{x.title}</Chip>)}</div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-muted-foreground tracking-wider mb-1.5">ANIMATIONS <span className="font-normal normal-case tracking-normal">(tap several to mix)</span></div>
          <div className="flex flex-wrap gap-1.5">{BUBBLE_FX.map((f) => <Chip key={f.id} on={fxSel.includes(f.id)} onClick={() => pickFx(f.id)}>{f.title}</Chip>)}</div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-muted-foreground tracking-wider mb-1.5">NUMBERS</div>
          <div className="flex flex-wrap gap-1.5">{VALUE_FX.map((f) => <Chip key={f.id} on={prefs.valueFx === f.id} onClick={() => setObdPrefs({ valueFx: f.id })}>{f.title}</Chip>)}</div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-muted-foreground tracking-wider mb-1.5">GLOW STRENGTH</div>
          <div className="flex flex-wrap gap-1.5">{GLOWS.map((l, i) => <Chip key={l} on={(prefs.glow ?? 1) === i} onClick={() => setObdPrefs({ glow: i })}>{l}</Chip>)}</div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-muted-foreground tracking-wider mb-1.5">USE ANIMATIONS ON</div>
          <div className="flex flex-wrap gap-1.5">
            <Chip on={FX_TARGETS.every((t) => fxTargetOn(prefs, t.id))} onClick={() => setAllFxTargets(FX_TARGETS.map((t) => t.id), true)}>All</Chip>
            <Chip on={FX_TARGETS.every((t) => !fxTargetOn(prefs, t.id))} onClick={() => setAllFxTargets(FX_TARGETS.map((t) => t.id), false)}>None</Chip>
            {FX_TARGETS.map((t) => <Chip key={t.id} on={fxTargetOn(prefs, t.id)} onClick={() => toggleFxTarget(t.id)}>{t.title}</Chip>)}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Tap All, None, or pick just the spots you want. Gauges animate even with no adapter connected; the rest use your map theme's colors.</p>
        </div>
        <Section title="EXTRAS" hint={`${EXTRAS.filter((x) => prefs.extras?.[x.id]).length} on`}>
          <p className="text-[11px] text-muted-foreground">Mix and match. Each one stacks on top of any animation.</p>
          <div className="flex flex-wrap gap-1.5">
            {EXTRAS.map((x) => <Chip key={x.id} on={!!prefs.extras?.[x.id]} onClick={() => setObdPrefs((p) => ({ extras: { ...p.extras, [x.id]: !p.extras?.[x.id] } }))}>{x.title}</Chip>)}
          </div>
        </Section>
        <div>
          <div className="text-[11px] font-bold text-muted-foreground tracking-wider mb-1.5">SIZE</div>
          <div className="flex gap-1.5">{['Small', 'Medium', 'Large'].map((l, i) => <Chip key={l} on={prefs.size === i} onClick={() => setObdPrefs({ size: i })}>{l}</Chip>)}</div>
        </div>
        <label className="block">
          <div className="text-[11px] font-bold text-muted-foreground tracking-wider mb-1">BACKGROUND {prefs.opacity}%</div>
          <input type="range" min="30" max="100" value={prefs.opacity} onChange={(e) => setObdPrefs({ opacity: Number(e.target.value) })} className="w-full accent-primary" />
        </label>
        <p className="text-[11px] text-muted-foreground">Animations pause in battery saver.</p>
      </Section>

      <Section title="PLACEMENT">
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => setObdPrefs({ locked: !prefs.locked })} className="h-10 rounded-xl bg-card border border-border text-xs font-semibold text-foreground flex items-center justify-center gap-1">
            {prefs.locked ? <><Lock className="w-3.5 h-3.5" /> Locked</> : <><Unlock className="w-3.5 h-3.5" /> Movable</>}
          </button>
          <button onClick={() => setObdPrefs({ pos: {} })} className="h-10 rounded-xl bg-card border border-border text-xs font-semibold text-foreground flex items-center justify-center gap-1"><RotateCcw className="w-3.5 h-3.5" /> Reset spots</button>
          <button onClick={resetPeak} className="h-10 rounded-xl bg-card border border-border text-xs font-semibold text-foreground">Reset peak</button>
        </div>
        <p className="text-[11px] text-muted-foreground">Drag bubbles on the map to place them while stopped. They lock in place while you're moving. Tap the boost bubble to reset its peak marker.</p>
      </Section>
    </div>
  );
}
