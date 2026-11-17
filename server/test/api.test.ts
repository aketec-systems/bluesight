import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  encodeCard,
  equal,
  maskFromVibes,
  newBoxKeyPair,
  newSignKeyPair,
  openChat,
  randomBytes,
  recognitionTag,
  sealChat,
  sharedKey,
  sidOf,
  textPayload,
  utf8,
  checkPass,
} from '@bluesight/protocol';
import { buildApp } from '../src/app';
import { stripJpegMetadata } from '../src/jpeg';
import { pack, unpack } from '../src/util';

type App = Awaited<ReturnType<typeof buildApp>>;
let app: App;
let dir: string;
let phoneN = 100_000;

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bls-'));
  app = await buildApp({ dataDir: dir, dev: true, sms: { async send() {} } });
});
after(async () => {
  await app.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(url: string, body: unknown, token?: string): Promise<{ status: number; body: any; bytes: number }> {
  const res = await app.inject({
    method: 'POST',
    url,
    payload: pack(body),
    headers: { 'content-type': 'application/msgpack', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
  return { status: res.statusCode, body: unpack(res.rawPayload), bytes: res.rawPayload.length };
}

interface Person {
  token: string;
  uid: string;
  identity: ReturnType<typeof newBoxKeyPair>;
  cursor: number;
}

async function signup(profile: Record<string, unknown>, loc = { la: 6.3005, lo: -10.797 }): Promise<Person> {
  const ph = `+2318${phoneN++}`;
  const s = await call('/v1/auth/start', { ph });
  assert.equal(s.status, 200);
  const v = await call('/v1/auth/verify', { ph, code: s.body.dev });
  assert.equal(v.status, 200);
  const identity = newBoxKeyPair();
  const sy = await call(
    '/v1/sync',
    {
      c: 0,
      ops: [
        { k: 'me', id: 'p1', n: 'Test', dob: '1999-04-02', g: 1, sm: 2, v: maskFromVibes([0, 1]), b: 'Hi there', i: 1, ...profile, pk: identity.publicKey },
        { k: 'loc', id: 'l1', ...loc },
      ],
    },
    v.body.tk,
  );
  assert.equal(sy.status, 200);
  assert.deepEqual(sy.body.acks, ['p1', 'l1'], JSON.stringify(sy.body.errs));
  return { token: v.body.tk, uid: v.body.uid, identity, cursor: sy.body.c };
}

async function syncOps(p: Person, ops: unknown[] = []) {
  const r = await call('/v1/sync', { c: p.cursor, ops }, p.token);
  assert.equal(r.status, 200);
  p.cursor = r.body.c;
  return r;
}

test('auth: bad phone, wrong code, lockout', async () => {
  assert.equal((await call('/v1/auth/start', { ph: '0777' })).body.e, 'bad_phone');
  const ph = '+231770000001';
  const s = await call('/v1/auth/start', { ph });
  assert.match(s.body.dev, /^\d{6}$/);
  const wrong = s.body.dev === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) assert.equal((await call('/v1/auth/verify', { ph, code: wrong })).body.e, 'wrong_code');
  assert.equal((await call('/v1/auth/verify', { ph, code: s.body.dev })).body.e, 'too_many_attempts');
  assert.equal((await call('/v1/sync', { c: 0 })).status, 401);
});

test('profiles: under-18 is refused', async () => {
  const ph = '+231770000002';
  const s = await call('/v1/auth/start', { ph });
  const v = await call('/v1/auth/verify', { ph, code: s.body.dev });
  const r = await call(
    '/v1/sync',
    { c: 0, ops: [{ k: 'me', id: 'x', n: 'Kid', dob: '2012-01-01', g: 2, pk: randomBytes(32) }] },
    v.body.tk,
  );
  assert.deepEqual(r.body.errs, [{ id: 'x', e: 'underage' }]);
});

test('deck respects both sides’ preferences; mutual like makes an encrypted chat', async () => {
  const ama = await signup({ n: 'Ama', g: 1, sm: 2 }); // woman, shows men
  const kofi = await signup({ n: 'Kofi', g: 2, sm: 1 }); // man, shows women
  const sekou = await signup({ n: 'Sekou', g: 2, sm: 2 }); // man, shows men
  const far = await signup({ n: 'Far', g: 2, sm: 1 }, { la: 8.5, lo: -13.2 });

  const deck = (await call('/v1/deck', { n: 30 }, ama.token)).body.cards as { u: string; d: string }[];
  const ids = deck.map((c) => c.u);
  assert.ok(ids.includes(kofi.uid), 'Kofi shown to Ama');
  assert.ok(!ids.includes(sekou.uid), 'Sekou only wants men');
  assert.ok(!ids.includes(far.uid), 'out of radius');
  assert.equal(deck.find((c) => c.u === kofi.uid)?.d, 'Under 3 km');

  await syncOps(ama, [{ k: 'sw', id: 's1', to: kofi.uid, l: 1 }]);
  const k1 = await syncOps(kofi, [{ k: 'sw', id: 's1', to: ama.uid, l: 1 }]);
  const kMatch = k1.body.ch.find((c: { k: string }) => c.k === 'm');
  assert.ok(kMatch, 'Kofi sees the match');
  assert.ok(equal(kMatch.u.pk, ama.identity.publicKey), 'match carries the identity key');
  const a1 = await syncOps(ama);
  const aMatch = a1.body.ch.find((c: { k: string }) => c.k === 'm');
  assert.equal(aMatch.m, kMatch.m);

  // Ama -> Kofi, end-to-end encrypted; server only relays ciphertext
  const key = sharedKey(kofi.identity.publicKey, ama.identity.secretKey);
  const body = sealChat(key, textPayload('Meet at the bar? 🍹'));
  const op = { k: 'msg', id: 'm1', m: aMatch.m, b: body };
  await syncOps(ama, [op]);
  await syncOps(ama, [op]); // retry after a lost response must not duplicate
  const k2 = await syncOps(kofi);
  const msgs = k2.body.ch.filter((c: { k: string }) => c.k === 'x');
  assert.equal(msgs.length, 1);
  const opened = openChat(sharedKey(ama.identity.publicKey, kofi.identity.secretKey), msgs[0].b);
  assert.equal(utf8.decode(opened!.data), 'Meet at the bar? 🍹');
  console.log(`    sync with 1 message: ${k2.bytes} bytes`);

  // swiped people leave the deck; blocking closes the match on both sides
  assert.ok(!((await call('/v1/deck', {}, ama.token)).body.cards as { u: string }[]).some((c) => c.u === kofi.uid));
  await syncOps(kofi, [{ k: 'blk', id: 'b1', to: ama.uid }]);
  const a2 = await syncOps(ama);
  assert.ok(a2.body.ch.some((c: { k: string; m: string }) => c.k === 'um' && c.m === aMatch.m));
  const late = await syncOps(ama, [{ k: 'msg', id: 'm2', m: aMatch.m, b: body }]);
  assert.deepEqual(late.body.errs, [{ id: 'm2', e: 'match_closed' }]);
});

test('Bluetooth matches move online when both phones claim each other', async () => {
  const a = await signup({ n: 'Fatu', g: 1, sm: 2 });
  const b = await signup({ n: 'Jallah', g: 2, sm: 1 });
  const r1 = await syncOps(a, [{ k: 'nl', id: 'n1', to: b.uid }]);
  assert.ok(!r1.body.ch.some((c: { k: string }) => c.k === 'm'), 'one claim is not enough');
  const r2 = await syncOps(b, [{ k: 'nl', id: 'n1', to: a.uid }]);
  const m = r2.body.ch.find((c: { k: string }) => c.k === 'm');
  assert.equal(m.src, 'nearby');
});

test('nearby passes verify offline and make stranger reports actionable', async () => {
  const musu = await signup({ n: 'Musu', g: 1, sm: 2 });
  const reporter = await signup({ n: 'Reporter', g: 2, sm: 1 });
  const info = await app.inject({ method: 'GET', url: '/v1/info' });
  const spk = (unpack(info.rawPayload) as { spk: Uint8Array }).spk;

  const session = newSignKeyPair();
  const later = newSignKeyPair();
  const r = await call('/v1/passes', { pks: [session.publicKey, later.publicKey] }, musu.token);
  assert.equal(r.status, 200);
  const [pass, pass2] = r.body.ps as Uint8Array[];
  const now = Math.floor(Date.now() / 1000);
  assert.ok(checkPass(pass, session.publicKey, spk, now));
  assert.ok(checkPass(pass2, later.publicKey, spk, now + 86400 + 60), 'second pass covers tomorrow');

  const card = encodeCard(
    {
      signPk: session.publicKey,
      rtag: recognitionTag(randomBytes(16), sidOf(session.publicKey)),
      age: 26,
      gender: 1,
      intent: 1,
      vibes: 0,
      name: 'Musu',
      bio: '',
      thumbhash: randomBytes(20),
      pass,
    },
    session.secretKey,
  );
  const rep = await syncOps(reporter, [{ k: 'rep', id: 'r1', card, r: 'harassment', ev: ['bad words'] }]);
  assert.deepEqual(rep.body.acks, ['r1']);
  const row = app.ctx.db.prepare('SELECT target_id FROM reports WHERE reporter_id = ?').get(reporter.uid) as { target_id: string };
  assert.equal(row.target_id, musu.uid, 'server resolved the anonymous card to the account');

  const tooMany = await call('/v1/passes', { pks: Array.from({ length: 7 }, () => randomBytes(32)) }, musu.token);
  assert.equal(tooMany.body.ps.length, 7);
  assert.equal((await call('/v1/passes', { pks: Array.from({ length: 7 }, () => randomBytes(32)) }, musu.token)).status, 429);
});

function fakeJpeg(): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x10, ...Buffer.from('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0];
  const exif = [0xff, 0xe1, 0x00, 0x0e, ...Buffer.from('Exif\0\0'), 0x47, 0x50, 0x53, 0x21, 0, 0]; // "GPS!"
  const dqt = [0xff, 0xdb, 0x00, 0x05, 0, 1, 2];
  const sos = [0xff, 0xda, 0x00, 0x04, 9, 9, 0x12, 0x34, 0xff, 0x00, 0x56];
  return Uint8Array.from([0xff, 0xd8, ...app0, ...exif, ...dqt, ...sos, ...new Array(200).fill(7), 0xff, 0xd9]);
}

test('photos: metadata stripped, served with immutable caching', async () => {
  const stripped = stripJpegMetadata(fakeJpeg());
  assert.ok(!Buffer.from(stripped).includes(Buffer.from('Exif')), 'EXIF removed');
  assert.ok(Buffer.from(stripped).includes(Buffer.from('JFIF')), 'JFIF kept');
  assert.equal(stripped.length, fakeJpeg().length - 16);

  const p = await signup({ n: 'Kebeh', g: 1, sm: 2 });
  const up = await call('/v1/photo', { v: 's', img: fakeJpeg(), th: randomBytes(24) }, p.token);
  assert.equal(up.status, 200);
  const res = await app.inject({ method: 'GET', url: `/p/${up.body.p}/s` });
  assert.equal(res.statusCode, 200);
  assert.match(String(res.headers['cache-control']), /immutable/);
  assert.ok(!res.rawPayload.includes(Buffer.from('Exif')));
  assert.equal((await call('/v1/photo', { v: 's', img: randomBytes(500), th: randomBytes(24) }, p.token)).body.e, 'not_jpeg');
});

test('data cost: a 20-person deck and an empty sync', async () => {
  const viewer = await signup({ n: 'Viewer', g: 2, sm: 1 }, { la: 5.0, lo: 0.5 });
  for (let i = 0; i < 20; i++) {
    const p = await signup({ n: `Person ${i}`, g: 1, sm: 2, b: 'Afrobeats, jollof and good energy. Find me by the DJ booth.' }, { la: 5.0, lo: 0.5 });
    await call('/v1/photo', { v: 's', img: fakeJpeg(), th: randomBytes(24) }, p.token);
  }
  const deck = await call('/v1/deck', { n: 20 }, viewer.token);
  assert.equal(deck.body.cards.length, 20);
  const empty = await syncOps(viewer);
  console.log(`    deck of 20: ${deck.bytes} bytes body; empty sync: ${empty.bytes} bytes body`);
  assert.ok(deck.bytes < 4500, `deck is ${deck.bytes} bytes`);
  assert.ok(empty.bytes < 32);
});

test('diaspora search: browse a city back home, shown honestly to people there', async () => {
  // Kemah lives in Maryland and wants to meet people in Monrovia before flying home.
  const kemah = await signup({ n: 'Kemah', g: 2, sm: 1, li: 'Maryland, USA' }, { la: 39.0, lo: -76.9 });
  const yah = await signup({ n: 'Yah', g: 1, sm: 2 }, { la: 6.3, lo: -10.8 });
  type Card = { u: string; d: string; li?: string; aw?: number };

  const home = (await call('/v1/deck', { n: 30 }, kemah.token)).body.cards as Card[];
  assert.ok(!home.some((c) => c.u === yah.uid), 'Monrovia is out of range from Maryland');

  const monrovia = (await call('/v1/deck', { n: 30, la: 6.3, lo: -10.8, aw: 1 }, kemah.token)).body.cards as Card[];
  assert.ok(monrovia.some((c) => c.u === yah.uid), 'searching Monrovia finds Yah');

  const yahDeck = (await call('/v1/deck', { n: 30 }, yah.token)).body.cards as Card[];
  const k = yahDeck.find((c) => c.u === kemah.uid);
  assert.ok(k, 'Yah sees Kemah');
  assert.equal(k.d, 'Not in town', 'never shown as "Under 3 km"');
  assert.equal(k.li, 'Maryland, USA');
  assert.equal(k.aw, 1);

  // Back to "near me" with no location fix: Kemah stops showing up in Monrovia.
  const none = (await call('/v1/deck', { n: 30, aw: 0 }, kemah.token)).body.cards as Card[];
  assert.equal(none.length, 0, 'no location, no deck');
  const yahAgain = (await call('/v1/deck', { n: 30 }, yah.token)).body.cards as Card[];
  assert.ok(!yahAgain.some((c) => c.u === kemah.uid), 'Kemah no longer listed in Monrovia');
});
