import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MapContainer, CircleMarker, Circle, Tooltip } from 'react-leaflet';
import { ChevronLeft, Users, MapPin, ShieldCheck, Loader2, BatteryFull, BatteryLow, BatteryCharging, Plus, Trash2, Copy, Share2, Lock, LogOut, Car, Siren, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { BaseLayer } from '@/components/DarkMap';
import { FitBounds } from '@/components/MapLayers';
import { api } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useFamily, ROLE_LABEL, CONTROL_LABELS, EVENT_ICON, familyHere } from '@/lib/family';
import { formatTimeAgo } from '@/lib/helpers';
import { spd, speedUnit, dst, distUnit } from '@/lib/units';

const EMOJIS = ['🏠', '🏫', '💼', '🏋️', '⛪', '🛒', '📍'];
const ago = (t) => (t ? formatTimeAgo(new Date(t).toISOString()) : 'not yet');

export default function FamilyPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, checkUserAuth } = useAuth();
  const { data, loading, reload } = useFamily();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const run = async (key, fn) => { setErr(''); setBusy(key); try { await fn(); await reload(); await checkUserAuth?.(); } catch (e) { setErr(e.message); } finally { setBusy(''); } };

  if (loading && !data) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  const fam = data?.family;
  return (
    <div className="min-h-screen pb-28">
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3 flex items-center gap-2 border-b border-border">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center" aria-label="Back"><ChevronLeft className="w-5 h-5" /></button>
        <Users className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-black text-foreground flex-1 truncate">{fam ? fam.name : 'Family'}</h1>
      </div>
      {err && <div className="mx-4 mt-3 rounded-xl bg-destructive/15 text-destructive text-sm px-3 py-2">{err}</div>}
      {!fam ? <NoFamily run={run} busy={busy} initialCode={params.get('code') || ''} name={user?.display_name} /> : <FamilyHome data={data} meId={user?.id} run={run} busy={busy} reload={reload} />}
    </div>
  );
}

function NoFamily({ run, busy, initialCode, name }) {
  const [famName, setFamName] = useState(`${(name || 'My').split(' ').slice(-1)[0]} family`);
  const [code, setCode] = useState(initialCode);
  return (
    <div className="px-4 pt-4 space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="text-base font-bold text-foreground">Keep your people close</div>
        <p className="text-sm text-muted-foreground mt-1">A private group for your household: see where everyone is, get a heads-up when they get to school or home, check in, and send an SOS. Parents can set up teen and kid accounts with limits.</p>
      </div>
      <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
        <div className="text-sm font-bold text-foreground">Join with a code</div>
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="6-letter code" maxLength={6} className="w-full bg-secondary rounded-xl px-3 py-2.5 text-lg tracking-[0.3em] font-black text-foreground uppercase" />
        <button disabled={code.length < 6 || busy} onClick={() => run('join', () => api.post('/family/join', { code }))} className="w-full dz-go rounded-xl py-2.5 text-sm font-bold disabled:opacity-50">{busy === 'join' ? 'Joining…' : 'Join family'}</button>
      </div>
      <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
        <div className="text-sm font-bold text-foreground">Start a family</div>
        <input value={famName} onChange={(e) => setFamName(e.target.value)} maxLength={40} className="w-full bg-secondary rounded-xl px-3 py-2.5 text-sm text-foreground" />
        <button disabled={busy} onClick={() => run('create', () => api.post('/family', { name: famName }))} className="w-full bg-secondary text-foreground rounded-xl py-2.5 text-sm font-bold">{busy === 'create' ? 'Creating…' : 'Create — you\'ll be the parent'}</button>
      </div>
    </div>
  );
}

