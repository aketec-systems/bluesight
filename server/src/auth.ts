import { randomBytes, randomInt } from 'node:crypto';
import type { Ctx } from './context';
import type { UserRow } from './db';
import { HttpError, newHexId, nowSec, sha256 } from './util';

const CODE_TTL = 600;
const SEND_WINDOW = 900;
const MAX_SENDS = 3;
const MAX_ATTEMPTS = 5;

export function normalizePhone(raw: unknown): string {
  const s = String(raw ?? '').replace(/[\s\-().]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(s)) throw new HttpError(400, 'bad_phone');
  return s;
}

const codeHash = (ctx: Ctx, phone: string, code: string) => sha256(`${phone}:${code}:${ctx.keys.otpPepper}`);

interface OtpRow {
  phone: string;
  code_hash: string;
  expires_at: number;
  attempts: number;
  sent_count: number;
  window_start: number;
}

/** Sends a 6-digit code. Returns the code only in dev mode (so the app can show it). */
export async function startOtp(ctx: Ctx, phone: string): Promise<string | undefined> {
  const t = nowSec();
  const row = ctx.db.prepare('SELECT * FROM otps WHERE phone = ?').get(phone) as OtpRow | undefined;
  const inWindow = !!row && t - row.window_start < SEND_WINDOW;
  if (inWindow && row!.sent_count >= MAX_SENDS) throw new HttpError(429, 'too_many_codes');
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  ctx.db
    .prepare(
      `INSERT INTO otps (phone, code_hash, expires_at, attempts, sent_count, window_start) VALUES (?, ?, ?, 0, ?, ?)
       ON CONFLICT(phone) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at,
         attempts = 0, sent_count = excluded.sent_count, window_start = excluded.window_start`,
    )
    .run(phone, codeHash(ctx, phone, code), t + CODE_TTL, inWindow ? row!.sent_count + 1 : 1, inWindow ? row!.window_start : t);
  await ctx.sms.send(phone, `Your Bluesight code is ${code}`);
  return ctx.dev ? code : undefined;
}

export function verifyOtp(ctx: Ctx, phone: string, code: string): { token: string; user: UserRow; isNew: boolean } {
  const t = nowSec();
  const row = ctx.db.prepare('SELECT * FROM otps WHERE phone = ?').get(phone) as OtpRow | undefined;
  if (!row || row.expires_at < t) throw new HttpError(400, 'code_expired');
  if (row.attempts >= MAX_ATTEMPTS) throw new HttpError(429, 'too_many_attempts');
  if (codeHash(ctx, phone, String(code)) !== row.code_hash) {
    ctx.db.prepare('UPDATE otps SET attempts = attempts + 1 WHERE phone = ?').run(phone);
    throw new HttpError(400, 'wrong_code');
  }
  ctx.db.prepare('DELETE FROM otps WHERE phone = ?').run(phone);
  let user = ctx.db.prepare('SELECT * FROM users WHERE phone = ?').get(phone) as UserRow | undefined;
  const isNew = !user;
  if (!user) {
    ctx.db.prepare('INSERT INTO users (id, phone, created_at, last_active) VALUES (?, ?, ?, ?)').run(newHexId(8), phone, t, t);
    user = ctx.db.prepare('SELECT * FROM users WHERE phone = ?').get(phone) as unknown as UserRow;
  }
  const token = randomBytes(32).toString('base64url');
  ctx.db.prepare('INSERT INTO sessions (token_hash, user_id, created_at) VALUES (?, ?, ?)').run(sha256(token), user.id, t);
  return { token, user, isNew };
}

export function userFromAuthHeader(ctx: Ctx, header: string | undefined): UserRow {
  const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new HttpError(401, 'unauthorized');
  const row = ctx.db
    .prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?')
    .get(sha256(token)) as UserRow | undefined;
  if (!row) throw new HttpError(401, 'unauthorized');
  if (row.banned === 1) throw new HttpError(403, 'banned');
  return row;
}
