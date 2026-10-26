// Voice for Kaido Maps: speaking (phone voice or Gemini's natural voice), recording a
// question from the mic as WAV, and the co-driver narration settings.
import { useEffect, useState } from 'react';
import { api } from '@/api/base44Client';
import { speak } from '@/lib/nav';
import { dst, spd, distWord, isMetric } from '@/lib/units';

const KEY = 'dz-voice';
const DEFAULTS = { narrate: true, style: 'device', gemVoice: 'Puck', speedAudio: true };
export function getVoiceSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}
export function useVoiceSettings() {
  const [v, setV] = useState(getVoiceSettings);
  useEffect(() => { const on = () => setV(getVoiceSettings()); window.addEventListener('dz-voice', on); return () => window.removeEventListener('dz-voice', on); }, []);
  const set = (patch) => { const next = { ...getVoiceSettings(), ...patch }; try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ } window.dispatchEvent(new Event('dz-voice')); };
  return [v, set];
}

// Is Gemini set up on the server? (cached for the session)
let aiState = null;
export function aiEnabled() {
  if (!aiState) aiState = api.get('/ai/config').then((d) => !!d.enabled).catch(() => false);
  return aiState;
}
export function useAiEnabled() {
  const [on, setOn] = useState(false);
  useEffect(() => { let alive = true; aiEnabled().then((x) => alive && setOn(x)); return () => { alive = false; }; }, []);
  return on;
}

let current = null;

// Speed-linked "cockpit" audio for the Gemini voice: stopped = softer and warmer (high end rolled
// off, like a quiet cabin); at speed = louder with a presence lift so it cuts through road noise.
let actx = null;
function cockpit(audio) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    actx = actx || new Ctx();
    if (actx.state === 'suspended') actx.resume();
    const src = actx.createMediaElementSource(audio);
    const low = actx.createBiquadFilter(); low.type = 'lowpass';
    const pres = actx.createBiquadFilter(); pres.type = 'peaking'; pres.frequency.value = 2800; pres.Q.value = 0.9;
    const gain = actx.createGain();
    src.connect(low); low.connect(pres); pres.connect(gain); gain.connect(actx.destination);
    const apply = () => {
      const k = Math.min(1, (window.__dzSpeed || 0) / 70);
      const t = actx.currentTime;
      low.frequency.setTargetAtTime(4500 + 11500 * k, t, 0.3);
      pres.gain.setTargetAtTime(5 * k, t, 0.3);
      gain.gain.setTargetAtTime(0.75 + 0.5 * k, t, 0.3);
    };
    apply();
    const id = setInterval(apply, 500);
    audio.addEventListener('ended', () => clearInterval(id));
    audio.addEventListener('pause', () => clearInterval(id));
  } catch { /* plays normally */ }
}
export function stopSpeaking() {
  try { current?.pause(); } catch { /* ignore */ }
  current = null;
  try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
}

// Say something. Uses Gemini's voice when picked (and set up), else the phone's voice.
export async function say(text, { natural } = {}) {
  if (!text) return;
  const v = getVoiceSettings();
  const useGemini = (natural ?? v.style === 'gemini') && (await aiEnabled());
  stopSpeaking();
  if (useGemini) {
    try {
      const res = await fetch('/api/tts', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, voice: v.gemVoice }) });
      if (!res.ok) throw new Error('tts');
      const url = URL.createObjectURL(await res.blob());
      const a = new Audio(url);
      current = a;
      a.onended = () => URL.revokeObjectURL(url);
      if (v.speedAudio) cockpit(a);
      await a.play();
      return;
    } catch { /* fall back to the phone voice */ }
  }
  speak(text);
}

// Record from the mic as 16 kHz mono WAV (works in Chrome, Safari and the Android app).
// Returns { stop(): Promise<{ mime, data }>, cancel(), level(): 0..1 }.
export async function recordWav(maxSeconds = 12) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const chunks = [];
  let lvl = 0, done = false;
  proc.onaudioprocess = (e) => {
    if (done) return;
    const d = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(d));
    let sum = 0; for (let i = 0; i < d.length; i += 16) sum += d[i] * d[i];
    lvl = Math.min(1, Math.sqrt(sum / (d.length / 16)) * 4);
  };
  src.connect(proc); proc.connect(ctx.destination);
  const close = () => { done = true; try { proc.disconnect(); src.disconnect(); } catch { /* ignore */ } stream.getTracks().forEach((t) => t.stop()); ctx.close().catch(() => {}); };
  let timer;
  const finished = new Promise((resolve) => { timer = setTimeout(() => resolve(), maxSeconds * 1000); });
  const stop = async () => {
    clearTimeout(timer);
    const rate = ctx.sampleRate;
    close();
    // Downsample to 16 kHz, 16-bit.
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const all = new Float32Array(total); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
    const ratio = rate / 16000, n = Math.floor(total / ratio);
    const pcm = new DataView(new ArrayBuffer(44 + n * 2));
    const w = (off, s) => { for (let i = 0; i < s.length; i++) pcm.setUint8(off + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); pcm.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); pcm.setUint32(16, 16, true); pcm.setUint16(20, 1, true); pcm.setUint16(22, 1, true);
    pcm.setUint32(24, 16000, true); pcm.setUint32(28, 32000, true); pcm.setUint16(32, 2, true); pcm.setUint16(34, 16, true); w(36, 'data'); pcm.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, all[Math.floor(i * ratio)])); pcm.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
    const bytes = new Uint8Array(pcm.buffer);
    let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return { mime: 'audio/wav', data: btoa(bin), seconds: n / 16000 };
  };
  return { stop, cancel: () => { clearTimeout(timer); close(); }, level: () => lvl, finished };
}

// A spoken recap of a drive: Gemini when set up, otherwise a simple summary.
export function plainRecap(t) {
  const mins = Math.max(1, Math.round((t.minutes || 0)));
  const bits = [`${dst(t.miles)} ${distWord()} in ${mins} minute${mins === 1 ? '' : 's'}`];
  if (t.avgMph) bits.push(`averaging ${spd(t.avgMph)}${isMetric() ? ' kilometers an hour' : ''}`);
  let s = `${t.justSaved ? 'Drive saved. ' : ''}${bits.join(', ')}.`;
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (t.mode === 'toge' && t.corners) s += ` ${t.corners} corners on the mountain.`;
  if (t.smoothness >= 90) s += ' Smooth driving, nice work.';
  else if (t.hardBrakes > 2) s += ` ${t.hardBrakes} hard brakes, easy on the pedal next time.`;
  return s;
}
export async function recapText(t, { ai = true } = {}) {
  if (ai && (await aiEnabled())) {
    try { return (await api.post('/narrate', { trip: t })).text; } catch { /* fall back */ }
  }
  return plainRecap(t);
}

// The facts about a saved drive that narration uses.
export function tripFacts(t, car = '') {
  return {
    title: t.title || '', when: t.start_time ? new Date(t.start_time).toLocaleString([], { weekday: 'long', hour: 'numeric', minute: '2-digit' }) : '',
    from: t.start_location || '', to: t.end_location || '',
    miles: t.distance || 0, minutes: (t.duration || 0) / 60, topMph: t.top_speed || 0, avgMph: t.avg_speed || 0,
    smoothness: t.smoothness ?? null, hardBrakes: t.hard_brakes ?? null, maxG: t.max_g ?? null, zeroToSixty: t.best_0_60 ?? null,
    mode: t.mode || null, corners: t.corners ?? null, convoy: !!t.convoy, car,
    units: isMetric() ? 'metric (say kilometers and km/h; 1 mile = 1.609 km)' : 'miles and mph',
  };
}
