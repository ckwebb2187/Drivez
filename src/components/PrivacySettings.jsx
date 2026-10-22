import { useState } from 'react';
import { ShieldCheck, Download, Trash2, Loader2 } from 'lucide-react';
import { api } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';

const OPTIONS = [[null, 'Keep forever'], [30, '30 days'], [90, '90 days'], [365, '1 year']];

// Privacy-first: your data is yours. Download it, auto-delete old trips, or delete everything.
export default function PrivacySettings() {
  const { user, checkUserAuth } = useAuth();
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState('');
  const [askDelete, setAskDelete] = useState(false);
  const [error, setError] = useState('');
  const retention = user?.trip_retention_days || null;
  const setRetention = async (days) => {
    setBusy('ret'); setError('');
    try { await api.patch('/me/privacy', { trip_retention_days: days }); await checkUserAuth(); } catch (e) { setError(e.message); } finally { setBusy(''); }
  };
  const deleteAccount = async () => {
    setBusy('del'); setError('');
    try {
      const res = await fetch('/api/me', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not delete the account');
      window.location.assign('/login');
    } catch (e) { setError(e.message); setBusy(''); }
  };
  return (
    <div>
      <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-accent" /> Privacy</h3>
      <div className="bg-card rounded-2xl p-4 border border-border space-y-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Drivez never sells or shares your location. There are no ads or trackers. Your live location is only shown to friends while you drive, unless Ghost Mode is on.
        </p>
        <div>
          <div className="text-sm font-semibold text-foreground mb-2">Automatically delete old drives</div>
          <div className="flex gap-2 flex-wrap">
            {OPTIONS.map(([d, label]) => (
              <button key={label} onClick={() => setRetention(d)} disabled={busy === 'ret'}
                className={`px-3 h-8 rounded-full text-xs font-semibold border ${retention === d ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary border-border text-foreground'}`}>{label}</button>
            ))}
          </div>
        </div>
        <a href="/api/me/export" download className="w-full h-11 rounded-xl bg-secondary text-sm font-semibold text-foreground flex items-center justify-center gap-2">
          <Download className="w-4 h-4" /> Download all my data
        </a>
        {!askDelete ? (
          <button onClick={() => setAskDelete(true)} className="w-full h-11 rounded-xl text-sm font-semibold text-destructive flex items-center justify-center gap-2">
            <Trash2 className="w-4 h-4" /> Delete my account
          </button>
        ) : (
          <div className="rounded-xl border border-destructive/40 p-3">
            <p className="text-xs text-foreground mb-2">This permanently deletes your account, drives, cars, places and photos. Type <b>DELETE</b> to confirm.</p>
            <div className="flex gap-2">
              <input value={confirm} onChange={(e) => setConfirm(e.target.value)} className="flex-1 min-w-0 bg-secondary rounded-lg px-3 h-10 text-sm outline-none" placeholder="DELETE" />
              <button onClick={deleteAccount} disabled={confirm.toUpperCase() !== 'DELETE' || busy === 'del'} className="px-4 rounded-lg bg-destructive text-destructive-foreground text-sm font-bold disabled:opacity-40 flex items-center gap-1">
                {busy === 'del' && <Loader2 className="w-4 h-4 animate-spin" />} Delete
              </button>
            </div>
          </div>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
