import {
  LIMITS,
  MIN_AGE,
  ageFromDob,
  checkPass,
  hex,
  openPass,
  parseCard,
  snapToGrid,
} from '@bluesight/protocol';
import type { Ctx } from './context';
import { tx, type UserRow } from './db';
import { HttpError, bin, hexId, int, newHexId, nowSec, num, pack, str } from './util';

/**
 * One request does everything: the phone sends its queued changes (ops) and gets back everything
 * that happened since its cursor. On expensive networks the per-request overhead (TLS, headers)
 * often costs more than the payload, so the app batches into as few of these as possible.
 */

type Op = { k?: unknown; id?: unknown; [field: string]: unknown };

export interface SyncResult {
  c: number;
  acks: string[];
  errs?: { id: string; e: string }[];
  ch: unknown[];
  more?: 1;
}

const MAX_OPS = 100;
const MAX_CHANGES = 200;

export function sync(ctx: Ctx, user: UserRow, body: { c?: unknown; ops?: unknown }): SyncResult {
  const ops = Array.isArray(body.ops) ? (body.ops as Op[]).slice(0, MAX_OPS) : [];
  const acks: string[] = [];
  const errs: { id: string; e: string }[] = [];
  for (const op of ops) {
    const id = typeof op?.id === 'string' && op.id.length <= 32 ? op.id : null;
    if (!id) continue;
    const done = ctx.db.prepare('SELECT 1 FROM processed_ops WHERE user_id = ? AND op_id = ?').get(user.id, id);
    if (done) {
      acks.push(id);
      continue;
    }
    try {
      tx(ctx.db, () => {
        applyOp(ctx, user, op);
        ctx.db.prepare('INSERT INTO processed_ops (user_id, op_id, at) VALUES (?, ?, ?)').run(user.id, id, nowSec());
      });
      acks.push(id);
    } catch (e) {
      const code = e instanceof HttpError ? e.code : 'server_error';
      if (!(e instanceof HttpError)) console.error('op failed', op.k, e);
      // Bad ops are reported once and dropped by the client, so they never clog the queue.
      ctx.db.prepare('INSERT OR IGNORE INTO processed_ops (user_id, op_id, at) VALUES (?, ?, ?)').run(user.id, id, nowSec());
      errs.push({ id, e: code });
    }
    // Re-read the user so later ops see earlier profile/location updates.
    Object.assign(user, ctx.db.prepare('SELECT * FROM users WHERE id = ?').get(user.id));
  }
  ctx.db.prepare('UPDATE users SET last_active = ? WHERE id = ?').run(nowSec(), user.id);
  const cursor = typeof body.c === 'number' && body.c >= 0 ? body.c : 0;
  const { c, ch, more } = changesFor(ctx, user.id, cursor);
  return { c, acks, errs: errs.length ? errs : undefined, ch, more: more ? 1 : undefined };
}

function applyOp(ctx: Ctx, me: UserRow, op: Op) {
  switch (op.k) {
    case 'me':
      return updateProfile(ctx, me, op);
    case 'loc': {
      const p = snapToGrid(num(op.la, -90, 90, 'lat'), num(op.lo, -180, 180, 'lon'));
      ctx.db.prepare('UPDATE users SET lat = ?, lon = ?, away = ? WHERE id = ?').run(p.lat, p.lon, op.aw === 1 ? 1 : 0, me.id);
      return;
    }
    case 'sw':
      return swipe(ctx, me, hexId(op.to, 'to'), op.l === 1);
    case 'nl':
      return nearbyLink(ctx, me, hexId(op.to, 'to'));
    case 'msg':
      return message(ctx, me, hexId(op.m, 'match'), bin(op.b, [24 + 16 + 13, 24 + 16 + 13 + LIMITS.msgBytes + 32], 'body'));
    case 'um':
      return unmatch(ctx, me, hexId(op.m, 'match'));
    case 'blk':
      return block(ctx, me, hexId(op.to, 'to'));
    case 'rep':
      return report(ctx, me, op);
    default:
      throw new HttpError(400, 'unknown_op');
  }
}

function updateProfile(ctx: Ctx, me: UserRow, op: Op) {
  const name = str(op.n, LIMITS.nameBytes, 'name', 1);
  const dob = str(op.dob, 10, 'dob', 10);
  const age = ageFromDob(dob);
  if (age === null) throw new HttpError(400, 'bad_dob');
  if (age < MIN_AGE) throw new HttpError(400, 'underage');
  const gender = int(op.g ?? 0, 0, 3, 'gender');
  const showMe = int(op.sm ?? 7, 1, 7, 'show_me');
  const ageMin = int(op.amin ?? MIN_AGE, MIN_AGE, 99, 'age_min');
  const ageMax = int(op.amax ?? 60, ageMin, 99, 'age_max');
  const intent = int(op.i ?? 0, 0, 4, 'intent');
  const vibes = int(op.v ?? 0, 0, 0xffffffff, 'vibes');
  const bio = op.b == null ? '' : str(op.b, LIMITS.bioBytes, 'bio');
  const pk = bin(op.pk, 32, 'identity');
  const radius = int(op.r ?? 25, 1, 200, 'radius');
  const livesIn = op.li == null ? '' : str(op.li, LIMITS.nameBytes, 'lives_in');
  ctx.db
    .prepare(
      `UPDATE users SET name = ?, dob = ?, gender = ?, show_me = ?, age_min = ?, age_max = ?, intent = ?, vibes = ?,
       bio = ?, identity_pk = ?, radius_km = ?, lives_in = ? WHERE id = ?`,
    )
    .run(name, dob, gender, showMe, ageMin, ageMax, intent, vibes, bio, pk, radius, livesIn, me.id);
}

