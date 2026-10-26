import { useEffect, useRef, useState } from 'react';
import { Mic, Loader2 } from 'lucide-react';
import { recordWav } from '@/lib/voice';
import { sendVoice } from '@/lib/convoy';

// Hold to talk to your group drive; let go to send (up to 15 s).
// Big target, works with a thumb while parked or from a passenger.
export default function PushToTalk({ code, className = '', compact = true }) {
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
  const handlers = { onPointerDown: start, onPointerUp: stop, onPointerLeave: recording ? stop : undefined, onPointerCancel: stop, onContextMenu: (e) => e.preventDefault() };
  const label = recording ? `${Math.ceil(15 - secs)} s · let go to send` : state === 'sending' ? 'Sending…' : state === 'err' ? 'Mic blocked' : 'Hold to talk';

  // Small round mic for the map: a slow breathing glow, ripples and a countdown ring while you talk.
  if (compact) {
    const R = 19, C = 2 * Math.PI * R;
    return (
      <button {...handlers} aria-label="Hold to talk to your group" title={label}
        className={`relative w-11 h-11 rounded-full flex items-center justify-center select-none touch-none pointer-events-auto shadow-xl border transition-transform duration-150 ${recording ? 'scale-110 bg-red-600 border-red-400 text-white' : 'dz-ptt-idle bg-card/95 backdrop-blur border-primary/50 text-primary'} ${className}`}>
        {recording && <>
          <span className="dz-ptt-ripple" /><span className="dz-ptt-ripple" style={{ animationDelay: '0.6s' }} />
          <span className="absolute inset-0 rounded-full bg-red-400/40" style={{ transform: `scale(${1 + level * 0.5})`, transition: 'transform 80ms' }} />
          <svg className="absolute inset-[-3px] w-[50px] h-[50px] -rotate-90" viewBox="0 0 44 44" aria-hidden="true">
            <circle cx="22" cy="22" r={R} fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${C * Math.max(0, 1 - secs / 15)} ${C}`} />
          </svg>
        </>}
        {state === 'sending' ? <Loader2 className="w-5 h-5 animate-spin relative" /> : <Mic className="w-5 h-5 relative" />}
        {recording && <span className="absolute right-full mr-2 whitespace-nowrap rounded-full bg-red-600 text-white text-[11px] font-bold px-2.5 py-1 shadow-lg dz-pop-in">{Math.ceil(15 - secs)} s · let go to send</span>}
        {state === 'err' && <span className="absolute right-full mr-2 whitespace-nowrap rounded-full bg-card text-foreground text-[11px] font-bold px-2.5 py-1 shadow-lg border border-border">Mic blocked</span>}
      </button>
    );
  }
  return (
    <button {...handlers}
      aria-label="Hold to talk to your group"
      className={`relative h-11 pl-3 pr-3.5 rounded-full shadow-xl border flex items-center gap-1.5 text-xs font-bold select-none touch-none pointer-events-auto transition-colors ${recording ? 'bg-red-600 border-red-400 text-white' : 'bg-card/95 backdrop-blur border-border text-foreground'} ${className}`}>
      {recording && <span className="absolute inset-0 rounded-full border-2 border-red-300" style={{ transform: `scale(${1 + level * 0.35})`, opacity: 0.7 }} />}
      {state === 'sending' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className={`w-4 h-4 ${recording ? '' : 'text-primary'}`} />}
      {label}
    </button>
  );
}
