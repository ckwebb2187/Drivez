import { useState } from 'react';
import { X, Check, Loader2 } from 'lucide-react';
import { useApp } from '@/lib/AppContext';

export default function ShareRouteModal({ route, onClose }) {
  const { shareRouteWithFriends } = useApp();
  const [emails, setEmails] = useState(route.sharedWith || []);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const addEmail = () => {
    const e = input.trim();
    if (!e || !e.includes('@') || emails.includes(e)) {
      setInput('');
      return;
    }
    setEmails(prev => [...prev, e]);
    setInput('');
  };

  const removeEmail = (e) => {
    setEmails(prev => prev.filter(x => x !== e));
  };

  const handleShare = async () => {
    setSaving(true);
    setError('');
    try {
      await shareRouteWithFriends(route.id, emails);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to share route');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card w-full max-w-md rounded-t-3xl p-6 border-t border-border" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-foreground">Share Route</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">{route.name}</p>

        <label className="text-xs text-muted-foreground mb-1 block">Friend's email</label>
        <div className="flex gap-2 mb-3">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEmail(); } }}
            className="flex-1 bg-secondary rounded-xl px-4 py-3 text-foreground text-sm border border-border focus:border-primary outline-none"
            placeholder="friend@email.com"
            type="email"
          />
          <button
            onClick={addEmail}
            className="bg-secondary text-foreground rounded-xl px-4 text-sm font-bold border border-border"
          >
            Add
          </button>
        </div>

        {emails.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4 max-h-40 overflow-y-auto no-scrollbar">
            {emails.map(e => (
              <div key={e} className="bg-secondary border border-border rounded-full pl-3 pr-2 py-1.5 flex items-center gap-1.5">
                <span className="text-xs text-foreground">{e}</span>
                <button onClick={() => removeEmail(e)}>
                  <X className="w-3 h-3 text-muted-foreground" />
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground mb-4">
          They'll find this route under "Shared with You" on their Routes page. Use the email they log in with.
        </p>

        {error && <p className="text-xs text-destructive mb-3">{error}</p>}

        <button
          onClick={handleShare}
          disabled={saving || emails.length === 0}
          className="w-full bg-primary text-primary-foreground rounded-xl py-3 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Share with {emails.length} {emails.length === 1 ? 'friend' : 'friends'}
        </button>
      </div>
    </div>
  );
}
