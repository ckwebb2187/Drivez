import { useRef, useState } from 'react';
import { Ghost, MapPin, Calendar, Eye, EyeOff, Pencil, LogOut, Loader2, Camera, Trash2, ImagePlus } from 'lucide-react';
import { useApp } from '@/lib/AppContext';
import { base44, api } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
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
  const { checkUserAuth } = useAuth();
  const fileRef = useRef(null);
  const [picMenu, setPicMenu] = useState(false);
  const [picBusy, setPicBusy] = useState(false);
  const [picError, setPicError] = useState('');

  // Center-crop to a square and shrink it so uploads stay small and fast.
  const toSquareJpeg = (file) => new Promise((resolve, reject) => {
    const img = new Image();
    const src = URL.createObjectURL(file);
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const out = Math.min(384, side);
      const c = document.createElement('canvas');
      c.width = c.height = out;
      c.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out);
      URL.revokeObjectURL(src);
      resolve(c.toDataURL('image/jpeg', 0.85).split(',')[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(src); reject(new Error("That file isn't a picture we can open.")); };
    img.src = src;
  });

  const onPickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPicMenu(false);
    setPicBusy(true);
    setPicError('');
    try {
      const data = await toSquareJpeg(file);
      await api.post('/me/avatar', { mime: 'image/jpeg', data });
      await checkUserAuth();
    } catch (err) {
      setPicError(err.message || 'Could not save that picture.');
    } finally {
      setPicBusy(false);
    }
  };

  const removePic = async () => {
    setPicMenu(false);
    setPicBusy(true);
    setPicError('');
    try {
      await api.del('/me/avatar');
      await checkUserAuth();
    } catch (err) {
      setPicError(err.message || 'Could not remove the picture.');
    } finally {
      setPicBusy(false);
    }
  };

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
          <button type="button" onClick={() => setPicMenu(true)} aria-label="Change profile picture" className="relative shrink-0 active:scale-95 transition-transform">
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
            {picBusy && (
              <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-white" />
              </div>
            )}
            <div className="absolute -bottom-1 -left-1 w-7 h-7 rounded-full bg-primary border-2 border-background flex items-center justify-center">
              <Camera className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
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
        {picError && <p className="text-xs text-destructive mt-2">{picError}</p>}
      </div>

      {picMenu && (
        <div className="fixed inset-0 z-[1500] bg-black/60 flex items-end justify-center" onClick={() => setPicMenu(false)}>
          <div className="w-full max-w-md bg-card border-t border-border rounded-t-3xl p-5 pb-8 space-y-2" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full bg-muted mx-auto mb-3" />
            <h3 className="text-sm font-bold text-foreground mb-2">Profile picture</h3>
            <button onClick={() => fileRef.current?.click()} className="w-full bg-secondary rounded-xl px-4 py-3 text-sm font-semibold text-foreground flex items-center gap-3">
              <ImagePlus className="w-5 h-5 text-primary" /> Take a photo or choose one
            </button>
            {user.avatarUrl && (
              <button onClick={removePic} className="w-full bg-secondary rounded-xl px-4 py-3 text-sm font-semibold text-destructive flex items-center gap-3">
                <Trash2 className="w-5 h-5" /> Remove picture
              </button>
            )}
            <button onClick={() => setPicMenu(false)} className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-muted-foreground">Cancel</button>
          </div>
        </div>
      )}

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
