import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { QrCode, Instagram, Facebook, Youtube, Users, Loader2, X, Download, ExternalLink, Share2, Plus } from 'lucide-react';
import { useApp } from '@/lib/AppContext';
import StickerModal from '@/components/StickerModal';

export const SOCIAL_LINKS = {
  instagram: { label: 'Instagram', icon: Instagram, url: (h) => `https://instagram.com/${h}` },
  x: { label: 'X', icon: ({ className }) => <span className={`${className} font-black text-[14px] leading-none flex items-center justify-center`}>𝕏</span>, url: (h) => `https://x.com/${h}` },
  facebook: { label: 'Facebook', icon: Facebook, url: (h) => `https://facebook.com/${h}` },
  tiktok: { label: 'TikTok', icon: ({ className }) => <span className={`${className} font-black text-[13px] leading-none flex items-center justify-center`}>♪</span>, url: (h) => `https://tiktok.com/@${h}` },
  youtube: { label: 'YouTube', icon: Youtube, url: (h) => `https://youtube.com/@${h}` },
};
const PARTS = [
  ['car', 'My car'], ['mods', 'Mods list'], ['socials', 'Social links'], ['clubs', 'Car clubs'], ['stats', 'Miles & drives'], ['bio', 'Bio & city'],
];
const WHO = [['everyone', 'Everyone'], ['friends', 'Friends'], ['me', 'Only me']];
const field = 'w-full bg-secondary rounded-xl px-3 py-2.5 text-sm text-foreground border border-border focus:border-primary outline-none';

// The QR library loads only when a code is drawn.
const loadQR = () => import('qrcode').then((m) => m.default || m);

export const profileUrl = (username) => `${window.location.origin}/u/${username}`;

