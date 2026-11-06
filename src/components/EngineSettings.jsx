import { useState } from 'react';
import { Bluetooth, Loader2, RefreshCw, Play, Square, Circle, Lock, Unlock, RotateCcw } from 'lucide-react';
import { METRICS, BUBBLE_THEMES, useObd, useObdPrefs, setObdPrefs, hasNativeObd, obdDevices, obdConnect, obdDisconnect, obdLog, obdAskBluetooth, useObdDemo, setObdDemo, resetPeak } from '@/lib/obd';

const Chip = ({ on, onClick, children }) => (
  <button onClick={onClick} className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary text-foreground border-border'}`}>{children}</button>
);

// Engine gauges (OBD-II): connect a Bluetooth adapter and set up the map bubbles.
export default function EngineSettings() {
  const prefs = useObdPrefs();
  const demo = useObdDemo();
  const s = useObd(true, 500);
  const native = hasNativeObd();
  const [list, setList] = useState(null);
  const [msg, setMsg] = useState('');

  const refresh = () => { obdAskBluetooth(); setList(obdDevices()); };
  const connect = (d) => { setObdDemo(false); obdConnect(d.address, d.name); setObdPrefs({ show: true, device: { name: d.name, address: d.address } }); };
  const status = demo ? 'Demo values (no car needed)' : !native ? 'Needs the Kaido Maps Android app (update to the newest version)'
    : s.status === 'live' ? `Live · ${s.device || 'adapter'} · ${Math.round(s.rate || 0)} reads/s`
    : s.status === 'connecting' ? s.message || 'Connecting…'
    : s.status === 'error' ? s.message || 'Connection failed' : 'Not connected';
  const toggleLog = () => { const err = obdLog(!s.logging); setMsg(err || ''); };

  return (
    <div className="space-y-4">
      <div className="bg-secondary rounded-xl p-3 text-sm">
        <div className={`font-semibold ${s.status === 'error' ? 'text-destructive' : 'text-foreground'}`}>{status}</div>
        {s.adapter && s.status === 'live' && <div className="text-[11px] text-muted-foreground mt-0.5">{s.adapter}</div>}
      </div>

      <label className="flex items-center justify-between text-sm font-semibold text-foreground">
        Show engine bubbles on the map
        <input type="checkbox" className="w-5 h-5 accent-primary" checked={prefs.show} onChange={(e) => setObdPrefs({ show: e.target.checked })} />
      </label>

      {native && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="text-xs font-bold text-muted-foreground tracking-wider flex-1">OBD ADAPTER</div>
            {(s.status === 'live' || s.status === 'connecting') ? (
              <button onClick={() => obdDisconnect()} className="text-xs font-bold text-destructive">Disconnect</button>
            ) : (
              <button onClick={refresh} className="text-xs font-bold text-primary flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Find adapters</button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">Plug in the adapter, turn the ignition on, and pair it in your phone's Bluetooth settings first (PIN is usually 1234 or 0000).</p>
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
              <button onClick={toggleLog} className={`w-full h-11 rounded-xl text-sm font-bold flex items-center justify-center gap-2 ${s.logging ? 'bg-destructive text-white' : 'bg-secondary text-foreground'}`}>
                {s.logging ? <><Square className="w-4 h-4 fill-current" /> Stop logging</> : <><Circle className="w-4 h-4 fill-destructive text-destructive" /> Start logging (CSV)</>}
              </button>
              <p className="text-[11px] text-muted-foreground">
                {s.logging ? `Logging to ${s.logFile}` : s.lastSaved ? `Saved ${s.lastSaved}` : 'Saves to Downloads/KaidoMaps. Opens in Datazap and Virtual Dyno.'}
              </p>
              {msg && <p className="text-[11px] text-destructive">{msg}</p>}
            </div>
          )}
        </div>
      )}

      <button onClick={() => { setObdDemo(!demo); if (!demo) setObdPrefs({ show: true }); }}
        className="w-full h-10 rounded-xl bg-secondary text-sm font-semibold text-foreground flex items-center justify-center gap-2">
        {demo ? <><Square className="w-4 h-4" /> Stop demo</> : <><Play className="w-4 h-4" /> Preview with demo values</>}
      </button>

      <div>
        <div className="text-xs font-bold text-muted-foreground tracking-wider mb-2">GAUGES</div>
        <div className="flex flex-wrap gap-1.5">
          {METRICS.map((m) => (
            <Chip key={m.id} on={!!prefs.metrics[m.id]} onClick={() => setObdPrefs((p) => ({ metrics: { ...p.metrics, [m.id]: !p.metrics[m.id] } }))}>{m.label}</Chip>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs font-bold text-muted-foreground tracking-wider mb-2">BUBBLE COLORS</div>
        <div className="flex flex-wrap gap-1.5">
          {BUBBLE_THEMES.map((t) => (
            <Chip key={t.id} on={prefs.theme === t.id} onClick={() => setObdPrefs({ theme: t.id })}>
              {t.accent && <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle" style={{ background: t.accent, boxShadow: `0 0 6px ${t.accent}` }} />}{t.title}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs font-bold text-muted-foreground tracking-wider mb-2">SIZE</div>
        <div className="flex gap-1.5">{['Small', 'Medium', 'Large'].map((l, i) => <Chip key={l} on={prefs.size === i} onClick={() => setObdPrefs({ size: i })}>{l}</Chip>)}</div>
      </div>

      <label className="block">
        <div className="text-xs font-bold text-muted-foreground tracking-wider mb-1">BACKGROUND {prefs.opacity}%</div>
        <input type="range" min="30" max="100" value={prefs.opacity} onChange={(e) => setObdPrefs({ opacity: Number(e.target.value) })} className="w-full accent-primary" />
      </label>

      <div className="grid grid-cols-3 gap-2">
        <button onClick={() => setObdPrefs({ locked: !prefs.locked })} className="h-10 rounded-xl bg-secondary text-xs font-semibold text-foreground flex items-center justify-center gap-1">
          {prefs.locked ? <><Lock className="w-3.5 h-3.5" /> Locked</> : <><Unlock className="w-3.5 h-3.5" /> Movable</>}
        </button>
        <button onClick={() => setObdPrefs({ pos: {} })} className="h-10 rounded-xl bg-secondary text-xs font-semibold text-foreground flex items-center justify-center gap-1"><RotateCcw className="w-3.5 h-3.5" /> Reset spots</button>
        <button onClick={resetPeak} className="h-10 rounded-xl bg-secondary text-xs font-semibold text-foreground">Reset peak</button>
      </div>
      <p className="text-[11px] text-muted-foreground">Drag bubbles on the map to place them while stopped. They lock in place while you're moving. Tap the boost bubble to reset its peak marker.</p>
    </div>
  );
}
