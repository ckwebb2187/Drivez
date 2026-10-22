import { useVoiceSettings, useAiEnabled, say } from '@/lib/voice';

const VOICES = [['Puck', 'Puck · upbeat'], ['Kore', 'Kore · calm'], ['Charon', 'Charon · deep'], ['Fenrir', 'Fenrir · bold'], ['Aoede', 'Aoede · bright'], ['Zephyr', 'Zephyr · smooth']];
const Toggle = ({ on }) => (
  <span className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${on ? 'bg-[#34A853]' : 'bg-muted'}`}>
    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
  </span>
);

// Co-driver narration on/off, and which voice talks: the phone's or Gemini's.
export default function VoiceSettings() {
  const [v, set] = useVoiceSettings();
  const ai = useAiEnabled();
  return (
    <div className="space-y-3">
      <button onClick={() => set({ narrate: !v.narrate })} className="w-full flex items-center gap-3 text-left">
        <div className="flex-1"><div className="text-sm font-semibold text-foreground">Co-driver narration</div><div className="text-[11px] text-muted-foreground">Callouts every 5 miles, Tōge corner counts, and a spoken recap when a drive is saved</div></div>
        <Toggle on={v.narrate} />
      </button>
      <div>
        <div className="text-[11px] font-semibold text-muted-foreground mb-1.5">Voice</div>
        <div className="flex bg-secondary rounded-xl p-1">
          {[['device', 'Phone voice'], ['gemini', 'Gemini voice']].map(([k, l]) => (
            <button key={k} disabled={k === 'gemini' && !ai} onClick={() => set({ style: k })} className={`flex-1 text-xs py-2 rounded-lg disabled:opacity-40 ${v.style === k ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground'}`}>{l}</button>
          ))}
        </div>
        {!ai && <p className="text-[10px] text-muted-foreground mt-1">Gemini voice and Ask Gemini turn on once Gemini is set up for Kaido Maps.</p>}
      </div>
      {v.style === 'gemini' && ai && (
        <div className="grid grid-cols-2 gap-1.5">
          {VOICES.map(([k, l]) => (
            <button key={k} onClick={() => { set({ gemVoice: k }); setTimeout(() => say('Kaido Maps. Ready when you are.', { natural: true }), 50); }}
              className={`text-xs py-2 rounded-lg border ${v.gemVoice === k ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border text-muted-foreground'}`}>{l}</button>
          ))}
        </div>
      )}
      <button onClick={() => say('Five miles in. Smooth driving, keep it up.')} className="text-xs font-semibold text-primary">Test the voice</button>
    </div>
  );
}
