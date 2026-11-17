import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { hex, issuePass } from '@bluesight/protocol';
import { normalizePhone, startOtp, userFromAuthHeader, verifyOtp } from './auth';
import type { Ctx } from './context';
import { openDb, type UserRow } from './db';
import { clearAwayLocation, deckFor, updateLocation } from './deck';
import { isJpeg, stripJpegMetadata } from './jpeg';
import { loadOrCreateKeys } from './keys';
import { consoleSms, type SmsProvider } from './sms';
import { publicProfile, sync } from './sync';
import { HttpError, bin, int, newHexId, nowSec, num, pack, unpack } from './util';

export interface AppOptions {
  dataDir: string;
  dev?: boolean;
  sms?: SmsProvider;
  logger?: boolean;
}

const PHOTO_LIMITS = { s: 60_000, f: 220_000 } as const;
const MAX_PASSES_PER_DAY = 14;

export async function buildApp(opts: AppOptions) {
  fs.mkdirSync(path.join(opts.dataDir, 'photos'), { recursive: true });
  const ctx: Ctx = {
    db: openDb(path.join(opts.dataDir, 'bluesight.db')),
    keys: loadOrCreateKeys(opts.dataDir),
    sms: opts.sms ?? consoleSms,
    dataDir: opts.dataDir,
    dev: !!opts.dev,
  };

  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 400 * 1024 });
  app.decorate('ctx', ctx);

  app.addContentTypeParser('application/msgpack', { parseAs: 'buffer' }, (_req, body, done) => {
    try {
      done(null, unpack(body as Buffer));
    } catch {
      done(new HttpError(400, 'bad_body'), undefined);
    }
  });

  const send = (reply: FastifyReply, value: unknown, status = 200) =>
    reply.code(status).header('content-type', 'application/msgpack').send(pack(value));

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) return send(reply, { e: err.code }, err.status);
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return send(reply, { e: 'bad_request' }, status);
    app.log.error(err);
    return send(reply, { e: 'server_error' }, 500);
  });

  const body = (req: FastifyRequest) => (req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {});
  const authed = (req: FastifyRequest): UserRow => userFromAuthHeader(ctx, req.headers.authorization);

  app.get('/health', async (_req, reply) => reply.send('ok'));

  /** Public key phones use to verify nearby passes offline. Cache forever. */
  app.get('/v1/info', async (_req, reply) => {
    reply.header('cache-control', 'public, max-age=86400');
    return send(reply, { v: 1, spk: ctx.keys.sign.publicKey });
  });

  app.post('/v1/auth/start', async (req, reply) => {
    const phone = normalizePhone(body(req).ph);
    const dev = await startOtp(ctx, phone);
    return send(reply, { ok: 1, dev });
  });

  app.post('/v1/auth/verify', async (req, reply) => {
    const b = body(req);
    const phone = normalizePhone(b.ph);
    const { token, user, isNew } = verifyOtp(ctx, phone, String(b.code ?? ''));
    return send(reply, {
      tk: token,
      uid: user.id,
      new: isNew ? 1 : undefined,
      spk: ctx.keys.sign.publicKey,
      me: user.name ? publicProfile(user, false) : undefined,
    });
  });

  app.post('/v1/sync', async (req, reply) => send(reply, sync(ctx, authed(req), body(req))));

  app.post('/v1/deck', async (req, reply) => {
    const me = authed(req);
    const b = body(req);
    if (b.la != null && b.lo != null) updateLocation(ctx, me, num(b.la, -90, 90, 'lat'), num(b.lo, -180, 180, 'lon'), b.aw === 1);
    else if (b.aw === 0 && me.away) clearAwayLocation(ctx, me);
    const n = b.n == null ? 20 : int(b.n, 1, 30, 'n');
    return send(reply, { cards: deckFor(ctx, me, n) });
  });

  /** Photos arrive already resized on the phone: s ≈ 320 px (~12 KB), f ≈ 800 px (~60 KB). */
  app.post('/v1/photo', async (req, reply) => {
    const me = authed(req);
    const b = body(req);
    const v = b.v === 'f' ? 'f' : b.v === 's' ? 's' : null;
    if (!v) throw new HttpError(400, 'bad_variant');
    const img = bin(b.img, [100, PHOTO_LIMITS[v]], 'img');
    if (!isJpeg(img)) throw new HttpError(400, 'not_jpeg');
    let clean: Uint8Array;
    try {
      clean = stripJpegMetadata(img);
    } catch {
      throw new HttpError(400, 'bad_jpeg');
    }
    const dir = path.join(ctx.dataDir, 'photos');
    if (v === 's') {
      const th = bin(b.th, [1, 40], 'thumbhash');
      const key = newHexId(6);
      fs.writeFileSync(path.join(dir, `${key}_s.jpg`), clean);
      if (me.photo_key) for (const old of ['s', 'f']) fs.rmSync(path.join(dir, `${me.photo_key}_${old}.jpg`), { force: true });
      ctx.db.prepare('UPDATE users SET photo_key = ?, thumbhash = ?, photo_s = ?, photo_f = 0 WHERE id = ?').run(key, th, clean.length, me.id);
      return send(reply, { p: key });
    }
    if (!me.photo_key) throw new HttpError(400, 'upload_small_first');
    fs.writeFileSync(path.join(dir, `${me.photo_key}_f.jpg`), clean);
    ctx.db.prepare('UPDATE users SET photo_f = ? WHERE id = ?').run(clean.length, me.id);
    return send(reply, { p: me.photo_key });
  });

  /** Content-addressed (the key changes when the photo does), so phones and proxies cache forever. */
  app.get('/p/:key/:v', async (req, reply) => {
    const { key, v } = req.params as { key: string; v: string };
    if (!/^[0-9a-f]{12}$/.test(key) || !/^[sf](\.jpg)?$/.test(v)) throw new HttpError(404, 'not_found');
    const dir = path.join(ctx.dataDir, 'photos');
    let file = path.join(dir, `${key}_${v[0]}.jpg`);
    if (!fs.existsSync(file)) file = path.join(dir, `${key}_s.jpg`);
    if (!fs.existsSync(file)) throw new HttpError(404, 'not_found');
    reply.header('content-type', 'image/jpeg').header('cache-control', 'public, max-age=31536000, immutable');
    return reply.send(fs.readFileSync(file));
  });

  /**
   * Issues nearby passes for session keys the phone generated (one per upcoming day). The phone
   * puts one in its Bluetooth card; strangers can verify it offline, only we can open it.
   */
  app.post('/v1/passes', async (req, reply) => {
    const me = authed(req);
    if (!me.name) throw new HttpError(400, 'no_profile');
    if (me.banned) throw new HttpError(403, 'banned');
    const pks = Array.isArray(body(req).pks) ? (body(req).pks as unknown[]) : [];
    if (pks.length < 1 || pks.length > 7) throw new HttpError(400, 'bad_pks');
    const keys = pks.map((pk) => bin(pk, 32, 'pk'));
    const t = nowSec();
    const recent = ctx.db.prepare('SELECT COUNT(*) AS n FROM pass_log WHERE user_id = ? AND at > ?').get(me.id, t - 86400) as { n: number };
    if (recent.n + keys.length > MAX_PASSES_PER_DAY) throw new HttpError(429, 'too_many_passes');
    const accountId = hex.decode(me.id);
    const ps = keys.map((sessionSignPk, i) => {
      ctx.db.prepare('INSERT INTO pass_log (user_id, at) VALUES (?, ?)').run(me.id, t);
      return issuePass({
        sessionSignPk,
        accountId,
        expiresAt: t + (i + 1) * 86400,
        serverSignSk: ctx.keys.sign.secretKey,
        serverSecret: ctx.keys.passSecret,
      });
    });
    return send(reply, { ps });
  });

  app.addHook('onClose', async () => ctx.db.close());
  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    ctx: Ctx;
  }
}