const pair = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

function isBlocked(ctx: Ctx, a: string, b: string): boolean {
  return !!ctx.db
    .prepare('SELECT 1 FROM blocks WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)')
    .get(a, b, b, a);
}

function addChange(ctx: Ctx, userId: string, kind: 'match' | 'msg' | 'um', ref: string) {
  ctx.db.prepare('INSERT INTO changes (user_id, kind, ref, at) VALUES (?, ?, ?, ?)').run(userId, kind, ref, nowSec());
}

function createMatch(ctx: Ctx, a: string, b: string, source: 'around' | 'nearby'): string | null {
  const [x, y] = pair(a, b);
  const existing = ctx.db.prepare('SELECT id FROM matches WHERE a = ? AND b = ?').get(x, y) as { id: string } | undefined;
  if (existing) return existing.id;
  if (isBlocked(ctx, a, b)) return null;
  const other = ctx.db.prepare('SELECT banned FROM users WHERE id = ?').get(a === x ? y : x) as { banned: number } | undefined;
  if (!other) return null;
  const id = newHexId(6);
  ctx.db.prepare('INSERT INTO matches (id, a, b, source, created_at) VALUES (?, ?, ?, ?, ?)').run(id, x, y, source, nowSec());
  addChange(ctx, a, 'match', id);
  addChange(ctx, b, 'match', id);
  return id;
}

function swipe(ctx: Ctx, me: UserRow, to: string, liked: boolean) {
  if (to === me.id) throw new HttpError(400, 'bad_to');
  ctx.db
    .prepare('INSERT INTO swipes (from_id, to_id, liked, at) VALUES (?, ?, ?, ?) ON CONFLICT(from_id, to_id) DO UPDATE SET liked = excluded.liked, at = excluded.at')
    .run(me.id, to, liked ? 1 : 0, nowSec());
  if (!liked) return;
  const back = ctx.db.prepare('SELECT liked FROM swipes WHERE from_id = ? AND to_id = ?').get(to, me.id) as { liked: number } | undefined;
  if (back?.liked) createMatch(ctx, me.id, to, 'around');
}

/** Two people who matched over Bluetooth each claim the other; when both have, the match moves online. */
function nearbyLink(ctx: Ctx, me: UserRow, to: string) {
  if (to === me.id) throw new HttpError(400, 'bad_to');
  ctx.db.prepare('INSERT OR REPLACE INTO nearby_claims (from_id, to_id, at) VALUES (?, ?, ?)').run(me.id, to, nowSec());
  const back = ctx.db.prepare('SELECT at FROM nearby_claims WHERE from_id = ? AND to_id = ?').get(to, me.id) as { at: number } | undefined;
  if (back && nowSec() - back.at < 14 * 86400) createMatch(ctx, me.id, to, 'nearby');
}

interface MatchRow {
  id: string;
  a: string;
  b: string;
  source: string;
  created_at: number;
  closed_at: number | null;
}

function myOpenMatch(ctx: Ctx, me: UserRow, matchId: string): { m: MatchRow; other: string } {
  const m = ctx.db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId) as MatchRow | undefined;
  if (!m || (m.a !== me.id && m.b !== me.id)) throw new HttpError(400, 'no_match');
  if (m.closed_at) throw new HttpError(400, 'match_closed');
  return { m, other: m.a === me.id ? m.b : m.a };
}

function message(ctx: Ctx, me: UserRow, matchId: string, body: Uint8Array) {
  const { other } = myOpenMatch(ctx, me, matchId);
  const r = ctx.db
    .prepare('INSERT INTO messages (match_id, from_id, to_id, body, at) VALUES (?, ?, ?, ?, ?)')
    .run(matchId, me.id, other, body, nowSec());
  addChange(ctx, other, 'msg', String(r.lastInsertRowid));
}

function closeMatch(ctx: Ctx, m: MatchRow, notify: string) {
  ctx.db.prepare('UPDATE matches SET closed_at = ? WHERE id = ? AND closed_at IS NULL').run(nowSec(), m.id);
  addChange(ctx, notify, 'um', m.id);
}

function unmatch(ctx: Ctx, me: UserRow, matchId: string) {
  const { m, other } = myOpenMatch(ctx, me, matchId);
  closeMatch(ctx, m, other);
}

