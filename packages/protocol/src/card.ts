import { ProtocolError, Reader, Writer, concat, equal, utf8 } from './bytes';
import { LIMITS, PASS_BYTES, PROTOCOL_VERSION } from './constants';
import { hashN, sign, tagged, verify } from './crypto';

/**
 * The card is what a phone serves over Bluetooth while Nearby is on — the "profile" strangers see.
 * It's signed by a per-day session key, so it can't be altered or forged by anyone else, and the
 * session key can't be linked to the person's account (only the server can do that, via the pass).
 *
 * Layout (v1), big-endian:
 *   u8   version
 *   u8   flags            bit0 = has photo, bit1 = has pass
 *   32   session sign pk  (Ed25519) — the session id is hash8(pk)
 *   8    recognition tag  lets existing matches recognise you; looks random to everyone else
 *   u8   age
 *   u8   gender | intent << 4
 *   u32  vibes bitmask
 *   s8   name             (≤ 30 bytes)
 *   s8   bio              (≤ 140 bytes)
 *   b8   thumbhash        (~25 bytes, a blurry colour preview of the photo)
 *   [u16 photo length, 4 photo hash]   if flags.bit0
 *   [92  nearby pass]                  if flags.bit1
 *   64   signature over everything above
 */
export interface Card {
  signPk: Uint8Array;
  rtag: Uint8Array;
  age: number;
  gender: number;
  intent: number;
  vibes: number;
  name: string;
  bio: string;
  thumbhash: Uint8Array;
  photo?: { len: number; hash: Uint8Array };
  pass?: Uint8Array;
}

const SIG_BYTES = 64;
const FLAG_PHOTO = 1;
const FLAG_PASS = 2;

/** Session id: short, unlinkable, derived from the session key. */
export const sidOf = (signPk: Uint8Array): Uint8Array => tagged(8, 'sid', signPk);

/** 4-byte fingerprint of a photo, so a phone can check the bytes it pulled over Bluetooth. */
export const photoHash = (photo: Uint8Array): Uint8Array => hashN(4, photo);

/** Tag that only people holding your recognition key (your matches) can check against your sid. */
export const recognitionTag = (recKey: Uint8Array, sid: Uint8Array): Uint8Array => tagged(8, 'rt', recKey, sid);

export function encodeCard(card: Card, signSk: Uint8Array): Uint8Array {
  const w = new Writer();
  const flags = (card.photo ? FLAG_PHOTO : 0) | (card.pass ? FLAG_PASS : 0);
  w.u8(PROTOCOL_VERSION).u8(flags);
  w.fixed(card.signPk, 32).fixed(card.rtag, 8);
  w.u8(Math.max(0, Math.min(255, card.age | 0)));
  w.u8((card.gender & 15) | ((card.intent & 15) << 4));
  w.u32(card.vibes >>> 0);
  w.str8(card.name, LIMITS.nameBytes);
  w.str8(card.bio, LIMITS.bioBytes);
  if (card.thumbhash.length > LIMITS.thumbhashBytes) throw new ProtocolError('thumbhash too long');
  w.bytes8(card.thumbhash);
  if (card.photo) w.u16(card.photo.len).fixed(card.photo.hash, 4);
  if (card.pass) w.fixed(card.pass, PASS_BYTES);
  const body = w.finish();
  const out = concat(body, sign(concat(utf8.encode('bls-card'), body), signSk));
  if (out.length > LIMITS.attrBytes) throw new ProtocolError(`card too large (${out.length})`);
  return out;
}

export interface ParsedCard {
  card: Card;
  sid: Uint8Array;
}

/** Decodes and checks the signature. Returns null for anything malformed or forged. */
export function parseCard(bytes: Uint8Array): ParsedCard | null {
  try {
    if (bytes.length < 2 + 32 + 8 + 6 + 3 + SIG_BYTES || bytes.length > LIMITS.attrBytes) return null;
    const body = bytes.slice(0, bytes.length - SIG_BYTES);
    const sig = bytes.slice(bytes.length - SIG_BYTES);
    const r = new Reader(body);
    if (r.u8() !== PROTOCOL_VERSION) return null;
    const flags = r.u8();
    const signPk = r.raw(32);
    if (!verify(concat(utf8.encode('bls-card'), body), sig, signPk)) return null;
    const rtag = r.raw(8);
    const age = r.u8();
    const gi = r.u8();
    const vibes = r.u32();
    const name = r.str8();
    const bio = r.str8();
    const thumbhash = r.bytes8();
    const card: Card = { signPk, rtag, age, gender: gi & 15, intent: gi >> 4, vibes, name, bio, thumbhash };
    if (flags & FLAG_PHOTO) card.photo = { len: r.u16(), hash: r.raw(4) };
    if (flags & FLAG_PASS) card.pass = r.raw(PASS_BYTES);
    if (r.remaining !== 0) return null;
    return { card, sid: sidOf(signPk) };
  } catch {
    return null;
  }
}

/** True when this card belongs to someone holding recKey (i.e. one of your matches). */
export function recognises(recKey: Uint8Array, parsed: ParsedCard): boolean {
  return equal(recognitionTag(recKey, parsed.sid), parsed.card.rtag);
}
