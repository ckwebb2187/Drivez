/* ---------- the TV home screen ----------
   Shown by the Home Base launcher on the TV: behind the row of apps (?mode=home) and as the screensaver (?mode=saver).
   Everything comes from the bridge's read-only tv.json, which Home Base fills in whenever something changes:
   what's up next, the weather, tonight's dinner, and the colors or holiday theme on the wall. No sign-in needed. */
const MODE = /mode=saver/.test(location.search) ? 'saver' : 'home';
document.body.classList.add(MODE);
const D = { data: null, ht: null, look: '', timer: 0 };
const HB_APP = window.HomeBaseTVApp || null;
try { const c = localStorage.getItem('hbtv.data'); if (c) D.data = JSON.parse(c); } catch (e) {}

function relTime(ms) {
  const m = Math.round(ms / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `in ${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r >= 10 && h < 3 ? `in ${h} hr ${r} min` : `in ${Math.round(m / 60)} hr`;
}
const hm = d => { let h = d.getHours(); const m = d.getMinutes(), ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return m ? `${h}:${pad(m)} ${ap}` : `${h} ${ap}`; };
/* "4:30 PM · in 2 hr", "Now · until 5:30 PM", "Tomorrow · 9 AM", "Wed · All day" */
function whenText(e, now) {
  const t0 = today(), t1 = addDays(t0, 1);
  if (e.ad) {
    const d = parseYmd(e.s);
    return +d <= +t0 ? 'Today · All day' : +d === +t1 ? 'Tomorrow · All day' : `${DOW[d.getDay()]} · All day`;
  }
  const s = new Date(e.s), en = e.e ? new Date(e.e) : new Date(+s + 36e5);
  if (s <= now) return `Now · until ${hm(en)}`;
  const day = sod(s);
  if (+day === +t0) return `${hm(s)} · ${relTime(s - now)}`;
  if (+day === +t1) return `Tomorrow · ${hm(s)}`;
  return `${DOWL[s.getDay()]} · ${hm(s)}`;
}

function applyLook(data) {
  const lk = (data && data.look) || {}, key = JSON.stringify(lk);
  if (key === D.look) return; D.look = key;
  const ht = lk.th ? holThemeById(lk.th) : null; D.ht = ht;
  /* The music picks its style from the holiday theme showing (spooky music box for Halloween, sleigh bells, ...). */
  S.settings.holidayMode = ht ? 'pick' : 'off'; S.settings.holidayTheme = ht ? ht.id : '';
  const main = ht ? ht.main : isHex(lk.main) ? lk.main : '#1D5B4A', hi = ht ? ht.hi : isHex(lk.hi) ? lk.hi : '#C98A12';
  const tk = deriveTokens(main, hi, true), root = document.documentElement.style;
  const bg = ht ? ht.bgDark : tk['--bg'];
  const A = hexRgb(tk['--accent']), G = hexRgb(tk['--gold']), B = hexRgb(bg);
  root.setProperty('--bg', bg);
  root.setProperty('--bg2', '#' + lerpC(B, A, 0.12).map(v => Math.round(v).toString(16).padStart(2, '0')).join(''));
  root.setProperty('--ink', tk['--ink']); root.setProperty('--ink2', tk['--ink-2']);
  root.setProperty('--accent', tk['--accent']); root.setProperty('--gold', tk['--gold']);
  root.setProperty('--glowA', rgba(A, 0.24)); root.setProperty('--glowG', rgba(G, 0.14));
  root.setProperty('--haloA', rgba(A, 0.45)); root.setProperty('--haloG', rgba(G, 0.38));
  /* The app row's focus glow (drawn by the app, not the page) uses the same colors. */
  try { if (HB_APP && typeof HB_APP.look === 'function') HB_APP.look(tk['--accent'], tk['--gold']); } catch (e) {}
  root.setProperty('--card', rgba(lerpC(B, [255, 255, 255], 0.06), 0.72)); root.setProperty('--line', rgba([255, 255, 255], 0.08));
  if (ht) {
    loadHolFonts([ht.font]);
    root.setProperty('--f-holiday', holFamily(ht.font)); root.setProperty('--f-holiday-w', String(HOL_FONTS[ht.font][2]));
    root.setProperty('--pat', holPattern(ht, true));
  } else { root.setProperty('--f-holiday', 'var(--f-display)'); root.setProperty('--f-holiday-w', '700'); root.removeProperty('--pat'); }
  makeMotes(ht && ht.fx ? ht.fx : [tk['--gold'], tk['--accent']]);
  renderLane();
}

/* A few soft glowing dots drifting up, in the theme's colors (CSS only, so it stays light on the TV box). */
function makeMotes(cols) {
  const n = MODE === 'saver' ? 16 : 9, box = $('#motes'); let h = '';
  for (let i = 0; i < n; i++) {
    const r = holHash('m' + i), x = r % 100, size = 0.8 + (r >> 4) % 18 / 10, du = 26 + (r >> 8) % 30, dl = -((Date.now() / 1000 + (r % 997)) % du);
    h += `<i style="left:${x}vw;width:${size}vh;height:${size}vh;--c:${cols[i % cols.length]};animation-duration:${du}s,${3 + (r >> 6) % 4}s;animation-delay:${dl.toFixed(1)}s,${(dl / 3).toFixed(1)}s"></i>`;
  }
  box.innerHTML = h;
}

/* The theme's characters: one walks (or drives, hops, flies) back and forth along the top of the app row; in the
   screensaver they take turns crossing the screen. */
function renderLane() {
  const lane = $('#lane'), ht = D.ht;
  if (!ht) { lane.innerHTML = ''; return; }   /* with reduced motion they stand still (see the CSS) */
  const hs = heroesFor(ht); if (!hs.length) { lane.innerHTML = ''; return; }
  const day = Math.floor(Date.now() / 864e5), name = hs[day % hs.length], H = HEROES[name];
  const per = HERO_PACE[H.go] || 0, pd = per ? (MODE === 'saver' ? 46 : 38) : 0, pdl = pd ? -((Date.now() / 1000) % pd) : 0;
  lane.innerHTML = `<div class="hero-pace go-${H.go}${pd ? '' : ' stay'}" style="aspect-ratio:${heroAR(name)};--pd:${pd}s;--pdl:${pdl.toFixed(1)}s"><div class="hv-turn">${heroSvg(ht, name)}</div></div>`;
}
let visitN = 0;
function visit() {
  const ht = D.ht; if (MODE !== 'saver' || !ht || decoStill() || document.querySelector('.hero-visit')) return;
  const movers = heroesFor(ht).filter(n => HEROES[n].go !== 'stay'); if (!movers.length) return;
  const name = movers[visitN % movers.length], H = HEROES[name], rtl = visitN++ % 2 === 1;
  const h = Math.round(innerHeight * .2), w = Math.round(h * H.vb[0] / H.vb[1]);
  const el = document.createElement('div');
  el.className = `hero-visit go-${H.go}${rtl ? ' rtl' : ''}`;
  el.style.cssText = `bottom:${Math.round(innerHeight * (H.go === 'fly' ? .05 : .025))}px;width:${w}px;height:${h}px;--vd:${((innerWidth + w) / (HERO_SPEED[H.go] * 1.4)).toFixed(1)}s`;
  el.innerHTML = `<div class="hv-turn">${heroSvg(ht, name)}</div>`;
  el.addEventListener('animationend', e => { if (e.target === el) el.remove(); });
  document.body.appendChild(el);
}

function renderClock() {
  const now = new Date(); let h = now.getHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  $('#clock').innerHTML = `${h}:${pad(now.getMinutes())}<span class="ap">${ap}</span>`;
  $('#date').textContent = `${DOWL[now.getDay()]}, ${MON[now.getMonth()]} ${now.getDate()}`;
}
function render() {
  renderClock();
  const d = D.data, now = new Date();
  /* Weather */
  const w = d && d.wx;
  $('#wx').innerHTML = w ? `${wxIcon(w.ic, w.night)}<span>${w.now != null ? `<b>${w.now}°</b>` : ''}<span class="wx-sub">${esc(w.ph || w.dph || '')}${w.hi != null ? `${w.ph || w.dph ? ' · ' : ''}High ${w.hi}° · Low ${w.lo}°` : ''}${w.rain >= 30 ? ` · ${w.rain}% rain` : ''}</span></span>` : '';
  /* Up next */
  const up = (d && d.up || []).filter(e => { const end = e.ad ? addDays(parseYmd(e.s), 1) : new Date(e.e || +new Date(e.s) + 36e5); return end > now; });
  const max = MODE === 'saver' ? 5 : 4;
  let h = '';
  if (!d || !d.ok) h = `<p class="none">Open Home Base once and what's coming up will show here.</p>`;
  else if (!up.length) h = `<p class="none">Nothing else on the calendar for the next few days.</p>`;
  else h = up.slice(0, max).map((e, i) => `<div class="ev${i ? '' : ' first'}${isNow(e, now) ? ' now' : ''}" style="--c:${esc(e.c || 'var(--accent)')}"><i></i><div><div class="when">${esc(whenText(e, now))}</div><div class="what">${esc(e.t)}</div></div></div>`).join('');
  $('#up').innerHTML = h;
  const nx = up[0];
  $('#next').innerHTML = nx ? `<div class="when">${esc(whenText(nx, now))}</div><div class="what">${esc(nx.t)}</div>` : '';
  $('#next').style.setProperty('--c', nx && nx.c ? nx.c : 'var(--accent)');
  syncPhotos();
  /* Tonight's dinner and chores still to do */
  const late = now.getHours() >= 20;
  const dinner = d && (late ? d.dinnerTomorrow : d.dinner);
  $('#dinner').innerHTML = dinner ? `<span class="lbl">${late ? 'Tomorrow night' : 'Tonight'}</span><span class="dn">${esc(dinner)}</span>` : '';
  const left = (d && d.chores || []).filter(c => c.left && c.left.length);
  $('#chores').innerHTML = d && d.chores && d.chores.length ? `<span class="lbl">Chores</span><span>${left.length ? left.map(c => `${esc(c.who)} <b>${c.left.length} left</b>`).join(' · ') : 'All done today ★'}</span>` : '';
  /* On a busy day, drop the last calendar items until dinner and chores fit above the app row. */
  const card = $('.right'), evs = () => $('#up').querySelectorAll('.ev');
  while (MODE === 'home' && card.scrollHeight > card.clientHeight + 2 && evs().length > 1) evs()[evs().length - 1].remove();
}

function isNow(e, now) { if (e.ad) return false; const s = new Date(e.s); return s <= now; }

/* ---------- screensaver slideshow ----------
   In the screensaver the right side shows the wall's screensaver photos (Home Base sends small copies to the bridge;
   tv.json lists them and p/ID serves each one). With no photos yet, Up next stays there instead. */
const PH = { ids: [], order: [], i: 0, timer: 0, cur: null, on: false };
const PHOTO_MS = 15000;
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function syncPhotos() {
  const ids = MODE === 'saver' && D.data && Array.isArray(D.data.photos) ? D.data.photos.filter(x => /^[A-Za-z0-9_-]+$/.test(x)) : [];
  if (ids.join() === PH.ids.join()) return;
  PH.ids = ids; PH.order = shuffle(ids); PH.i = 0;
  if (!ids.length) { PH.on = false; clearTimeout(PH.timer); document.body.classList.remove('photos'); $('#photo').innerHTML = ''; return; }
  if (!PH.on) { PH.on = true; nextPhoto(); }
}
function nextPhoto() {
  clearTimeout(PH.timer);
  if (!PH.ids.length) return;
  if (PH.i >= PH.order.length) { PH.order = shuffle(PH.ids); PH.i = 0; }
  const id = PH.order[PH.i++], src = DEMO ? demoPhoto(id) : `p/${encodeURIComponent(id)}`;
  const img = new Image();
  img.onload = () => {
    const box = $('#photo'), el = document.createElement('div');
    el.className = 'ph';
    el.innerHTML = `<div class="bk"></div>`;
    el.firstChild.style.backgroundImage = `url("${src}")`;
    img.alt = ''; el.appendChild(img); box.appendChild(el);
    document.body.classList.add('photos');
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
    const old = PH.cur; PH.cur = el;
    if (old) { old.classList.remove('show'); setTimeout(() => old.remove(), 2200); }
    PH.timer = setTimeout(nextPhoto, PHOTO_MS);
  };
  /* A photo that won't load is skipped (it may have just been removed on the wall). */
  img.onerror = () => { PH.timer = setTimeout(nextPhoto, PH.cur ? 2000 : 500); };
  img.src = src;
}
/* Sample pictures for the demo code: soft gradients, so the layout can be checked without real photos. */
function demoPhoto(id) {
  const h = holHash(id) % 360, w = 1280, ht = id.length % 2 ? 960 : 1600;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${ht}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h},70%,55%)"/><stop offset="1" stop-color="hsl(${(h + 60) % 360},70%,30%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${w * .7}" cy="${ht * .3}" r="${ht * .12}" fill="rgba(255,255,255,.55)"/></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

/* "demo" as the code shows made-up sample data, to preview the screen before connecting. */
const DEMO = /\/w\/demo\//.test(location.href);
function demoData() {
  const t = today(), at = (d, h, m) => { const x = addDays(t, d); x.setHours(h, m || 0, 0, 0); return x.toISOString(); };
  return { ok: true, dinner: 'Pizza night', dinnerTomorrow: 'Tacos', chores: [{ who: 'Liam', total: 3, left: ['Feed the dog', 'Trash'] }, { who: 'Cass', total: 1, left: [] }],
    up: [{ t: 'Soccer practice', s: at(0, 18, 30), e: at(0, 19, 30), ad: false, c: '#2E9B6A' }, { t: 'Work', s: at(1, 9), e: at(1, 17), ad: false, c: '#3F7FD9' },
      { t: 'Grocery run', s: at(1, 18), e: at(1, 19), ad: false, c: '#C98A12' }, { t: 'Pumpkin carving', s: ymd(addDays(t, 2)), e: '', ad: true, c: '#E8913A' }],
    wx: { now: 72, ph: 'Mostly sunny', ic: 2, night: false, hi: 78, lo: 60, rain: 10 }, look: { th: 'moonlitwoods' }, photos: ['beach', 'porch', 'pumpkins', 'park'] };
}
async function load() {
  if (DEMO) { D.data = demoData(); applyLook(D.data); render(); return; }
  try {
    const r = await fetch('tv.json', { cache: 'no-store' });
    if (r.ok) { D.data = await r.json(); try { localStorage.setItem('hbtv.data', JSON.stringify(D.data)); } catch (e) {} }
  } catch (e) {}
  applyLook(D.data); render();
}
window.hbRefresh = () => { load(); renderLane(); };

/* Keeps the screensaver from sitting in one spot all night. */
function drift() {
  if (MODE !== 'saver') return;
  const r = Math.random, w = $('#wrap');
  w.style.transform = `translate(${(r() * 4 - 2).toFixed(2)}vw, ${(r() * 4 - 2).toFixed(2)}vh)`;
}

applyLook(D.data); render();
load();
setInterval(load, 20000);   // picks up a new theme or calendar change within about 20 seconds
(function tickClock() { renderClock(); setTimeout(tickClock, 60000 - Date.now() % 60000 + 50); })();
setInterval(render, 30000);
/* Very quiet ambient pads on the home screen only (not the screensaver): slow, warm chords with no melody, each one
   fading into the next. Made with the wall's Web Audio pieces (nothing to download). The app stops it whenever
   another app or the screensaver opens. */
const AMB = { on: false, timer: 0, i: 0, next: 0, vol: 0.22, keep: false };
const AMB_CHORDS = [[48, 55, 59, 64], [45, 52, 55, 60], [41, 48, 52, 57], [43, 50, 53, 62]];   /* Cmaj7, Am7, Fmaj7, G sus */
function ambVoice(f, t, dur, vol) {
  const c = MU.ctx, end = t + dur + 6, lp = c.createBiquadFilter(), g = c.createGain();
  lp.type = 'lowpass'; lp.frequency.value = 620; lp.Q.value = 0.3;
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 4); g.gain.setValueAtTime(vol, t + dur);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 5.5);
  [[ 'sine', 0 ], [ 'triangle', -6 ], [ 'triangle', 6 ]].forEach(([type, det]) => { const o = muOsc(type, f, t, end); o.detune.value = det; o.connect(lp); });
  lp.connect(g); muOut(g, 0.8);
}
function ambTick() {
  const c = MU.ctx; if (!AMB.on || !c || c.state !== 'running') return;
  if (AMB.next < c.currentTime) AMB.next = c.currentTime + 0.2;
  /* Scheduled well ahead: behind the screensaver the page is hidden and its timers can slow to once a minute. */
  while (AMB.next < c.currentTime + 75) {
    const ch = AMB_CHORDS[AMB.i++ % AMB_CHORDS.length];
    ch.forEach((m, n) => ambVoice(mtof(m), AMB.next + n * 0.35, 9, n ? 0.012 : 0.016));
    AMB.next += 10;
  }
}
function ambStart() {
  if (MODE !== 'home' || document.hidden || !muInit()) return;
  const g = MU.master.gain, now = MU.ctx.currentTime;
  if (!AMB.on) { AMB.on = true; clearInterval(AMB.timer); AMB.timer = setInterval(ambTick, 500); }
  const go = () => { g.cancelScheduledValues(MU.ctx.currentTime); g.setValueAtTime(Math.max(0.0001, g.value), MU.ctx.currentTime); g.linearRampToValueAtTime(AMB.vol, MU.ctx.currentTime + 3); ambTick(); };
  if (MU.ctx.state !== 'running') MU.ctx.resume().then(go, () => {}); else go();
}
function ambStop() {
  if (!AMB.on || !MU.ctx) return; AMB.on = false; clearInterval(AMB.timer);
  const g = MU.master.gain, now = MU.ctx.currentTime; g.cancelScheduledValues(now); g.setValueAtTime(Math.max(0.0001, g.value), now); g.linearRampToValueAtTime(0.0001, now + 1.5);
  setTimeout(() => { if (!AMB.on && MU.ctx) MU.ctx.suspend().catch(() => {}); }, 1800);
}
/* The home screen's music is now recorded zen music played by the app itself (see Zen.java); these pads stay off. */
/* The app calls hbMusic(true) when home shows, 'keep' when the screensaver covers it (the music plays on), false otherwise. */
window.hbMusic = on => {
  AMB.keep = on === 'keep'; clearTimeout(AMB.sleepT);
  /* The screensaver lets the box go to sleep after two hours, so the music goes quiet then too. */
  if (on === 'keep') { AMB.sleepT = setTimeout(ambStop, 2 * 3600e3); return; }
  if (on) ambStart(); else ambStop();
};
if (MODE === 'saver') { setInterval(drift, 90000); setInterval(visit, 40000); setTimeout(visit, 8000); }
document.addEventListener('visibilitychange', () => { if (!document.hidden) window.hbRefresh(); });
requestAnimationFrame(() => { document.body.classList.add('ready'); try { HB_APP && HB_APP.ready(); } catch (e) {} });
