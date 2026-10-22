import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Navigation, Flame, Loader2, Check } from 'lucide-react';
import { useApp } from '@/lib/AppContext';

const OPTIONS = [
  { key: 'nav', icon: Navigation, title: 'Just navigation', text: 'Maps, traffic, weather and trip history. Clean and simple.' },
  { key: 'scene', icon: Flame, title: 'Car scene', text: 'Everything: garage & mods, service reminders, drive stats, driver profile, rankings — and meets and convoys as they arrive.' },
];

// First launch: pick how much of the app you want. Changeable any time in Profile.
export default function SetupModeModal({ onDone }) {
  const { setAppMode } = useApp();
  const [pick, setPick] = useState('scene');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const go = async () => {
    setBusy(true); setError('');
    try { await setAppMode(pick); onDone?.(); } catch (e) { setError(e.message || 'Could not save. Try again.'); setBusy(false); }
  };
  return createPortal(
    <div className="fixed inset-0 z-[2000] bg-background/95 backdrop-blur flex items-center justify-center p-5">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-black text-foreground">How do you want to drive?</h1>
        <p className="text-sm text-muted-foreground mt-1 mb-5">Everything is optional. You can switch any time in Profile.</p>
        <div className="space-y-3">
          {OPTIONS.map((o) => (
            <button key={o.key} onClick={() => setPick(o.key)}
              className={`w-full text-left rounded-2xl border p-4 flex gap-3 transition-colors ${pick === o.key ? 'border-primary bg-primary/10' : 'border-border bg-card'}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${pick === o.key ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'}`}><o.icon className="w-5 h-5" /></div>
              <div className="flex-1">
                <div className="text-base font-bold text-foreground">{o.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{o.text}</div>
              </div>
              {pick === o.key && <Check className="w-5 h-5 text-primary shrink-0" />}
            </button>
          ))}
        </div>
        {error && <p className="text-xs text-destructive mt-3">{error}</p>}
        <button onClick={go} disabled={busy} className="w-full mt-5 bg-primary text-primary-foreground rounded-xl py-3.5 text-sm font-bold flex items-center justify-center gap-2">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}Let's go
        </button>
      </div>
    </div>,
    document.body
  );
}
