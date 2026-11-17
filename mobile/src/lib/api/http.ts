import { decode, encode } from '@msgpack/msgpack';
import { recordBytes } from '../data';
import type { Category } from '../store';
import { ApiError, type Api, type SyncResponse, type WireCard } from './types';

/**
 * Talks MessagePack over plain XHR (binary in, binary out — works the same on Android, iOS and web).
 * Every call is metered, including an estimate of HTTP header overhead, so the data receipt in the
 * app is honest. TLS overhead isn't included; keep-alive and an ECDSA certificate keep it small.
 */
const REQ_HEADERS = 230;
const RES_HEADERS = 170;

function request(
  method: 'GET' | 'POST',
  url: string,
  body?: Uint8Array,
  token?: string,
): Promise<{ status: number; bytes: Uint8Array; wireLen: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.responseType = 'arraybuffer';
    xhr.timeout = 20_000;
    if (body) xhr.setRequestHeader('content-type', 'application/msgpack');
    xhr.setRequestHeader('accept', 'application/msgpack');
    if (token) xhr.setRequestHeader('authorization', `Bearer ${token}`);
    xhr.onload = () => {
      const bytes = xhr.response ? new Uint8Array(xhr.response as ArrayBuffer) : new Uint8Array(0);
      const len = Number(xhr.getResponseHeader('content-length')) || bytes.length;
      resolve({ status: xhr.status, bytes, wireLen: len });
    };
    xhr.onerror = () => reject(new ApiError('network', 0));
    xhr.ontimeout = () => reject(new ApiError('network', 0));
    xhr.send(body ?? null);
  });
}

export class HttpApi implements Api {
  readonly kind = 'http' as const;
  constructor(private readonly base: string) {}

  private async call<T>(path: string, cat: Category, body?: unknown, token?: string, method: 'GET' | 'POST' = 'POST'): Promise<T> {
    const payload = body === undefined ? undefined : encode(body, { ignoreUndefined: true });
    const res = await request(method, this.base + path, payload, token);
    recordBytes(cat, (payload?.length ?? 0) + REQ_HEADERS + path.length + (token ? 50 : 0) + res.wireLen + RES_HEADERS);
    let data: unknown = {};
    try {
      data = res.bytes.length ? decode(res.bytes) : {};
    } catch {
      data = {};
    }
    if (res.status >= 400 || res.status === 0) {
      const e = (data as { e?: string })?.e ?? `http_${res.status}`;
      throw new ApiError(e, res.status);
    }
    return data as T;
  }

  info() {
    return this.call<{ spk: Uint8Array }>('/v1/info', 'account', undefined, undefined, 'GET');
  }
  authStart(ph: string) {
    return this.call<{ dev?: string }>('/v1/auth/start', 'account', { ph });
  }
  authVerify(ph: string, code: string) {
    return this.call<{ tk: string; uid: string; spk: Uint8Array }>('/v1/auth/verify', 'account', { ph, code });
  }
  sync(token: string, c: number, ops: unknown[]) {
    return this.call<SyncResponse>('/v1/sync', 'sync', { c, ops }, token);
  }
  async deck(token: string, n: number, loc?: { lat: number; lon: number }, away?: boolean) {
    const r = await this.call<{ cards: WireCard[] }>('/v1/deck', 'deck', { n, la: loc?.lat, lo: loc?.lon, aw: away ? 1 : 0 }, token);
    return r.cards ?? [];
  }
  async uploadPhoto(token: string, v: 's' | 'f', img: Uint8Array, th?: Uint8Array) {
    const r = await this.call<{ p: string }>('/v1/photo', 'upload', { v, img, th }, token);
    return r.p;
  }
  async passes(token: string, pks: Uint8Array[]) {
    const r = await this.call<{ ps: Uint8Array[] }>('/v1/passes', 'account', { pks }, token);
    return r.ps ?? [];
  }
  photoUrl(key: string, v: 's' | 'f') {
    return `${this.base}/p/${key}/${v}`;
  }
}
