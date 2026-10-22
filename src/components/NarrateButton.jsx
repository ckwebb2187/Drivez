import { useState } from 'react';
import { AudioLines, Loader2, Square } from 'lucide-react';
import { recapText, say, stopSpeaking, tripFacts, useAiEnabled } from '@/lib/voice';

// "Narrate this drive": a short spoken recap (written by Gemini when it's set up).
export default function NarrateButton({ trip, car }) {
  const ai = useAiEnabled();
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [playing, setPlaying] = useState(false);
  const go = async () => {
    if (playing) { stopSpeaking(); setPlaying(false); return; }
    setBusy(true);
    try {
      const t = text || await recapText(tripFacts(trip, car), { ai });
      setText(t);
      setPlaying(true);
      await say(t, { natural: ai });
      setTimeout(() => setPlaying(false), Math.min(30000, t.length * 70));
    } finally { setBusy(false); }
  };
  return (
    <div className="mt-2">
      <button onClick={go} className="w-full bg-secondary text-foreground rounded-xl py-2.5 text-xs font-bold flex items-center justify-center gap-1.5">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : playing ? <Square className="w-3 h-3 fill-current" /> : <AudioLines className="w-3.5 h-3.5" />}
        {playing ? 'Stop' : 'Narrate this drive'}
      </button>
      {text && <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{text}</p>}
    </div>
  );
}
