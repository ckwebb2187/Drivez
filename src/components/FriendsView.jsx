import { useCallback, useEffect, useState } from 'react';
import { Users, UserPlus, Check, X, Loader2 } from 'lucide-react';
import { api } from '@/api/base44Client';
import { getInitials } from '@/lib/helpers';

function Avatar({ f }) {
  if (f.avatarUrl) return <img src={f.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover" />;
  return (
    <div className="w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: f.color || '#00BFFF' }}>
      {getInitials(f.name)}
    </div>
  );
}

export default function FriendsView() {
  const [data, setData] = useState(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(() => api.get('/friends').then(setData).catch((e) => setMsg(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    setBusy(true); setMsg('');
    try {
      const r = await api.post('/friends/request', { who: input.trim() });
      setMsg(r.message); setInput(''); await load();
    } catch (err) { setMsg(err.message); }
    setBusy(false);
  };
  const respond = async (id, accept) => { await api.post('/friends/respond', { id, accept }); load(); };
  const remove = async (id) => { await api.post('/friends/remove', { id }); load(); };

  return (
    <div>
      <h3 className="text-sm font-bold text-foreground mb-3">Friends</h3>
      <form onSubmit={add} className="flex gap-2 mb-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Friend's username or email"
          className="flex-1 bg-secondary rounded-xl px-4 py-2.5 text-foreground text-sm border border-border focus:border-primary outline-none"
        />
        <button disabled={busy} className="bg-primary text-primary-foreground rounded-xl px-3 text-xs font-bold flex items-center gap-1 disabled:opacity-40">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />} Add
        </button>
      </form>
      {msg && <p className="text-xs text-muted-foreground mb-2">{msg}</p>}

      {data?.incoming?.length > 0 && (
        <div className="space-y-2 mb-3">
          <p className="text-[11px] font-bold text-muted-foreground uppercase">Requests</p>
          {data.incoming.map((f) => (
            <div key={f.id} className="bg-card rounded-2xl p-3 border border-primary/40 flex items-center gap-3">
              <Avatar f={f} />
              <div className="flex-1 min-w-0"><div className="text-sm font-semibold text-foreground truncate">{f.name}</div><div className="text-[10px] text-muted-foreground">@{f.username}</div></div>
              <button onClick={() => respond(f.id, true)} className="w-8 h-8 rounded-full bg-primary flex items-center justify-center"><Check className="w-4 h-4 text-primary-foreground" /></button>
              <button onClick={() => respond(f.id, false)} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center"><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
          ))}
        </div>
      )}

      {data === null ? (
        <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : data.friends.length === 0 && !data.outgoing.length ? (
        <div className="bg-card rounded-2xl p-8 border border-border text-center">
          <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No friends yet</p>
          <p className="text-xs text-muted-foreground mt-1">Add friends to see them on the live map and leaderboard</p>
        </div>
      ) : (
        <div className="space-y-2">
          {data.friends.map((f) => (
            <div key={f.id} className="bg-card rounded-2xl p-3 border border-border flex items-center gap-3">
              <Avatar f={f} />
              <div className="flex-1 min-w-0"><div className="text-sm font-semibold text-foreground truncate">{f.name}</div><div className="text-[10px] text-muted-foreground">@{f.username}{f.topSpeed ? ` · best ${f.topSpeed} mph` : ''}</div></div>
              <button onClick={() => remove(f.id)} className="text-muted-foreground p-1" aria-label="Remove friend"><X className="w-4 h-4" /></button>
            </div>
          ))}
          {data.outgoing.map((f) => (
            <div key={f.id} className="bg-card rounded-2xl p-3 border border-border flex items-center gap-3 opacity-70">
              <Avatar f={f} />
              <div className="flex-1 min-w-0"><div className="text-sm font-semibold text-foreground truncate">{f.name}</div><div className="text-[10px] text-muted-foreground">Request sent</div></div>
              <button onClick={() => remove(f.id)} className="text-muted-foreground p-1" aria-label="Cancel request"><X className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
