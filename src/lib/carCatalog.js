// Cars you can pick in the garage. Each has a body shape for the 3D car and map icon,
// plus details (hood scoop, wing) and stock wheels. Cars not listed use a generic shape.

// Body shapes: 'sedan', 'hatch', 'coupe', 'suv', 'truck' ('sports' is the older name for coupe).
export const SHAPES = [
  { key: 'hatch', label: 'Hatchback' },
  { key: 'sedan', label: 'Sedan' },
  { key: 'coupe', label: 'Coupe' },
  { key: 'suv', label: 'SUV' },
  { key: 'truck', label: 'Pickup' },
];
export const shapeOf = (body) => (body === 'sports' ? 'coupe' : SHAPES.some((s) => s.key === body) ? body : 'sedan');
// Icon key for the flat map car (older icons call coupes "sports").
export const iconBody = (shape) => (shape === 'coupe' ? 'sports' : shape);

export const WHEELS = [
  { key: 'stock', label: 'Stock' },
  { key: 'te37', label: 'TE37-style' },
  { key: 'mesh', label: 'Mesh' },
  { key: 'six', label: '6-spoke' },
  { key: 'multi', label: 'Multi-spoke' },
  { key: 'dish', label: 'Deep dish' },
];
export const WHEEL_COLORS = [
  { key: '#c9ced6', label: 'Silver' },
  { key: '#3a3d42', label: 'Gunmetal' },
  { key: '#121214', label: 'Black' },
  { key: '#b07a3a', label: 'Bronze' },
  { key: '#d4af37', label: 'Gold' },
  { key: '#f2f2f2', label: 'White' },
];

const C = (make, model, years, shape, extra = {}) => ({ id: `${make}-${model}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'), make, model, years, shape, ...extra });

export const CATALOG = [
  C('Honda', 'Civic EG', [1992, 1995], 'hatch'),
  C('Honda', 'Civic EK', [1996, 2000], 'hatch'),
  C('Honda', 'Civic Type R (FK8)', [2017, 2021], 'hatch', { wing: true, wheelColor: '#121214' }),
  C('Honda', 'Civic', [2001, 2025], 'sedan'),
  C('Honda', 'Integra', [1994, 2001], 'coupe'),
  C('Honda', 'S2000', [2000, 2009], 'coupe'),
  C('Subaru', 'WRX', [2015, 2021], 'sedan', { scoop: true, wheelColor: '#3a3d42' }),
  C('Subaru', 'WRX STI', [2015, 2021], 'sedan', { scoop: true, wing: true, wheelColor: '#3a3d42', model3d: 'wrx-sti' }),
  C('Subaru', 'WRX STI (hatch)', [2008, 2014], 'hatch', { scoop: true, wing: true }),
  C('Subaru', 'WRX', [2022, 2025], 'sedan', { scoop: true }),
  C('Subaru', 'BRZ', [2013, 2025], 'coupe'),
  C('Toyota', 'Supra MK4', [1993, 2002], 'coupe', { wing: true }),
  C('Toyota', 'Supra MK5', [2020, 2025], 'coupe'),
  C('Toyota', 'GR86', [2022, 2025], 'coupe'),
  C('Toyota', '86', [2017, 2020], 'coupe'),
  C('Nissan', 'Skyline GT-R (R32–R34)', [1989, 2002], 'coupe', { wing: true }),
  C('Nissan', 'GT-R (R35)', [2009, 2025], 'coupe', { wing: true }),
  C('Nissan', '350Z', [2003, 2009], 'coupe'),
  C('Nissan', '370Z', [2009, 2020], 'coupe'),
  C('Nissan', '240SX', [1989, 1998], 'coupe'),
  C('Infiniti', 'G35', [2003, 2008], 'coupe'),
  C('Infiniti', 'G37', [2008, 2013], 'coupe'),
  C('Infiniti', 'Q50', [2014, 2025], 'sedan'),
  C('BMW', '3 Series (E36)', [1992, 1999], 'coupe'),
  C('BMW', '3 Series (E46)', [1999, 2006], 'coupe'),
  C('BMW', '3 Series (E92)', [2007, 2013], 'coupe'),
  C('Mazda', 'MX-5 Miata', [1990, 2025], 'coupe'),
  C('Mazda', 'RX-7 (FD)', [1993, 2002], 'coupe', { wing: true }),
  C('Mitsubishi', 'Lancer Evolution', [2003, 2015], 'sedan', { scoop: true, wing: true }),
  C('Volkswagen', 'Golf GTI', [2006, 2025], 'hatch'),
  C('Ford', 'Mustang', [2005, 2025], 'coupe', { scoop: true }),
];
export const MAKES = [...new Set(CATALOG.map((c) => c.make))];
export const catalogById = (id) => CATALOG.find((c) => c.id === id) || null;

// Best guess for cars added before the catalog existed (make/model typed by hand).
export function guessCatalog(v) {
  if (!v) return null;
  if (v.catalog_id) return catalogById(v.catalog_id);
  const make = String(v.make || '').toLowerCase();
  const model = String(v.model || '').toLowerCase().replace(/\s+/g, ' ');
  const year = +v.year || 0;
  const hits = CATALOG.filter((c) => c.make.toLowerCase() === make && (model.includes(c.model.toLowerCase().split(' (')[0]) || c.model.toLowerCase().includes(model)));
  const inYears = hits.filter((c) => !year || (year >= c.years[0] && year <= c.years[1]));
  // Prefer the most specific name (e.g. "WRX STI" over "WRX").
  return (inYears.length ? inYears : hits).sort((a, b) => b.model.length - a.model.length)[0] || null;
}

// Everything needed to draw a car: shape, details, wheels, paint, underglow.
export function carLook(v) {
  const cat = guessCatalog(v);
  return {
    shape: shapeOf(v?.shape || v?.body || cat?.shape),
    scoop: v?.scoop ?? !!cat?.scoop,
    wing: v?.wing ?? !!cat?.wing,
    wheels: v?.wheels || 'stock',
    wheelColor: v?.wheel_color || cat?.wheelColor || '#c9ced6',
    paint: v?.color || '#1f5ad6',
    glow: v?.glow_on === false ? null : v?.glow_color || null,
    model3d: v?.model3d === 'none' ? null : v?.model3d || cat?.model3d || null,
  };
}
