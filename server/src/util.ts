import { createHash, randomBytes } from 'node:crypto';
import { decode, encode } from '@msgpack/msgpack';
import { utf8 } from '@bluesight/protocol';

export const nowSec = () => Math.floor(Date.now() / 1000);
export const newHexId = (bytes = 8) => randomBytes(bytes).toString('hex');
export const sha256 = (s: string | Uint8Array) => createHash('sha256').update(s).digest('hex');

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

/** MessagePack: compact, and carries binary (keys, ciphertext, thumbhashes) without base64 bloat. */
export const pack = (v: unknown) => Buffer.from(encode(v, { ignoreUndefined: true }));
export const unpack = (b: Uint8Array) => decode(b);

export function str(v: unknown, maxBytes: number, field: string, minChars = 0): string {
  if (typeof v !== 'string') throw new HttpError(400, `bad_${field}`);
  const s = v.trim();
  if (s.length < minChars || utf8.byteLength(s) > maxBytes) throw new HttpError(400, `bad_${field}`);
  return s;
}

export function int(v: unknown, min: number, max: number, field: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw new HttpError(400, `bad_${field}`);
  return v;
}

export function num(v: unknown, min: number, max: number, field: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new HttpError(400, `bad_${field}`);
  return v;
}

export function bin(v: unknown, len: number | [number, number], field: string): Uint8Array {
  if (!(v instanceof Uint8Array)) throw new HttpError(400, `bad_${field}`);
  const [min, max] = typeof len === 'number' ? [len, len] : len;
  if (v.length < min || v.length > max) throw new HttpError(400, `bad_${field}`);
  return v;
}

export function hexId(v: unknown, field: string): string {
  if (typeof v !== 'string' || !/^[0-9a-f]{12,16}$/.test(v)) throw new HttpError(400, `bad_${field}`);
  return v;
}
