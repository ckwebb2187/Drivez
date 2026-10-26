import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronUp, Loader2, Lightbulb, Bug, Trash2, Check } from 'lucide-react';
import { api } from '@/api/base44Client';
import { useApp } from '@/lib/AppContext';

// Ideas board (T29): suggest features and upvote others'. Report a problem (T30): goes to the creator.
const field = 'w-full bg-secondary rounded-xl px-3 py-2.5 text-sm text-foreground border border-border focus:border-primary outline-none';
const STATUS = { planned: 'Planned', building: 'Building', done: 'Done ✓' };

export default function IdeasPage() {
  const navigate = useNavigate();
  const { user } = useApp();
  const [tab, setTab] = useState('ideas');
  return (
    <div className="max-w-md mx-auto px-4 pt-[max(16px,env(safe-area-inset-top))] pb-24 space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center" aria-label="Back"><ChevronLeft className="w-5 h-5" /></button>
        <h1 className="text-xl font-black text-foreground">Ideas & help</h1>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[['ideas', Lightbulb, 'Ideas board'], ['problem', Bug, 'Report a problem']].map(([k, Icon, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`h-10 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 ${tab === k ? 'dz-go' : 'bg-secondary text-foreground'}`}><Icon className="w-4 h-4" />{l}</button>
        ))}
      </div>
      {tab === 'ideas' ? <Ideas /> : <Problem creator={!!user?.creator} />}
    </div>
  );
}

function Ideas() {
  const [list, setList] = useState(null);
  const [canMark, setCanMark] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const load = () => api.get('/requests').then((d) => { setList(d.requests); setCanMark(d.canMark); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const post = async () => {
    setBusy(true); setErr('');
    try { await api.post('/requests', { text }); setText(''); await load(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const vote = async (r) => {
    setList((l) => l.map((x) => (x.id === r.id ? { ...x, voted: !r.voted, votes: x.votes + (r.voted ? -1 : 1) } : x)));
    await api.post(`/requests/${r.id}/vote`, { on: !r.voted }).catch(load);
  };
  const act = (r, what, extra = {}) => api.post(`/requests/${r.id}/${what}`, extra).then(load).catch((e) => setErr(e.message));
  return (
    <>
      <div className="bg-card rounded-2xl border border-border p-3">
        <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={280} rows={2} placeholder="What should Kaido Maps do next?" className={field} />
        <button onClick={post} disabled={busy || text.trim().length < 4} className="w-full mt-2 h-10 rounded-xl dz-go text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-1.5">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Post idea</button>
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      {!list ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto" /> : !list.length ? (
        <p className="text-sm text-muted-foreground text-center py-6">No ideas yet. Be the first.</p>
      ) : list.map((r) => (
        <div key={r.id} className="bg-card rounded-2xl border border-border p-3 flex gap-3">
          <button onClick={() => vote(r)} className={`w-12 shrink-0 rounded-xl flex flex-col items-center justify-center py-1.5 ${r.voted ? 'bg-primary/15 text-primary' : 'bg-secondary text-foreground'}`} aria-label={r.voted ? 'Remove vote' : 'Upvote'}>
            <ChevronUp className="w-5 h-5" /><span className="text-sm font-black">{r.votes}</span>
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground break-words">{r.text}</p>
            <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
              <span>{r.by}</span>
              {r.status && <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary font-semibold">{STATUS[r.status]}</span>}
              {canMark && ['planned', 'building', 'done'].map((st) => (
                <button key={st} onClick={() => act(r, 'status', { status: r.status === st ? null : st })} className={`px-1.5 rounded ${r.status === st ? 'text-primary font-bold' : ''}`}>{st}</button>
              ))}
              {(r.own || canMark) && <button onClick={() => act(r, 'delete')} className="ml-auto" aria-label="Delete idea"><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

function Problem({ creator }) {
  const [text, setText] = useState('');
  const [state, setState] = useState('');
  const [inbox, setInbox] = useState(null);
  useEffect(() => { if (creator) api.get('/problems').then((d) => setInbox(d.problems)).catch(() => setInbox([])); }, [creator]);
  const send = async () => {
    setState('sending');
    const info = `${navigator.userAgent.slice(0, 200)} · ${window.innerWidth}x${window.innerHeight} · ${window.location.pathname}`;
    try { await api.post('/problems', { text, info }); setText(''); setState('sent'); } catch { setState('err'); }
  };
  return (
    <>
      <div className="bg-card rounded-2xl border border-border p-3">
        <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} rows={4} placeholder="What went wrong? What were you doing when it happened?" className={field} />
        <p className="text-[10px] text-muted-foreground mt-1">Your phone model and screen size are sent too, to help fix it.</p>
        <button onClick={send} disabled={state === 'sending' || text.trim().length < 4} className="w-full mt-2 h-10 rounded-xl dz-go text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-1.5">
          {state === 'sending' ? <Loader2 className="w-4 h-4 animate-spin" /> : state === 'sent' ? <Check className="w-4 h-4" /> : null}
          {state === 'sent' ? 'Sent. Thanks!' : state === 'err' ? 'Try again' : 'Send report'}
        </button>
      </div>
      {creator && (
        <div className="space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground pt-2">Problem reports (only you see these)</div>
          {!inbox ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : !inbox.length ? <p className="text-xs text-muted-foreground">None yet.</p> : inbox.map((p) => (
            <div key={p.id} className="bg-card rounded-xl border border-border p-3">
              <p className="text-sm text-foreground whitespace-pre-wrap break-words">{p.text}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{p.by} · {new Date(p.at).toLocaleString()} · {p.info}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
