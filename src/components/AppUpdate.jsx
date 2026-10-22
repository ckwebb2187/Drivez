import { useEffect, useState } from 'react';
import { RefreshCw, Check, Download, Loader2 } from 'lucide-react';

/* global __APP_VERSION__, __BUILD_TIME__ */
const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
const BUILT = typeof __BUILD_TIME__ !== 'undefined' ? new Date(__BUILD_TIME__) : null;

// The running app's main script, e.g. /assets/index-abc123.js. A new release
// has a different file name, so comparing it with the live site finds updates.
function currentBundle() {
  return [...document.querySelectorAll('script[type="module"][src]')].map((s) => new URL(s.src).pathname).find((p) => p.startsWith('/assets/')) || null;
}

async function latestBundle() {
  const res = await fetch(`/index.html?check=${Date.now()}`, { cache: 'no-store' });
  const html = await res.text();
  return html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1] || null;
}

export async function checkForUpdate() {
  const now = currentBundle();
  const latest = await latestBundle();
  return !!(now && latest && now !== latest);
}

export async function installUpdate() {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.();
    await Promise.all((regs || []).map((r) => r.unregister()));
    const keys = await caches?.keys?.();
    await Promise.all((keys || []).map((k) => caches.delete(k)));
  } catch { /* nothing cached */ }
  window.location.reload();
}

export default function AppUpdate() {
  const [state, setState] = useState('checking'); // checking | current | available | error | installing
  const check = async () => {
    setState('checking');
    try { setState((await checkForUpdate()) ? 'available' : 'current'); }
    catch { setState('error'); }
  };
  useEffect(() => { check(); }, []);

  return (
    <div>
      <h3 className="text-sm font-bold text-foreground mb-3">App</h3>
      <div className="bg-card rounded-2xl p-4 border border-border">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-foreground">Drivez {VERSION}</div>
            <div className="text-[11px] text-muted-foreground">
              {state === 'available' ? 'A new version is ready' : state === 'current' ? 'You’re on the latest version' : state === 'error' ? 'Couldn’t check for updates' : 'Checking for updates…'}
              {BUILT && state !== 'available' ? ` · ${BUILT.toLocaleDateString()}` : ''}
            </div>
          </div>
          {state === 'available' || state === 'installing' ? (
            <button onClick={() => { setState('installing'); installUpdate(); }} className="bg-primary text-primary-foreground rounded-xl px-3 py-2 text-xs font-bold flex items-center gap-1.5">
              {state === 'installing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Update now
            </button>
          ) : (
            <button onClick={check} disabled={state === 'checking'} className="bg-secondary text-foreground rounded-xl px-3 py-2 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-60">
              {state === 'checking' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : state === 'current' ? <Check className="w-3.5 h-3.5 text-accent" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Check for updates
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
