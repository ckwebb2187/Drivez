import { useEffect, useMemo, useRef, useState } from 'react';
import { distM, distToLineM, getRoute, speak, spokenDistance } from './nav';

const STEP_REACHED_M = 30;   // count a turn as done within this distance
const OFF_ROUTE_M = 60;      // further than this from the route line = off route
const OFF_ROUTE_FIXES = 3;   // ...for this many GPS fixes in a row → reroute
const ARRIVED_M = 40;
const PASSED_M = 12;         // a turn counts as done once you're this far past it along the road

// The route as a measured line: distance along it to every point, and where each turn sits on it.
function measure(route) {
  const c = route?.coords || [];
  const along = [0];
  for (let i = 1; i < c.length; i++) along.push(along[i - 1] + distM(c[i - 1], c[i]));
  // Each turn: the route point nearest to it, searching forward so loops don't confuse it.
  let k = 0;
  const stepAt = (route?.steps || []).map((st) => {
    let best = k, bd = Infinity;
    for (let i = k; i < Math.min(c.length, k + 4000); i++) { const d = distM([st.lat, st.lng], c[i]); if (d < bd) { bd = d; best = i; } if (bd < 3) break; }
    k = best;
    return along[best] || 0;
  });
  return { c, along, stepAt, total: along[along.length - 1] || 0 };
}

// Where you are on the route: the nearest spot on the line (searching around where you were last),
// how far along the road that is, and how far you are from the road.
function project(geo, pos, hint) {
  const { c, along } = geo;
  if (c.length < 2) return null;
  const kx = Math.cos((pos[0] * Math.PI) / 180) * 111320, ky = 110540;
  const scan = (from, to) => {
    let best = null;
    for (let i = Math.max(0, from); i < Math.min(c.length - 1, to); i++) {
      const ax = (c[i][1] - pos[1]) * kx, ay = (c[i][0] - pos[0]) * ky;
      const bx = (c[i + 1][1] - pos[1]) * kx, by = (c[i + 1][0] - pos[0]) * ky;
      const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
      const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
      const off = Math.hypot(ax + t * dx, ay + t * dy);
      if (!best || off < best.off - 0.5) best = { i, t, off };
    }
    return best;
  };
  // Prefer the stretch just behind / ahead of the last known spot; fall back to the whole route.
  let b = scan(hint - 10, hint + 400);
  if (!b || b.off > 80) { const all = scan(0, c.length); if (all && (!b || all.off < b.off)) b = all; }
  if (!b) return null;
  const segLen = along[b.i + 1] - along[b.i];
  const lat = c[b.i][0] + (c[b.i + 1][0] - c[b.i][0]) * b.t, lng = c[b.i][1] + (c[b.i + 1][1] - c[b.i][1]) * b.t;
  const brg = (Math.atan2((c[b.i + 1][1] - c[b.i][1]) * kx, (c[b.i + 1][0] - c[b.i][0]) * ky) * 180) / Math.PI;
  return { seg: b.i, s: along[b.i] + segLen * b.t, off: b.off, snapped: [lat, lng], bearing: (brg + 360) % 360 };
}