function block(ctx: Ctx, me: UserRow, to: string) {
  ctx.db.prepare('INSERT OR IGNORE INTO blocks (from_id, to_id, at) VALUES (?, ?, ?)').run(me.id, to, nowSec());
  const [x, y] = pair(me.id, to);
  const m = ctx.db.prepare('SELECT * FROM matches WHERE a = ? AND b = ? AND closed_at IS NULL').get(x, y) as MatchRow | undefined;
  if (m) closeMatch(ctx, m, to);
}

const REASONS = new Set(['harassment', 'fake', 'underage', 'unsafe', 'spam', 'other']);
const AUTO_HIDE_REPORTERS = 3;

/**
 * Reports work for strangers met over Bluetooth too: the reporter sends the signed card they saw;
 * the pass inside it tells the server (and only the server) whose account it was.
 */
function report(ctx: Ctx, me: UserRow, op: Op) {
  const reason = typeof op.r === 'string' && REASONS.has(op.r) ? op.r : 'other';
  const note = op.note == null ? null : str(op.note, 500, 'note');
  let target: string | null = op.to == null ? null : hexId(op.to, 'to');
  let card: Uint8Array | undefined;
  if (!target && op.card != null) {
    card = bin(op.card, [40, LIMITS.attrBytes], 'card');
    const parsed = parseCard(card);
    if (!parsed) throw new HttpError(400, 'bad_card');
    const pass = parsed.card.pass;
    // Signature is checked with now = 0 so a pass that expired since the incident still counts.
    if (pass && checkPass(pass, parsed.card.signPk, ctx.keys.sign.publicKey, 0)) {
      const id = openPass(pass, parsed.card.signPk, ctx.keys.passSecret);
      if (id) target = hex.encode(id);
    }
  }
  const evidence = Array.isArray(op.ev) ? op.ev.filter((s) => typeof s === 'string').slice(0, 10).map((s) => (s as string).slice(0, 500)) : [];
  ctx.db
    .prepare('INSERT INTO reports (reporter_id, target_id, reason, note, evidence, at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(me.id, target, reason, note, pack({ card, ev: evidence }), nowSec());
  if (target && target !== me.id) {
    block(ctx, me, target);
    const n = ctx.db
      .prepare('SELECT COUNT(DISTINCT reporter_id) AS n FROM reports WHERE target_id = ? AND at > ?')
      .get(target, nowSec() - 7 * 86400) as { n: number };
    // Hidden pending human review (banned = 2); a moderator decides whether it becomes permanent.
    if (n.n >= AUTO_HIDE_REPORTERS) ctx.db.prepare('UPDATE users SET banned = 2 WHERE id = ? AND banned = 0').run(target);
  }
}

export function publicProfile(u: UserRow, withIdentity: boolean) {
  return {
    id: u.id,
    n: u.name ?? '',
    a: u.dob ? ageFromDob(u.dob) ?? 0 : 0,
    g: u.gender,
    i: u.intent,
    v: u.vibes,
    b: u.bio,
    li: u.lives_in || undefined,
    th: u.thumbhash ?? undefined,
    p: u.photo_key ?? undefined,
    ps: u.photo_key ? [u.photo_s, u.photo_f] : undefined,
    pk: withIdentity ? u.identity_pk ?? undefined : undefined,
  };
}

function changesFor(ctx: Ctx, userId: string, cursor: number): { c: number; ch: unknown[]; more: boolean } {
  const rows = ctx.db
    .prepare('SELECT seq, kind, ref FROM changes WHERE user_id = ? AND seq > ? ORDER BY seq LIMIT ?')
    .all(userId, cursor, MAX_CHANGES) as { seq: number; kind: string; ref: string }[];
  const ch: unknown[] = [];
  for (const r of rows) {
    if (r.kind === 'match') {
      const m = ctx.db.prepare('SELECT * FROM matches WHERE id = ?').get(r.ref) as MatchRow | undefined;
      if (!m) continue;
      const other = ctx.db.prepare('SELECT * FROM users WHERE id = ?').get(m.a === userId ? m.b : m.a) as UserRow | undefined;
      if (!other) continue;
      ch.push({ k: 'm', m: m.id, src: m.source, at: m.created_at, u: publicProfile(other, true) });
    } else if (r.kind === 'msg') {
      const msg = ctx.db.prepare('SELECT * FROM messages WHERE seq = ?').get(Number(r.ref)) as
        | { match_id: string; from_id: string; body: Uint8Array; at: number }
        | undefined;
      if (msg) ch.push({ k: 'x', m: msg.match_id, f: msg.from_id, b: msg.body, at: msg.at });
    } else if (r.kind === 'um') {
      ch.push({ k: 'um', m: r.ref });
    }
  }
  return { c: rows.length ? rows[rows.length - 1].seq : cursor, ch, more: rows.length === MAX_CHANGES };
}
