import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { signKeyPairFromSeed, type KeyPair } from '@bluesight/protocol';

export interface ServerKeys {
  /** signs nearby passes; the public half is shipped to every phone */
  sign: KeyPair;
  /** encrypts account ids inside passes; never leaves the server */
  passSecret: Uint8Array;
  /** mixed into OTP hashes */
  otpPepper: string;
}

/** Generated on first start and kept in DATA_DIR. Back this file up: losing it invalidates all passes. */
export function loadOrCreateKeys(dataDir: string): ServerKeys {
  const file = path.join(dataDir, 'server-keys.json');
  let raw: { signSeed: string; passSecret: string; otpPepper: string };
  if (fs.existsSync(file)) raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  else {
    raw = {
      signSeed: randomBytes(32).toString('base64'),
      passSecret: randomBytes(32).toString('base64'),
      otpPepper: randomBytes(16).toString('hex'),
    };
    fs.writeFileSync(file, JSON.stringify(raw, null, 2), { mode: 0o600 });
  }
  return {
    sign: signKeyPairFromSeed(new Uint8Array(Buffer.from(raw.signSeed, 'base64'))),
    passSecret: new Uint8Array(Buffer.from(raw.passSecret, 'base64')),
    otpPepper: raw.otpPepper,
  };
}
