import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, Mic, Square, Send, X, Loader2, Volume2, VolumeX } from 'lucide-react';
import { api } from '@/api/base44Client';
import { recordWav, say, stopSpeaking, useAiEnabled } from '@/lib/voice';

const SUGGEST = ['Nearest gas station', 'Any good drives near me?', 'Report police', 'Switch to Tōge mode', 'What does a blow-off valve do?'];

// "Ask Gemini": tap the button, talk (or type), hear the answer. Gemini can also start
// directions, report something on the road or switch drive modes (onAction).
export default function AskGemini({ context, onAction, size = 50, className = '' }) {
  const enabled = useAiEnabled();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState('idle'); // idle | listening | thinking
  const [level, setLevel] = useState(0);
  const [chat, setChat] = useState([]); // { role: 'user'|'model', text }
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(false);
  const rec = useRef(null);
  const raf = useRef(0);
  const scroller = useRef(null);
  useEffect(() => { scroller.current?.scrollTo({ top: 1e6, behavior: 'smooth' }); }, [chat, phase]);
  useEffect(() => () => { rec.current?.cancel(); cancelAnimationFrame(raf.current); }, []);

  const send = async (payload, shown) => {
    setPhase('thinking'); setError('');
    const history = chat.slice(-6);
    if (shown) setChat((c) => [...c, { role: 'user', text: shown }]);
    try {
      const r = await api.post('/ask', { ...payload, context: context?.() || {}, history });
      setChat((c) => [...c, { role: 'model', text: r.text }]);
      if (!muted) say(r.text);
      if (r.action) {
        try { await onAction?.(r.action); } catch (e) { setChat((c) => [...c, { role: 'model', text: e.message || "Couldn't do that." }]); }
      }
    } catch (e) { setError(e.message || 'Gemini is not answering right now.'); }
    setPhase('idle');
  };

  const listen = async () => {
    setError(''); stopSpeaking();
    try {
      const r = await recordWav(12);
      rec.current = r;
      setPhase('listening');
      const tick = () => { setLevel(r.level()); raf.current = requestAnimationFrame(tick); };
      tick();
      r.finished.then(() => { if (rec.current === r) finish(); });
    } catch { setError('Allow the microphone to ask out loud, or type below.'); }
  };
  const finish = async () => {
    const r = rec.current; rec.current = null; cancelAnimationFrame(raf.current);
    if (!r) return;
    const audio = await r.stop();
    if (audio.seconds < 0.6) { setPhase('idle'); return; }
    send({ audio: { mime: audio.mime, data: audio.data } }, '🎙️ (voice question)');
  };
  const sendTyped = () => { const q = typed.trim(); if (!q) return; setTyped(''); send({ question: q }, q); };
  const openAndListen = () => { setOpen(true); if (phase === 'idle') listen(); };

  if (!enabled) return null;
  return (
    <>
      <button onClick={openAndListen} aria-label="Ask Gemini" style={{ width: size, height: size }}
        className={`rounded-full shadow-xl border border-border bg-card flex items-center justify-center pointer-events-auto ${className}`}>
        <Sparkles className="w-5 h-5" style={{ color: '#8ab4f8' }} />
      </button>
      {open && createPortal(
        <div className="fixed inset-x-0 bottom-0 z-[1650] px-3 pb-[max(12px,env(safe-area-inset-bottom))] pointer-events-none">
          <div className="max-w-md mx-auto bg-card/97 backdrop-blur rounded-3xl border border-border shadow-2xl pointer-events-auto overflow-hidden dz-pop-in">
            <div className="flex items-center gap-2 px-4 pt-3">
              <Sparkles className="w-4 h-4" style={{ color: '#8ab4f8' }} />
              <span className="flex-1 text-sm font-bold text-foreground">Ask Gemini</span>
              <button onClick={() => { setMuted((m) => !m); stopSpeaking(); }} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center" aria-label={muted ? 'Read answers aloud' : 'Mute answers'}>
                {muted ? <VolumeX className="w-4 h-4 text-muted-foreground" /> : <Volume2 className="w-4 h-4 text-foreground" />}
              </button>
              <button onClick={() => { rec.current?.cancel(); rec.current = null; setPhase('idle'); stopSpeaking(); setOpen(false); }} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center" aria-label="Close"><X className="w-4 h-4" /></button>
            </div>
            <div ref={scroller} className="max-h-[34vh] overflow-y-auto px-4 py-2 space-y-2">
              {!chat.length && phase === 'idle' && (
                <div className="flex flex-wrap gap-1.5 py-1">
                  {SUGGEST.map((s) => <button key={s} onClick={() => send({ question: s }, s)} className="text-xs px-3 py-1.5 rounded-full bg-secondary text-foreground">{s}</button>)}
                </div>
              )}
              {chat.map((m, i) => (
                <div key={i} className={`text-sm rounded-2xl px-3 py-2 max-w-[88%] ${m.role === 'user' ? 'ml-auto bg-primary text-primary-foreground' : 'bg-secondary text-foreground'}`}>{m.text}</div>
              ))}
              {phase === 'thinking' && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" />Thinking…</div>}
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
            <div className="flex items-center gap-2 px-3 pb-3">
              {phase === 'listening' ? (
                <button onClick={finish} className="flex-1 h-12 rounded-2xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2">
                  <span className="flex items-end gap-0.5 h-4">{[0.6, 1, 0.75, 0.9, 0.5].map((k, i) => <span key={i} className="w-1 rounded-full bg-current transition-all" style={{ height: `${Math.max(15, Math.min(100, level * 100 * k + 10))}%` }} />)}</span>
                  Listening… tap to send <Square className="w-3.5 h-3.5 fill-current" />
                </button>
              ) : (
                <>
                  <input value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendTyped()} placeholder="Ask anything…" disabled={phase === 'thinking'}
                    className="flex-1 h-12 bg-secondary rounded-2xl px-4 text-sm text-foreground border border-border focus:border-primary outline-none" />
                  {typed.trim()
                    ? <button onClick={sendTyped} className="w-12 h-12 rounded-2xl dz-go flex items-center justify-center" aria-label="Send"><Send className="w-5 h-5" /></button>
                    : <button onClick={listen} disabled={phase === 'thinking'} className="w-12 h-12 rounded-2xl dz-go flex items-center justify-center" aria-label="Talk"><Mic className="w-5 h-5" /></button>}
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
