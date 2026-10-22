import { useEffect, useRef, useState } from 'react';
import { distM, distToLineM, getRoute, speak, spokenDistance } from './nav';

const STEP_REACHED_M = 30;   // count a turn as done within this distance
const OFF_ROUTE_M = 60;      // further than this from the route line = off route
const OFF_ROUTE_FIXES = 3;   // ...for this many GPS fixes in a row → reroute
const ARRIVED_M = 40;

// Turn-by-turn guidance for a planned route. `plan` = { dest, route } or null.
export function useNavigation(plan, pos, voice) {
  const [route, setRoute] = useState(plan?.route || null);
  const [idx, setIdx] = useState(1);
  const [rerouting, setRerouting] = useState(false);
  const [arrived, setArrived] = useState(false);
  const offCount = useRef(0);
  const said = useRef(new Set());
  const startedVoice = useRef(false);

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
    if (distM(pos, dest) < ARRIVED_M) {
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
      getRoute(pos, dest)
        .then((r) => { setRoute(r); setIdx(1); said.current = new Set(); })
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
  remainingS += distToStep / 13; // ~30 mph for the stretch to the next turn
  return {
    active: true, route, step, nextStep: steps[idx + 1], distToStep,
    remainingM, remainingS, arrived, rerouting,
  };
}
