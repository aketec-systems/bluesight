import { ProtocolError, Reader, Writer, concat, equal, utf8 } from './bytes';
import { LIMITS, PROTOCOL_VERSION, TIMING } from './constants';
import { sidOf } from './card';
import {
  NONCE_BYTES,
  boxOpen,
  boxSeal,
  randomBytes,
  secretOpen,
  secretSeal,
  signToBoxPublic,
  signToBoxSecret,
  tagged,
} from './crypto';

/**
 * Envelopes are what phones write into each other's Bluetooth inbox.
 *
 * Between strangers (session keys, from the cards):
 *   LIKE    head | sender session pk (32) | box(to sid 8, ts u32)
 *   MATCH   head | sender session pk (32) | box(to sid 8, identity pk 32, recognition key 16, account id 8, ts u32)
 *
 * Between matches (long-term shared key):
 *   MSG     head | tag 8 | secretbox(msg id 8, ts u32, kind u8, data)
 *   UNMATCH head | tag 8 | secretbox(ts u32)
 *
 * head = version << 4 | type. tag = hash8("mt", shared key, nonce) — it lets the receiver find the
 * right match without the envelope carrying any stable identifier.
 *
 * The same MSG ciphertext is what the server relays when two matches are apart, so chats are
 * end-to-end encrypted on both paths.
 */

export const ENV = { LIKE: 1, MATCH: 2, MSG: 3, UNMATCH: 4 } as const;
export const MSG_KIND = { TEXT: 0, KEYS: 1 } as const;

export interface Session {
  signPk: Uint8Array;
  signSk: Uint8Array;
}

const head = (type: number) => (PROTOCOL_VERSION << 4) | type;

export function envelopeType(env: Uint8Array): number | null {
  if (env.length < 2 || env[0] >> 4 !== PROTOCOL_VERSION) return null;
  const t = env[0] & 15;
  return t >= ENV.LIKE && t <= ENV.UNMATCH ? t : null;
}

export const nowSec = () => Math.floor(Date.now() / 1000);
const fresh = (ts: number, now: number) => Math.abs(ts - now) <= TIMING.maxSkewSeconds;

function sealToSession(type: number, me: Session, toSignPk: Uint8Array, payload: Uint8Array): Uint8Array {
  const theirBox = signToBoxPublic(toSignPk);
  if (!theirBox) throw new ProtocolError('bad recipient key');
  return concat(Uint8Array.of(head(type)), me.signPk, boxSeal(payload, theirBox, signToBoxSecret(me.signSk)));
}

export function encodeLike(me: Session, toSignPk: Uint8Array, ts = nowSec()): Uint8Array {
  return sealToSession(ENV.LIKE, me, toSignPk, new Writer().raw(sidOf(toSignPk)).u32(ts).finish());
}

export interface MatchPayload {
  identityPk: Uint8Array; // long-term X25519 public key
  recKey: Uint8Array; // 16 bytes
  accountId: Uint8Array; // 8 bytes, zeros when the person has no account yet
}

export function encodeMatch(me: Session, toSignPk: Uint8Array, p: MatchPayload, ts = nowSec()): Uint8Array {
  const body = new Writer()
    .raw(sidOf(toSignPk))
    .fixed(p.identityPk, 32)
    .fixed(p.recKey, 16)
    .fixed(p.accountId, 8)
    .u32(ts)
    .finish();
  return sealToSession(ENV.MATCH, me, toSignPk, body);
}

export type SessionEnvelope =
  | { type: 'like'; fromSignPk: Uint8Array; fromSid: Uint8Array; ts: number; to: Session }
  | ({ type: 'match'; fromSignPk: Uint8Array; fromSid: Uint8Array; ts: number; to: Session } & MatchPayload);

