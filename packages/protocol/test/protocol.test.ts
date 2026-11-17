import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BLE_UUIDS,
  FrameAssembler,
  LIMITS,
  MSG_KIND,
  ageFromDob,
  base64,
  checkPass,
  encodeCard,
  encodeLike,
  encodeMatch,
  encodeMsg,
  encodeUnmatch,
  equal,
  hex,
  issuePass,
  maskFromVibes,
  newBoxKeyPair,
  newSignKeyPair,
  openMatchEnvelope,
  openPass,
  openSessionEnvelope,
  parseCard,
  parsePhotoChunk,
  photoChunks,
  photoHash,
  randomBytes,
  recognises,
  recognitionTag,
  sharedKey,
  sidOf,
  snapToGrid,
  distanceKm,
  textPayload,
  toFrames,
  truncateUtf8,
  utf8,
  vibesFromMask,
  wantsToSee,
  type Card,
} from '../src';

const longName = 'Àmà 🔥 Kebeh-Siaffa Comfort-Princess';
const longBio = 'Find me by the DJ booth 💃🏾 '.repeat(12);

function sampleCard(over: Partial<Card> = {}): { card: Card; signSk: Uint8Array } {
  const kp = newSignKeyPair();
  const recKey = randomBytes(16);
  return {
    signSk: kp.secretKey,
    card: {
      signPk: kp.publicKey,
      rtag: recognitionTag(recKey, sidOf(kp.publicKey)),
      age: 24,
      gender: 1,
      intent: 1,
      vibes: maskFromVibes([0, 8, 14]),
      name: 'Ama',
      bio: 'Afrobeats & good energy',
      thumbhash: randomBytes(25),
      ...over,
    },
  };
}

test('utf8 round-trips and truncation never splits characters', () => {
  const s = 'Hello 👋🏾 Accra — ŋ ɛ ɔ 日本 🇱🇷';
  assert.equal(utf8.decode(utf8.encode(s)), s);
  assert.deepEqual(utf8.encode(s), new Uint8Array(Buffer.from(s, 'utf8')));
  assert.equal(utf8.byteLength(s), Buffer.byteLength(s));
  for (let n = 0; n < 40; n++) {
    const t = truncateUtf8(s, n);
    assert.ok(Buffer.byteLength(t) <= n);
    assert.ok(s.startsWith(t));
  }
});

test('base64 and hex match Node', () => {
  for (const len of [0, 1, 2, 3, 4, 5, 31, 32, 33, 100]) {
    const b = randomBytes(len);
    assert.equal(base64.encode(b), Buffer.from(b).toString('base64'));
    assert.ok(equal(base64.decode(base64.encode(b)), b));
    assert.ok(equal(base64.decode(Buffer.from(b).toString('base64url')), b));
    assert.equal(hex.encode(b), Buffer.from(b).toString('hex'));
    assert.ok(equal(hex.decode(hex.encode(b)), b));
  }
});

test('card round-trips and signature catches tampering', () => {
  const { card, signSk } = sampleCard({ photo: { len: 12000, hash: randomBytes(4) } });
  const bytes = encodeCard(card, signSk);
  const parsed = parseCard(bytes);
  assert.ok(parsed);
  assert.equal(parsed.card.name, 'Ama');
  assert.equal(parsed.card.age, 24);
  assert.equal(parsed.card.gender, 1);
  assert.equal(parsed.card.intent, 1);
  assert.deepEqual(vibesFromMask(parsed.card.vibes), [0, 8, 14]);
  assert.equal(parsed.card.photo?.len, 12000);
  assert.ok(equal(parsed.sid, sidOf(card.signPk)));
  for (let i = 0; i < bytes.length; i += 7) {
    const t = bytes.slice();
    t[i] ^= 1;
    assert.equal(parseCard(t), null, `tamper at ${i} must fail`);
  }
  assert.equal(parseCard(bytes.slice(0, -1)), null);
});