function FamilyHome({ data, meId, run, busy, reload }) {
  const { family, me, members, places, events } = data;
  const parent = me.role === 'parent';
  const young = me.role === 'teen' || me.role === 'kid';
  const pts = useMemo(() => [...members.filter((m) => m.live).map((m) => [m.live.lat, m.live.lng]), ...places.map((p) => [p.lat, p.lng])], [members, places]);
  const [fitKey] = useState(() => Date.now());
  const [open, setOpen] = useState(null);
  const sos = useHold(() => run('sos', async () => api.post('/family/sos', await familyHere())));

  return (
    <div className="px-4 pt-3 space-y-4">
      {young && (
        <div className="rounded-2xl border border-primary/50 bg-primary/10 px-3 py-2.5 flex items-center gap-2 text-sm text-foreground">
          <MapPin className="w-4 h-4 text-primary shrink-0" />Your location is shared with your family while you use Kaido Maps.
        </div>
      )}
      <div className="h-60 rounded-2xl overflow-hidden border border-border isolate">
        <MapContainer center={pts[0] || [39.8, -98.6]} zoom={pts.length ? 13 : 4} zoomControl={false} style={{ height: '100%', width: '100%' }}>
          <BaseLayer />
          {pts.length > 1 && <FitBounds key={fitKey} points={pts} padding={[40, 40]} />}
          {places.map((p) => <Circle key={p.id} center={[p.lat, p.lng]} radius={p.radius} pathOptions={{ color: 'hsl(var(--primary))', weight: 1.5, fillOpacity: 0.12 }}><Tooltip direction="top">{p.emoji} {p.name}</Tooltip></Circle>)}
          {members.filter((m) => m.live).map((m) => (
            <CircleMarker key={m.id} center={[m.live.lat, m.live.lng]} radius={9} pathOptions={{ color: '#fff', weight: 2, fillColor: m.color || '#00BFFF', fillOpacity: 1 }}>
              <Tooltip permanent direction="top" offset={[0, -8]}>{m.id === meId ? 'You' : m.name}</Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button disabled={!!busy} onClick={() => run('checkin', async () => api.post('/family/checkin', await familyHere()))} className="rounded-2xl bg-card border border-border py-3 flex items-center justify-center gap-2 text-sm font-bold text-foreground">
          {busy === 'checkin' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 text-green-400" />}I'm here & safe
        </button>
        <button {...sos.handlers} className="relative overflow-hidden rounded-2xl bg-red-600 text-white py-3 flex items-center justify-center gap-2 text-sm font-black select-none touch-none">
          <span className="absolute inset-y-0 left-0 bg-red-900/50" style={{ width: `${sos.progress * 100}%` }} />
          <Siren className="w-4 h-4 relative" /><span className="relative">{busy === 'sos' ? 'Sending…' : sos.progress > 0 ? 'Keep holding…' : 'Hold for SOS'}</span>
        </button>
      </div>

      <Section title="People">
        {members.map((m) => {
          const mine = m.id === meId;
          const canManage = parent && !mine;
          const status = !m.sharing ? 'Location paused' : m.live?.driving ? `Driving · ${spd(m.live.speed)} ${speedUnit()}` : m.at ? `At ${m.at}` : m.live ? 'Out and about' : 'No location yet';
          const Bat = m.charging ? BatteryCharging : m.battery != null && m.battery < 0.2 ? BatteryLow : BatteryFull;
          return (
            <div key={m.id} className="rounded-2xl bg-card border border-border">
              <button onClick={() => setOpen(open === m.id ? null : m.id)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black text-white shrink-0" style={{ background: m.color || '#3a4560' }}>{(m.name || '?').slice(0, 1).toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-foreground truncate">{mine ? `${m.name} (you)` : m.name} <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground align-middle">{ROLE_LABEL[m.role]}</span></div>
                  <div className="text-[11px] text-muted-foreground truncate">{m.live?.driving && <Car className="w-3 h-3 inline mr-1 text-primary" />}{status} · {ago(m.updated)}</div>
                </div>
                {m.battery != null && <span className={`text-[11px] font-bold flex items-center gap-0.5 ${m.battery < 0.2 && !m.charging ? 'text-red-400' : 'text-muted-foreground'}`}><Bat className="w-4 h-4" />{Math.round(m.battery * 100)}%</span>}
                {(canManage || mine) && (open === m.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />)}
              </button>
              {open === m.id && (canManage ? <MemberAdmin m={m} run={run} busy={busy} /> : mine ? <MySharing me={me} run={run} /> : null)}
            </div>
          );
        })}
      </Section>

      <Places places={places} run={run} busy={busy} />

      <Invite parent={parent} />

      <Section title="Activity">
        {!events.length ? <p className="text-sm text-muted-foreground px-1">Arrivals, check-ins and alerts from the last week show up here.</p>
          : events.map((e) => (
            <a key={e.id} href={e.lat != null ? `https://www.google.com/maps?q=${e.lat},${e.lng}` : undefined} target="_blank" rel="noreferrer"
              className={`flex items-start gap-2.5 rounded-xl px-3 py-2 ${e.kind === 'sos' ? 'bg-red-600/20 border border-red-500/50' : 'bg-secondary/40'}`}>
              <span className="text-base leading-5">{EVENT_ICON[e.kind] || '•'}</span>
              <span className="flex-1 min-w-0 text-sm text-foreground">{e.text}<span className="block text-[10px] text-muted-foreground">{ago(e.at)}</span></span>
            </a>
          ))}
      </Section>

      {parent && <ParentPin pinSet={family.pinSet} run={run} busy={busy} />}

      <LeaveFamily young={young} locked={young && family.pinSet} run={run} busy={busy} />
      <p className="text-[10px] text-muted-foreground text-center px-6">Family locations are private to your family and never shown publicly. Teen and kid accounts always know their location is shared. Crash detection is coming later.</p>
    </div>
  );
}

function Section({ title, children, right }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1"><div className="text-xs font-black tracking-wider text-muted-foreground uppercase">{title}</div>{right}</div>
      {children}
    </div>
  );
}

function Toggle({ on, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${on ? 'bg-primary' : 'bg-muted'} disabled:opacity-50`}>
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

function MemberAdmin({ m, run, busy }) {
  const young = m.role === 'teen' || m.role === 'kid';
  const [trips, setTrips] = useState(null);
  useEffect(() => { if (young) api.get(`/family/trips/${m.id}`).then((d) => setTrips(d.trips)).catch(() => setTrips([])); }, [m.id, young]);
  const patch = (body) => run(`m-${m.id}`, () => api.patch('/family/member', { userId: m.id, ...body }));
  return (
    <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
      <div className="grid grid-cols-4 gap-1">
        {['parent', 'adult', 'teen', 'kid'].map((r) => (
          <button key={r} onClick={() => patch({ role: r })} className={`text-[11px] py-1.5 rounded-lg border ${m.role === r ? 'border-primary bg-primary/10 text-primary font-bold' : 'border-border text-muted-foreground'}`}>{ROLE_LABEL[r]}</button>
        ))}
      </div>
      {young && m.controls && (
        <div className="space-y-2">
          <div className="text-[11px] font-bold text-muted-foreground flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" />What {m.name.split(' ')[0]} can use</div>
          {CONTROL_LABELS.map(([k, label, sub]) => (
            <div key={k} className="flex items-center gap-3">
              <div className="flex-1 min-w-0"><div className="text-sm text-foreground">{label}</div><div className="text-[10px] text-muted-foreground">{sub}</div></div>
              <Toggle on={!!m.controls[k]} disabled={busy === `m-${m.id}`} onClick={() => patch({ controls: { [k]: !m.controls[k] } })} />
            </div>
          ))}
        </div>
      )}
      {young && (
        <div className="space-y-1">
          <div className="text-[11px] font-bold text-muted-foreground">Recent drives</div>
          {trips == null ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : !trips.length ? <p className="text-[11px] text-muted-foreground">No drives yet.</p>
            : trips.slice(0, 6).map((t) => (
              <div key={t.id} className="text-[11px] text-foreground bg-secondary/40 rounded-lg px-2 py-1.5 flex gap-2">
                <span className="flex-1 truncate">{t.start ? new Date(t.start).toLocaleDateString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''} · {t.end_location || t.title || 'Drive'}</span>
                <span className="shrink-0 text-muted-foreground">{dst(t.distance)} {distUnit()} · top {spd(t.top_speed)}{t.hard_brakes ? ` · ${t.hard_brakes} hard brakes` : ''}</span>
              </div>
            ))}
        </div>
      )}
      <button onClick={() => { if (window.confirm(`Remove ${m.name} from the family?`)) run('rm', () => api.post('/family/remove', { userId: m.id })); }} className="text-xs text-destructive font-semibold">Remove from family</button>
    </div>
  );
}

function MySharing({ me, run }) {
  if (me.role === 'teen' || me.role === 'kid') return <p className="px-3 pb-3 text-[11px] text-muted-foreground border-t border-border pt-2">Your location stays shared with your family. A parent can change your account type.</p>;
  return (
    <div className="px-3 pb-3 pt-2 border-t border-border flex items-center gap-3">
      <div className="flex-1 text-sm text-foreground">Share my location with the family</div>
      <Toggle on={me.sharing} onClick={() => run('share', () => api.post('/family/sharing', { on: !me.sharing }))} />
    </div>
  );
}

function Places({ places, run, busy }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🏠');
  const [radius, setRadius] = useState(150);
  const add = () => run('place', async () => {
    const here = await familyHere();
    if (here.lat == null) throw new Error('Turn on location to save this spot.');
    await api.post('/family/places', { name, emoji, radius, ...here });
    setAdding(false); setName('');
  });
  return (
    <Section title="Places" right={<button onClick={() => setAdding((a) => !a)} className="text-xs font-bold text-primary flex items-center gap-1"><Plus className="w-3.5 h-3.5" />Add where I am</button>}>
      {adding && (
        <div className="rounded-2xl bg-card border border-primary/50 p-3 space-y-2">
          <div className="flex gap-1">{EMOJIS.map((e) => <button key={e} onClick={() => setEmoji(e)} className={`flex-1 py-1.5 rounded-lg text-lg ${emoji === e ? 'bg-primary/20 ring-1 ring-primary' : 'bg-secondary/50'}`}>{e}</button>)}</div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Home, School, Work…" maxLength={40} className="w-full bg-secondary rounded-xl px-3 py-2 text-sm text-foreground" />
          <label className="text-[11px] text-muted-foreground flex items-center gap-2">Size<input type="range" min="60" max="600" step="10" value={radius} onChange={(e) => setRadius(+e.target.value)} className="flex-1" />{radius} m</label>
          <button disabled={!name.trim() || busy === 'place'} onClick={add} className="w-full dz-go rounded-xl py-2 text-sm font-bold disabled:opacity-50">{busy === 'place' ? 'Saving…' : 'Save place here'}</button>
          <p className="text-[10px] text-muted-foreground">Everyone gets a heads-up when someone arrives or leaves.</p>
        </div>
      )}
      {!places.length && !adding && <p className="text-sm text-muted-foreground px-1">Save Home, School or Work to get arrive and leave alerts.</p>}
      {places.map((p) => (
        <div key={p.id} className="flex items-center gap-3 rounded-xl bg-card border border-border px-3 py-2">
          <span className="text-lg">{p.emoji}</span><span className="flex-1 text-sm font-semibold text-foreground">{p.name}</span>
          <button onClick={() => { if (window.confirm(`Delete ${p.name}?`)) run('delp', () => api.del(`/family/places/${p.id}`)); }} aria-label={`Delete ${p.name}`} className="text-muted-foreground"><Trash2 className="w-4 h-4" /></button>
        </div>
      ))}
    </Section>
  );
}

function Invite({ parent }) {
  const [inv, setInv] = useState(null);
  const [err, setErr] = useState('');
  const make = async (role) => { setErr(''); try { setInv(await api.post('/family/invite', { role })); } catch (e) { setErr(e.message); } };
  const link = inv ? `${window.location.origin}/family?code=${inv.code}` : '';
  return (
    <Section title="Add someone">
      <div className="rounded-2xl bg-card border border-border p-3 space-y-2">
        <div className="grid grid-cols-4 gap-1">
          {(parent ? ['adult', 'parent', 'teen', 'kid'] : ['adult']).map((r) => <button key={r} onClick={() => make(r)} className="text-[11px] py-2 rounded-lg bg-secondary text-foreground font-semibold">{ROLE_LABEL[r]}</button>)}
        </div>
        {parent && <p className="text-[10px] text-muted-foreground">Teen and kid accounts: open Kaido Maps on their phone, sign them up, then enter the code in Family. Kids start with meets, social, group drives and map visibility off.</p>}
        {inv && (
          <div className="rounded-xl bg-secondary/50 p-3 text-center">
            <div className="text-[11px] text-muted-foreground">{ROLE_LABEL[inv.role]} code · lasts 7 days</div>
            <div className="text-3xl font-black tracking-[0.3em] text-primary my-1">{inv.code}</div>
            <div className="flex gap-2 justify-center">
              <button onClick={() => navigator.clipboard?.writeText(inv.code)} className="text-xs font-semibold flex items-center gap-1 px-3 py-1.5 rounded-full bg-secondary"><Copy className="w-3.5 h-3.5" />Copy</button>
              <button onClick={() => (navigator.share ? navigator.share({ title: 'Join my family on Kaido Maps', text: `Join my family on Kaido Maps with code ${inv.code}`, url: link }).catch(() => {}) : navigator.clipboard?.writeText(link))} className="text-xs font-semibold flex items-center gap-1 px-3 py-1.5 rounded-full bg-secondary"><Share2 className="w-3.5 h-3.5" />Share link</button>
            </div>
          </div>
        )}
        {err && <p className="text-xs text-destructive">{err}</p>}
      </div>
    </Section>
  );
}

function ParentPin({ pinSet, run, busy }) {
  const [pin, setPin] = useState('');
  return (
    <Section title="Parent PIN">
      <div className="rounded-2xl bg-card border border-border p-3 space-y-2">
        <p className="text-[11px] text-muted-foreground">{pinSet ? 'Teen and kid settings are locked with your PIN.' : 'Set a PIN to lock settings on teen and kid phones (they also need it to leave the family).'}</p>
        <div className="flex gap-2">
          <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" type="password" placeholder="4–8 digits" className="flex-1 bg-secondary rounded-xl px-3 py-2 text-sm text-foreground" />
          <button disabled={pin.length < 4 || busy === 'pin'} onClick={() => run('pin', async () => { await api.post('/family/pin', { pin }); setPin(''); })} className="px-4 rounded-xl dz-go text-sm font-bold disabled:opacity-50 flex items-center gap-1"><Lock className="w-3.5 h-3.5" />{pinSet ? 'Change' : 'Set'}</button>
        </div>
        {pinSet && <button onClick={() => run('pin', () => api.post('/family/pin', { pin: '' }))} className="text-xs text-muted-foreground underline">Remove PIN</button>}
      </div>
    </Section>
  );
}

function LeaveFamily({ locked, run, busy }) {
  const [pin, setPin] = useState('');
  const [ask, setAsk] = useState(false);
  const go = () => run('leave', () => api.post('/family/leave', { pin }));
  return (
    <div className="pt-2">
      {ask && locked && <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} inputMode="numeric" type="password" placeholder="Parent PIN" className="w-full bg-secondary rounded-xl px-3 py-2 text-sm text-foreground mb-2" />}
      <button disabled={busy === 'leave'} onClick={() => { if (locked && !ask) { setAsk(true); return; } if (window.confirm('Leave this family? They will stop seeing your location.')) go(); }} className="w-full rounded-2xl border border-border py-3 text-sm font-semibold text-destructive flex items-center justify-center gap-2"><LogOut className="w-4 h-4" />Leave family</button>
    </div>
  );
}

// Press-and-hold (2 s) so SOS can't go off by accident.
function useHold(onDone, ms = 2000) {
  const [progress, setProgress] = useState(0);
  const raf = useRef(0), t0 = useRef(0);
  const stop = () => { cancelAnimationFrame(raf.current); setProgress(0); };
  const start = (e) => {
    e.preventDefault();
    t0.current = performance.now();
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0.current) / ms);
      setProgress(p);
      if (p >= 1) { setProgress(0); onDone(); return; }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };
  return { progress, handlers: { onPointerDown: start, onPointerUp: stop, onPointerLeave: stop, onPointerCancel: stop, onContextMenu: (e) => e.preventDefault() } };
}