// Turn-by-turn guidance for a planned route. `plan` = { dest, stops?, route } or null.
// With stops, guidance announces each stop and carries on to the next one.
export function useNavigation(plan, pos, voice) {
  const [route, setRoute] = useState(plan?.route || null);
  const [idx, setIdx] = useState(1);
  const [rerouting, setRerouting] = useState(false);
  const [arrived, setArrived] = useState(false);
  const stops = plan?.stops || [];
  const [stopIdx, setStopIdx] = useState(0); // next stop not yet reached
  const [justReached, setJustReached] = useState(null);
  const legBase = useRef(0); // which stop the current route's first leg goes to
  const offCount = useRef(0);
  const geo = useMemo(() => measure(route), [route]);
  const prog = useRef({ seg: 0, s: 0, off: 0, snapped: null, bearing: null });
  useEffect(() => { prog.current = { seg: 0, s: 0, off: 0, snapped: null, bearing: null }; }, [route]);
  const said = useRef(new Set());
  const startedVoice = useRef(false);

  // A new plan (tap Go, open a saved plan) or none (End route): start guidance fresh.
  // The drive screen stays open all the time, so this can't rely on the screen reopening.
  const planRef = useRef(plan);
  useEffect(() => {
    if (planRef.current === plan) return;
    planRef.current = plan;
    setRoute(plan?.route || null);
    setIdx(1); setRerouting(false); setArrived(false); setStopIdx(0); setJustReached(null);
    legBase.current = 0; offCount.current = 0; said.current = new Set(); startedVoice.current = false;
  }, [plan]);

  // First instruction when guidance starts.
  useEffect(() => {
    if (voice && plan && route && !startedVoice.current) {
      startedVoice.current = true;
      const first = route.steps[0];
      const next = route.steps[1];
      speak(next ? `${first.text}. Then, ${next.text.toLowerCase()}` : first.text);
    }
  }, [voice, route]);

  useEffect(() => {
    if (!plan || !route || !pos || arrived) return;
    const steps = route.steps;

    // Follow your progress along the road itself. A turn is done once you're past it on the route,
    // even if no GPS fix landed right on it (at speed fixes are 20+ m apart and GPS can be 10-30 m off).
    const pr = project(geo, pos, prog.current.seg);
    if (pr) prog.current = pr;
    let i = idx;
    if (pr && pr.off < OFF_ROUTE_M) {
      while (i < steps.length - 1 && geo.stepAt[i] < pr.s - PASSED_M) i++;
    }
    while (i < steps.length - 1 && distM(pos, [steps[i].lat, steps[i].lng]) < STEP_REACHED_M) i++;
    if (i !== idx) setIdx(i);

    const dest = [plan.dest.lat, plan.dest.lng];
    // Reached the next stop? Announce it and carry on.
    const nextStop = stops[stopIdx];
    // The stop itself may sit off the road, so also count the spot on the road where the route stops for it.
    const stopArrive = nextStop ? steps.find((st) => st.type === 'arrive' && st.leg === stopIdx - legBase.current) : null;
    const nearStop = nextStop && (distM(pos, [nextStop.lat, nextStop.lng]) < ARRIVED_M || (stopArrive && distM(pos, [stopArrive.lat, stopArrive.lng]) < ARRIVED_M));
    if (nearStop) {
      setStopIdx(stopIdx + 1);
      setJustReached(nextStop);
      setTimeout(() => setJustReached((s) => (s === nextStop ? null : s)), 15000);
      if (voice) speak(`You've reached ${nextStop.name || `stop ${stopIdx + 1}`}. Continuing to ${stops[stopIdx + 1]?.name || plan.dest.name || 'your destination'}`);
      // Skip guidance steps up to the arrival at this stop.
      const arriveAt = route.steps.findIndex((st) => st.type === 'arrive' && st.leg === stopIdx - legBase.current);
      if (arriveAt >= 0 && arriveAt + 1 > i) setIdx(Math.min(arriveAt + 1, route.steps.length - 1));
      return;
    }
    const finalArrive = steps[steps.length - 1];
    if (stopIdx >= stops.length && (distM(pos, dest) < ARRIVED_M || (finalArrive?.type === 'arrive' && distM(pos, [finalArrive.lat, finalArrive.lng]) < ARRIVED_M))) {
      setArrived(true);
      if (voice) speak('You have arrived at your destination');
      return;
    }

    if (voice) {
      const d = pr && pr.off < OFF_ROUTE_M ? Math.max(0, geo.stepAt[i] - pr.s) : distM(pos, [steps[i].lat, steps[i].lng]);
      const far = `${i}:far`, near = `${i}:near`;
      if (d < 400 && d > 120 && !said.current.has(far)) { said.current.add(far); speak(`In ${spokenDistance(d)}, ${steps[i].text.toLowerCase()}`); }
      if (d <= 60 && !said.current.has(near)) { said.current.add(near); speak(steps[i].text); }
    }

    if ((pr ? pr.off : distToLineM(pos, route.coords)) > OFF_ROUTE_M) offCount.current++;
    else offCount.current = 0;
    if (offCount.current >= OFF_ROUTE_FIXES && !rerouting) {
      setRerouting(true);
      if (voice) speak('Rerouting');
      const base = stopIdx;
      getRoute(pos, dest, stops.slice(stopIdx), plan.dest.name)
        .then((r) => { legBase.current = base; setRoute(r); setIdx(1); said.current = new Set(); })
        .catch(() => {})
        .finally(() => { setRerouting(false); offCount.current = 0; });
    }
  }, [pos]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } }, []);

  if (!plan || !route) return { active: false };
  const steps = route.steps;
  const step = steps[Math.min(idx, steps.length - 1)];
  // Distances are measured along the road (not as the crow flies) while you're on the route.
  const p = (pos && project(geo, pos, prog.current.seg)) || prog.current;
  const onRoute = pos && p.snapped && p.off < OFF_ROUTE_M;
  const si = Math.min(idx, steps.length - 1);
  const distToStep = onRoute ? Math.max(0, geo.stepAt[si] - p.s) : pos ? distM(pos, [step.lat, step.lng]) : step.distance;
  let remainingM = distToStep, remainingS = 0;
  for (let j = idx; j < steps.length; j++) { remainingM += steps[j].distance; remainingS += steps[j].duration; }
  if (onRoute && geo.total) remainingM = Math.max(0, geo.total - p.s);
  // The stretch to the next turn: at the road's own expected speed (from the route), not a guess.
  const cur = steps[Math.max(0, Math.min(idx, steps.length - 1) - 1)];
  const roadSpeed = cur && cur.distance > 20 && cur.duration > 0 ? cur.distance / cur.duration : 13;
  remainingS += distToStep / Math.max(3, roadSpeed);
  const skipStop = () => {
    if (stopIdx >= stops.length || !pos) return;
    const next = stopIdx + 1;
    setStopIdx(next);
    setRerouting(true);
    getRoute(pos, [plan.dest.lat, plan.dest.lng], stops.slice(next), plan.dest.name)
      .then((r) => { legBase.current = next; setRoute(r); setIdx(1); said.current = new Set(); if (voice) speak('Stop skipped'); })
      .catch(() => {})
      .finally(() => setRerouting(false));
  };
  return {
    active: true, route, step, stepIdx: Math.min(idx, steps.length - 1), nextStep: steps[idx + 1], distToStep,
    remainingM, remainingS, arrived, rerouting,
    // Your spot snapped onto the road and the road's direction (for drawing the car on the road).
    snapped: onRoute && p.off < 30 ? p.snapped : null, roadBearing: onRoute ? p.bearing : null,
    stops, stopIdx, nextStop: stops[stopIdx] || null, justReached, skipStop,
  };
}