/** Opens a LIKE or MATCH addressed to any of our recent sessions. */
export function openSessionEnvelope(env: Uint8Array, mine: Session[], now = nowSec()): SessionEnvelope | null {
  const type = envelopeType(env);
  if (type !== ENV.LIKE && type !== ENV.MATCH) return null;
  if (env.length < 1 + 32 + NONCE_BYTES + 16) return null;
  const fromSignPk = env.slice(1, 33);
  const fromBox = signToBoxPublic(fromSignPk);
  if (!fromBox) return null;
  const sealed = env.slice(33);
  for (const s of mine) {
    const plain = boxOpen(sealed, fromBox, signToBoxSecret(s.signSk));
    if (!plain) continue;
    try {
      const r = new Reader(plain);
      if (!equal(r.raw(8), sidOf(s.signPk))) return null;
      const fromSid = sidOf(fromSignPk);
      if (type === ENV.LIKE) {
        const ts = r.u32();
        return fresh(ts, now) ? { type: 'like', fromSignPk, fromSid, ts, to: s } : null;
      }
      const identityPk = r.raw(32);
      const recKey = r.raw(16);
      const accountId = r.raw(8);
      const ts = r.u32();
      return fresh(ts, now) ? { type: 'match', fromSignPk, fromSid, ts, to: s, identityPk, recKey, accountId } : null;
    } catch {
      return null;
    }
  }
  return null;
}

const msgTag = (key: Uint8Array, nonce: Uint8Array) => tagged(8, 'mt', key, nonce);

export interface ChatPayload {
  msgId: Uint8Array; // 8 random bytes, used to de-duplicate across Bluetooth and internet
  ts: number;
  kind: number;
  data: Uint8Array;
}

/** The encrypted chat payload (nonce || ciphertext) — relayed as-is by the server. */
export function sealChat(key: Uint8Array, p: ChatPayload): Uint8Array {
  if (p.kind === MSG_KIND.TEXT && p.data.length > LIMITS.msgBytes) throw new ProtocolError('message too long');
  const plain = new Writer().fixed(p.msgId, 8).u32(p.ts).u8(p.kind).raw(p.data).finish();
  return secretSeal(plain, key);
}

export function openChat(key: Uint8Array, sealed: Uint8Array): ChatPayload | null {
  const plain = secretOpen(sealed, key);
  if (!plain) return null;
  try {
    const r = new Reader(plain);
    return { msgId: r.raw(8), ts: r.u32(), kind: r.u8(), data: r.rest() };
  } catch {
    return null;
  }
}

export function encodeMsg(key: Uint8Array, p: ChatPayload): Uint8Array {
  const sealed = sealChat(key, p);
  return concat(Uint8Array.of(head(ENV.MSG)), msgTag(key, sealed.slice(0, NONCE_BYTES)), sealed);
}

/** Wraps an already-sealed chat payload (e.g. one queued for the server) as a Bluetooth MSG envelope. */
export function msgEnvelopeFromSealed(key: Uint8Array, sealed: Uint8Array): Uint8Array {
  return concat(Uint8Array.of(head(ENV.MSG)), msgTag(key, sealed.slice(0, NONCE_BYTES)), sealed);
}

export function encodeUnmatch(key: Uint8Array, ts = nowSec()): Uint8Array {
  const sealed = secretSeal(new Writer().u32(ts).finish(), key);
  return concat(Uint8Array.of(head(ENV.UNMATCH)), msgTag(key, sealed.slice(0, NONCE_BYTES)), sealed);
}

export type MatchEnvelope<K> =
  | { type: 'msg'; match: K; payload: ChatPayload }
  | { type: 'unmatch'; match: K; ts: number };

/** Opens a MSG/UNMATCH by finding which of our matches' keys it was sealed with. */
export function openMatchEnvelope<K extends { key: Uint8Array }>(
  env: Uint8Array,
  matches: K[],
  now = nowSec(),
): MatchEnvelope<K> | null {
  const type = envelopeType(env);
  if (type !== ENV.MSG && type !== ENV.UNMATCH) return null;
  if (env.length < 1 + 8 + NONCE_BYTES + 16) return null;
  const tag = env.slice(1, 9);
  const sealed = env.slice(9);
  const nonce = sealed.slice(0, NONCE_BYTES);
  const match = matches.find((m) => equal(msgTag(m.key, nonce), tag));
  if (!match) return null;
  if (type === ENV.MSG) {
    const payload = openChat(match.key, sealed);
    return payload ? { type: 'msg', match, payload } : null;
  }
  const plain = secretOpen(sealed, match.key);
  if (!plain || plain.length < 4) return null;
  const ts = new Reader(plain).u32();
  return fresh(ts, now) ? { type: 'unmatch', match, ts } : null;
}

export const newMsgId = () => randomBytes(8);
export const textPayload = (text: string, ts = nowSec()): ChatPayload => ({
  msgId: newMsgId(),
  ts,
  kind: MSG_KIND.TEXT,
  data: utf8.encode(text),
});
