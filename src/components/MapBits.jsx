import { useEffect, useMemo, useState } from 'react';
import { Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { createPortal } from 'react-dom';
import { ArrowUp, CornerUpLeft, CornerUpRight, ArrowUpLeft, ArrowUpRight, RotateCcw, Flag, RefreshCw, GitFork, TriangleAlert, X, Loader2 } from 'lucide-react';
import { carSvg } from '@/lib/cars';
import { REPORT_TYPES } from '@/lib/reports';
import { formatTimeAgo } from '@/lib/helpers';

function carIcon(car, heading, size = 1) {
  const w = Math.round(30 * size), h = Math.round(60 * size);
  return L.divIcon({
    className: '',
    iconSize: [h, h],
    iconAnchor: [h / 2, h / 2],
    html: `<div style="width:${h}px;height:${h}px;display:flex;align-items:center;justify-content:center;transform:rotate(${heading || 0}deg);transition:transform .4s ease;filter:drop-shadow(0 2px 3px rgba(0,0,0,.6))"><div style="width:${w}px;height:${h}px">${carSvg(car.body, car.color).replace('width="40" height="80"', `width="${w}" height="${h}"`)}</div></div>`,
  });
}

// A friend (or anyone) on the map as their car, with their name.
export function CarMarker({ pos, car, heading, label }) {
  const icon = useMemo(() => carIcon(car, heading, 0.85), [car?.body, car?.color, heading]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Marker position={pos} icon={icon}>
      {label && <Tooltip permanent direction="top" offset={[0, -24]} className="dz-car-label">{label}</Tooltip>}
    </Marker>
  );
}

// Your position: your car when you've picked one, otherwise a blue dot with a pointer.
export function LocationMarker({ pos, heading, car }) {
  const icon = useMemo(() => car ? carIcon(car, heading, 1) : L.divIcon({
    className: '',
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    html: `<div style="position:relative;width:44px;height:44px">
      ${heading != null ? `<div style="position:absolute;inset:0;transform:rotate(${heading}deg)"><div style="position:absolute;left:50%;top:0;transform:translateX(-50%);width:0;height:0;border-left:9px solid transparent;border-right:9px solid transparent;border-bottom:16px solid rgba(66,133,244,.85)"></div></div>` : ''}
      <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:20px;height:20px;border-radius:50%;background:#4285F4;border:3px solid #fff;box-shadow:0 0 0 6px rgba(66,133,244,.25),0 1px 4px rgba(0,0,0,.5)"></div>
    </div>`,
  }), [heading, car?.body, car?.color]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!pos) return null;
  return <Marker position={pos} icon={icon} interactive={false} zIndexOffset={1000} />;
}

export function PinMarker({ pos, color = '#EA4335' }) {
  const icon = useMemo(() => L.divIcon({
    className: '',
    iconSize: [32, 42],
    iconAnchor: [16, 40],
    html: `<svg width="32" height="42" viewBox="0 0 32 42"><path d="M16 1C7.7 1 1 7.6 1 15.8 1 27 16 41 16 41s15-14 15-25.2C31 7.6 24.3 1 16 1z" fill="${color}" stroke="#fff" stroke-width="2"/><circle cx="16" cy="15.5" r="5.5" fill="#fff"/></svg>`,
  }), [color]);
  if (!pos) return null;
  return <Marker position={pos} icon={icon} interactive={false} />;
}

// Keeps the map centred on you until you drag it.
export function FollowMe({ pos, follow, onUserMove, zoom }) {
  const map = useMap();
  useEffect(() => {
    const stop = () => onUserMove?.();
    map.on('dragstart', stop);
    return () => { map.off('dragstart', stop); };
  }, [map, onUserMove]);
  useEffect(() => {
    if (follow && pos) map.setView(pos, zoom ?? Math.max(map.getZoom(), 15), { animate: true });
  }, [pos, follow]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export function FitBounds({ points, padding = [60, 60], paddingBottom }) {
  const map = useMap();
  useEffect(() => {
    if (!points?.length) return;
    map.fitBounds(L.latLngBounds(points), {
      paddingTopLeft: [padding[0], padding[1]],
      paddingBottomRight: [padding[0], paddingBottom ?? padding[1]],
      animate: true,
    });
  }, [points]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

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

function reportIcon(type) {
  const t = REPORT_TYPES[type] || REPORT_TYPES.hazard;
  return L.divIcon({
    className: '',
    iconSize: [38, 46],
    iconAnchor: [19, 44],
    html: `<div style="position:relative;width:38px;height:46px"><div style="width:38px;height:38px;border-radius:50%;background:${t.color};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;font-size:19px">${t.emoji}</div><div style="position:absolute;left:50%;bottom:0;transform:translateX(-50%);width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:10px solid #fff"></div></div>`,
  });
}

// Road reports on the map. Tap one to confirm it's still there or dismiss it.
export function ReportMarkers({ reports, onVote, onRemove }) {
  const icons = useMemo(() => Object.fromEntries(Object.keys(REPORT_TYPES).map((k) => [k, reportIcon(k)])), []);
  return reports.map((r) => (
    <Marker key={r.id} position={[r.lat, r.lng]} icon={icons[r.type] || icons.hazard}>
      <Popup closeButton={false} className="dz-popup">
        <ReportPopup r={r} onVote={onVote} onRemove={onRemove} />
      </Popup>
    </Marker>
  ));
}

function ReportPopup({ r, onVote, onRemove }) {
  const [busy, setBusy] = useState(false);
  const t = REPORT_TYPES[r.type] || REPORT_TYPES.hazard;
  const act = async (fn) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  return (
    <div style={{ minWidth: 190 }}>
      <div style={{ fontWeight: 700, fontSize: 15 }}>{t.emoji} {t.label}</div>
      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>Reported by {r.by} · {formatTimeAgo(r.created)}{r.confirms ? ` · ${r.confirms} confirmed` : ''}</div>
      {busy ? <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center' }}><Loader2 className="w-5 h-5 animate-spin" /></div> : r.mine ? (
        <button onClick={() => act(() => onRemove(r.id))} className="dz-pop-btn" style={{ marginTop: 10, width: '100%' }}>Remove my report</button>
      ) : (
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <button onClick={() => act(() => onVote(r.id, true))} className="dz-pop-btn dz-pop-yes" disabled={r.myVote === true}>{r.myVote === true ? 'Thanks!' : 'Still there'}</button>
          <button onClick={() => act(() => onVote(r.id, false))} className="dz-pop-btn" disabled={r.myVote === false}>Not there</button>
        </div>
      )}
    </div>
  );
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
