import { Reader, Writer, concat, utf8 } from './bytes';
import { PASS_BYTES } from './constants';
import { tagged, sign, verify } from './crypto';
import nacl from 'tweetnacl';

/**
 * A nearby pass is the server vouching for a session key without revealing who owns it.
 *
 *   u32  expiry (unix seconds)
 *   24   secretbox(account id, 8 bytes) under a key only the server knows;
 *        the nonce is derived from the session key, so it isn't sent
 *   64   server Ed25519 signature over ("bls-pass", session pk, expiry, encrypted id)
 *
 * Anyone with the app can check the signature offline ("verified" badge). Only the server can
 * open the encrypted id — which is what makes a report against a stranger in a club actionable.
 */

const passNonce = (sessionSignPk: Uint8Array) => tagged(24, 'pass-nonce', sessionSignPk);
const signedPart = (sessionSignPk: Uint8Array, head: Uint8Array) =>
  concat(utf8.encode('bls-pass'), sessionSignPk, head);

export interface IssuePassInput {
  sessionSignPk: Uint8Array;
  accountId: Uint8Array; // 8 bytes
  expiresAt: number; // unix seconds
  serverSignSk: Uint8Array;
  serverSecret: Uint8Array; // 32 bytes
}

export function issuePass(i: IssuePassInput): Uint8Array {
  if (i.accountId.length !== 8) throw new Error('account id must be 8 bytes');
  const enc = nacl.secretbox(i.accountId, passNonce(i.sessionSignPk), i.serverSecret);
  const head = new Writer().u32(i.expiresAt).raw(enc).finish();
  const out = concat(head, sign(signedPart(i.sessionSignPk, head), i.serverSignSk));
  if (out.length !== PASS_BYTES) throw new Error('bad pass length');
  return out;
}

/** Offline check done by phones: is this pass genuine, bound to this card's key, and unexpired? */
export function checkPass(
  pass: Uint8Array,
  sessionSignPk: Uint8Array,
  serverSignPk: Uint8Array,
  nowSec: number,
): { expiresAt: number } | null {
  if (pass.length !== PASS_BYTES) return null;
  const head = pass.slice(0, 28);
  const sig = pass.slice(28);
  if (!verify(signedPart(sessionSignPk, head), sig, serverSignPk)) return null;
  const expiresAt = new Reader(head).u32();
  return expiresAt > nowSec ? { expiresAt } : null;
}

/** Server-only: recover the account id behind a pass. */
export function openPass(pass: Uint8Array, sessionSignPk: Uint8Array, serverSecret: Uint8Array): Uint8Array | null {
  if (pass.length !== PASS_BYTES) return null;
  const enc = pass.slice(4, 28);
  return nacl.secretbox.open(enc, passNonce(sessionSignPk), serverSecret) ?? null;
}
