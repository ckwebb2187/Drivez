import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, MapPin, Users, Share2 } from 'lucide-react';
import { api } from '@/api/base44Client';
import { convoyUrl } from '@/lib/convoy';
import { getInitials } from '@/lib/helpers';

// Opened from a shared group-drive link: see who's going and join.
export default function ConvoyPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [c, setC] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get(`/convoys/${code}`).then(setC).catch((e) => setError(e.message || 'That group drive has ended.')); }, [code]);

  const join = async () => {
    setBusy(true);
    try {
      const joined = await api.post(`/convoys/${code}/join`);
      window.dispatchEvent(new Event('dz-convoy'));
      navigate('/', { state: { plan: { dest: joined.dest, stops: [] } } });
    } catch (e) { setError(e.message || 'Could not join.'); setBusy(false); }
  };
  const share = async () => { try { await navigator.share({ title: 'Group drive', url: convoyUrl(code) }); } catch { try { await navigator.clipboard.writeText(convoyUrl(code)); } catch { /* ignore */ } } };
  const inIt = c?.members?.some((m) => m.me);

  return (
    <div className="min-h-full bg-background px-5 pt-[max(16px,env(safe-area-inset-top))] pb-10">
      <button onClick={() => navigate('/')} className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center mb-4" aria-label="Back"><ArrowLeft className="w-5 h-5" /></button>
      {error ? <p className="text-sm text-destructive">{error}</p> : !c ? <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /> : (
        <div className="space-y-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-primary flex items-center gap-1"><Users className="w-3.5 h-3.5" />Group drive</div>
            <h1 className="text-2xl font-black text-foreground mt-1">{c.name || `To ${c.dest.name}`}</h1>
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1"><MapPin className="w-4 h-4" />{c.dest.name}</p>
          </div>
          <div className="bg-card rounded-2xl border border-border divide-y divide-border">
            {c.members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                {m.avatarUrl ? <img src={m.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover" /> : <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: m.color || '#00BFFF' }}>{getInitials(m.name || m.username)}</div>}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground truncate">{m.name}{m.me ? ' (you)' : ''}</div>
                  <div className="text-[11px] text-muted-foreground">{m.id === c.leaderId ? 'Leading · ' : ''}{m.live ? `driving · ${m.live.speed || 0} mph` : 'not on the road yet'}</div>
                </div>
              </div>
            ))}
          </div>
          <button onClick={join} disabled={busy} className="w-full dz-go bg-primary text-primary-foreground rounded-2xl py-4 text-base font-bold flex items-center justify-center gap-2">
            {busy && <Loader2 className="w-5 h-5 animate-spin" />}{inIt ? 'Drive there' : 'Join and drive'}
          </button>
          <button onClick={share} className="w-full bg-secondary text-foreground rounded-2xl py-3 text-sm font-semibold flex items-center justify-center gap-2"><Share2 className="w-4 h-4" />Invite more drivers</button>
          <p className="text-[11px] text-muted-foreground text-center">Everyone in the group sees each other on the map while driving. It ends after 12 hours or when the leader ends it.</p>
        </div>
      )}
    </div>
  );
}
