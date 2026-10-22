// Badges earned from your drives. Each has tiers (bronze, silver, gold, neon);
// the value is computed from your saved trips and garage.

const TIERS = ['Bronze', 'Silver', 'Gold', 'Neon'];
export const TIER_COLORS = ['#c27c4a', '#c9ced6', '#e8b923', '#ff4fd8'];

const hourOf = (t) => new Date(t.start_time).getHours();
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

function longestStreak(trips) {
  const days = [...new Set(trips.map((t) => dayKey(new Date(t.start_time))))]
    .map((k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m, d).getTime(); })
    .sort((a, b) => a - b);
  let best = 0, run = 0, prev = null;
  for (const d of days) {
    run = prev != null && Math.round((d - prev) / 86400000) === 1 ? run + 1 : 1;
    best = Math.max(best, run); prev = d;
  }
  return best;
}
const cityOf = (loc) => String(loc || '').split(',').slice(-2, -1)[0]?.trim() || String(loc || '').split(',')[0]?.trim() || '';

export const BADGES = [
  { id: 'miles', icon: '🛣️', name: 'Road Warrior', what: 'Miles driven', tiers: [100, 1000, 5000, 10000], value: (t) => Math.round(t.reduce((s, x) => s + (x.distance || 0), 0)) },
  { id: 'drives', icon: '🚗', name: 'Daily Driver', what: 'Drives logged', tiers: [10, 50, 200, 500], value: (t) => t.length },
  { id: 'night', icon: '🌙', name: 'Night Owl', what: 'Drives between 10 pm and 4 am', tiers: [1, 10, 50, 150], value: (t) => t.filter((x) => { const h = hourOf(x); return h >= 22 || h < 4; }).length },
  { id: 'dawn', icon: '🌅', name: 'Dawn Patrol', what: 'Drives between 5 and 7 am', tiers: [1, 10, 30, 100], value: (t) => t.filter((x) => { const h = hourOf(x); return h >= 5 && h < 7; }).length },
  { id: 'streak', icon: '🔥', name: 'On a Roll', what: 'Days in a row with a drive', tiers: [3, 7, 14, 30], value: longestStreak },
  { id: 'long', icon: '🧭', name: 'Long Haul', what: 'Longest single drive (mi)', tiers: [50, 150, 300, 600], value: (t) => Math.round(Math.max(0, ...t.map((x) => x.distance || 0))) },
  { id: 'smooth', icon: '🧈', name: 'Butter Smooth', what: 'Drives scoring 90+ smoothness', tiers: [3, 15, 50, 150], value: (t) => t.filter((x) => (x.smoothness || 0) >= 90).length },
  { id: 'weekend', icon: '🏁', name: 'Weekend Warrior', what: 'Saturday and Sunday drives', tiers: [5, 25, 75, 200], value: (t) => t.filter((x) => [0, 6].includes(new Date(x.start_time).getDay())).length },
  { id: 'explorer', icon: '🗺️', name: 'Explorer', what: 'Different places you ended a drive', tiers: [5, 15, 40, 100], value: (t) => new Set(t.map((x) => cityOf(x.end_location)).filter(Boolean)).size },
  { id: 'toge', icon: '⛰️', name: 'Tōge Runner', what: 'Drives in Tōge mode', tiers: [1, 10, 30, 100], value: (t) => t.filter((x) => x.mode === 'toge').length },
  { id: 'wangan', icon: '🌉', name: 'Wangan Midnight', what: 'Drives in Wangan mode', tiers: [1, 10, 30, 100], value: (t) => t.filter((x) => x.mode === 'wangan').length },
  { id: 'convoy', icon: '🚙', name: 'Convoy', what: 'Group drives with friends', tiers: [1, 5, 20, 50], value: (t) => t.filter((x) => x.convoy).length },
  { id: 'builder', icon: '🔧', name: 'Builder', what: 'Mods across your garage', tiers: [3, 10, 25, 50], value: (_t, cars) => cars.reduce((s, c) => s + (c.mods || []).length, 0) },
];

// Every badge with your value, tier reached (-1 = not yet) and the next goal.
export function badgeProgress(trips = [], cars = []) {
  const done = trips.filter((t) => t.start_time);
  return BADGES.map((b) => {
    const value = b.value(done, cars);
    let tier = -1;
    b.tiers.forEach((goal, i) => { if (value >= goal) tier = i; });
    const next = b.tiers[tier + 1] ?? null;
    return { ...b, value, tier, tierName: tier >= 0 ? TIERS[tier] : null, next, pct: next ? Math.min(1, value / next) : 1 };
  });
}
