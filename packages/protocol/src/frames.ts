import { ProtocolError, Reader, Writer, concat } from './bytes';
import { LIMITS } from './constants';

/**
 * Bluetooth writes are limited by the link's MTU (often 185 bytes on iPhone, 23 bytes before an
 * Android phone negotiates). Envelopes are therefore split into frames:
 *
 *   u8 seq      random per envelope, so interleaved senders don't mix
 *   u8 index
 *   u8 count
 *   ...payload
 */
export const FRAME_HEADER = 3;

export function toFrames(env: Uint8Array, maxFrameBytes: number, seq: number): Uint8Array[] {
  const per = Math.max(1, Math.min(LIMITS.attrBytes, maxFrameBytes) - FRAME_HEADER);
  const count = Math.max(1, Math.ceil(env.length / per));
  if (count > LIMITS.maxFrames) throw new ProtocolError('envelope too large for this link');
  const frames: Uint8Array[] = [];
  for (let i = 0; i < count; i++) {
    const part = env.slice(i * per, (i + 1) * per);
    frames.push(concat(Uint8Array.of(seq & 255, i, count), part));
  }
  return frames;
}

interface Partial {
  parts: (Uint8Array | undefined)[];
  at: number;
}

/** Reassembles frames per sender. Drops incomplete envelopes after `ttlMs`. */
export class FrameAssembler {
  private pending = new Map<string, Partial>();
  constructor(private readonly ttlMs = 15_000) {}

  push(from: string, frame: Uint8Array, now = Date.now()): Uint8Array | null {
    for (const [k, p] of this.pending) if (now - p.at > this.ttlMs) this.pending.delete(k);
    if (frame.length < FRAME_HEADER + 1) return null;
    const seq = frame[0];
    const idx = frame[1];
    const count = frame[2];
    if (!count || idx >= count) return null;
    if (count === 1) return frame.slice(FRAME_HEADER);
    const key = `${from}:${seq}:${count}`;
    let p = this.pending.get(key);
    if (!p) {
      p = { parts: new Array(count).fill(undefined), at: now };
      this.pending.set(key, p);
    }
    p.parts[idx] = frame.slice(FRAME_HEADER);
    p.at = now;
    if (p.parts.every(Boolean)) {
      this.pending.delete(key);
      return concat(...(p.parts as Uint8Array[]));
    }
    return null;
  }
}

/**
 * Photo transfer: the reader writes a u16 start index to the PHOTO characteristic, then reads it
 * repeatedly. Every read at offset 0 returns the next chunk:
 *   u16 index | u16 count | payload (≤ 480 bytes)
 * (Reads at a non-zero offset are the OS fetching the rest of the same chunk.)
 */
export function photoChunks(photo: Uint8Array, size: number = LIMITS.photoChunk): Uint8Array[] {
  const count = Math.max(1, Math.ceil(photo.length / size));
  const out: Uint8Array[] = [];
  for (let i = 0; i < count; i++) {
    out.push(new Writer().u16(i).u16(count).raw(photo.slice(i * size, (i + 1) * size)).finish());
  }
  return out;
}

export function parsePhotoChunk(chunk: Uint8Array): { index: number; count: number; data: Uint8Array } | null {
  try {
    const r = new Reader(chunk);
    const index = r.u16();
    const count = r.u16();
    if (!count || index >= count) return null;
    return { index, count, data: r.rest() };
  } catch {
    return null;
  }
}

export const photoStartRequest = (index = 0) => new Writer().u16(index).finish();
