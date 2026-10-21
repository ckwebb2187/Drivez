import { useState } from 'react';
import { Check, Loader2, Send, Link2 } from 'lucide-react';
import { useApp } from '@/lib/AppContext';
import { api, base44 } from '@/api/base44Client';
import { DiscordIcon, useAuthConfig } from '@/components/SocialButtons';

export default function DiscordSettings() {
  const { user, updateUser } = useApp();
  const cfg = useAuthConfig();
  const [webhook, setWebhook] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const run = async (key, fn, ok) => {
    setBusy(key); setMsg(''); setErr('');
    try { await fn(); if (ok) setMsg(ok); } catch (e) { setErr(e.message); }
    setBusy('');
  };

  const discordLogin = cfg?.providers?.includes('discord');

  return (
    <div>
      <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
        <DiscordIcon className="w-4 h-4 text-[#5865F2]" /> Discord
      </h3>
      <div className="bg-card rounded-2xl p-4 border border-border space-y-4">
        {discordLogin && (
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-foreground">Discord account</div>
              <div className="text-[11px] text-muted-foreground">{user.discordConnected ? 'Connected — you can log in with Discord' : 'Link it to log in with Discord'}</div>
            </div>
            {user.discordConnected ? (
              <span className="text-xs text-accent flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Linked</span>
            ) : (
              <button onClick={() => base44.auth.loginWithProvider('discord', '/profile')} className="bg-[#5865F2] text-white rounded-xl px-3 py-2 text-xs font-bold flex items-center gap-1">
                <Link2 className="w-3.5 h-3.5" /> Connect
              </button>
            )}
          </div>
        )}

        <div>
          <div className="text-sm font-semibold text-foreground">Post drives to a Discord channel</div>
          <p className="text-[11px] text-muted-foreground mt-0.5 mb-2">
            {user.discordWebhookSet
              ? 'A channel is connected. Paste a new link to change it.'
              : 'In Discord: channel settings → Integrations → Webhooks → New Webhook → Copy Webhook URL, then paste it here.'}
          </p>
          <div className="flex gap-2">
            <input
              value={webhook}
              onChange={(e) => setWebhook(e.target.value)}
              placeholder={user.discordWebhookSet ? '•••• connected ••••' : 'https://discord.com/api/webhooks/…'}
              className="flex-1 min-w-0 bg-secondary rounded-xl px-3 py-2.5 text-foreground text-xs border border-border focus:border-primary outline-none"
            />
            <button
              disabled={!webhook || busy}
              onClick={() => run('save', async () => { await updateUser({ discordWebhook: webhook }); setWebhook(''); }, 'Channel connected. Try "Send test".')}
              className="bg-primary text-primary-foreground rounded-xl px-3 text-xs font-bold disabled:opacity-40"
            >
              {busy === 'save' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
            </button>
          </div>
        </div>

        {user.discordWebhookSet && (
          <>
            <button
              onClick={() => run('auto', () => updateUser({ discordAuto: !user.discordAuto }))}
              className="w-full flex items-center justify-between"
            >
              <div className="text-left">
                <div className="text-sm font-semibold text-foreground">Auto-post every drive</div>
                <div className="text-[11px] text-muted-foreground">Or share drives one by one from the trip page</div>
              </div>
              <div className={`w-11 h-6 rounded-full transition-colors relative ${user.discordAuto ? 'bg-primary' : 'bg-muted-foreground'}`}>
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${user.discordAuto ? 'left-[22px]' : 'left-0.5'}`} />
              </div>
            </button>
            <div className="flex gap-2">
              <button onClick={() => run('test', () => api.post('/discord/test'), 'Test message sent — check your Discord channel.')} className="flex-1 bg-secondary text-foreground rounded-xl py-2.5 text-xs font-bold flex items-center justify-center gap-1.5">
                {busy === 'test' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Send test
              </button>
              <button onClick={() => run('remove', () => updateUser({ discordWebhook: '', discordAuto: false }), 'Channel disconnected.')} className="bg-secondary text-muted-foreground rounded-xl py-2.5 px-3 text-xs font-medium">
                Disconnect
              </button>
            </div>
          </>
        )}
        {msg && <p className="text-xs text-accent">{msg}</p>}
        {err && <p className="text-xs text-destructive">{err}</p>}
      </div>
    </div>
  );
}
