// Top-down car pictures for the map. Each is drawn pointing up (north) in a
// 40×80 box and rotated to the direction of travel.

export const BODY_TYPES = [
  { key: 'sports', label: 'Sports car' },
  { key: 'sedan', label: 'Sedan' },
  { key: 'suv', label: 'SUV' },
  { key: 'truck', label: 'Pickup' },
  { key: 'moto', label: 'Motorcycle' },
];

function shade(hex, amt) {
  const n = parseInt(String(hex || '#00BFFF').replace('#', ''), 16);
  const c = (v) => Math.max(0, Math.min(255, v + amt));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

export function carSvg(body = 'sedan', color = '#00BFFF') {
  const dark = shade(color, -70), light = shade(color, 60);
  const glass = '#0b1220', shine = 'rgba(255,255,255,0.35)';
  const lights = (y1, y2, w) => `<rect x="${20 - w - 3}" y="${y1}" width="5" height="2.5" rx="1" fill="#fff8c4"/><rect x="${20 + w - 2}" y="${y1}" width="5" height="2.5" rx="1" fill="#fff8c4"/><rect x="${20 - w - 3}" y="${y2}" width="5" height="2" rx="1" fill="#ff3b3b"/><rect x="${20 + w - 2}" y="${y2}" width="5" height="2" rx="1" fill="#ff3b3b"/>`;
  let shape;
  switch (body) {
    case 'sports':
      shape = `<path d="M9 14 C10 5 30 5 31 14 L34 30 C35 44 35 58 33 70 C32 76 8 76 7 70 C5 58 5 44 6 30 Z" fill="${color}" stroke="${dark}" stroke-width="1.5"/>
        <path d="M11 28 C14 23 26 23 29 28 L28 38 L12 38 Z" fill="${glass}"/><path d="M12 54 L28 54 L27 62 L13 62 Z" fill="${glass}"/>
        <path d="M12 38 L28 38 L28 54 L12 54 Z" fill="${shade(color, -25)}"/><path d="M14 9 C17 7 23 7 26 9" stroke="${shine}" stroke-width="2" fill="none"/>${lights(8, 73, 9)}`;
      break;
    case 'suv':
      shape = `<rect x="6" y="6" width="28" height="68" rx="7" fill="${color}" stroke="${dark}" stroke-width="1.5"/>
        <path d="M9 22 L31 22 L29 31 L11 31 Z" fill="${glass}"/><rect x="10" y="33" width="20" height="28" rx="2" fill="${shade(color, -25)}"/>
        <rect x="12" y="35" width="16" height="2" fill="${light}"/><rect x="12" y="57" width="16" height="2" fill="${light}"/>
        <path d="M10 63 L30 63 L30 69 L10 69 Z" fill="${glass}"/>${lights(7, 72, 9)}`;
      break;
    case 'truck':
      shape = `<rect x="6" y="5" width="28" height="70" rx="6" fill="${color}" stroke="${dark}" stroke-width="1.5"/>
        <path d="M9 19 L31 19 L29 27 L11 27 Z" fill="${glass}"/><rect x="10" y="29" width="20" height="13" rx="2" fill="${shade(color, -25)}"/>
        <rect x="9" y="44" width="22" height="28" rx="2" fill="${dark}"/><rect x="11" y="46" width="18" height="24" rx="1" fill="${shade(color, -45)}"/>${lights(6, 73, 9)}`;
      break;
    case 'moto':
      shape = `<ellipse cx="20" cy="40" rx="7" ry="28" fill="${color}" stroke="${dark}" stroke-width="1.5"/>
        <rect x="8" y="24" width="24" height="3" rx="1.5" fill="#333"/><circle cx="20" cy="40" r="6" fill="${glass}"/>
        <ellipse cx="20" cy="14" rx="3" ry="4" fill="#fff8c4"/><ellipse cx="20" cy="66" rx="3" ry="2.5" fill="#ff3b3b"/>`;
      break;
    default: // sedan
      shape = `<path d="M8 12 C9 5 31 5 32 12 L33 30 L33 66 C33 74 7 74 7 66 L7 30 Z" fill="${color}" stroke="${dark}" stroke-width="1.5"/>
        <path d="M10 24 C14 20 26 20 30 24 L28 34 L12 34 Z" fill="${glass}"/><rect x="11" y="35" width="18" height="20" rx="2" fill="${shade(color, -25)}"/>
        <path d="M12 56 L28 56 L29 63 L11 63 Z" fill="${glass}"/><path d="M13 9 C17 7 23 7 27 9" stroke="${shine}" stroke-width="2" fill="none"/>${lights(7, 70, 8)}`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="80" viewBox="0 0 40 80"><ellipse cx="20" cy="42" rx="17" ry="37" fill="rgba(0,0,0,0.35)"/>${shape}</svg>`;
}
