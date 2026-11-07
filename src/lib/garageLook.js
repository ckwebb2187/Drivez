// Garage showroom look (walls, graffiti, banners), saved per phone.
import { useSyncExternalStore } from 'react';

export const WALL_STYLES = [
  { id: 'brick', title: 'Brick' },
  { id: 'concrete', title: 'Concrete' },
  { id: 'panel', title: 'Metal panels' },
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
const DEFAULTS = { wall: 'brick', color: 'charcoal', graffiti: false, makeBanner: true, mods: ['cobb', 'perrin', 'grimmspeed'] };
let state = (() => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return DEFAULTS; } })();
const subs = new Set();
export function setGarageLook(patch) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ }
  subs.forEach((f) => f());
}
export const useGarageLook = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state);
