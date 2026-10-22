import { useState } from 'react';
import { UserPlus, Check, Loader2 } from 'lucide-react';
import { api } from '@/api/base44Client';

// Share your personal invite link. Whoever joins (or logs in) through it is added as your friend.
export default function InviteButton({ className = '' }) {
  const [state, setState] = useState('');
  const share = async () => {
    setState('busy');
    try {
      const { url } = await api.get('/me/invite');
      const text = 'Drive with me on Kaido Maps! Open this link and we’re friends automatically:';
      if (navigator.share) {
        try { await navigator.share({ title: 'Kaido Maps', text, url }); setState(''); return; } catch (e) { if (e?.name === 'AbortError') { setState(''); return; } }
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setState('copied');
      setTimeout(() => setState(''), 2500);
    } catch { setState('error'); setTimeout(() => setState(''), 2500); }
  };
  return (
    <button onClick={share} className={`w-full rounded-2xl px-4 py-3 flex items-center gap-3 text-left text-white shadow-lg ${className}`}
      style={{ background: 'linear-gradient(90deg,#ff2d55,#ff6a3d)' }}>
      {state === 'busy' ? <Loader2 className="w-5 h-5 animate-spin" /> : state === 'copied' ? <Check className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold">{state === 'copied' ? 'Link copied — paste it anywhere' : state === 'error' ? 'Could not get your link. Try again.' : 'Invite friends to Kaido Maps'}</div>
        <div className="text-[11px] opacity-90">Anyone who joins with your link is added as your friend</div>
      </div>
    </button>
  );
}
