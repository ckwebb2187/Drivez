import { Suspense, useEffect, useState } from 'react';
import { prefetchPages } from '@/lib/pages';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Gauge, Clock, User, ChevronRight, Flame, CalendarDays } from 'lucide-react';
import LiveDrive from '@/pages/LiveDrive';
import SetupModeModal from '@/components/SetupModeModal';
import { useApp } from '@/lib/AppContext';
import { api } from '@/api/base44Client';
import { useMapLook, useActiveLook, featureName, applySkin } from '@/lib/mapTheme';
import { useUnits } from '@/lib/units';
import { useFamilyPing, useFamilyBrief, EVENT_ICON } from '@/lib/family';


export default function Layout() {
  const { pathname } = useLocation();
  const { user, scene } = useApp();
  const [look] = useMapLook();
  const { key: skinKey } = useActiveLook();
  useUnits(); // re-render everything when mph/km changes
  // The whole app takes on the world theme's colors.
  useEffect(() => { applySkin(skinKey); }, [skinKey]);
  const fam = useFamilyBrief();
  const [famToast, clearFamToast] = useFamilyPing();
  // Someone spotted your car: a quick heads-up (checked every 2 minutes).
  const [spotToast, setSpotToast] = useState(null);
  useEffect(() => {
    if (!user || !scene) return undefined;
    let since = Date.now(), t;
    const tick = () => api.get(`/spot/inbox?since=${since}`).then((d) => { since = d.now || Date.now(); if (d.spots?.length) setSpotToast(d.spots[0]); }).catch(() => {}).finally(() => { t = setTimeout(tick, 120000); });
    t = setTimeout(tick, 15000);
    return () => clearTimeout(t);
  }, [user?.id, scene]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!spotToast) return undefined; const t = setTimeout(() => setSpotToast(null), 7000); return () => clearTimeout(t); }, [spotToast?.id]);
  useEffect(() => { if (!famToast || famToast.kind === 'sos') return undefined; const t = setTimeout(clearFamToast, 6000); return () => clearTimeout(t); }, [famToast?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const onDrive = pathname === '/' || pathname === '/drive'; // the drive map is the home screen
  // Detail pages (a saved drive, saved places, routes…) fill the screen without the tab bar.
  const fullPage = !onDrive && !['/history', '/profile', '/leaderboard', '/feed', '/meets'].includes(pathname);
  // The drive screen is kept running once opened, so switching tabs never loses a drive.
  const [driveOpened, setDriveOpened] = useState(onDrive);
  // Fetch the other pages in the background once the app is up.
  useEffect(() => { const t = setTimeout(prefetchPages, 2500); return () => clearTimeout(t); }, []);
  useEffect(() => { if (onDrive) setDriveOpened(true); }, [onDrive]);
  const [driveStatus, setDriveStatus] = useState(() => window.__dzDriveStatus);
  useEffect(() => {
    const on = () => setDriveStatus(window.__dzDriveStatus);
    window.addEventListener('dz-drive-status', on);
    return () => window.removeEventListener('dz-drive-status', on);
  }, []);
  const driving = driveStatus === 'driving' || driveStatus === 'acquiring';
  // Peek: you're driving and opened another screen. The map keeps running in the top part.
  const peek = driving && !onDrive;

  // Joined through someone's invite link: make you friends, then say so.
  const { refreshData } = useApp();
  const [inviteMsg, setInviteMsg] = useState('');
  useEffect(() => {
    if (!user) return;
    let code = null;
    try { code = localStorage.getItem('dz-invite'); } catch { /* private mode */ }
    if (!code) return;
    try { localStorage.removeItem('dz-invite'); } catch { /* ignore */ }
    api.post('/invite/accept', { code }).then((r) => { if (!r.self) { setInviteMsg(r.message); setTimeout(() => setInviteMsg(''), 5000); refreshData?.(); } }).catch(() => {});
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* Mid-drive, other screens open as a panel under the live map, so the map and your 3D car stay up. */}
      {!onDrive && (
        <main className={peek
          ? 'fixed left-0 right-0 bottom-0 top-[38vh] z-[45] overflow-y-auto no-scrollbar rounded-t-3xl bg-background border-t border-primary/40 shadow-[0_-12px_30px_rgba(0,0,0,.45)] pb-[calc(16px+env(safe-area-inset-bottom))] dz-sheet-up'
          : `flex-1 overflow-y-auto no-scrollbar ${fullPage ? '' : 'pb-24'}`}>
          {peek && (
            <NavLink to="/" className="sticky top-0 z-20 flex flex-col items-center pt-2 pb-1 bg-background/95 backdrop-blur" aria-label="Back to the full map">
              <span className="w-10 h-1.5 rounded-full bg-muted-foreground/40" />
              <span className="text-[10px] font-semibold text-muted-foreground mt-1">Tap here or the map for the full drive view</span>
            </NavLink>
          )}
          <Suspense fallback={<div className="min-h-full bg-background" />}>
            <Outlet />
          </Suspense>
        </main>
      )}
      {driveOpened && (
        <div style={peek ? { position: 'fixed', top: 0, left: 0, right: 0, height: '40vh', transform: 'translateZ(0)', overflow: 'hidden', zIndex: 40 } : { display: onDrive ? 'block' : 'none' }}>
          <LiveDrive active={onDrive || peek} peek={peek} />
          {peek && <NavLink to="/" className="absolute inset-0 z-[900]" aria-label="Back to the full map" />}
        </div>
      )}
      {user && !user.appMode && <SetupModeModal />}
      {inviteMsg && (
        <div className="fixed left-3 right-3 top-[max(12px,env(safe-area-inset-top))] z-[1500] rounded-2xl bg-[#188038] text-white shadow-2xl px-4 py-3 text-sm font-semibold text-center dz-pop-in">🤝 {inviteMsg}</div>
      )}
      {famToast && (
        <NavLink to="/family" onClick={clearFamToast} className={`fixed left-3 right-3 top-[max(12px,env(safe-area-inset-top))] z-[1600] rounded-2xl shadow-2xl px-4 py-3 text-sm font-semibold flex items-center gap-2 dz-pop-in ${famToast.kind === 'sos' ? 'bg-red-600 text-white animate-pulse' : 'bg-card text-foreground border border-primary/60'}`}>
          <span className="text-lg">{EVENT_ICON[famToast.kind] || '👪'}</span><span className="flex-1">{famToast.text}</span><span className="text-xs opacity-80">Open ›</span>
        </NavLink>
      )}
      {spotToast && !famToast && (
        <NavLink to="/feed" onClick={() => setSpotToast(null)} className="fixed left-3 right-3 top-[max(12px,env(safe-area-inset-top))] z-[1600] rounded-2xl shadow-2xl px-4 py-3 text-sm font-semibold flex items-center gap-2 dz-pop-in bg-card text-foreground border border-primary/60">
          <span className="text-lg">👀</span><span className="flex-1">{spotToast.by.name} spotted your car{spotToast.note ? `: ${spotToast.note}` : '!'}</span><span className="text-xs opacity-80">Feed ›</span>
        </NavLink>
      )}
      {!onDrive && driving && !peek && (
        <NavLink to="/" className={`fixed left-3 right-3 ${fullPage ? 'bottom-[max(16px,env(safe-area-inset-bottom))]' : 'bottom-[92px]'} z-[1400] rounded-2xl bg-[#188038] text-white shadow-2xl px-4 h-12 flex items-center gap-2 text-sm font-semibold`}>
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" /> Drive in progress
          <span className="ml-auto flex items-center gap-1 text-xs opacity-90">Return to drive <ChevronRight className="w-4 h-4" /></span>
        </NavLink>
      )}
      {/* No tab bar: everything lives in the menu (top left of the map). Other screens get a glowing way back. */}
      {!onDrive && !peek && !fullPage && (
        <NavLink to="/" className="fixed left-1/2 -translate-x-1/2 bottom-[calc(16px+env(safe-area-inset-bottom))] z-50 dz-glow h-12 pl-4 pr-5 rounded-full bg-card/95 backdrop-blur border border-primary/50 text-primary text-sm font-bold flex items-center gap-2 shadow-2xl" aria-label="Back to the map">
          <span className="dz-sweep" aria-hidden="true" /><Gauge className="w-5 h-5" />Map
        </NavLink>
      )}
    </div>
  );
}
