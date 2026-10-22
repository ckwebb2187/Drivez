import { useMemo, useState } from 'react';
import { badgeProgress, TIER_COLORS } from '@/lib/badges';

// Grid of badges: earned ones glow in their tier color, the rest show progress.
export default function Badges({ trips, cars }) {
  const list = useMemo(() => badgeProgress(trips, cars), [trips, cars]);
  const [pick, setPick] = useState(null);
  const sel = list.find((b) => b.id === pick);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        {list.map((b) => {
          const c = b.tier >= 0 ? TIER_COLORS[b.tier] : null;
          return (
            <button key={b.id} onClick={() => setPick(pick === b.id ? null : b.id)}
              className={`rounded-2xl border p-2 flex flex-col items-center gap-1 ${pick === b.id ? 'border-primary' : 'border-border'} ${c ? 'bg-card' : 'bg-secondary/40'}`}>
              <div className="w-11 h-11 rounded-full flex items-center justify-center text-xl"
                style={c ? { background: `${c}22`, boxShadow: `0 0 0 2px ${c}, 0 0 12px ${c}66` } : { filter: 'grayscale(1)', opacity: 0.45 }}>{b.icon}</div>
              <div className="text-[10px] font-semibold text-foreground text-center leading-tight">{b.name}</div>
              <div className="w-full h-1 rounded-full bg-secondary overflow-hidden"><div className="h-full rounded-full bg-primary" style={{ width: `${b.pct * 100}%` }} /></div>
            </button>
          );
        })}
      </div>
      {sel && (
        <div className="bg-card rounded-2xl border border-border p-3 text-sm">
          <div className="font-bold text-foreground">{sel.icon} {sel.name}{sel.tierName ? <span style={{ color: TIER_COLORS[sel.tier] }}> · {sel.tierName}</span> : null}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{sel.what}: <span className="text-foreground font-semibold">{sel.value.toLocaleString()}</span>{sel.next ? ` · next tier at ${sel.next.toLocaleString()}` : ' · maxed out'}</div>
        </div>
      )}
    </div>
  );
}
