import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { X, Clock, Star, Route as RouteIcon, Radio, Trophy, Upload, User, Settings, Navigation, Flame, CalendarDays, Wrench } from 'lucide-react';
import { useApp } from '@/lib/AppContext';
import InviteButton from '@/components/InviteButton';
import { ThemePicker } from '@/components/MapLookSettings';
import { getInitials } from '@/lib/helpers';

// Left pull-out drawer: everything that isn't driving lives here, so the map stays clean.
export default function LeftDrawer({ open, onClose }) {
  const { user, scene, stats, setAppMode } = useApp();
  if (!open || !user) return null;
  const links = [
    ['/history', Clock, 'Drive history', `${stats.totalDrives} drives · ${stats.lifetimeMiles.toLocaleString()} mi`],
    ['/places', Star, 'Saved places', 'Home, work and favorites'],
    ['/routes', RouteIcon, 'Routes & plans', 'Saved drives and multi-stop plans'],
    ['/live-map', Radio, 'Friends live', 'Who is driving right now'],
    ...(scene ? [['/feed', Flame, 'Feed', "Friends' drives, builds and meets"], ['/meets', CalendarDays, 'Meets & shops', 'Car meets, tuners, parts, 93 gas']] : []),
    ...(scene ? [['/leaderboard', Trophy, 'Ranks', 'Leaderboards']] : []),
    ['/import', Upload, 'Import', 'From Google Maps & Waze'],
    ['/profile', Settings, 'Profile & settings', 'Garage, privacy, Discord, app'],
  ];
  return createPortal(
    <div className="fixed inset-0 z-[1550] bg-black/40" onClick={onClose}>
      <div className="h-full w-[min(86vw,360px)] bg-background border-r border-border shadow-2xl flex flex-col dz-slide-in-left" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 pt-[max(16px,env(safe-area-inset-top))] pb-3 flex items-center gap-3 border-b border-border">
          {user.avatarUrl
            ? <img src={user.avatarUrl} alt="" className="w-11 h-11 rounded-full object-cover" />
            : <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ background: user.color }}>{getInitials(user.displayName)}</div>}
          <div className="flex-1 min-w-0">
            <div className="text-base font-bold text-foreground truncate">{user.displayName}</div>
            <div className="text-xs text-primary truncate">@{user.username}</div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center" aria-label="Close menu"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <InviteButton />
          <div className="bg-card rounded-2xl border border-border divide-y divide-border">
            {links.map(([to, Icon, title, sub]) => (
              <Link key={to} to={to} onClick={onClose} className="flex items-center gap-3 px-4 py-3">
                <Icon className="w-4 h-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0"><div className="text-sm font-semibold text-foreground">{title}</div><div className="text-[11px] text-muted-foreground truncate">{sub}</div></div>
              </Link>
            ))}
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2 px-1">World theme</div>
            <ThemePicker compact />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[['nav', Navigation, 'Just navigation'], ['scene', Flame, 'Car scene']].map(([m, Icon, label]) => (
              <button key={m} onClick={() => setAppMode(m)} className={`rounded-xl border px-3 py-2.5 flex items-center gap-2 text-xs font-semibold ${(user.appMode || 'scene') === m ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground'}`}>
                <Icon className="w-4 h-4" />{label}
              </button>
            ))}
          </div>
          <Link to="/profile" onClick={onClose} className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-2"><User className="w-3.5 h-3.5" />Edit profile</Link>
        </div>
      </div>
    </div>,
    document.body
  );
}
