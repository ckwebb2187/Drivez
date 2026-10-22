import { useState } from 'react';
import { Ghost, MapPin, Calendar, Eye, EyeOff, Pencil, LogOut, Loader2 } from 'lucide-react';
import { useApp } from '@/lib/AppContext';
import { base44 } from '@/api/base44Client';
import StatsDashboard from '@/components/StatsDashboard';
import GarageManager from '@/components/GarageManager';
import FriendsView from '@/components/FriendsView';
import HeatMapSection from '@/components/HeatMapSection';
import EditProfileModal from '@/components/EditProfileModal';
import DiscordSettings from '@/components/DiscordSettings';
import AppUpdate from '@/components/AppUpdate';
import { getInitials } from '@/lib/helpers';

export default function Profile() {
  const { user, stats, weeklyStats, toggleGhostMode } = useApp();
  const [editing, setEditing] = useState(false);

  if (!user) {
    return (
      <div className="flex items-center justify-center h-full py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleLogout = () => {
    base44.auth.logout('/login');
  };

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="px-5 pt-12 pb-4">
        <div className="flex items-center gap-4">
          <div className="relative">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="w-20 h-20 rounded-full object-cover" />
            ) : (
              <div className="w-20 h-20 rounded-full flex items-center justify-center text-xl font-bold text-white" style={{ backgroundColor: user.color }}>
                {getInitials(user.displayName)}
              </div>
            )}
            {user.ghostMode && (
              <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-secondary border-2 border-background flex items-center justify-center">
                <Ghost className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-foreground">{user.displayName}</h1>
            <p className="text-sm text-primary">@{user.username}</p>
            <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
              {user.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {user.location}
                </span>
              )}
              {user.joinDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> {new Date(user.joinDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => setEditing(true)}
            className="w-9 h-9 rounded-full glass border border-border flex items-center justify-center"
          >
            <Pencil className="w-4 h-4 text-foreground" />
          </button>
        </div>
        {user.bio && <p className="text-xs text-muted-foreground mt-3">{user.bio}</p>}
      </div>

      {/* Ghost mode toggle */}
      <div className="px-5 mb-4">
        <button
          onClick={toggleGhostMode}
          className="w-full bg-card rounded-2xl p-4 border border-border flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${user.ghostMode ? 'bg-muted' : 'bg-primary/10'}`}>
              {user.ghostMode ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-primary" />}
            </div>
            <div className="text-left">
              <div className="text-sm font-semibold text-foreground">Ghost Mode</div>
              <div className="text-[10px] text-muted-foreground">{user.ghostMode ? 'Hidden from friends & leaderboards' : 'Visible to friends'}</div>
            </div>
          </div>
          <div className={`w-11 h-6 rounded-full transition-colors relative ${user.ghostMode ? 'bg-muted-foreground' : 'bg-primary'}`}>
            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${user.ghostMode ? 'left-0.5' : 'left-[22px]'}`} />
          </div>
        </button>
      </div>

      {/* Stats highlights */}
      <div className="px-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-foreground">Statistics</h2>
        </div>
        <StatsDashboard stats={stats} weekly={weeklyStats} />
      </div>

      {/* Heat map */}
      <div className="px-5 mb-6">
        <HeatMapSection />
      </div>

      {/* Garage */}
      <div className="px-5 mb-6">
        <GarageManager />
      </div>

      {/* Friends */}
      <div className="px-5 mb-6">
        <FriendsView />
      </div>

      {/* Discord */}
      <div className="px-5 mb-6">
        <DiscordSettings />
      </div>

      {/* App version + updates */}
      <div className="px-5 mb-6">
        <AppUpdate />
      </div>

      {/* Logout */}
      <div className="px-5 mb-10">
        <button
          onClick={handleLogout}
          className="w-full bg-card rounded-2xl p-4 border border-border flex items-center justify-center gap-2 text-destructive"
        >
          <LogOut className="w-4 h-4" />
          <span className="text-sm font-semibold">Log Out</span>
        </button>
      </div>

      {editing && <EditProfileModal onClose={() => setEditing(false)} />}
    </div>
  );
}
