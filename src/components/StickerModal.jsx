import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, Download, Share2, Loader2 } from 'lucide-react';
import { useApp } from '@/lib/AppContext';

const SIZES = [['3x4', '3 × 4 in', 3, 4], ['4x4', '4 × 4 in', 4, 4], ['5x7', '5 × 7 in', 5, 7]];
const STYLES = [['neon', 'Night neon'], ['theme', 'My theme'], ['clean', 'Clean white']];
const SOCIAL_TAG = { instagram: 'IG', x: '𝕏', tiktok: 'TT', youtube: 'YT', facebook: 'FB' };
const DPI = 300;

const cssColor = (v, fallback) => {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  return raw ? `hsl(${raw.split(/\s+/).join(', ')})` : fallback;
};

// Draws the sticker at print resolution (300 dpi).
async function drawSticker(c, { wIn, hIn, style, url, username, carName, socials, show }) {
  const QRCode = (await import('qrcode')).default;
  const W = Math.round(wIn * DPI), H = Math.round(hIn * DPI);
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const pal = style === 'clean'
    ? { bg: '#ffffff', fg: '#0b1020', sub: '#5b6474', a: '#ff2d55', b: '#00a3d9', qrDark: '#0b1020' }
    : style === 'theme'
      ? { bg: cssColor('--background', '#0b1020'), fg: cssColor('--foreground', '#fff'), sub: cssColor('--muted-foreground', '#9aa4b2'), a: cssColor('--primary', '#ff2d55'), b: cssColor('--accent', '#00bfff'), qrDark: '#0b1020' }
      : { bg: '#0b1020', fg: '#ffffff', sub: '#9aa4b2', a: '#ff2d55', b: '#00bfff', qrDark: '#0b1020' };
  const u = Math.min(W, H) / 100; // 1% of the short side
  g.fillStyle = pal.bg; g.fillRect(0, 0, W, H);
  // Neon frame
  const grad = g.createLinearGradient(0, 0, W, H); grad.addColorStop(0, pal.a); grad.addColorStop(1, pal.b);
  g.strokeStyle = grad; g.lineWidth = u * 2.2;
  if (style !== 'clean') { g.shadowColor = pal.a; g.shadowBlur = u * 4; }
  g.beginPath(); g.roundRect(u * 3, u * 3, W - u * 6, H - u * 6, u * 6); g.stroke();
  g.shadowBlur = 0;
  // Title
  g.textAlign = 'center'; g.fillStyle = pal.fg;
  g.font = `900 ${u * 9}px system-ui, sans-serif`;
  g.fillText('SCAN MY BUILD', W / 2, u * 17);
  // QR on a white tile
  const lines = [show.handle && `@${username}`, show.car && carName].filter(Boolean);
  const tags = show.socials ? Object.entries(socials || {}).filter(([, h]) => h).map(([k]) => SOCIAL_TAG[k] || k.toUpperCase()) : [];
  const footer = u * (lines.length * 9 + (tags.length ? 9 : 0) + 12);
  const qrSize = Math.min(W - u * 20, H - u * 25 - footer);
  const qx = (W - qrSize) / 2, qy = u * 23;
  g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(qx - u * 2, qy - u * 2, qrSize + u * 4, qrSize + u * 4, u * 4); g.fill();
  const qc = await QRCode.toCanvas(document.createElement('canvas'), url, { margin: 1, width: Math.round(qrSize), color: { dark: pal.qrDark, light: '#ffffff' } });
  g.drawImage(qc, qx, qy, qrSize, qrSize);
  // Text under the QR
  let y = qy + qrSize + u * 12;
  lines.forEach((t, i) => { g.fillStyle = i === 0 ? pal.fg : pal.sub; g.font = `${i === 0 ? 800 : 600} ${u * (i === 0 ? 7.5 : 5.5)}px system-ui, sans-serif`; g.fillText(t, W / 2, y); y += u * 8.5; });
  if (tags.length) { g.fillStyle = pal.b; g.font = `800 ${u * 5}px system-ui, sans-serif`; g.fillText(tags.join('  ·  '), W / 2, y); y += u * 8; }
  g.fillStyle = pal.sub; g.font = `600 ${u * 4}px system-ui, sans-serif`;
  g.fillText('KAIDO MAPS', W / 2, H - u * 7);
}

