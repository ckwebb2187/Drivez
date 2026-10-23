import { useEffect, useRef, useState } from 'react';
import { distM, distToLineM, getRoute, speak, spokenDistance } from './nav';

const STEP_REACHED_M = 30;   // count a turn as done within this distance
const OFF_ROUTE_M = 60;      // further than this from the route line = off route
const OFF_ROUTE_FIXES = 3;   // ...for this many GPS fixes in a row → reroute
const ARRIVED_M = 40;

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

    let i = idx;
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
      const d = distM(pos, [steps[i].lat, steps[i].lng]);
      const far = `${i}:far`, near = `${i}:near`;
      if (d < 400 && d > 120 && !said.current.has(far)) { said.current.add(far); speak(`In ${spokenDistance(d)}, ${steps[i].text.toLowerCase()}`); }
      if (d <= 60 && !said.current.has(near)) { said.current.add(near); speak(steps[i].text); }
    }

    if (distToLineM(pos, route.coords) > OFF_ROUTE_M) offCount.current++;
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
  const distToStep = pos ? distM(pos, [step.lat, step.lng]) : step.distance;
  let remainingM = distToStep, remainingS = 0;
  for (let j = idx; j < steps.length; j++) { remainingM += steps[j].distance; remainingS += steps[j].duration; }
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
    stops, stopIdx, nextStop: stops[stopIdx] || null, justReached, skipStop,
  };
}
