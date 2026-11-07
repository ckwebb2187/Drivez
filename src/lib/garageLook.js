// Garage showroom look (walls, graffiti, banners), saved per phone.
import { useSyncExternalStore } from 'react';

export const WALL_STYLES = [
  { id: 'brick', title: 'Brick' },
  { id: 'concrete', title: 'Concrete' },
  { id: 'panel', title: 'Metal panels' },
  { id: 'wood', title: 'Wood' },
  { id: 'tile', title: 'Subway tile' },
  { id: 'carbon', title: 'Carbon fiber' },
  { id: 'corrugated', title: 'Corrugated' },
  { id: 'hex', title: 'Hex panels' },
  { id: 'stripe', title: 'Racing stripe' },
  { id: 'led', title: 'LED panels' },
];
export const FLOORS = [
  { id: 'epoxy', title: 'Epoxy' },
  { id: 'resin', title: 'Resin flake' },
  { id: 'concrete', title: 'Concrete' },
  { id: 'polished', title: 'Polished concrete' },
  { id: 'checker', title: 'Checkerboard' },
  { id: 'racedeck', title: 'Plastic race tiles' },
  { id: 'diamond', title: 'Diamond plate' },
  { id: 'rubber', title: 'Rubber coin mat' },
  { id: 'carbon', title: 'Carbon fiber' },
  { id: 'hex', title: 'Hex tiles' },
  { id: 'wood', title: 'Wood' },
  { id: 'led', title: 'LED grid' },
];
export const FLOOR_COLORS = [
  { id: 'black', hex: '#15161c' }, { id: 'gray', hex: '#6b6e75' }, { id: 'white', hex: '#d9dad6' }, { id: 'red', hex: '#b3121f' },
  { id: 'blue', hex: '#1f4fbf' }, { id: 'yellow', hex: '#f2c200' }, { id: 'green', hex: '#1f8a4c' }, { id: 'orange', hex: '#ff6a13' },
  { id: 'purple', hex: '#6c2bd9' }, { id: 'teal', hex: '#00a3a3' },
];
export const LIGHTS = [
  { id: 'shop', title: 'Shop' }, { id: 'showroom', title: 'Showroom' }, { id: 'neon', title: 'Neon night' }, { id: 'sunset', title: 'Sunset' },
  { id: 'spotlight', title: 'Spotlight' }, { id: 'underground', title: 'Underground' }, { id: 'trackday', title: 'Track day' },
  { id: 'cyber', title: 'Cyber' }, { id: 'warm', title: 'Warm' }, { id: 'arctic', title: 'Arctic' },
];
export const NEON_COLORS = ['#00e5ff', '#ff2d95', '#7cff3c', '#ffd400', '#a855ff', '#ff6a13', '#ffffff', '#ff2b2b'];
export const EFFECTS = [
  { id: 'turntable', title: 'Turntable' }, { id: 'sweep', title: 'Light sweep' }, { id: 'pulse', title: 'Neon pulse' },
  { id: 'rainbow', title: 'Rainbow underglow' }, { id: 'flicker', title: 'Flickering lights' }, { id: 'haze', title: 'Haze' },
  { id: 'dust', title: 'Floating dust' }, { id: 'scanner', title: 'Laser scanner' }, { id: 'sparks', title: 'Welding sparks' },
  { id: 'orbit', title: 'Camera orbit' },
];
export const GRAFFITI = [
  { id: 'off', title: 'Off' }, { id: 'bubble', title: 'Bubble' }, { id: 'wild', title: 'Wildstyle' }, { id: 'stencil', title: 'Stencil' },
  { id: 'neon', title: 'Neon tag' }, { id: 'kanji', title: 'Kanji' }, { id: 'throwie', title: 'Throw-ups' },
];
export const CAR_TYPES = [
  { id: 'jdm', name: 'JDM', bg: '#bc002d', fg: '#ffffff' }, { id: 'rally', name: 'RALLY', bg: '#0b2e6b', fg: '#f4c20d' },
  { id: 'drift', name: 'DRIFT', bg: '#111111', fg: '#ff2d95' }, { id: 'track', name: 'TRACK DAY', bg: '#ffffff', fg: '#111111' },
  { id: 'stance', name: 'STANCE', bg: '#1a1a1a', fg: '#7cff3c' }, { id: 'attack', name: 'TIME ATTACK', bg: '#ff6a13', fg: '#111111' },
  { id: 'offroad', name: 'OFF-ROAD', bg: '#4a3b22', fg: '#ffd400' }, { id: 'sleeper', name: 'SLEEPER', bg: '#2a2a2e', fg: '#9aa0aa' },
];
export const WALL_COLORS = [
  { id: 'charcoal', title: 'Charcoal', hex: '#23242b' },
  { id: 'black', title: 'Matte black', hex: '#141416' },
  { id: 'white', title: 'Shop white', hex: '#c9c9c4' },
  { id: 'gray', title: 'Gray', hex: '#5a5d63' },
  { id: 'red', title: 'Red brick', hex: '#6e2a22' },
  { id: 'blue', title: 'Rally blue', hex: '#1d3a78' },
  { id: 'green', title: 'Garage green', hex: '#25402f' },
  { id: 'yellow', title: 'Hazard yellow', hex: '#a88a1c' },
];
// Banners are plain text in brand-ish colors (no logos).
export const MOD_BRANDS = [
  { id: 'cobb', name: 'COBB', bg: '#111111', fg: '#e31b23' },
  { id: 'perrin', name: 'PERRIN', bg: '#0b1d44', fg: '#ffffff' },
  { id: 'invidia', name: 'INVIDIA', bg: '#0a0a0a', fg: '#e10600' },
  { id: 'grimmspeed', name: 'GRIMMSPEED', bg: '#121212', fg: '#ff7a00' },
  { id: 'iag', name: 'IAG', bg: '#ffd400', fg: '#111111' },
  { id: 'processwest', name: 'PROCESS WEST', bg: '#f2f2f2', fg: '#111111' },
  { id: 'killerb', name: 'KILLER B', bg: '#ffcc00', fg: '#0a0a0a' },
  { id: 'mishimoto', name: 'MISHIMOTO', bg: '#0a0a0a', fg: '#f26522' },
  { id: 'whiteline', name: 'WHITELINE', bg: '#0d3c8c', fg: '#ffffff' },
  { id: 'hks', name: 'HKS', bg: '#ffffff', fg: '#0a0a0a' },
  { id: 'tomei', name: 'TOMEI', bg: '#c8102e', fg: '#ffffff' },
  { id: 'enkei', name: 'ENKEI', bg: '#0a0a0a', fg: '#ffffff' },
];
// Car-brand banner colors (anything else gets a neutral banner in the accent color).
export const MAKE_STYLE = {
  subaru: { bg: '#0b2e6b', fg: '#ffffff', stripe: '#f4c20d' },
  toyota: { bg: '#111111', fg: '#ffffff', stripe: '#eb0a1e' },
  honda: { bg: '#0a0a0a', fg: '#ffffff', stripe: '#e40521' },
  nissan: { bg: '#1a1a1a', fg: '#ffffff', stripe: '#c3002f' },
  mazda: { bg: '#101010', fg: '#ffffff', stripe: '#9b9b9b' },
  mitsubishi: { bg: '#111111', fg: '#ffffff', stripe: '#e60012' },
  ford: { bg: '#0b2c63', fg: '#ffffff', stripe: '#ffffff' },
  chevrolet: { bg: '#111111', fg: '#f2b632', stripe: '#f2b632' },
  bmw: { bg: '#0a0a0a', fg: '#ffffff', stripe: '#1c69d4' },
  volkswagen: { bg: '#0b1f4b', fg: '#ffffff', stripe: '#ffffff' },
  hyundai: { bg: '#002c5f', fg: '#ffffff', stripe: '#00aad2' },
};