test('worst-case card still fits one Bluetooth attribute (512 bytes)', () => {
  const kp = newSignKeyPair();
  const server = newSignKeyPair();
  const pass = issuePass({
    sessionSignPk: kp.publicKey,
    accountId: randomBytes(8),
    expiresAt: 2_000_000_000,
    serverSignSk: server.secretKey,
    serverSecret: randomBytes(32),
  });
  const { card } = sampleCard({
    signPk: kp.publicKey,
    name: longName,
    bio: longBio,
    thumbhash: randomBytes(LIMITS.thumbhashBytes),
    photo: { len: 30000, hash: randomBytes(4) },
    pass,
  });
  const bytes = encodeCard(card, kp.secretKey);
  assert.ok(bytes.length <= LIMITS.attrBytes, `card is ${bytes.length} bytes`);
  const parsed = parseCard(bytes)!;
  assert.ok(utf8.byteLength(parsed.card.name) <= LIMITS.nameBytes);
  assert.ok(utf8.byteLength(parsed.card.bio) <= LIMITS.bioBytes);
  assert.ok(parsed.card.pass && equal(parsed.card.pass, pass));
});

test('matches recognise each other; strangers cannot', () => {
  const recKey = randomBytes(16);
  const { card, signSk } = sampleCard();
  card.rtag = recognitionTag(recKey, sidOf(card.signPk));
  const parsed = parseCard(encodeCard(card, signSk))!;
  assert.ok(recognises(recKey, parsed));
  assert.ok(!recognises(randomBytes(16), parsed));
});

test('nearby pass: verifiable offline, bound to the session, opened only by the server', () => {
  const server = newSignKeyPair();
  const secret = randomBytes(32);
  const session = newSignKeyPair();
  const accountId = randomBytes(8);
  const now = 1_800_000_000;
  const pass = issuePass({
    sessionSignPk: session.publicKey,
    accountId,
    expiresAt: now + 86400,
    serverSignSk: server.secretKey,
    serverSecret: secret,
  });
  assert.deepEqual(checkPass(pass, session.publicKey, server.publicKey, now), { expiresAt: now + 86400 });
  assert.equal(checkPass(pass, session.publicKey, server.publicKey, now + 86401), null, 'expired');
  assert.equal(checkPass(pass, newSignKeyPair().publicKey, server.publicKey, now), null, 'copied to another card');
  assert.equal(checkPass(pass, session.publicKey, newSignKeyPair().publicKey, now), null, 'other server');
  const bad = pass.slice();
  bad[10] ^= 1;
  assert.equal(checkPass(bad, session.publicKey, server.publicKey, now), null, 'tampered');
  assert.ok(equal(openPass(pass, session.publicKey, secret)!, accountId));
  assert.equal(openPass(pass, session.publicKey, randomBytes(32)), null);
});

test('like + match handshake over session keys', () => {
  const a = newSignKeyPair();
  const b = newSignKeyPair();
  const aSession = { signPk: a.publicKey, signSk: a.secretKey };
  const bSession = { signPk: b.publicKey, signSk: b.secretKey };
  const oldB = newSignKeyPair();

  const like = encodeLike(aSession, b.publicKey);
  assert.equal(like.length, 85);
  const got = openSessionEnvelope(like, [{ signPk: oldB.publicKey, signSk: oldB.secretKey }, bSession]);
  assert.ok(got && got.type === 'like');
  assert.ok(equal(got.fromSid, sidOf(a.publicKey)));
  assert.equal(openSessionEnvelope(like, [aSession]), null, 'sender cannot open their own like');

  const payload = { identityPk: newBoxKeyPair().publicKey, recKey: randomBytes(16), accountId: randomBytes(8) };
  const match = encodeMatch(bSession, a.publicKey, payload);
  assert.equal(match.length, 141);
  const m = openSessionEnvelope(match, [aSession]);
  assert.ok(m && m.type === 'match');
  assert.ok(equal(m.identityPk, payload.identityPk) && equal(m.recKey, payload.recKey));

  // a stale timestamp is rejected
  assert.equal(openSessionEnvelope(encodeLike(aSession, b.publicKey, 1000), [bSession]), null);
});

