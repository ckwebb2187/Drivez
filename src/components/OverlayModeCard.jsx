// Settings card for Overlay Mode (Waze): Kaido's gauges float over Waze, taps pass through to Waze.
import { useEffect, useState } from 'react';
import { Layers } from 'lucide-react';
import { useObdPrefs, setObdPrefs } from '@/lib/obdPrefs';

const nat = () => window.DrivezNative;
const readState = () => { try { return JSON.parse(nat().overlayState()); } catch { return null; } };

export default function OverlayModeCard() {
  const prefs = useObdPrefs();
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
      <p className="text-[10px] text-muted-foreground">Tip: add the "Kaido overlay" tile to your quick settings to turn it on from anywhere.</p>
    </div>
  );
}
