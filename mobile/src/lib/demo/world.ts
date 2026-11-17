import jpeg from 'jpeg-js';
import {
  base64,
  hex,
  issuePass,
  newBoxKeyPair,
  newSignKeyPair,
  randomBytes,
  signKeyPairFromSeed,
  utf8,
  type KeyPair,
} from '@bluesight/protocol';
import { gradientThumbhash } from '../thumbs';

/**
 * The demo world: a pretend server key and a cast of people, shared by the simulated Bluetooth
 * transport and the in-browser demo API. Everything still runs through the real protocol code
 * (signed cards, passes, encrypted envelopes) — only the radio and the server are simulated.
 */

export const demoServer = {
  sign: signKeyPairFromSeed(utf8.encode('bluesight-demo-server-seed-v1-32b').slice(0, 32)),
  passSecret: utf8.encode('bluesight-demo-pass-secret-32byte').slice(0, 32),
};

export interface DemoPerson {
  uid: string;
  name: string;
  age: number;
  gender: number;
  intent: number;
  vibes: number;
  bio: string;
  thumbhash: Uint8Array;
  identity: KeyPair;
  recKey: Uint8Array;
  likesYou: boolean;
  chatty: boolean;
}

const WOMEN = ['Ama', 'Fatu', 'Musu', 'Kebeh', 'Comfort', 'Zainab', 'Esther', 'Yah', 'Precious', 'Hawa', 'Abena', 'Nneka', 'Josephine', 'Adwoa'];
const MEN = ['Kofi', 'Sekou', 'Jallah', 'Emmanuel', 'Varney', 'Alieu', 'Tunde', 'Kwame', 'Junior', 'Momo', 'Siaka', 'Chidi', 'Prince', 'Yaw'];
const NB = ['Remi', 'Sam'];

const BIOS = [
  'Here for the Afrobeats and good energy',
  'Home for December. Show me what I missed.',
  'Jollof debates welcome. I will win.',
  'Engineer by day, dancer by night',
  'Looking for someone to split suya with',
  'Big laugh, bigger playlist',
  'New in town. Show me the good spots?',
  'Gym, gospel, and Sunday rice',
  'Moving back home next year 🏡',
  'If the song is sweet, I am on the floor',
  'Ask me about my plant collection 🌿',
  'Market on Saturday, beach on Sunday',
];

export const REPLIES = [
  'Hey! I just saw your card 😄',
  'Wave so I can find you 👋',
  'This song is my jam 🎶',
  "I'm by the entrance, come say hi",
  'Haha ok I see you 👀',
  'Are you from here or visiting?',
  'Coffee after this?',
  'You look familiar… were you here last week?',
];

function rand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function vibesMask(r: () => number) {
  let m = 0;
  const n = 2 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) m |= 1 << Math.floor(r() * 32);
  return m >>> 0;
}

export function makePeople(count: number, seed: number, prefix: string): DemoPerson[] {
  const r = rand(seed);
  const out: DemoPerson[] = [];
  for (let i = 0; i < count; i++) {
    const roll = r();
    const gender = roll < 0.48 ? 1 : roll < 0.94 ? 2 : 3;
    const pool = gender === 1 ? WOMEN : gender === 2 ? MEN : NB;
    const name = pool[Math.floor(r() * pool.length)];
    out.push({
      uid: hex.encode(randomBytes(8)),
      name,
      age: 21 + Math.floor(r() * 14),
      gender,
      intent: 1 + Math.floor(r() * 4),
      vibes: vibesMask(r),
      bio: BIOS[Math.floor(r() * BIOS.length)],
      thumbhash: gradientThumbhash(`${prefix}${i}${name}`),
      identity: newBoxKeyPair(),
      recKey: randomBytes(16),
      likesYou: r() < 0.6,
      chatty: r() < 0.8,
    });
  }
  return out;
}

export function demoPass(sessionSignPk: Uint8Array, uid: string): Uint8Array {
  return issuePass({
    sessionSignPk,
    accountId: hex.decode(uid),
    expiresAt: Math.floor(Date.now() / 1000) + 86400,
    serverSignSk: demoServer.sign.secretKey,
    serverSecret: demoServer.passSecret,
  });
}

export const newSession = () => newSignKeyPair();

/** jpeg-js's encoder returns a Node Buffer; give it a tiny stand-in for the duration of the call. */
function withBufferShim<T>(fn: () => T): T {
  const g = globalThis as { Buffer?: unknown };
  if (g.Buffer) return fn();
  g.Buffer = { from: (a: ArrayLike<number>) => Uint8Array.from(a) };
  try {
    return fn();
  } finally {
    delete g.Buffer;
  }
}

const photoCache = new Map<string, Uint8Array>();

/**
 * A stylised portrait (no real faces) encoded as a real JPEG of realistic size (~8–14 KB), so the
 * demo exercises the same photo path and data costs as real profiles.
 */
