import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wrench, X } from 'lucide-react';
import { reminders, dueText } from '@/lib/maintenance';

// Home-screen nudge when a service on the car you're driving is due soon or overdue.
export default function ServiceDueCard({ vehicle, trips }) {
  const navigate = useNavigate();
  const due = reminders(vehicle, trips).filter((r) => r.status === 'overdue' || r.status === 'soon')
    .sort((a, b) => (a.status === 'overdue' ? -1 : 0) - (b.status === 'overdue' ? -1 : 0) || (a.milesLeft ?? 1e9) - (b.milesLeft ?? 1e9));
  const key = `dz-service-hide-${vehicle.id}-${due.map((r) => r.key).join(',')}`;
  const [hidden, setHidden] = useState(() => { try { return Number(localStorage.getItem(key) || 0) > Date.now(); } catch { return false; } });
  if (!due.length || hidden) return null;
  const top = due[0];
  const hide = () => { try { localStorage.setItem(key, String(Date.now() + 3 * 86400000)); } catch { /* private mode */ } setHidden(true); };
  return (
    <div className="mt-2 bg-card/95 backdrop-blur rounded-2xl border border-border shadow-xl flex items-center gap-3 pl-3 pr-1.5 py-2 dz-pop-in">
      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${top.status === 'overdue' ? 'bg-destructive/15' : 'bg-amber-400/15'}`}>
        <Wrench className={`w-4 h-4 ${top.status === 'overdue' ? 'text-destructive' : 'text-amber-400'}`} />
      </div>
      <button onClick={() => navigate('/profile')} className="flex-1 min-w-0 text-left">
        <div className="text-sm font-semibold text-foreground truncate">{top.label} {top.status === 'overdue' ? 'overdue' : 'due soon'}{due.length > 1 ? ` +${due.length - 1} more` : ''}</div>
        <div className="text-[11px] text-muted-foreground truncate">{vehicle.nickname || `${vehicle.make} ${vehicle.model}`} · {dueText(top)}</div>
      </button>
      <button onClick={hide} className="w-8 h-8 flex items-center justify-center" aria-label="Hide for 3 days"><X className="w-4 h-4 text-muted-foreground" /></button>
    </div>
  );
}
