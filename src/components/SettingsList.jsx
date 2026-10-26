import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, EyeOff, Palette, AudioLines, Flame, Navigation, MessageCircle, ShieldCheck, Smartphone, LogOut, Loader2, X, Gauge } from 'lucide-react';
import { useApp } from '@/lib/AppContext';
import { useAuth } from '@/lib/AuthContext';
import Collapsible from '@/components/Collapsible';
import MapLookSettings from '@/components/MapLookSettings';
import VoiceSettings from '@/components/VoiceSettings';
import DiscordSettings from '@/components/DiscordSettings';
import PrivacySettings from '@/components/PrivacySettings';
import AppUpdate from '@/components/AppUpdate';
import { useUnits, setUnits } from '@/lib/units';
import { useFamilyBrief } from '@/lib/family';
import { api } from '@/api/base44Client';

let unlockedFor = null; // family id unlocked with the parent PIN this session

// All app settings in one list: used at the bottom of Profile and in the quick Settings sheet.
export default function SettingsList() {
  const { user, scene, setAppMode, toggleGhostMode } = useApp();
  const { logout } = useAuth();
  const [modeBusy, setModeBusy] = useState(false);
  const units = useUnits();
  const switchMode = async (m) => { if (m === user.appMode) return; setModeBusy(true); try { await setAppMode(m); } finally { setModeBusy(false); } };
  if (!user) return null;
  return (
    <div className="space-y-3">
      <button onClick={toggleGhostMode} className="w-full bg-card rounded-2xl border border-border flex items-center gap-3 px-4 py-3 text-left">
        {user.ghostMode ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-primary" />}
        <div className="flex-1">
          <div className="text-sm font-semibold text-foreground">Ghost mode</div>
          <div className="text-[11px] text-muted-foreground">{ghostLocked ? 'Kept on by your parent · only family sees you' : user.ghostMode ? 'Hidden from friends & rankings' : 'Friends can see you while you drive'}</div>
        </div>
        <span className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${user.ghostMode ? 'bg-primary' : 'bg-muted'}`}>
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${user.ghostMode ? 'left-[22px]' : 'left-0.5'}`} />
        </span>
      </button>
      <div className="w-full bg-card rounded-2xl border border-border flex items-center gap-3 px-4 py-3">
        <Gauge className="w-4 h-4 text-primary" />
        <div className="flex-1">
          <div className="text-sm font-semibold text-foreground">Units</div>
          <div className="text-[11px] text-muted-foreground">Speeds and distances everywhere, and what the voice says</div>
        </div>
        <div className="flex rounded-full bg-secondary p-0.5 shrink-0">
          {[['imperial', 'mph · mi'], ['metric', 'km/h · km']].map(([k, l]) => (
            <button key={k} onClick={() => setUnits(k)} className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${units === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{l}</button>
          ))}
        </div>
      </div>
      <Collapsible id="look" icon={Palette} title="Map look" subtitle="World theme, battery saver, Japanese names">
        <MapLookSettings />
      </Collapsible>
      <Collapsible id="voice" icon={AudioLines} title="Voice & narration" subtitle="Co-driver callouts, drive recaps, Gemini voice">
        <VoiceSettings />
      </Collapsible>
      <Collapsible id="mode" icon={Flame} title="App mode" subtitle={(user.appMode || 'scene') === 'nav' ? 'Just navigation' : 'Car scene'} right={modeBusy ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : null}>
        <div className="grid grid-cols-2 gap-2">
          {[['nav', Navigation, 'Just navigation'], ['scene', Flame, 'Car scene']].map(([m, Icon, label]) => (
            <button key={m} onClick={() => switchMode(m)} className={`rounded-xl border px-3 py-3 flex items-center gap-2 text-sm font-semibold ${(user.appMode || 'scene') === m ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground'}`}>
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">{scene ? 'All car features are on.' : 'Car features (mods, stats, rankings, driver profile) are hidden. Nothing is deleted.'}</p>
      </Collapsible>
      <Collapsible id="discord" icon={MessageCircle} title="Discord" subtitle="Post your drives and group chat to a channel">
        <DiscordSettings />
      </Collapsible>
      <Collapsible id="privacy" icon={ShieldCheck} title="Privacy & data" subtitle="Trip history, download, delete account">
        <PrivacySettings />
      </Collapsible>
      <Collapsible id="app" icon={Smartphone} title="App & updates" subtitle="Android app, version">
        <AppUpdate />
      </Collapsible>
      <button onClick={logout} className="w-full bg-card rounded-2xl border border-border flex items-center justify-center gap-2 py-3 text-destructive">
        <LogOut className="w-4 h-4" />
        <span className="text-sm font-semibold">Log out</span>
      </button>
    </div>
  );
}

// Settings as a sheet over whatever screen you're on (one tap from the menu).
export function SettingsSheet({ onClose }) {
  return createPortal(
    <div className="fixed inset-0 z-[1600] bg-black/50 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-md max-h-[88vh] overflow-y-auto overscroll-contain bg-background rounded-t-3xl border-t border-border px-4 pb-[max(20px,env(safe-area-inset-bottom))] dz-pop-in" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-background pt-4 pb-3 flex items-center justify-between">
          <h2 className="text-lg font-black text-foreground">Settings</h2>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center" aria-label="Close settings"><X className="w-4 h-4" /></button>
        </div>
        <SettingsList />
      </div>
    </div>,
    document.body
  );
}

// Teen / kid phones: settings open with the parent's PIN.
function PinGate({ onOpen, onLogout }) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); setErr(''); try { await api.post('/family/unlock', { pin }); onOpen(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  return (
    <div className="bg-card rounded-2xl border border-border p-4 space-y-3 text-center">
      <ShieldCheck className="w-8 h-8 text-primary mx-auto" />
      <div className="text-sm font-bold text-foreground">Settings are locked by a parent</div>
      <p className="text-[11px] text-muted-foreground">Ask a parent to enter the family PIN. Your location is shared with your family.</p>
      <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} onKeyDown={(e) => e.key === 'Enter' && go()} inputMode="numeric" type="password" placeholder="Parent PIN" className="w-full bg-secondary rounded-xl px-3 py-2.5 text-center text-lg tracking-[0.4em] text-foreground" />
      {err && <p className="text-xs text-destructive">{err}</p>}
      <button disabled={pin.length < 4 || busy} onClick={go} className="w-full dz-go rounded-xl py-2.5 text-sm font-bold disabled:opacity-50">{busy ? 'Checking…' : 'Unlock'}</button>
      <button onClick={onLogout} className="text-xs text-muted-foreground">Log out</button>
    </div>
  );
}
