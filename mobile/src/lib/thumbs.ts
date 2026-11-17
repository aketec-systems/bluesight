import { rgbaToThumbHash } from 'thumbhash';

/**
 * People without a photo still get a colourful blur on their card: a thumbhash generated from a
 * soft "portrait" (head and shoulders) in two colours picked from their name. ~25 bytes, no data.
 */
const SWATCHES: [number, number, number][] = [
  [255, 79, 109],
  [255, 178, 31],
  [63, 196, 240],
  [146, 92, 230],
  [38, 190, 160],
  [255, 120, 70],
  [230, 70, 160],
  [90, 120, 255],
];

function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function gradientThumbhash(seed: string): Uint8Array {
  const h = seedOf(seed);
  const a = SWATCHES[h % SWATCHES.length];
  const b = SWATCHES[(h >>> 8) % SWATCHES.length === h % SWATCHES.length ? (h + 3) % SWATCHES.length : (h >>> 8) % SWATCHES.length];
  const skin = [[94, 58, 40], [139, 90, 60], [176, 120, 84], [60, 38, 28]][(h >>> 16) % 4];
  const w = 32;
  const ht = 40;
  const rgba = new Uint8Array(w * ht * 4);
  for (let y = 0; y < ht; y++) {
    for (let x = 0; x < w; x++) {
      const t = (x / w) * 0.4 + (y / ht) * 0.6;
      let c = [0, 1, 2].map((k) => a[k] * (1 - t) + b[k] * t);
      const head = Math.hypot((x - 16) / 7, (y - 15) / 8.5);
      const body = Math.hypot((x - 16) / 13, (y - 40) / 13);
      const m = Math.max(0, 1 - Math.min(head, body));
      if (m > 0) c = c.map((v, k) => v * (1 - Math.min(1, m * 2.2)) + skin[k] * Math.min(1, m * 2.2));
      const i = (y * w + x) * 4;
      rgba[i] = c[0];
      rgba[i + 1] = c[1];
      rgba[i + 2] = c[2];
      rgba[i + 3] = 255;
    }
  }
  return rgbaToThumbHash(w, ht, rgba);
}
