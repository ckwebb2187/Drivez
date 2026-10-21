import { useState } from 'react';
import { X, Check, Loader2 } from 'lucide-react';
import { useApp } from '@/lib/AppContext';

export default function EditProfileModal({ onClose }) {
  const { user, updateUser } = useApp();
  const [displayName, setDisplayName] = useState(user.displayName);
  const [username, setUsername] = useState(user.username);
  const [bio, setBio] = useState(user.bio);
  const [location, setLocation] = useState(user.location);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await updateUser({ displayName, username, bio, location });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card w-full max-w-md rounded-t-3xl p-6 border-t border-border" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-foreground">Edit Profile</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="space-y-4 mb-6">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Display Name</label>
            <input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              className="w-full bg-secondary rounded-xl px-4 py-3 text-foreground text-sm border border-border focus:border-primary outline-none"
              placeholder="Your name"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Username</label>
            <div className="flex items-center bg-secondary rounded-xl border border-border focus-within:border-primary">
              <span className="pl-4 text-sm text-muted-foreground">@</span>
              <input
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="flex-1 bg-transparent px-2 py-3 text-foreground text-sm outline-none"
                placeholder="username"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Bio</label>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              rows={2}
              className="w-full bg-secondary rounded-xl px-4 py-3 text-foreground text-sm border border-border focus:border-primary outline-none resize-none"
              placeholder="Tell us about yourself"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Location</label>
            <input
              value={location}
              onChange={e => setLocation(e.target.value)}
              className="w-full bg-secondary rounded-xl px-4 py-3 text-foreground text-sm border border-border focus:border-primary outline-none"
              placeholder="City, State"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-primary text-primary-foreground rounded-xl py-3 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save Profile
        </button>
      </div>
    </div>
  );
}
