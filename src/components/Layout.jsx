import { useEffect, useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Gauge, Clock, User, ChevronRight } from 'lucide-react';
import LiveDrive from '@/pages/LiveDrive';
import SetupModeModal from '@/components/SetupModeModal';
import { useApp } from '@/lib/AppContext';
import { useMapLook, featureName } from '@/lib/mapTheme';

const tabs = [
  { to: '/history', icon: Clock, label: 'History' },
  { to: '/', icon: Gauge, label: 'Drive', center: true },
  { to: '/profile', icon: User, label: 'Profile' }
];

export default function Layout() {
  const { pathname } = useLocation();
  const { user } = useApp();
  const [look] = useMapLook();
  const shownTabs = tabs.map((t) => (t.to === '/' && look.jpNames ? { ...t, label: 'Chizu' } : t));
  const onDrive = pathname === '/' || pathname === '/drive'; // the drive map is the home screen
  // The drive screen is kept running once opened, so switching tabs never loses a drive.
  const [driveOpened, setDriveOpened] = useState(onDrive);
  useEffect(() => { if (onDrive) setDriveOpened(true); }, [onDrive]);
  const [driveStatus, setDriveStatus] = useState(() => window.__dzDriveStatus);
  useEffect(() => {
    const on = () => setDriveStatus(window.__dzDriveStatus);
    window.addEventListener('dz-drive-status', on);
    return () => window.removeEventListener('dz-drive-status', on);
  }, []);
  const driving = driveStatus === 'driving' || driveStatus === 'acquiring';

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {!onDrive && (
        <main className="flex-1 overflow-y-auto no-scrollbar pb-24">
          <Outlet />
        </main>
      )}
      {driveOpened && (
        <div style={{ display: onDrive ? 'block' : 'none' }}>
          <LiveDrive active={onDrive} />
        </div>
      )}
      {user && !user.appMode && <SetupModeModal />}
      {!onDrive && driving && (
        <NavLink to="/" className="fixed left-3 right-3 bottom-[92px] z-50 rounded-2xl bg-[#188038] text-white shadow-2xl px-4 h-12 flex items-center gap-2 text-sm font-semibold">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" /> Drive in progress
          <span className="ml-auto flex items-center gap-1 text-xs opacity-90">Return to drive <ChevronRight className="w-4 h-4" /></span>
        </NavLink>
      )}
      <nav className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-border">
        <div className="flex items-center justify-around max-w-md mx-auto px-2 h-20">
          {shownTabs.map((tab) => {
            const Icon = tab.icon;
            if (tab.center) {
              return (
                <NavLink key={tab.to} to={tab.to} end className="flex flex-col items-center -mt-6">
                  {({ isActive }) => (
                    <>
                      <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg ${
                        isActive
                          ? 'bg-primary text-primary-foreground scale-110 shadow-primary/30'
                          : 'bg-secondary text-foreground'
                      }`}>
                        <Icon className="w-6 h-6" strokeWidth={2.5} />
                      </div>
                      <span className={`text-[10px] mt-1 font-medium ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                        {tab.label}
                      </span>
                    </>
                  )}
                </NavLink>
              );
            }
            return (
              <NavLink key={tab.to} to={tab.to} className="flex flex-col items-center gap-1 py-2 px-3">
                {({ isActive }) => (
                  <>
                    <Icon className={`w-5 h-5 transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground'}`} strokeWidth={2.2} />
                    <span className={`text-[10px] font-medium transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                      {tab.label}
                    </span>
                  </>
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
