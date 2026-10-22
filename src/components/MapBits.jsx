import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, CornerUpLeft, CornerUpRight, ArrowUpLeft, ArrowUpRight, RotateCcw, Flag, RefreshCw, GitFork, TriangleAlert, X, Loader2 } from 'lucide-react';
import { carMarkup } from '@/lib/cars';
import { REPORT_TYPES } from '@/lib/reports';
import { formatTimeAgo } from '@/lib/helpers';

export function TurnIcon({ step, className = 'w-8 h-8' }) {
  if (!step) return null;
  const m = step.modifier || '';
  let Icon = ArrowUp;
  if (step.type === 'arrive') Icon = Flag;
  else if (m === 'uturn') Icon = RotateCcw;
  else if (['roundabout', 'rotary', 'roundabout turn'].includes(step.type)) Icon = RefreshCw;
  else if (step.type === 'fork') Icon = GitFork;
  else if (m === 'sharp left' || m === 'left') Icon = CornerUpLeft;
  else if (m === 'sharp right' || m === 'right') Icon = CornerUpRight;
  else if (m === 'slight left') Icon = ArrowUpLeft;
  else if (m === 'slight right') Icon = ArrowUpRight;
  return <Icon className={className} strokeWidth={2.6} />;
}

// Waze-style orange Report button and picker.
export function ReportButton({ onReport, disabled, size = 52 }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [done, setDone] = useState('');
  const pick = async (type) => {
    setBusy(type);
    try { await onReport(type); setDone(REPORT_TYPES[type].label); setTimeout(() => { setOpen(false); setDone(''); }, 1200); }
    catch (e) { setDone(e.message || 'Could not send report'); }
    finally { setBusy(''); }
  };
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Report"
        className="rounded-full flex items-center justify-center shadow-xl active:scale-95 transition-transform border-2 border-white/80"
        style={{ width: size, height: size, background: 'linear-gradient(145deg,#ffb020,#ff7a00)' }}
      >
        <TriangleAlert className="w-6 h-6 text-white" strokeWidth={2.6} />
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/60" onClick={() => !busy && setOpen(false)}>
          <div className="bg-card w-full max-w-md rounded-t-3xl p-5 pb-8 border-t border-border" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground">What do you see?</h2>
              <button onClick={() => setOpen(false)} aria-label="Close"><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            {disabled ? (
              <p className="text-sm text-muted-foreground">Waiting for your location before you can report.</p>
            ) : done ? (
              <p className="text-center text-sm font-semibold text-accent py-6">{done.startsWith('Could') ? done : `${done} reported — thanks!`}</p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {Object.entries(REPORT_TYPES).map(([k, t]) => (
                  <button key={k} onClick={() => pick(k)} disabled={!!busy} className="flex flex-col items-center gap-2 py-3 rounded-2xl bg-secondary active:scale-95 transition-transform disabled:opacity-50">
                    <span className="w-14 h-14 rounded-full flex items-center justify-center text-2xl border-2 border-white/80" style={{ background: t.color }}>
                      {busy === k ? <Loader2 className="w-6 h-6 text-white animate-spin" /> : t.emoji}
                    </span>
                    <span className="text-xs font-semibold text-foreground">{t.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
