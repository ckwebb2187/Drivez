import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/base44Client';
import { useApp } from '@/lib/AppContext';
import { DiscordIcon } from '@/components/SocialButtons';

export default function DiscordShareButton({ tripId }) {
  const { user } = useApp();
  const navigate = useNavigate();
  const [state, setState] = useState('idle'); // idle | busy | done
  const [err, setErr] = useState('');

  const share = async () => {
    if (!user?.discordWebhookSet) return navigate('/profile');
    setState('busy'); setErr('');
    try { await api.post('/discord/share', { tripId }); setState('done'); }
    catch (e) { setErr(e.message); setState('idle'); }
  };

  return (
    <>
      <button
        onClick={share}
        disabled={state !== 'idle'}
        className="w-full mt-2 bg-[#5865F2]/15 text-[#8b93ff] border border-[#5865F2]/40 rounded-xl py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-70"
      >
        {state === 'busy' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : state === 'done' ? <Check className="w-3.5 h-3.5" /> : <DiscordIcon className="w-3.5 h-3.5" />}
        {state === 'done' ? 'Shared to Discord' : user?.discordWebhookSet ? 'Share to Discord' : 'Set up Discord sharing'}
      </button>
      {err && <p className="text-[11px] text-destructive mt-1 text-center">{err}</p>}
    </>
  );
}
