import { Outlet, NavLink } from 'react-router-dom';
import { Home, Gauge, Clock, Trophy, User } from 'lucide-react';

const tabs = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/history', icon: Clock, label: 'History' },
  { to: '/drive', icon: Gauge, label: 'Drive', center: true },
  { to: '/leaderboard', icon: Trophy, label: 'Ranks' },
  { to: '/profile', icon: User, label: 'Profile' }
];

export default function Layout() {
  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <main className="flex-1 overflow-y-auto no-scrollbar pb-24">
        <Outlet />
      </main>
      <nav className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-border">
        <div className="flex items-center justify-around max-w-md mx-auto px-2 h-20">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            if (tab.center) {
              return (
                <NavLink key={tab.to} to={tab.to} className="flex flex-col items-center -mt-6">
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
