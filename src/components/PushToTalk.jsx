import { useEffect, useRef, useState } from 'react';
import { Mic, Loader2 } from 'lucide-react';
import { recordWav } from '@/lib/voice';
import { sendVoice } from '@/lib/convoy';

// Hold to talk to your group drive; let go to send (up to 15 s).
// Big target, works with a thumb while parked or from a passenger.
export default function PushToTalk({ code, className = '' }) {
  const [state, setState] = useState('idle'); // idle | rec | sending | err
  const [level, setLevel] = useState(0);
  const [secs, setSecs] = useState(0);
  const rec = useRef(null);
  const t0 = useRef(0);
  const raf = useRef(0);
  useEffect(() => () => { cancelAnimationFrame(raf.current); rec.current?.cancel(); }, []);

  const start = async (e) => {
    e.preventDefault();
    if (state !== 'idle') return;
    try {
      setState('rec'); t0.current = Date.now();
      rec.current = await recordWav(15);
      try { navigator.vibrate?.(30); } catch { /* ignore */ }
      const tick = () => { setLevel(rec.current?.level() || 0); setSecs((Date.now() - t0.current) / 1000); raf.current = requestAnimationFrame(tick); };
      tick();
      rec.current.finished.then(() => stop());
    } catch { setState('err'); setTimeout(() => setState('idle'), 2000); }
  };
  const stop = async () => {
    cancelAnimationFrame(raf.current);
    const r = rec.current; rec.current = null;
    if (!r) return;
    if ((Date.now() - t0.current) < 600) { r.cancel(); setState('idle'); return; } // a tap, not a hold
    setState('sending');
    try { const clip = await r.stop(); await sendVoice(code, clip); setState('idle'); }
    catch { setState('err'); setTimeout(() => setState('idle'), 2000); }
  };

  const recording = state === 'rec';
  return (
    <button onPointerDown={start} onPointerUp={stop} onPointerLeave={recording ? stop : undefined} onPointerCancel={stop} onContextMenu={(e) => e.preventDefault()}
      aria-label="Hold to talk to your group"
      className={`relative h-11 pl-3 pr-3.5 rounded-full shadow-xl border flex items-center gap-1.5 text-xs font-bold select-none touch-none pointer-events-auto transition-colors ${recording ? 'bg-red-600 border-red-400 text-white' : 'bg-card/95 backdrop-blur border-border text-foreground'} ${className}`}>
      {recording && <span className="absolute inset-0 rounded-full border-2 border-red-300" style={{ transform: `scale(${1 + level * 0.35})`, opacity: 0.7 }} />}
      {state === 'sending' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className={`w-4 h-4 ${recording ? '' : 'text-primary'}`} />}
      {recording ? `${Math.ceil(15 - secs)} s · let go to send` : state === 'sending' ? 'Sending…' : state === 'err' ? 'Mic blocked' : 'Hold to talk'}
    </button>
  );
}
