import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ghost, MapPin, Calendar, Eye, EyeOff, Pencil, LogOut, Loader2, Camera, Trash2, ImagePlus, Upload, Star, ChevronRight, Navigation, Flame, BarChart3, QrCode, Users, Palette, Award, AudioLines, MessageCircle, ShieldCheck, Smartphone } from 'lucide-react';
import { useApp } from '@/lib/AppContext';
import { base44, api } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import StatsDashboard, { StatsRow } from '@/components/StatsDashboard';
import Collapsible from '@/components/Collapsible';
import InviteButton from '@/components/InviteButton';
import GarageManager from '@/components/GarageManager';
import FriendsView from '@/components/FriendsView';
import HeatMapSection from '@/components/HeatMapSection';
import EditProfileModal from '@/components/EditProfileModal';
import DiscordSettings from '@/components/DiscordSettings';
import AppUpdate from '@/components/AppUpdate';
import PrivacySettings from '@/components/PrivacySettings';
import { getInitials } from '@/lib/helpers';
import ProfileSharing from '@/components/ProfileSharing';
import MapLookSettings from '@/components/MapLookSettings';
import Badges from '@/components/Badges';
import VoiceSettings from '@/components/VoiceSettings';
import { badgeProgress } from '@/lib/badges';
import UserTags from '@/components/UserTags';
import SettingsList, { SettingsSheet } from '@/components/SettingsList';
import { Settings } from 'lucide-react';

export default function Profile() {
  const { user, scene, setAppMode, stats, weeklyStats, toggleGhostMode, trips, vehicles } = useApp();
  const [modeBusy, setModeBusy] = useState(false);
  const switchMode = async (m) => { if (m === user.appMode) return; setModeBusy(true); try { await setAppMode(m); } finally { setModeBusy(false); } };
  const [editing, setEditing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
      <div className="px-5 pt-[max(24px,env(safe-area-inset-top))] pb-4">
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
            <p className="text-sm text-primary">@{user.username}
              <UserTags creator={user.creator} founder={user.founder} className="ml-2" />
            </p>
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
          <button onClick={() => setSettingsOpen(true)} className="w-9 h-9 rounded-full glass border border-border flex items-center justify-center ml-2" aria-label="Settings">
            <Settings className="w-4 h-4 text-foreground" />
          </button>
          {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}
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

      <div className="px-5 space-y-3 pb-10">
        {/* Totals */}
        <StatsRow stats={stats} />
        <InviteButton />

        {/* Garage */}
        <div className="pt-2"><GarageManager /></div>

        <div className="pt-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">You</div>
        <Collapsible id="badges" icon={Award} title="Badges" subtitle={`${badgeProgress(trips, vehicles).filter((b) => b.tier >= 0).length} earned · night drives, streaks, Tōge runs…`}>
          <Badges trips={trips} cars={vehicles} />
        </Collapsible>
        <Collapsible id="charts" icon={BarChart3} title="Charts" subtitle="Drives and speed by week">
          <StatsDashboard stats={stats} weekly={weeklyStats} chartsOnly />
        </Collapsible>
        <Collapsible id="heat" icon={Flame} title="Heat map" subtitle="Everywhere you've driven">
          <HeatMapSection />
        </Collapsible>
        {scene && (
          <Collapsible id="social" icon={QrCode} title="Driver profile & QR" subtitle="Socials, clubs, window sticker, who sees what">
            <ProfileSharing />
          </Collapsible>
        )}
        <Collapsible id="friends" icon={Users} title="Friends" subtitle="Add friends, see requests">
          <FriendsView />
        </Collapsible>
        <Link to="/places" className="bg-card rounded-2xl border border-border flex items-center gap-3 px-4 py-3">
          <Star className="w-4 h-4 text-amber-400" />
          <span className="flex-1 text-sm font-semibold text-foreground">Saved places</span>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </Link>
        <Link to="/import" className="bg-card rounded-2xl border border-border flex items-center gap-3 px-4 py-3">
          <Upload className="w-4 h-4 text-primary" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-foreground">Import from Google Maps & Waze</div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </Link>

        <div id="settings" className="pt-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Settings</div>
        <SettingsList />
      </div>

      {editing && <EditProfileModal onClose={() => setEditing(false)} />}
    </div>
  );
}