const KEY = 'dz-garage';
const DEFAULTS = {
  wall: 'brick', color: 'charcoal', customWall: '', floor: 'epoxy', floorColor: 'black', floorColor2: 'gray',
  light: 'shop', bright: 1, neon: '', shadows: 'off', fx: {}, graffiti: 'off', grafText: 'KAIDO',
  makeBanner: true, mods: ['cobb', 'perrin', 'grimmspeed'], types: [], flags: false,
};
let state = (() => {
  try {
    const p = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    if (p.graffiti === true) p.graffiti = 'bubble'; if (p.graffiti === false) p.graffiti = 'off'; // older saves
    return p;
  } catch { return DEFAULTS; }
})();
const subs = new Set();
export function setGarageLook(patch) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ }
  subs.forEach((f) => f());
}
export const useGarageLook = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state);

// Whole-garage looks.
export const GARAGE_PRESETS = [
  { name: 'Pro Shop', p: { wall: 'panel', color: 'gray', floor: 'epoxy', floorColor: 'gray', light: 'shop', graffiti: 'off', fx: { pulse: true }, shadows: 'soft', types: [], flags: false } },
  { name: 'Showroom', p: { wall: 'tile', color: 'white', floor: 'polished', floorColor: 'white', light: 'showroom', graffiti: 'off', fx: { turntable: true, sweep: true }, shadows: 'soft', flags: false } },
  { name: 'Rally HQ', p: { wall: 'stripe', color: 'blue', floor: 'racedeck', floorColor: 'blue', floorColor2: 'yellow', light: 'shop', graffiti: 'off', fx: { pulse: true }, types: ['rally'], flags: true } },
  { name: 'Drift Den', p: { wall: 'concrete', color: 'gray', floor: 'concrete', floorColor: 'gray', light: 'neon', neon: '#ff2d95', graffiti: 'wild', fx: { haze: true, rainbow: true }, types: ['drift', 'jdm'] } },
  { name: 'Track Day', p: { wall: 'panel', color: 'white', floor: 'checker', floorColor: 'black', floorColor2: 'white', light: 'trackday', graffiti: 'off', fx: { orbit: true }, types: ['track', 'attack'], flags: true } },
  { name: 'Underground', p: { wall: 'brick', color: 'black', floor: 'resin', floorColor: 'purple', light: 'underground', neon: '#a855ff', graffiti: 'neon', fx: { haze: true, dust: true, pulse: true }, types: ['stance'] } },
  { name: 'Cyber Lab', p: { wall: 'led', color: 'black', floor: 'led', floorColor: 'teal', light: 'cyber', neon: '#00e5ff', graffiti: 'off', fx: { scanner: true, pulse: true, dust: true } } },
  { name: 'Tokyo Night', p: { wall: 'corrugated', color: 'charcoal', floor: 'hex', floorColor: 'black', light: 'neon', neon: '#ff2d95', graffiti: 'kanji', fx: { rainbow: true, haze: true }, types: ['jdm'] } },
  { name: 'Fab Shop', p: { wall: 'corrugated', color: 'gray', floor: 'diamond', floorColor: 'gray', light: 'warm', graffiti: 'stencil', fx: { sparks: true, flicker: true }, types: ['offroad'] } },
  { name: 'Stealth', p: { wall: 'carbon', color: 'black', floor: 'carbon', floorColor: 'black', light: 'spotlight', graffiti: 'off', fx: { sweep: true }, shadows: 'sharp', types: ['sleeper'] } },
];
