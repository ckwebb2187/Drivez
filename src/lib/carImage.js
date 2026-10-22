// Turns a photo/drawing of a car (seen from above) into a map icon:
// removes the plain background around it (keeping glows soft), trims it,
// and turns it so the front points up.

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That file isn't a picture we can open.")); };
    img.src = url;
  });
}

// Remove the background connected to the edges (flood fill), fading near-background colors to transparent.
export async function cutOutCar(file) {
  const img = await loadImage(file);
  const scale = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, w, h);
  const im = g.getImageData(0, 0, w, h);
  const d = im.data;

  // Background color = average of the four corners.
  const corners = [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]].map(([x, y]) => { const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; });
  const transparentAlready = corners.every((k) => k[3] < 20);
  if (!transparentAlready) {
    const bg = [0, 1, 2].map((k) => corners.reduce((s, x) => s + x[k], 0) / 4);
    const dist = (i) => Math.hypot(d[i] - bg[0], d[i + 1] - bg[1], d[i + 2] - bg[2]);
    const TOL = 110;
    const seen = new Uint8Array(w * h);
    const stack = [];
    for (let x = 0; x < w; x++) { stack.push(x, (h - 1) * w + x); }
    for (let y = 0; y < h; y++) { stack.push(y * w, y * w + w - 1); }
    while (stack.length) {
      const p = stack.pop();
      if (seen[p]) continue;
      seen[p] = 1;
      const i = p * 4;
      if (dist(i) > TOL) continue;
      // "Color to alpha": the closer to the background, the more see-through.
      let a = 0;
      for (let k = 0; k < 3; k++) {
        const diff = d[i + k] - bg[k];
        const room = diff >= 0 ? 255 - bg[k] : bg[k];
        a = Math.max(a, room > 0 ? Math.abs(diff) / room : 0);
      }
      if (a < 0.04) { d[i + 3] = 0; }
      else {
        for (let k = 0; k < 3; k++) d[i + k] = Math.max(0, Math.min(255, bg[k] + (d[i + k] - bg[k]) / a));
        d[i + 3] = Math.round(Math.min(1, a) * 255);
      }
      const x = p % w, y = (p / w) | 0;
      if (x > 0) stack.push(p - 1);
      if (x < w - 1) stack.push(p + 1);
      if (y > 0) stack.push(p - w);
      if (y < h - 1) stack.push(p + w);
    }
    g.putImageData(im, 0, 0);
  }

  // Trim to what's left.
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] > 10) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (maxX < 0) throw new Error("Couldn't find the car in that picture.");
  const out = document.createElement('canvas');
  out.width = maxX - minX + 1; out.height = maxY - minY + 1;
  out.getContext('2d').drawImage(c, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

// Rotate by quarter turns (clockwise) and shrink so the long side is at most `max` px. Returns a canvas.
export function turnCar(canvas, quarterTurns, max = 240) {
  const q = ((quarterTurns % 4) + 4) % 4;
  const sw = canvas.width, sh = canvas.height;
  const rw = q % 2 ? sh : sw, rh = q % 2 ? sw : sh;
  const k = Math.min(1, max / Math.max(rw, rh));
  const c = document.createElement('canvas');
  c.width = Math.round(rw * k); c.height = Math.round(rh * k);
  const g = c.getContext('2d');
  g.translate(c.width / 2, c.height / 2);
  g.rotate((q * Math.PI) / 2);
  g.drawImage(canvas, (-sw * k) / 2, (-sh * k) / 2, sw * k, sh * k);
  return c;
}

export const canvasToPngBase64 = (c) => c.toDataURL('image/png').split(',')[1];
