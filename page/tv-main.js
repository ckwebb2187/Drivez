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
  const main = ht ? ht.main : isHex(lk.main) ? lk.main : '#1D5B4A', hi = ht ? ht.hi : isHex(lk.hi) ? lk.hi : '#C98A12';
  const tk = deriveTokens(main, hi, true), root = document.documentElement.style;
  const bg = ht ? ht.bgDark : tk['--bg'];
  const A = hexRgb(tk['--accent']), G = hexRgb(tk['--gold']), B = hexRgb(bg);
  root.setProperty('--bg', bg);
  root.setProperty('--bg2', '#' + lerpC(B, A, 0.12).map(v => Math.round(v).toString(16).padStart(2, '0')).join(''));
  root.setProperty('--ink', tk['--ink']); root.setProperty('--ink2', tk['--ink-2']);
  root.setProperty('--accent', tk['--accent']); root.setProperty('--gold', tk['--gold']);
  root.setProperty('--glowA', rgba(A, 0.24)); root.setProperty('--glowG', rgba(G, 0.14));
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
  if (!ht || decoStill()) { lane.innerHTML = ''; return; }
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
  else h = up.slice(0, max).map((e, i) => `<div class="ev${i ? '' : ' first'}" style="--c:${esc(e.c || 'var(--accent)')}"><i></i><div><div class="when">${esc(whenText(e, now))}</div><div class="what">${esc(e.t)}</div></div></div>`).join('');
  $('#up').innerHTML = h;
  /* Tonight's dinner and chores still to do */
  const late = now.getHours() >= 20;
  const dinner = d && (late ? d.dinnerTomorrow : d.dinner);
  $('#dinner').innerHTML = dinner ? `<span class="lbl">${late ? 'Tomorrow night' : 'Tonight'}</span><span class="dn">${esc(dinner)}</span>` : '';
  const left = (d && d.chores || []).filter(c => c.left && c.left.length);
  $('#chores').innerHTML = d && d.chores && d.chores.length ? `<span class="lbl">Chores</span><span>${left.length ? left.map(c => `${esc(c.who)} <b>${c.left.length} left</b>`).join(' · ') : 'All done today ★'}</span>` : '';
}

/* "demo" as the code shows made-up sample data, to preview the screen before connecting. */
const DEMO = /\/w\/demo\//.test(location.href);
function demoData() {
  const t = today(), at = (d, h, m) => { const x = addDays(t, d); x.setHours(h, m || 0, 0, 0); return x.toISOString(); };
  return { ok: true, dinner: 'Pizza night', dinnerTomorrow: 'Tacos', chores: [{ who: 'Liam', total: 3, left: ['Feed the dog', 'Trash'] }, { who: 'Cass', total: 1, left: [] }],
    up: [{ t: 'Soccer practice', s: at(0, 18, 30), e: at(0, 19, 30), ad: false, c: '#2E9B6A' }, { t: 'Work', s: at(1, 9), e: at(1, 17), ad: false, c: '#3F7FD9' },
      { t: 'Grocery run', s: at(1, 18), e: at(1, 19), ad: false, c: '#C98A12' }, { t: 'Pumpkin carving', s: ymd(addDays(t, 2)), e: '', ad: true, c: '#E8913A' }],
    wx: { now: 72, ph: 'Mostly sunny', ic: 2, night: false, hi: 78, lo: 60, rain: 10 }, look: { th: 'moonlitwoods' } };
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
setInterval(load, 60000);
(function tickClock() { renderClock(); setTimeout(tickClock, 60000 - Date.now() % 60000 + 50); })();
setInterval(render, 30000);
if (MODE === 'saver') { setInterval(drift, 90000); setInterval(visit, 40000); setTimeout(visit, 8000); }
document.addEventListener('visibilitychange', () => { if (!document.hidden) window.hbRefresh(); });
requestAnimationFrame(() => { document.body.classList.add('ready'); try { HB_APP && HB_APP.ready(); } catch (e) {} });