test('messages find the right match among many and stay private', () => {
  const me = newBoxKeyPair();
  const peers = Array.from({ length: 50 }, () => newBoxKeyPair());
  const myMatches = peers.map((p, i) => ({ id: `m${i}`, key: sharedKey(p.publicKey, me.secretKey) }));
  const sender = peers[37];
  const senderKey = sharedKey(me.publicKey, sender.secretKey);
  assert.ok(equal(senderKey, myMatches[37].key), 'shared key is symmetric');

  const text = 'Meet me by the bar? 🍹';
  const env = encodeMsg(senderKey, textPayload(text));
  const opened = openMatchEnvelope(env, myMatches);
  assert.ok(opened && opened.type === 'msg');
  assert.equal(opened.match.id, 'm37');
  assert.equal(opened.payload.kind, MSG_KIND.TEXT);
  assert.equal(utf8.decode(opened.payload.data), text);
  assert.equal(openMatchEnvelope(env, myMatches.filter((m) => m.id !== 'm37')), null);

  const max = 'x'.repeat(LIMITS.msgBytes);
  assert.ok(encodeMsg(senderKey, textPayload(max)).length <= LIMITS.attrBytes);
  assert.throws(() => encodeMsg(senderKey, textPayload(max + 'x')));

  const um = openMatchEnvelope(encodeUnmatch(senderKey), myMatches);
  assert.ok(um && um.type === 'unmatch' && um.match.id === 'm37');
});

test('frames split and reassemble for small MTUs, any order', () => {
  const env = randomBytes(470);
  for (const mtuPayload of [20, 100, 182, 512]) {
    const frames = toFrames(env, mtuPayload, 7);
    assert.ok(frames.every((f) => f.length <= mtuPayload));
    const asm = new FrameAssembler();
    const shuffled = [...frames].reverse();
    let out: Uint8Array | null = null;
    for (const f of shuffled) out = asm.push('dev1', f) ?? out;
    assert.ok(out && equal(out, env), `mtu ${mtuPayload}`);
  }
  assert.throws(() => toFrames(randomBytes(5000), 20, 1), 'too many frames is an error');
});

test('photo chunks', () => {
  const photo = randomBytes(10_001);
  const chunks = photoChunks(photo);
  assert.ok(chunks.every((c) => c.length <= LIMITS.attrBytes));
  const parts = chunks.map((c) => parsePhotoChunk(c)!);
  assert.equal(parts[0].count, chunks.length);
  const joined = Buffer.concat(parts.map((p) => p.data));
  assert.ok(equal(new Uint8Array(joined), photo));
  assert.equal(photoHash(photo).length, 4);
});

test('profile helpers', () => {
  const now = new Date(Date.UTC(2026, 10, 15));
  assert.equal(ageFromDob('2008-11-15', now), 18);
  assert.equal(ageFromDob('2008-11-16', now), 17);
  assert.equal(ageFromDob('2001-02-30', now), null);
  assert.ok(wantsToSee(0b001, 1) && !wantsToSee(0b001, 2));
  assert.ok(!wantsToSee(0b011, 0) && wantsToSee(0b111, 0));
});

test('location is coarse', () => {
  const p = snapToGrid(6.30054, -10.79695);
  assert.ok(Math.abs(p.lat - 6.3) < 1e-9 && Math.abs(p.lon - -10.8) < 1e-9);
  assert.ok(distanceKm(p, { lat: 6.3, lon: -10.8 }) < 0.001);
  assert.ok(distanceKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }) > 110);
});

test('uuids are well-formed', () => {
  for (const u of Object.values(BLE_UUIDS)) assert.match(u, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});
