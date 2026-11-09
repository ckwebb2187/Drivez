// Battery-friendly polling: runs `fn` every `ms` while the app is on screen.
// In the background it waits (or runs every `hiddenMs` if given), then catches up
// right away when you come back if the last run is stale.
import { useSyncExternalStore } from 'react';

export function poll(fn, ms, hiddenMs = 0) {
  let last = Date.now();
  const run = () => { last = Date.now(); try { fn(); } catch { /* caller handles */ } };
  const t = setInterval(() => {
    const gap = document.hidden ? hiddenMs : ms;
    if (gap && Date.now() - last >= gap - 50) run();
  }, Math.min(ms, hiddenMs || ms));
  const vis = () => { if (!document.hidden && Date.now() - last >= ms) run(); };
  document.addEventListener('visibilitychange', vis);
  return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
}

const sub = (f) => { document.addEventListener('visibilitychange', f); return () => document.removeEventListener('visibilitychange', f); };
// True while the app is on screen.
export const usePageVisible = () => useSyncExternalStore(sub, () => !document.hidden, () => true);
