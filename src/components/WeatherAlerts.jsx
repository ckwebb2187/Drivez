import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { TriangleAlert, X, Navigation, ChevronRight, Loader2 } from 'lucide-react';
import { EVACUATE, pickEvacuationCity } from '@/lib/alerts';
import { weatherAlongRoute } from '@/lib/routeWeather';
import { dst, distUnit } from '@/lib/units';
import { alertsAlongRoute } from '@/lib/alerts';

export const colorFor = (a) => (/Warning|Emergency/.test(a.event) ? '#EA4335' : /Watch/.test(a.event) ? '#F9AB00' : '#FB8C00');

// Red banner when there's a serious alert where you are; opens details + evacuation route.
export function AlertsBanner({ alerts, pos, onRoute, className = '' }) {
  const [open, setOpen] = useState(false);
  if (!alerts.length) return null;
  const top = alerts[0];
  const canEvacuate = pos && alerts.some((a) => EVACUATE.test(a.event));
  const evacuate = () => {
    const city = pickEvacuationCity(pos, alerts);
    if (city) { setOpen(false); onRoute(city); }
  };
  return (
    <>
      <button onClick={() => setOpen(true)} className={`w-full rounded-2xl shadow-xl px-3 py-2.5 flex items-center gap-2 text-left text-white ${className}`} style={{ background: colorFor(top) }}>
        <TriangleAlert className="w-5 h-5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold truncate">{top.event}{alerts.length > 1 ? ` +${alerts.length - 1} more` : ''}</div>
          <div className="text-[11px] opacity-90 truncate">{top.headline || top.area}</div>
        </div>
        <ChevronRight className="w-4 h-4 shrink-0" />
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[1600] bg-black/60 flex items-end justify-center" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md max-h-[85vh] overflow-y-auto bg-card border-t border-border rounded-t-3xl p-5 pb-10" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-foreground">Weather alerts here</h3>
              <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center" aria-label="Close"><X className="w-4 h-4" /></button>
            </div>
            {canEvacuate && (
              <button onClick={evacuate} className="w-full mb-4 h-12 rounded-xl bg-[#EA4335] text-white font-bold text-sm flex items-center justify-center gap-2">
                <Navigation className="w-4 h-4 fill-white" /> Evacuation route (inland, away from alerts)
              </button>
            )}
            <div className="space-y-3">
              {alerts.map((a) => (
                <div key={a.id} className="rounded-2xl border border-border p-3">
                  <div className="text-sm font-bold" style={{ color: colorFor(a) }}>{a.event}</div>
                  <div className="text-[11px] text-muted-foreground mb-1">{a.area}{a.ends ? ` · until ${new Date(a.ends).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}</div>
                  {a.instruction && <p className="text-xs text-foreground whitespace-pre-line mb-1">{a.instruction}</p>}
                  <details><summary className="text-[11px] text-primary">Details</summary><p className="text-[11px] text-muted-foreground whitespace-pre-line mt-1">{a.description}</p></details>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-3">From the National Weather Service. Always follow local officials' evacuation orders and routes; turn around at flooded roads.</p>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// Weather along the planned route + any alerts it passes through (for the route card).
export function RouteConditions({ route, departAt }) {
  const [wx, setWx] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setWx(null); setAlerts([]); setLoading(true);
    weatherAlongRoute(route, departAt).then((w) => alive && setWx(w)).catch(() => {}).finally(() => alive && setLoading(false));
    alertsAlongRoute(route.coords).then((a) => alive && setAlerts(a)).catch(() => {});
    return () => { alive = false; };
  }, [route]); // eslint-disable-line react-hooks/exhaustive-deps
  const time = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (
    <div className="mt-2">
      {alerts.length > 0 && (
        <div className="text-[11px] font-semibold text-[#EA4335] flex items-center gap-1 mb-1">
          <TriangleAlert className="w-3.5 h-3.5" /> Passes through: {[...new Set(alerts.map((a) => a.event))].join(', ')}
        </div>
      )}
      {loading ? (
        <div className="text-[11px] text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Checking weather along the way…</div>
      ) : wx && (
        <button onClick={() => setOpen(!open)} className="w-full text-left">
          <div className={`text-[11px] font-semibold ${wx.worst?.level >= 3 ? 'text-[#F9AB00]' : 'text-muted-foreground'}`}>{wx.summary} {open ? '▴' : '▾'}</div>
          {open && (
            <div className="flex gap-2 mt-2 overflow-x-auto no-scrollbar">
              {wx.points.map((p, i) => (
                <div key={i} className="shrink-0 w-[68px] rounded-xl bg-secondary/60 px-2 py-1.5 text-center">
                  <div className="text-lg leading-none">{p.emoji}</div>
                  <div className="text-xs font-bold text-foreground mt-1">{p.temp}°</div>
                  <div className="text-[9px] text-muted-foreground">{i === 0 ? 'Now' : `${distUnit()} ${dst(p.miles, 0)}`}</div>
                  <div className="text-[9px] text-muted-foreground">{time(p.eta)}</div>
                  {p.rainChance != null && p.rainChance >= 20 && <div className="text-[9px] text-[#64b5f6]">{p.rainChance}% rain</div>}
                </div>
              ))}
            </div>
          )}
        </button>
      )}
    </div>
  );
}
