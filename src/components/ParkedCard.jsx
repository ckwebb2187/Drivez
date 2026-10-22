import { useEffect, useState } from 'react';
import { ParkingSquare, X, Footprints } from 'lucide-react';
import { distM, formatNavDistance } from '@/lib/nav';

const read = () => { try { return JSON.parse(localStorage.getItem('dz-parked') || 'null'); } catch { return null; } };
const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };

// "Your car is parked at …" — shown once you've walked away from where a drive ended.
export default function ParkedCard({ pos }) {
  const [spot, setSpot] = useState(read);
  useEffect(() => {
    if (!spot || spot.label) return;
    fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${spot.lat}&lon=${spot.lng}&zoom=18`)
      .then((r) => r.json()).then((d) => {
        const a = d.address || {};
        const label = [a.house_number && a.road ? `${a.house_number} ${a.road}` : a.road, a.city || a.town || a.suburb].filter(Boolean).join(', ') || 'your last stop';
        const next = { ...spot, label };
        try { localStorage.setItem('dz-parked', JSON.stringify(next)); } catch { /* ignore */ }
        setSpot(next);
      }).catch(() => {});
  }, [spot]);
  if (!spot || Date.now() - spot.at > 3 * 86400000) return null;
  const away = pos ? distM(pos, [spot.lat, spot.lng]) : null;
  if (away == null || away < 150) return null;
  const clear = () => { try { localStorage.removeItem('dz-parked'); } catch { /* ignore */ } setSpot(null); };
  return (
    <div className="mt-2 bg-card/95 backdrop-blur rounded-2xl border border-border shadow-xl flex items-center gap-3 pl-3 pr-1.5 py-2 dz-pop-in">
      <div className="w-9 h-9 rounded-full bg-[#4285F4]/15 flex items-center justify-center shrink-0"><ParkingSquare className="w-4 h-4 text-[#4285F4]" /></div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-foreground truncate">{spot.car ? `${spot.car} parked` : 'Parked'} · {formatNavDistance(away)} away</div>
        <div className="text-[11px] text-muted-foreground truncate">{spot.label || 'Finding the address…'} · {ago(spot.at)}</div>
      </div>
      <a href={`https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}&travelmode=walking`} target="_blank" rel="noopener noreferrer"
        className="h-9 px-3 rounded-full dz-go text-xs font-bold flex items-center gap-1"><Footprints className="w-3.5 h-3.5" />Walk</a>
      <button onClick={clear} className="w-8 h-8 flex items-center justify-center" aria-label="Forget parking spot"><X className="w-4 h-4 text-muted-foreground" /></button>
    </div>
  );
}
