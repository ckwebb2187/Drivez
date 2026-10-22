import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, Wrench, Gauge, Settings2, Loader2, Check, Sparkles } from 'lucide-react';
import { useApp } from '@/lib/AppContext';
import { CarPic } from '@/components/GarageManager';
import { SERVICE_KINDS, MOD_CATEGORIES, kindOf, newId, odometer, reminders, trackedKinds, dueText } from '@/lib/maintenance';

const field = 'w-full bg-secondary rounded-xl px-3 py-2.5 text-sm text-foreground border border-border focus:border-primary outline-none';
const pill = { overdue: 'bg-destructive/15 text-destructive', soon: 'bg-amber-400/15 text-amber-400', ok: 'bg-accent/15 text-accent', unknown: 'bg-secondary text-muted-foreground' };
const pillText = { overdue: 'Overdue', soon: 'Due soon', ok: 'OK', unknown: 'Not logged' };

// One car's page: odometer, service reminders + log, and mods list.
export default function VehicleDetail({ vehicle: v0, onClose }) {
  const { vehicles, trips, updateVehicle, scene } = useApp();
  const v = vehicles.find((x) => x.id === v0.id) || v0;
  const odo = odometer(v, trips);
  const rem = reminders(v, trips);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [odoInput, setOdoInput] = useState('');
  const [editOdo, setEditOdo] = useState(odo == null);
  const [logging, setLogging] = useState(null);   // service form values
  const [modForm, setModForm] = useState(null);
  const [customize, setCustomize] = useState(false);

  const save = async (patch) => {
    setBusy(true); setError('');
    try { await updateVehicle(v.id, patch); return true; } catch (e) { setError(e.message || 'Could not save.'); return false; } finally { setBusy(false); }
  };

  const saveOdo = async () => {
    const n = parseInt(String(odoInput).replace(/[^0-9]/g, ''), 10);
    if (!Number.isFinite(n)) { setError('Enter the number on your odometer.'); return; }
    if (await save({ odometer_base: n, odometer_base_date: new Date().toISOString() })) { setEditOdo(false); setOdoInput(''); }
  };

  const startLog = (kind) => setLogging({ kind: kind || 'oil', date: new Date().toISOString().slice(0, 10), miles: odo != null ? String(odo) : '', note: '', cost: '' });
  const saveLog = async () => {
    const miles = logging.miles === '' ? null : parseInt(String(logging.miles).replace(/[^0-9]/g, ''), 10);
    const entry = { id: newId(), kind: logging.kind, date: logging.date, miles: Number.isFinite(miles) ? miles : null, note: logging.note.trim().slice(0, 200), cost: logging.cost ? parseFloat(logging.cost) || null : null };
    if (await save({ services: [entry, ...(v.services || [])] })) setLogging(null);
  };
  const delLog = (id) => save({ services: (v.services || []).filter((s) => s.id !== id) });

  const saveMod = async () => {
    if (!modForm.name.trim()) { setError('Give the mod a name.'); return; }
    const m = { id: newId(), name: modForm.name.trim().slice(0, 80), category: modForm.category, note: modForm.note.trim().slice(0, 200) };
    if (await save({ mods: [...(v.mods || []), m] })) setModForm(null);
  };
  const delMod = (id) => save({ mods: (v.mods || []).filter((m) => m.id !== id) });

  const setPref = (key, patch) => {
    const prefs = { ...(v.service_prefs || {}) };
    prefs[key] = { ...(prefs[key] || {}), ...patch };
    save({ service_prefs: prefs });
  };

  const history = [...(v.services || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));

  return createPortal(
    <div className="fixed inset-0 z-[1600] bg-background flex flex-col">
      <div className="px-4 pt-[max(16px,env(safe-area-inset-top))] pb-3 flex items-center gap-3 border-b border-border">
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center shrink-0" aria-label="Close"><X className="w-5 h-5" /></button>
        <div className="w-10 h-12 flex items-center justify-center"><CarPic body={v.body || 'sedan'} color={v.color || '#00BFFF'} image={v.image_url} className="w-5 h-10" /></div>
        <div className="flex-1 min-w-0">
          <div className="text-base font-bold text-foreground truncate">{v.year} {v.make} {v.model}</div>
          {v.nickname && <div className="text-xs text-primary truncate">"{v.nickname}"</div>}
        </div>
        {busy && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 pb-16 space-y-6">
        {error && <p className="text-xs text-destructive">{error}</p>}

        {/* Odometer */}
        <section className="bg-card rounded-2xl border border-border p-4">
          <div className="flex items-center gap-2 mb-2"><Gauge className="w-4 h-4 text-primary" /><h3 className="text-sm font-bold text-foreground">Odometer</h3></div>
          {!editOdo && odo != null ? (
            <div className="flex items-end justify-between">
              <div>
                <div className="text-3xl font-black text-foreground tabular-nums">{odo.toLocaleString()} <span className="text-sm font-semibold text-muted-foreground">mi</span></div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Your reading of {v.odometer_base.toLocaleString()} on {new Date(v.odometer_base_date).toLocaleDateString()} + miles driven in the app</div>
              </div>
              <button onClick={() => { setEditOdo(true); setOdoInput(String(odo)); }} className="text-xs font-semibold text-primary">Correct it</button>
            </div>
          ) : (
            <div>
              <p className="text-[11px] text-muted-foreground mb-2">Enter what your dash says now. Drives in the app add to it automatically.</p>
              <div className="flex gap-2">
                <input value={odoInput} onChange={(e) => setOdoInput(e.target.value)} inputMode="numeric" placeholder="e.g. 84250" className={field} />
                <button onClick={saveOdo} disabled={busy} className="bg-primary text-primary-foreground rounded-xl px-4 text-sm font-semibold">Save</button>
              </div>
            </div>
          )}
        </section>

        {/* Service reminders */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2"><Wrench className="w-4 h-4 text-primary" /><h3 className="text-sm font-bold text-foreground">Service</h3></div>
            <div className="flex items-center gap-3">
              <button onClick={() => setCustomize((c) => !c)} className="text-xs text-muted-foreground flex items-center gap-1"><Settings2 className="w-3.5 h-3.5" />{customize ? 'Done' : 'Customize'}</button>
              <button onClick={() => startLog()} className="text-xs font-semibold text-primary flex items-center gap-1"><Plus className="w-3.5 h-3.5" />Log service</button>
            </div>
          </div>
          {odo == null && <p className="text-[11px] text-amber-400 mb-2">Set your odometer above so reminders can count miles.</p>}
          {customize ? (
            <div className="bg-card rounded-2xl border border-border divide-y divide-border">
              {trackedKinds(v).map((k) => (
                <div key={k.key} className="flex items-center gap-3 px-3 py-2.5">
                  <button onClick={() => setPref(k.key, { on: !k.on })} className={`w-5 h-5 rounded-md border flex items-center justify-center ${k.on ? 'bg-primary border-primary' : 'border-border'}`} aria-label={`Track ${k.label}`}>
                    {k.on && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
                  </button>
                  <span className="flex-1 text-sm text-foreground">{k.label}</span>
                  <span className="text-[11px] text-muted-foreground">every</span>
                  <input defaultValue={k.miles} inputMode="numeric" onBlur={(e) => { const n = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10); if (Number.isFinite(n) && n !== k.miles) setPref(k.key, { miles: n }); }}
                    className="w-20 bg-secondary rounded-lg px-2 py-1 text-sm text-right text-foreground border border-border outline-none" />
                  <span className="text-[11px] text-muted-foreground">mi</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {rem.map((r) => (
                <div key={r.key} className="bg-card rounded-2xl border border-border px-3 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{r.label}</span>
                      <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${pill[r.status]}`}>{pillText[r.status]}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {dueText(r)}{r.last ? ` · last ${r.last.miles != null ? `at ${r.last.miles.toLocaleString()} mi` : new Date(r.last.date).toLocaleDateString()}` : ''} · every {r.miles.toLocaleString()} mi
                    </div>
                  </div>
                  <button onClick={() => startLog(r.key)} className="text-[11px] font-bold text-primary bg-primary/10 rounded-full px-3 py-1.5 shrink-0">Done it</button>
                </div>
              ))}
            </div>
          )}

          {history.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-bold text-muted-foreground mb-2">History</h4>
              <div className="bg-card rounded-2xl border border-border divide-y divide-border">
                {history.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-foreground">{kindOf(s.kind).label}{s.cost ? <span className="text-muted-foreground"> · ${s.cost.toFixed(2)}</span> : null}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{new Date(`${s.date}T12:00`).toLocaleDateString()}{s.miles != null ? ` · ${s.miles.toLocaleString()} mi` : ''}{s.note ? ` · ${s.note}` : ''}</div>
                    </div>
                    <button onClick={() => delLog(s.id)} className="p-1 text-muted-foreground hover:text-destructive" aria-label="Delete"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Mods */}
        {scene && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /><h3 className="text-sm font-bold text-foreground">Mods</h3></div>
              <button onClick={() => setModForm({ name: '', category: MOD_CATEGORIES[0], note: '' })} className="text-xs font-semibold text-primary flex items-center gap-1"><Plus className="w-3.5 h-3.5" />Add mod</button>
            </div>
            {(v.mods || []).length === 0 ? (
              <p className="text-[11px] text-muted-foreground bg-card rounded-2xl border border-border p-4 text-center">No mods yet. Add your build list here; it can show on your profile.</p>
            ) : (
              <div className="bg-card rounded-2xl border border-border divide-y divide-border">
                {v.mods.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-foreground">{m.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{m.category}{m.note ? ` · ${m.note}` : ''}</div>
                    </div>
                    <button onClick={() => delMod(m.id)} className="p-1 text-muted-foreground hover:text-destructive" aria-label="Delete"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {logging && (
        <div className="fixed inset-0 z-[1700] bg-black/60 flex items-end justify-center" onClick={() => setLogging(null)}>
          <div className="w-full max-w-md bg-card rounded-t-3xl border-t border-border p-5 pb-8 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-foreground">Log service</h3>
            <select value={logging.kind} onChange={(e) => setLogging({ ...logging, kind: e.target.value })} className={field}>
              {SERVICE_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-muted-foreground">Date<input type="date" value={logging.date} onChange={(e) => setLogging({ ...logging, date: e.target.value })} className={`${field} mt-1`} /></label>
              <label className="text-[11px] text-muted-foreground">Odometer<input value={logging.miles} inputMode="numeric" onChange={(e) => setLogging({ ...logging, miles: e.target.value })} placeholder="miles" className={`${field} mt-1`} /></label>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input value={logging.note} onChange={(e) => setLogging({ ...logging, note: e.target.value })} placeholder="Note (e.g. Motul 5W-30)" className={`${field} col-span-2`} />
              <input value={logging.cost} inputMode="decimal" onChange={(e) => setLogging({ ...logging, cost: e.target.value })} placeholder="$ cost" className={field} />
            </div>
            <button onClick={saveLog} disabled={busy} className="w-full bg-primary text-primary-foreground rounded-xl py-3 text-sm font-semibold">Save</button>
          </div>
        </div>
      )}

      {modForm && (
        <div className="fixed inset-0 z-[1700] bg-black/60 flex items-end justify-center" onClick={() => setModForm(null)}>
          <div className="w-full max-w-md bg-card rounded-t-3xl border-t border-border p-5 pb-8 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-foreground">Add mod</h3>
            <input autoFocus value={modForm.name} onChange={(e) => setModForm({ ...modForm, name: e.target.value })} placeholder="e.g. Cobb Accessport V3" className={field} />
            <select value={modForm.category} onChange={(e) => setModForm({ ...modForm, category: e.target.value })} className={field}>
              {MOD_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input value={modForm.note} onChange={(e) => setModForm({ ...modForm, note: e.target.value })} placeholder="Note (optional)" className={field} />
            <button onClick={saveMod} disabled={busy} className="w-full bg-primary text-primary-foreground rounded-xl py-3 text-sm font-semibold">Add</button>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