export function portraitJpeg(seed: string, width = 300): Uint8Array {
  const key = `${seed}:${width}`;
  const hit = photoCache.get(key);
  if (hit) return hit;
  const r = rand([...seed].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261));
  const height = Math.round(width * 1.25);
  const hues = [
    [255, 79, 109],
    [255, 178, 31],
    [63, 196, 240],
    [146, 92, 230],
    [38, 190, 160],
    [255, 120, 70],
  ];
  const a = hues[Math.floor(r() * hues.length)];
  const b = hues[Math.floor(r() * hues.length)];
  const skin = [
    [94, 58, 40],
    [139, 90, 60],
    [176, 120, 84],
    [60, 38, 28],
  ][Math.floor(r() * 4)];
  const shirt = hues[Math.floor(r() * hues.length)].map((v) => v * 0.55);
  const hair = [
    [22, 14, 12],
    [40, 26, 20],
    [12, 10, 14],
  ][Math.floor(r() * 3)];
  const style = Math.floor(r() * 3); // 0 short, 1 puff, 2 long
  const data = new Uint8Array(width * height * 4);
  const cx = width / 2 + (r() - 0.5) * width * 0.08;
  const headY = height * 0.4;
  const headR = width * 0.19;
  const inEllipse = (x: number, y: number, ex: number, ey: number, rx: number, ry: number) => ((x - ex) / rx) ** 2 + ((y - ey) / ry) ** 2 < 1;
  const px = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = (x / width) * 0.35 + (y / height) * 0.65;
      let c = [0, 1, 2].map((k) => a[k] * (1 - t) + b[k] * t);
      const glow = Math.max(0, 1 - Math.hypot(x - width * 0.85, y - height * 0.05) / (width * 0.9));
      c = c.map((v) => v + glow * 60);
      if (style === 2 && inEllipse(x, y, cx, headY + headR * 0.5, headR * 1.25, headR * 1.7)) c = hair;
      if (inEllipse(x, y, cx, height * 1.05, width * 0.44, height * 0.36)) c = shirt;
      if (Math.abs(x - cx) < headR * 0.45 && y > headY && y < height * 0.74) c = skin.map((v) => v * 0.82);
      const head = Math.hypot((x - cx) / headR, (y - headY) / (headR * 1.2));
      if (head < 1) {
        const shade = 0.88 + 0.22 * (1 - head) - 0.14 * ((x - cx) / headR);
        c = skin.map((v) => v * shade);
      }
      const hairTop = style === 1 ? inEllipse(x, y, cx, headY - headR * 0.95, headR * 1.25, headR * 0.95) : inEllipse(x, y, cx, headY - headR * 0.45, headR * 1.06, headR * 0.82);
      if (hairTop && y < headY - headR * 0.1) c = hair;
      const i = (y * width + x) * 3;
      px[i] = c[0];
      px[i + 1] = c[1];
      px[i + 2] = c[2];
    }
  }
  // soft focus: two box-blur passes, so it reads as an out-of-focus photo rather than a cartoon
  const blur = (src: Float32Array, rad: number) => {
    const out = new Float32Array(src.length);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        for (let k = 0; k < 3; k++) {
          let sum = 0;
          let n = 0;
          for (let dx = -rad; dx <= rad; dx++) {
            const xx = Math.min(width - 1, Math.max(0, x + dx));
            sum += src[(y * width + xx) * 3 + k];
            n++;
          }
          out[(y * width + x) * 3 + k] = sum / n;
        }
    const out2 = new Float32Array(src.length);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        for (let k = 0; k < 3; k++) {
          let sum = 0;
          let n = 0;
          for (let dy = -rad; dy <= rad; dy++) {
            const yy = Math.min(height - 1, Math.max(0, y + dy));
            sum += out[(yy * width + x) * 3 + k];
            n++;
          }
          out2[(y * width + x) * 3 + k] = sum / n;
        }
    return out2;
  };
  const soft = blur(px, Math.max(2, Math.round(width / 90)));
  for (let j = 0, i = 0; j < soft.length; j += 3, i += 4) {
    data[i] = Math.max(0, Math.min(255, soft[j]));
    data[i + 1] = Math.max(0, Math.min(255, soft[j + 1]));
    data[i + 2] = Math.max(0, Math.min(255, soft[j + 2]));
    data[i + 3] = 255;
  }
  const out = withBufferShim(() => jpeg.encode({ data, width, height }, 55).data);
  const bytes = out instanceof Uint8Array ? new Uint8Array(out) : Uint8Array.from(out as ArrayLike<number>);
  photoCache.set(key, bytes);
  return bytes;
}

export const jpegDataUri = (bytes: Uint8Array) => `data:image/jpeg;base64,${base64.encode(bytes)}`;
