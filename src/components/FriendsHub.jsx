import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Users, X, Share2, Send, LogOut, Loader2, MessageCircle, Check, UserPlus, Navigation } from 'lucide-react';
import { api } from '@/api/base44Client';
import { getInitials } from '@/lib/helpers';
import { distM, formatNavDistance } from '@/lib/nav';
import { convoyUrl, startConvoy, inviteToConvoy, convoySettings, useConvoyChat, voiceUrl } from '@/lib/convoy';
import PushToTalk from '@/components/PushToTalk';
import UserTags from '@/components/UserTags';
import { spd, speedUnit } from '@/lib/units';

const QUICK = ['On my way', 'Gas stop', 'Pull over ahead', 'Slow down a bit', '👍', '🔥'];
const Avatar = ({ u, size = 36 }) => (u.avatarUrl
  ? <img src={u.avatarUrl} alt="" className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
  : <div className="rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0" style={{ width: size, height: size, background: u.color || '#00BFFF' }}>{getInitials(u.name || u.username)}</div>);

// Friends & group drives, reachable from the map (also mid-drive):
// who's driving now, invite friends to your group drive, join one, and the group chat.
export default function FriendsHub({ live = [], convoy, openConvoys = [], here, dest, onJoin, onLeave, onDriver, className = '' }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('group');
  const [friends, setFriends] = useState(null);
  const [invited, setInvited] = useState({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const invites = openConvoys.filter((c) => c.invited);
  const badge = (convoy ? convoy.members.length : 0) || invites.length || live.length;

  useEffect(() => {
    if (!open || friends) return;
    api.get('/friends').then((d) => setFriends(d.friends || [])).catch(() => setFriends([]));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) setTab(convoy ? 'group' : invites.length || openConvoys.length ? 'join' : 'friends'); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (key, fn) => { setBusy(key); setError(''); try { await fn(); } catch (e) { setError(e.message || 'That didn’t work.'); } finally { setBusy(''); } };
  const share = async () => { const url = convoyUrl(convoy.code); try { await navigator.share({ title: 'Group drive on Kaido Maps', url }); } catch { try { await navigator.clipboard.writeText(url); setError('Link copied'); } catch { /* ignore */ } } };
  const invite = (f) => act(`inv-${f.userId}`, async () => { await inviteToConvoy(convoy.code, [f.userId]); setInvited((m) => ({ ...m, [f.userId]: true })); });
  const inGroup = useMemo(() => new Set((convoy?.members || []).map((m) => m.id)), [convoy]);
  const liveById = useMemo(() => Object.fromEntries(live.map((d) => [d.userId, d])), [live]);

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Friends and group drives"
        className={`relative dz-glow h-9 pl-2.5 pr-3 rounded-full shadow-xl border flex items-center gap-1 text-[11px] font-bold pointer-events-auto ${convoy || invites.length ? 'bg-primary text-primary-foreground border-primary' : 'dz-wire border-primary/60 text-white'} ${className}`}>
        <span className={`dz-sweep ${convoy || invites.length ? 'dz-sweep-light' : ''}`} aria-hidden="true" />
        <Users className="w-3.5 h-3.5" />{convoy ? 'Group' : 'Friends'}{badge ? <span className="opacity-80">· {badge}</span> : null}
        {invites.length > 0 && !convoy && <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#ff3b30] border-2 border-background" />}
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[1550] bg-black/50 flex items-end justify-center" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md max-h-[86vh] flex flex-col bg-card border-t border-border rounded-t-3xl dz-pop-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 pt-4 pb-2">
              <div className="flex-1 flex bg-secondary rounded-xl p-1">
                {[['group', convoy ? 'My group' : 'Group drive'], ['join', `Join${openConvoys.length ? ` · ${openConvoys.length}` : ''}`], ['friends', `Live${live.length ? ` · ${live.length}` : ''}`]].map(([k, l]) => (
                  <button key={k} onClick={() => setTab(k)} className={`flex-1 text-xs py-2 rounded-lg ${tab === k ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground'}`}>{l}</button>
                ))}
              </div>
              <button onClick={() => setOpen(false)} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center shrink-0" aria-label="Close"><X className="w-4 h-4" /></button>
            </div>
            {error && <p className={`px-4 text-xs ${error === 'Link copied' ? 'text-accent' : 'text-destructive'}`}>{error}</p>}

            <div className="flex-1 overflow-y-auto px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
              {tab === 'group' && (convoy ? (
                <GroupTab convoy={convoy} here={here} friends={friends} inGroup={inGroup} invited={invited} busy={busy} onInvite={invite} onShare={share}
                  onLeave={() => act('leave', async () => { await onLeave(); setOpen(false); })} setError={setError} />
              ) : (
                <div className="py-4 space-y-3 text-center">
                  <p className="text-sm text-muted-foreground">{dest ? <>Start a group drive to <b className="text-foreground">{dest.name}</b>. Friends you invite see the route and each other on the map.</> : 'Pick where you’re going first (search on the map), then start a group drive from here or with the Group button next to Go.'}</p>
                  {dest && (
                    <button disabled={busy === 'start'} onClick={() => act('start', () => startConvoy(dest))} className="w-full h-12 rounded-2xl dz-go text-sm font-bold flex items-center justify-center gap-2">
                      {busy === 'start' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}Start group drive
                    </button>
                  )}
                </div>
              ))}

              {tab === 'join' && (
                <div className="py-2 space-y-2">
                  {openConvoys.length ? openConvoys.map((c) => (
                    <div key={c.code} className={`rounded-2xl border p-3 ${c.invited ? 'border-primary bg-primary/10' : 'border-border bg-secondary/40'}`}>
                      {c.invited && <div className="text-[10px] font-black tracking-wide text-primary mb-0.5">YOU’RE INVITED</div>}
                      <div className="text-sm font-bold text-foreground truncate">{c.name || `To ${c.dest.name}`}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{c.leader ? `${c.leader.name} leading · ` : ''}{c.members} driver{c.members === 1 ? '' : 's'}{here ? ` · ${formatNavDistance(distM(here, [c.dest.lat, c.dest.lng]))} away` : ''}</div>
                      <button disabled={busy === c.code} onClick={() => act(c.code, async () => { await onJoin(c.code); setTab('group'); })} className="mt-2 w-full h-10 rounded-xl dz-go text-sm font-bold flex items-center justify-center gap-1.5">
                        {busy === c.code ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}Join and drive
                      </button>
                    </div>
                  )) : <p className="text-sm text-muted-foreground text-center py-6">No group drives to join right now. When a friend starts one or invites you, it shows up here.</p>}
                  <JoinByCode onJoin={(code) => act('code', async () => { await onJoin(code); setTab('group'); })} busy={busy === 'code'} />
                </div>
              )}

              {tab === 'friends' && (
                <div className="py-2 space-y-1.5">
                  {!friends ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto my-6" /> : !friends.length ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No friends yet. Use “Invite friends” in the menu to share your link.</p>
                  ) : [...friends].sort((a, b) => (liveById[b.userId] ? 1 : 0) - (liveById[a.userId] ? 1 : 0)).map((f) => {
                    const d = liveById[f.userId];
                    return (
                      <div key={f.userId} className="flex items-center gap-3 rounded-xl px-2 py-2 bg-secondary/40">
                        <button onClick={() => d && onDriver?.(d)} className="relative"><Avatar u={f} />{d && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-accent border-2 border-card" />}</button>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-foreground truncate">{f.name}<UserTags creator={f.creator} founder={f.founder} className="ml-1" /></div>
                          <div className="text-[11px] text-muted-foreground truncate">{d ? `Driving · ${spd(d.speed || 0)} ${speedUnit()}${here ? ` · ${formatNavDistance(distM(here, [d.lat, d.lng]))} away` : ''}` : `@${f.username}`}</div>
                        </div>
                        {convoy && !inGroup.has(f.userId) && (
                          <button disabled={invited[f.userId] || busy === `inv-${f.userId}`} onClick={() => invite(f)} className={`h-9 px-3 rounded-full text-xs font-bold flex items-center gap-1 ${invited[f.userId] ? 'bg-secondary text-muted-foreground' : 'dz-go'}`}>
                            {invited[f.userId] ? <><Check className="w-3.5 h-3.5" />Invited</> : <><UserPlus className="w-3.5 h-3.5" />Invite</>}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function JoinByCode({ onJoin, busy }) {
  const [code, setCode] = useState('');
  const clean = (v) => (v.match(/convoy\/([a-f0-9]{8})/i)?.[1] || v).trim().toLowerCase();
  return (
    <div className="flex gap-2 pt-2">
      <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paste a group drive link or code" autoCapitalize="none"
        className="flex-1 min-w-0 h-10 bg-secondary rounded-xl px-3 text-sm text-foreground border border-border focus:border-primary outline-none" />
      <button disabled={busy || !/^[a-f0-9]{8}$/.test(clean(code))} onClick={() => onJoin(clean(code))} className="h-10 px-4 rounded-xl dz-go text-sm font-bold disabled:opacity-50">{busy ? '…' : 'Join'}</button>
    </div>
  );
}

function GroupTab({ convoy, here, friends, inGroup, invited, busy, onInvite, onShare, onLeave, setError }) {
  const { msgs, send } = useConvoyChat(convoy.code, true);
  const [text, setText] = useState('');
  const [discord, setDiscord] = useState(convoy.discord || '');
  const list = useRef(null);
  useEffect(() => { list.current?.scrollTo({ top: 1e6 }); }, [msgs.length]);
  const say = async (t) => { if (!t.trim()) return; setText(''); try { await send(t.trim()); } catch (e) { setError(e.message); } };
  const saveDiscord = async (patch) => { try { await convoySettings(convoy.code, patch); window.dispatchEvent(new Event('dz-convoy')); } catch (e) { setError(e.message); } };
  const toInvite = (friends || []).filter((f) => !inGroup.has(f.userId));

  return (
    <div className="py-2 space-y-3">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wide text-primary">Group drive · {convoy.dest.name}</div>
        <div className="mt-1.5 space-y-1">
          {convoy.members.map((m) => (
            <div key={m.id} className="flex items-center gap-2 text-sm">
              <span className={`w-2 h-2 rounded-full ${m.live || m.me ? 'bg-accent' : 'bg-muted'}`} />
              <span className="flex-1 truncate text-foreground">{m.me ? 'You' : m.name}{m.id === convoy.leaderId ? ' · lead' : ''}</span>
              <span className="text-[11px] text-muted-foreground">{m.me ? '' : m.live && here ? formatNavDistance(distM(here, [m.live.lat, m.live.lng])) : 'not driving yet'}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={onShare} className="flex-1 h-10 rounded-xl bg-secondary text-xs font-bold text-foreground flex items-center justify-center gap-1.5"><Share2 className="w-4 h-4" />Share link</button>
        {convoy.discord && <a href={convoy.discord} target="_blank" rel="noreferrer" className="flex-1 h-10 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5" style={{ background: '#5865F2' }}><MessageCircle className="w-4 h-4" />Discord</a>}
        <button onClick={onLeave} disabled={busy === 'leave'} className="h-10 px-3 rounded-xl bg-secondary text-xs font-bold text-destructive flex items-center gap-1"><LogOut className="w-4 h-4" />{convoy.isLeader ? 'End' : 'Leave'}</button>
      </div>

      {toInvite.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold text-muted-foreground mb-1.5">Invite friends</div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {toInvite.map((f) => (
              <button key={f.userId} disabled={invited[f.userId] || busy === `inv-${f.userId}`} onClick={() => onInvite(f)} className="shrink-0 w-16 flex flex-col items-center gap-1">
                <div className="relative"><Avatar u={f} size={44} />{invited[f.userId] && <span className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center"><Check className="w-5 h-5 text-white" /></span>}</div>
                <span className="text-[10px] text-foreground truncate w-full text-center">{invited[f.userId] ? 'Invited' : f.name.split(' ')[0]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Group chat (quick replies are tap-once, so it's usable at a light) */}
      <div className="rounded-2xl border border-border bg-secondary/30">
        <div ref={list} className="max-h-[26vh] overflow-y-auto p-2 space-y-1.5">
          {!msgs.length && <p className="text-[11px] text-muted-foreground text-center py-3">Group chat. Messages show for everyone in this drive{convoy.discordMirror ? ' and post to Discord' : ''}.</p>}
          {msgs.map((m) => (
            m.kind === 'system' ? (
              <div key={m.id} className="text-[11px] text-center text-muted-foreground font-semibold py-0.5">{m.text}</div>
            ) : (
              <div key={m.id} className={`text-sm rounded-2xl px-3 py-1.5 max-w-[85%] ${m.mine ? 'ml-auto bg-primary text-primary-foreground' : 'bg-card text-foreground'}`}>
                {!m.mine && <div className="text-[10px] font-bold opacity-70">{m.user.name}</div>}
                {m.kind === 'voice'
                  ? <button onClick={() => new Audio(voiceUrl(convoy.code, m.id)).play().catch(() => {})} className="flex items-center gap-1.5 font-semibold">▶ Voice · {Math.round(m.secs || 0)} s</button>
                  : m.text}
              </div>
            )
          ))}
        </div>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar px-2 pb-2">
          {QUICK.map((q) => <button key={q} onClick={() => say(q)} className="shrink-0 text-xs px-3 py-1.5 rounded-full bg-card text-foreground border border-border">{q}</button>)}
        </div>
        <div className="px-2 pb-2"><PushToTalk code={convoy.code} compact={false} className="w-full justify-center" /></div>
        <div className="flex gap-2 p-2 pt-0">
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && say(text)} placeholder="Message the group…" className="flex-1 min-w-0 h-10 bg-card rounded-xl px-3 text-sm text-foreground border border-border focus:border-primary outline-none" />
          <button onClick={() => say(text)} className="w-10 h-10 rounded-xl dz-go flex items-center justify-center" aria-label="Send"><Send className="w-4 h-4" /></button>
        </div>
      </div>

      {convoy.isLeader && (
        <div className="rounded-2xl border border-border p-3 space-y-2">
          <div className="text-[11px] font-semibold text-muted-foreground">Discord for this group</div>
          <div className="flex gap-2">
            <input value={discord} onChange={(e) => setDiscord(e.target.value)} placeholder="Discord invite or channel link" className="flex-1 min-w-0 h-10 bg-secondary rounded-xl px-3 text-sm text-foreground border border-border focus:border-primary outline-none" />
            <button onClick={() => saveDiscord({ discord })} className="h-10 px-3 rounded-xl bg-secondary text-xs font-bold text-foreground">Save</button>
          </div>
          <button onClick={() => saveDiscord({ discordMirror: !convoy.discordMirror })} className="w-full flex items-center gap-3 text-left">
            <span className="flex-1 text-xs text-foreground">Post group chat to my Discord channel</span>
            <span className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${convoy.discordMirror ? 'bg-[#34A853]' : 'bg-muted'}`}><span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${convoy.discordMirror ? 'left-[22px]' : 'left-0.5'}`} /></span>
          </button>
        </div>
      )}
    </div>
  );
}
