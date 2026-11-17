import nacl from 'tweetnacl';
import ed2curve from 'ed2curve';
import { concat, utf8 } from './bytes';

// All crypto goes through this file so the app and server share one tweetnacl instance.
// Primitives: Ed25519 signatures, X25519 + XSalsa20-Poly1305 boxes, SHA-512.

export const NONCE_BYTES = 24;
export const MAC_BYTES = 16;

/**
 * React Native (Hermes) has no WebCrypto, so the app passes a secure random source
 * (expo-crypto) here before using anything else. Browsers and Node are detected automatically.
 */
export function setRandomSource(fill: (n: number) => Uint8Array) {
  nacl.setPRNG((x: Uint8Array, n: number) => {
    const r = fill(n);
    for (let i = 0; i < n; i++) x[i] = r[i];
  });
}

export const randomBytes = (n: number): Uint8Array => nacl.randomBytes(n);

/** First n bytes of SHA-512 over the parts. Inputs are fixed-length, so this is safe as a keyed PRF. */
export function hashN(n: number, ...parts: Uint8Array[]): Uint8Array {
  return nacl.hash(concat(...parts)).slice(0, n);
}

/** Domain-separated short hash: hashN(n, "label", ...parts). */
export function tagged(n: number, label: string, ...parts: Uint8Array[]): Uint8Array {
  return hashN(n, utf8.encode(label), ...parts);
}

export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export const newBoxKeyPair = (): KeyPair => nacl.box.keyPair();
export const newSignKeyPair = (): KeyPair => nacl.sign.keyPair();
export const signKeyPairFromSeed = (seed: Uint8Array): KeyPair => nacl.sign.keyPair.fromSeed(seed);

/** Session keys are Ed25519; they're converted to X25519 for encryption so a card carries one key. */
export function signToBoxPublic(signPk: Uint8Array): Uint8Array | null {
  try {
    return ed2curve.convertPublicKey(signPk);
  } catch {
    return null;
  }
}
export const signToBoxSecret = (signSk: Uint8Array): Uint8Array => ed2curve.convertSecretKey(signSk);

export const sign = (msg: Uint8Array, signSk: Uint8Array): Uint8Array => nacl.sign.detached(msg, signSk);

export function verify(msg: Uint8Array, sig: Uint8Array, signPk: Uint8Array): boolean {
  try {
    return nacl.sign.detached.verify(msg, sig, signPk);
  } catch {
    return false;
  }
}

/** Authenticated public-key encryption. Output: nonce(24) || ciphertext(len + 16). */
export function boxSeal(msg: Uint8Array, theirBoxPk: Uint8Array, myBoxSk: Uint8Array): Uint8Array {
  const nonce = randomBytes(NONCE_BYTES);
  return concat(nonce, nacl.box(msg, nonce, theirBoxPk, myBoxSk));
}

export function boxOpen(sealed: Uint8Array, theirBoxPk: Uint8Array, myBoxSk: Uint8Array): Uint8Array | null {
  if (sealed.length < NONCE_BYTES + MAC_BYTES) return null;
  try {
    return nacl.box.open(sealed.slice(NONCE_BYTES), sealed.slice(0, NONCE_BYTES), theirBoxPk, myBoxSk) ?? null;
  } catch {
    return null;
  }
}

/** Precomputed X25519 shared key between two long-term identities (same value on both sides). */
export const sharedKey = (theirBoxPk: Uint8Array, myBoxSk: Uint8Array): Uint8Array => nacl.box.before(theirBoxPk, myBoxSk);

/** Symmetric authenticated encryption. Output: nonce(24) || ciphertext(len + 16). */
export function secretSeal(msg: Uint8Array, key: Uint8Array, nonce: Uint8Array = randomBytes(NONCE_BYTES)): Uint8Array {
  return concat(nonce, nacl.secretbox(msg, nonce, key));
}

export function secretOpen(sealed: Uint8Array, key: Uint8Array): Uint8Array | null {
  if (sealed.length < NONCE_BYTES + MAC_BYTES) return null;
  try {
    return nacl.secretbox.open(sealed.slice(NONCE_BYTES), sealed.slice(0, NONCE_BYTES), key) ?? null;
  } catch {
    return null;
  }
}