// Window sticker designer: pick a size and style, preview it, then print or save it.
export default function StickerModal({ username, url, onClose }) {
  const { activeVehicle, user } = useApp();
  const [size, setSize] = useState('3x4');
  const [style, setStyle] = useState('neon');
  const [show, setShow] = useState({ handle: true, car: true, socials: true });
  const [busy, setBusy] = useState(true);
  const canvas = useRef(null);
  const [, wIn, hIn] = SIZES.find((s) => s[0] === size).slice(1);
  const carName = activeVehicle ? `${activeVehicle.year || ''} ${activeVehicle.make} ${activeVehicle.model}`.trim() : '';

  useEffect(() => {
    let alive = true;
    setBusy(true);
    const c = document.createElement('canvas');
    drawSticker(c, { wIn, hIn, style, url, username, carName, socials: user?.profile?.socials, show }).then(() => {
      if (!alive || !canvas.current) return;
      const p = canvas.current; p.width = c.width; p.height = c.height; p.getContext('2d').drawImage(c, 0, 0);
      setBusy(false);
    });
    return () => { alive = false; };
  }, [size, style, show, url, username, carName]); // eslint-disable-line react-hooks/exhaustive-deps

  const png = () => canvas.current.toDataURL('image/png');
  const download = () => { const a = document.createElement('a'); a.href = png(); a.download = `kaido-sticker-${username}-${size}.png`; a.click(); };
  const print = () => {
    // A page with the sticker at its real size; the browser's print dialog does the rest.
    const w = window.open('', '_blank');
    if (!w) { download(); return; }
    w.document.write(`<!doctype html><title>Kaido Maps sticker</title><style>@page{margin:0.4in}body{margin:0;display:flex;justify-content:center}img{width:${wIn}in;height:${hIn}in}</style><img src="${png()}" onload="setTimeout(()=>{print()},250)">`);
    w.document.close();
  };
  const share = async () => {
    try {
      const blob = await (await fetch(png())).blob();
      const file = new File([blob], `kaido-sticker-${username}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'My Kaido Maps sticker' });
      else download();
    } catch { /* cancelled */ }
  };

  return createPortal(
    <div className="fixed inset-0 z-[1700] bg-black/70 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-md max-h-[92vh] overflow-y-auto bg-card rounded-t-3xl border-t border-border p-4 pb-[max(20px,env(safe-area-inset-bottom))] dz-pop-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-foreground">Window sticker</h3>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex justify-center bg-secondary/50 rounded-2xl p-3 relative">
          <canvas ref={canvas} className="rounded-xl shadow-2xl" style={{ height: 300, width: (300 * wIn) / hIn }} />
          {busy && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}
        </div>
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-3 gap-1.5">{SIZES.map(([k, l]) => <button key={k} onClick={() => setSize(k)} className={`text-xs py-2 rounded-lg border ${size === k ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border text-muted-foreground'}`}>{l}</button>)}</div>
          <div className="grid grid-cols-3 gap-1.5">{STYLES.map(([k, l]) => <button key={k} onClick={() => setStyle(k)} className={`text-xs py-2 rounded-lg border ${style === k ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border text-muted-foreground'}`}>{l}</button>)}</div>
          <div className="flex gap-1.5">
            {[['handle', '@handle'], ['car', 'My car'], ['socials', 'Socials']].map(([k, l]) => (
              <button key={k} onClick={() => setShow((s) => ({ ...s, [k]: !s[k] }))} className={`flex-1 text-xs py-2 rounded-lg border ${show[k] ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border text-muted-foreground'}`}>{show[k] ? '✓ ' : ''}{l}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3">
          <button onClick={print} disabled={busy} className="dz-go rounded-xl py-3 text-sm font-bold flex items-center justify-center gap-1.5"><Printer className="w-4 h-4" />Print</button>
          <button onClick={download} disabled={busy} className="bg-secondary text-foreground rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-1.5"><Download className="w-4 h-4" />Save</button>
          <button onClick={share} disabled={busy} className="bg-secondary text-foreground rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-1.5"><Share2 className="w-4 h-4" />Share</button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-3 text-center">Prints at its real size ({wIn} × {hIn} in, 300 dpi). Use clear vinyl or sticker paper and stick it inside a back side window.</p>
      </div>
    </div>,
    document.body
  );
}
