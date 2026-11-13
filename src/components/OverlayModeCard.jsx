// Settings card for Overlay Mode (Waze): Kaido's gauges float over Waze, taps pass through to Waze.
import { useEffect, useState } from 'react';
import { Layers } from 'lucide-react';
import { useObdPrefs, setObdPrefs } from '@/lib/obdPrefs';
import { useMapLook } from '@/lib/mapTheme';
import OverlayFx, { OVERLAY_FX, FX_COLOR_SETS, overlayColors, hex6 } from '@/components/OverlayFx';

const nat = () => window.DrivezNative;
const readState = () => { try { return JSON.parse(nat().overlayState()); } catch { return null; } };

export default function OverlayModeCard() {
  const prefs = useObdPrefs();
  const [look] = useMapLook();
  const [st, setSt] = useState(readState);
  const [note, setNote] = useState('');
  // Refresh when you come back from Android settings or Waze.
  useEffect(() => {
    const on = () => { if (document.visibilityState === 'visible') setSt(readState()); };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);

  if (!nat()) return null; // only in the Android app
  if (!nat().overlayStart) {
    return (
      <div className="rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-[11px] text-muted-foreground">
        <span className="font-bold text-foreground">Overlay Mode (Waze)</span> needs the latest Kaido Maps app. Update the app to float your gauges over Waze.
      </div>
    );
  }
  const on = !!st?.running;
  const toggle = () => {
    if (on) { nat().overlayStop(); setNote(''); setTimeout(() => setSt(readState()), 300); return; }
    const r = nat().overlayStart();
    setNote(r === 'permission' ? 'Turn on "Allow display over other apps" for Kaido Maps, then come back and tap again.'
      : r === 'nowaze' ? 'Install Waze from the Play Store, then tap again.' : '');
    setTimeout(() => setSt(readState()), 500);
  };
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5 space-y-2">
      <button onClick={toggle} className="w-full flex items-center justify-between gap-3 text-left">
        <div className="flex items-start gap-2">
          <Layers className="w-4 h-4 mt-0.5 text-primary shrink-0" />
          <div>
            <div className="text-sm font-semibold text-foreground">Overlay Mode (Waze)</div>
            <div className="text-[11px] text-muted-foreground">Waze is the map; your gauges and speed float on top. Taps go through to Waze. Use "Edit layout" in the notification to move things (while parked).</div>
          </div>
        </div>
        <span className={`shrink-0 w-10 h-6 rounded-full p-0.5 transition-colors ${on ? 'bg-primary' : 'bg-secondary'}`}>
          <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${on ? 'translate-x-4' : ''}`} />
        </span>
      </button>
      {note && <p className="text-[11px] font-semibold text-foreground">{note}</p>}
      {st && !st.permission && !note && <p className="text-[11px] text-muted-foreground">First time: Android will ask you to allow Kaido Maps to display over other apps.</p>}
      <label className="flex items-center justify-between text-xs font-semibold text-foreground">
        Show speed in the overlay
        <input type="checkbox" className="w-4 h-4 accent-primary" checked={prefs.ovlSpeed !== false} onChange={(e) => setObdPrefs({ ovlSpeed: e.target.checked })} />
      </label>
      <label className="flex items-center justify-between text-xs font-semibold text-foreground">
        Show what's playing (Spotify etc.)
        <input type="checkbox" className="w-4 h-4 accent-primary" checked={prefs.ovlMusic !== false} onChange={(e) => setObdPrefs({ ovlMusic: e.target.checked })} />
      </label>
      <OverlayLook prefs={prefs} theme={look.theme} />
      <p className="text-[10px] text-muted-foreground">Tip: add the "Kaido overlay" tile to your quick settings to turn it on from anywhere.</p>
    </div>
  );
}

// Animations floating over Waze and their colors (also used for the music ring).
function OverlayLook({ prefs, theme }) {
  const fx = prefs.ovlFx || [];
  const custom = prefs.ovlColors || null;
  const cols = overlayColors(prefs, theme);
  const toggle = (id) => setObdPrefs({ ovlFx: fx.includes(id) ? fx.filter((x) => x !== id) : [...fx, id] });
  const same = (a, b) => a && b && a.join() === b.join();
  const setCol = (i, v) => { const next = [...cols]; next[i] = v; setObdPrefs({ ovlColors: next }); };
  const chip = (on) => `px-2.5 py-1 rounded-full text-[11px] font-semibold border ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary text-foreground border-border'}`;
  return (
    <div className="space-y-2 pt-1">
      <div className="text-[10px] font-bold text-muted-foreground tracking-wider">ANIMATIONS OVER WAZE</div>
      <div className="flex flex-wrap gap-1.5">
        {OVERLAY_FX.map((f) => <button key={f.id} onClick={() => toggle(f.id)} className={chip(fx.includes(f.id))}>{f.title}</button>)}
      </div>
      <div className="flex gap-1.5 items-center">
        <span className="text-[11px] text-muted-foreground mr-1">Amount</span>
        {['Light', 'Medium', 'Lots'].map((t, i) => <button key={t} onClick={() => setObdPrefs({ ovlFxAmount: i })} className={chip((prefs.ovlFxAmount ?? 1) === i)}>{t}</button>)}
      </div>
      <div className="text-[10px] font-bold text-muted-foreground tracking-wider">COLORS</div>
      <div className="flex flex-wrap gap-1.5 items-center">
        <button onClick={() => setObdPrefs({ ovlColors: null })} className={chip(!custom)}>My map theme</button>
        {FX_COLOR_SETS.map((c) => (
          <button key={c.id} onClick={() => setObdPrefs({ ovlColors: c.cols })} aria-label={c.id}
            className={`w-7 h-7 rounded-full border-2 ${same(custom, c.cols) ? 'border-primary' : 'border-border'}`}
            style={{ background: `conic-gradient(${c.cols.join(', ')}, ${c.cols[0]})` }} />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground">Your own</span>
        {[0, 1, 2].map((i) => (
          <input key={i} type="color" value={hex6(cols[i] || cols[0])} onChange={(e) => setCol(i, e.target.value)}
            className="w-8 h-8 rounded-full border border-border bg-transparent p-0 cursor-pointer" />
        ))}
      </div>
      {fx.length > 0 && (
        <div className="relative h-24 rounded-lg overflow-hidden border border-border" style={{ background: '#1b2430' }}>
          <OverlayFx fx={fx} colors={cols} amount={prefs.ovlFxAmount ?? 1} />
          <span className="absolute bottom-1 right-2 text-[9px] font-bold text-white/60">PREVIEW</span>
        </div>
      )}
    </div>
  );
}
