// Dependency-free byte helpers that behave the same in Node, browsers and Hermes (React Native).

export class ProtocolError extends Error {}

export function concat(...parts: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Constant-time equality for equal-length inputs. */
export function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

function codePointBytes(c: number): number {
  return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
}

export const utf8 = {
  encode(s: string): Uint8Array {
    const out: number[] = [];
    for (let i = 0; i < s.length; i++) {
      let c = s.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
        const d = s.charCodeAt(i + 1);
        if (d >= 0xdc00 && d <= 0xdfff) {
          c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
          i++;
        } else c = 0xfffd;
      } else if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return Uint8Array.from(out);
  },
  decode(b: Uint8Array): string {
    let s = '';
    let i = 0;
    while (i < b.length) {
      const a = b[i++];
      let c: number;
      if (a < 0x80) c = a;
      else if (a >= 0xc2 && a < 0xe0 && i < b.length) c = ((a & 31) << 6) | (b[i++] & 63);
      else if (a >= 0xe0 && a < 0xf0 && i + 1 < b.length) {
        c = ((a & 15) << 12) | ((b[i] & 63) << 6) | (b[i + 1] & 63);
        i += 2;
      } else if (a >= 0xf0 && a < 0xf5 && i + 2 < b.length) {
        c = ((a & 7) << 18) | ((b[i] & 63) << 12) | ((b[i + 1] & 63) << 6) | (b[i + 2] & 63);
        i += 3;
      } else c = 0xfffd;
      if (c > 0xffff) {
        c -= 0x10000;
        s += String.fromCharCode(0xd800 + (c >> 10), 0xdc00 + (c & 1023));
      } else s += String.fromCharCode(c);
    }
    return s;
  },
  byteLength(s: string): number {
    let n = 0;
    for (const ch of s) n += codePointBytes(ch.codePointAt(0)!);
    return n;
  },
};

/** Cuts a string so its UTF-8 form fits in maxBytes, never splitting a character. */
export function truncateUtf8(s: string, maxBytes: number): string {
  let n = 0;
  let out = '';
  for (const ch of s) {
    const len = codePointBytes(ch.codePointAt(0)!);
    if (n + len > maxBytes) break;
    n += len;
    out += ch;
  }
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = (() => {
  const t = new Int16Array(256).fill(-1);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  t['-'.charCodeAt(0)] = 62; // accept base64url too
  t['_'.charCodeAt(0)] = 63;
  return t;
})();

export const base64 = {
  encode(b: Uint8Array): string {
    let s = '';
    let i = 0;
    for (; i + 2 < b.length; i += 3) {
      const n = (b[i] << 16) | (b[i + 1] << 8) | b[i + 2];
      s += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
    }
    if (i < b.length) {
      const n = (b[i] << 16) | ((i + 1 < b.length ? b[i + 1] : 0) << 8);
      s += B64[n >> 18] + B64[(n >> 12) & 63] + (i + 1 < b.length ? B64[(n >> 6) & 63] : '=') + '=';
    }
    return s;
  },
  decode(s: string): Uint8Array {
    const clean = s.replace(/[\s=]/g, '');
    const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
    let bits = 0;
    let acc = 0;
    let o = 0;
    for (let i = 0; i < clean.length; i++) {
      const v = B64_LOOKUP[clean.charCodeAt(i)];
      if (v < 0) throw new ProtocolError('invalid base64');
      acc = (acc << 6) | v;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out[o++] = (acc >> bits) & 255;
      }
    }
    return out.subarray(0, o);
  },
};

export const hex = {
  encode(b: Uint8Array): string {
    let s = '';
    for (let i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16);
    return s;
  },
  decode(s: string): Uint8Array {
    if (s.length % 2 || /[^0-9a-f]/i.test(s)) throw new ProtocolError('invalid hex');
    const out = new Uint8Array(s.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
    return out;
  },
};

export class Writer {
  private buf: number[] = [];
  u8(n: number) {
    this.buf.push(n & 255);
    return this;
  }
  u16(n: number) {
    this.buf.push((n >>> 8) & 255, n & 255);
    return this;
  }
  u32(n: number) {
    this.buf.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
    return this;
  }
  raw(b: Uint8Array) {
    for (let i = 0; i < b.length; i++) this.buf.push(b[i]);
    return this;
  }
  fixed(b: Uint8Array, len: number) {
    if (b.length !== len) throw new ProtocolError(`expected ${len} bytes, got ${b.length}`);
    return this.raw(b);
  }
  bytes8(b: Uint8Array) {
    if (b.length > 255) throw new ProtocolError('field too long');
    return this.u8(b.length).raw(b);
  }
  str8(s: string, maxBytes: number) {
    return this.bytes8(utf8.encode(truncateUtf8(s, Math.min(maxBytes, 255))));
  }
  get length() {
    return this.buf.length;
  }
  finish(): Uint8Array {
    return Uint8Array.from(this.buf);
  }
}

export class Reader {
  private o = 0;
  constructor(private readonly b: Uint8Array) {}
  private need(n: number) {
    if (this.o + n > this.b.length) throw new ProtocolError('truncated');
  }
  u8() {
    this.need(1);
    return this.b[this.o++];
  }
  u16() {
    this.need(2);
    const v = (this.b[this.o] << 8) | this.b[this.o + 1];
    this.o += 2;
    return v;
  }
  u32() {
    this.need(4);
    const b = this.b;
    const o = this.o;
    const v = b[o] * 0x1000000 + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]);
    this.o += 4;
    return v;
  }
  raw(n: number) {
    this.need(n);
    const v = this.b.slice(this.o, this.o + n);
    this.o += n;
    return v;
  }
  bytes8() {
    return this.raw(this.u8());
  }
  str8() {
    return utf8.decode(this.bytes8());
  }
  rest() {
    return this.raw(this.b.length - this.o);
  }
  get offset() {
    return this.o;
  }
  get remaining() {
    return this.b.length - this.o;
  }
}