// Social links, car clubs, who-sees-what, and your QR code / window sticker.
export default function ProfileSharing() {
  const { user, saveProfile } = useApp();
  const [p, setP] = useState(user.profile);
  const [clubInput, setClubInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [qrOpen, setQrOpen] = useState(false);
  useEffect(() => { setP(user.profile); }, [user.profile]);

  const dirty = JSON.stringify(p) !== JSON.stringify(user.profile);
  const save = async (next = p) => {
    setSaving(true); setError('');
    try { await saveProfile(next); setSaved(true); setTimeout(() => setSaved(false), 1500); } catch (e) { setError(e.message || 'Could not save.'); } finally { setSaving(false); }
  };
  const setShow = (k, v) => { const next = { ...p, show: { ...p.show, [k]: v } }; setP(next); save(next); };
  const addClub = () => { const c = clubInput.trim(); if (!c) return; setP({ ...p, clubs: [...(p.clubs || []), c].slice(0, 10) }); setClubInput(''); };
  const publicParts = PARTS.filter(([k]) => p.show?.[k] === 'everyone').map(([, l]) => l.toLowerCase());

  return (
    <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground">Driver profile</h3>
        <button onClick={() => setQrOpen(true)} className="text-xs font-semibold text-primary flex items-center gap-1"><QrCode className="w-4 h-4" />QR & sticker</button>
      </div>

      <div className="space-y-2">
        <div className="text-[11px] text-muted-foreground">Social links (just your handle)</div>
        {Object.entries(SOCIAL_LINKS).map(([k, s]) => (
          <div key={k} className="flex items-center gap-2">
            <s.icon className="w-5 h-5 text-muted-foreground shrink-0" />
            <input value={p.socials?.[k] || ''} onChange={(e) => setP({ ...p, socials: { ...p.socials, [k]: e.target.value } })} placeholder={`${s.label} @handle`} className={field} autoCapitalize="none" autoCorrect="off" />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="text-[11px] text-muted-foreground flex items-center gap-1"><Users className="w-3.5 h-3.5" />Car clubs & crews</div>
        <div className="flex flex-wrap gap-1.5">
          {(p.clubs || []).map((c, i) => (
            <span key={`${c}-${i}`} className="text-xs bg-primary/10 text-primary rounded-full pl-2.5 pr-1 py-1 flex items-center gap-1">
              {c}<button onClick={() => setP({ ...p, clubs: p.clubs.filter((_, j) => j !== i) })} aria-label={`Remove ${c}`}><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={clubInput} onChange={(e) => setClubInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addClub()} placeholder="e.g. Louisiana Subaru Crew" className={field} />
          <button onClick={addClub} className="bg-secondary rounded-xl px-3 border border-border" aria-label="Add club"><Plus className="w-4 h-4 text-foreground" /></button>
        </div>
      </div>

      {(dirty || saving || saved) && (
        <button onClick={() => save()} disabled={saving || !dirty} className="w-full bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}{saved && !dirty ? 'Saved' : 'Save profile'}
        </button>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}

      <div>
        <div className="text-[11px] text-muted-foreground mb-2">Who can see each part</div>
        <div className="space-y-1.5">
          {PARTS.map(([k, label]) => (
            <div key={k} className="flex items-center gap-2">
              <span className="flex-1 text-sm text-foreground">{label}</span>
              <div className="flex bg-secondary rounded-lg p-0.5">
                {WHO.map(([w, wl]) => (
                  <button key={w} onClick={() => setShow(k, w)} className={`text-[11px] px-2 py-1 rounded-md ${(p.show?.[k] || 'friends') === w ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground'}`}>{wl}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">Your profile never shows where you are. Strangers who scan your QR only see parts set to Everyone{publicParts.length ? ` (${publicParts.join(', ')})` : ' (right now: just your name and picture)'}.</p>
      </div>

      <a href={`/u/${user.username}?as=public`} className="text-xs text-primary flex items-center gap-1"><ExternalLink className="w-3.5 h-3.5" />See your profile as others do</a>
      {qrOpen && <QrSheet username={user.username} name={user.displayName} onClose={() => setQrOpen(false)} />}
    </div>
  );
}

// Your QR code, plus a printable window sticker.
export function QrSheet({ username, name, onClose }) {
  const url = profileUrl(username);
  const [qr, setQr] = useState('');
  useEffect(() => { loadQR().then((QRCode) => QRCode.toDataURL(url, { margin: 1, width: 512, color: { dark: '#0b1020', light: '#ffffff' } })).then(setQr); }, [url]);

  const [stickerOpen, setStickerOpen] = useState(false);
  const sticker = async () => {
    // A 1200x1500 sticker: dark card, big QR, call to action.
    const c = document.createElement('canvas');
    c.width = 1200; c.height = 1500;
    const g = c.getContext('2d');
    g.fillStyle = '#0b1020'; g.fillRect(0, 0, 1200, 1500);
    const grad = g.createLinearGradient(0, 0, 1200, 0); grad.addColorStop(0, '#ff2d55'); grad.addColorStop(1, '#00bfff');
    g.fillStyle = grad; g.fillRect(0, 0, 1200, 18); g.fillRect(0, 1482, 1200, 18);
    g.fillStyle = '#ffffff'; g.textAlign = 'center';
    g.font = '800 92px system-ui, sans-serif'; g.fillText('SCAN MY BUILD', 600, 170);
    const QRCode = await loadQR();
    const code = await QRCode.toCanvas(document.createElement('canvas'), url, { margin: 2, width: 860, color: { dark: '#0b1020', light: '#ffffff' } });
    g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(150, 240, 900, 900, 40); g.fill();
    g.drawImage(code, 170, 260, 860, 860);
    g.font = '700 72px system-ui, sans-serif'; g.fillStyle = '#ffffff'; g.fillText(`@${username}`, 600, 1260);
    g.font = '500 44px system-ui, sans-serif'; g.fillStyle = '#9aa4b2'; g.fillText('Mods · socials · crew — on Kaido Maps', 600, 1340);
    const a = document.createElement('a');
    a.href = c.toDataURL('image/png'); a.download = `drivez-sticker-${username}.png`; a.click();
  };
  const share = async () => {
    try { await navigator.share({ title: `${name} on Kaido Maps`, url }); } catch { try { await navigator.clipboard.writeText(url); } catch { /* ignore */ } }
  };

  return createPortal(
    <div className="fixed inset-0 z-[1600] bg-black/70 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-md bg-card rounded-t-3xl border-t border-border p-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-foreground">Your QR code</h3>
          <button onClick={onClose} aria-label="Close"><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="bg-white rounded-2xl p-3 w-60 h-60 mx-auto flex items-center justify-center">
          {qr ? <img src={qr} alt="QR code to your profile" className="w-full h-full" /> : <Loader2 className="w-6 h-6 animate-spin text-black/40" />}
        </div>
        <p className="text-center text-xs text-muted-foreground mt-3 break-all">{url}</p>
        <div className="grid grid-cols-2 gap-2 mt-4">
          <button onClick={() => setStickerOpen(true)} className="bg-primary text-primary-foreground rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-2"><Download className="w-4 h-4" />Window sticker</button>
          <button onClick={share} className="bg-secondary text-foreground rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-2"><Share2 className="w-4 h-4" />Share link</button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-3 text-center">Design a window sticker: pick the size and style, then print it or save it.</p>
        {stickerOpen && <StickerModal username={username} url={url} onClose={() => setStickerOpen(false)} />}
      </div>
    </div>,
    document.body
  );
}
