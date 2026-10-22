import { useEffect, useRef, useState } from 'react';
import { api } from '@/api/base44Client';
import { distM } from '@/lib/nav';

// Posted speed limits from OpenStreetMap. Roads are loaded around you (~2 km at a time)
// and the limit of the road you're on is picked by distance and direction of travel.

const toXY = ([lat, lng], lat0) => [lng * 111320 * Math.cos((lat0 * Math.PI) / 180), lat * 110540];
function segInfo(p, a, b, lat0) {
  const [px, py] = toXY(p, lat0), [ax, ay] = toXY(a, lat0), [bx, by] = toXY(b, lat0);
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L));
  const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  const brg = (Math.atan2(dx, dy) * 180) / Math.PI; // 0 = north
  return { d, brg: (brg + 360) % 360 };
}
const angleGap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

export function useSpeedLimit(pos, heading, enabled) {
  const [roads, setRoads] = useState([]);
  const [limit, setLimit] = useState(null);
  const lastLoad = useRef(null);
  const lastHit = useRef(0);

  // Load roads around you; again after moving ~1.2 km.
  useEffect(() => {
    if (!enabled || !pos) return;
    if (lastLoad.current && distM(lastLoad.current, pos) < 1200) return;
    lastLoad.current = pos;
    const d = 0.02;
    api.get(`/osm?kind=limits&s=${pos[0] - d}&w=${pos[1] - d}&n=${pos[0] + d}&e=${pos[1] + d}`)
      .then((r) => setRoads(r.items || []))
      .catch(() => { lastLoad.current = null; });
  }, [enabled, pos?.[0], pos?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  // Which road are you on?
  useEffect(() => {
    if (!enabled || !pos || !roads.length) return;
    let best = null, bestLimit = null;
    for (const r of roads) {
      for (let i = 1; i < r.g.length; i++) {
        const { d, brg } = segInfo(pos, r.g[i - 1], r.g[i], pos[0]);
        if (d > 30) continue;
        // Prefer roads lined up with the way you're going (either direction unless one-way).
        let score = d;
        if (heading != null && !Number.isNaN(heading)) {
          const gap = r.oneway ? angleGap(brg, heading) : Math.min(angleGap(brg, heading), angleGap(brg + 180, heading));
          score += gap > 50 ? 40 : gap / 5;
        }
        if (!best || score < best.score) best = { score, mph: r.mph, name: r.name };
        if (r.mph && (!bestLimit || score < bestLimit.score)) bestLimit = { score, mph: r.mph };
      }
    }
    if (best && best.score < 45) { setLimit({ name: best.name, mph: bestLimit && bestLimit.score < 45 ? bestLimit.mph : null }); lastHit.current = Date.now(); }
    else if (Date.now() - lastHit.current > 12000) setLimit(null); // keep the last sign briefly through gaps
  }, [enabled, roads, pos?.[0], pos?.[1], heading]); // eslint-disable-line react-hooks/exhaustive-deps

  return enabled ? limit : null;
}
