import {
  ENV,
  MSG_KIND,
  encodeCard,
  encodeLike,
  encodeMatch,
  encodeMsg,
  envelopeType,
  hex,
  openMatchEnvelope,
  openSessionEnvelope,
  parseCard,
  photoChunks,
  photoHash,
  randomBytes,
  recognitionTag,
  sharedKey,
  sidOf,
  textPayload,
  toFrames,
  parsePhotoChunk,
  type KeyPair,
  type ParsedCard,
} from '@bluesight/protocol';
import { REPLIES, demoPass, makePeople, newSession, portraitJpeg, type DemoPerson } from '../demo/world';
import type { StartOptions, Transport, TransportEvents } from './types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const between = (a: number, b: number) => a + Math.random() * (b - a);

class SimPeer {
  readonly deviceId = `sim:${hex.encode(randomBytes(4))}`;
  readonly session: KeyPair = newSession();
  readonly card: Uint8Array;
  readonly photo: Uint8Array;
  rssi: number;
  readonly arrivedAt = Date.now();
  sentLike = false;
  sentMatch = false;
  key?: Uint8Array;
  private replies = 0;

  constructor(
    readonly person: DemoPerson,
    private readonly room: SimTransport,
  ) {
    this.rssi = between(-88, -55);
    this.photo = portraitJpeg(person.uid + person.name, 300);
    this.card = encodeCard(
      {
        signPk: this.session.publicKey,
        rtag: recognitionTag(person.recKey, sidOf(this.session.publicKey)),
        age: person.age,
        gender: person.gender,
        intent: person.intent,
        vibes: person.vibes,
        name: person.name,
        bio: person.bio,
        thumbhash: person.thumbhash,
        photo: { len: this.photo.length, hash: photoHash(this.photo) },
        pass: Math.random() < 0.8 ? demoPass(this.session.publicKey, person.uid) : undefined,
      },
      this.session.secretKey,
    );
  }

  private get me() {
    return { signPk: this.session.publicKey, signSk: this.session.secretKey };
  }

  receive(env: Uint8Array) {
    const type = envelopeType(env);
    if (type === ENV.LIKE || type === ENV.MATCH) {
      const o = openSessionEnvelope(env, [this.me]);
      if (!o) return;
      if (o.type === 'like') {
        if (this.person.likesYou && !this.sentMatch) setTimeout(() => this.sendMatch(o.fromSignPk), between(900, 2600));
        return;
      }
      this.key = sharedKey(o.identityPk, this.person.identity.secretKey);
      if (!this.sentMatch) this.sendMatch(o.fromSignPk);
      if (this.person.chatty) setTimeout(() => this.say(REPLIES[0]), between(3500, 7000));
      return;
    }
    if (type === ENV.MSG && this.key) {
      const o = openMatchEnvelope(env, [{ key: this.key }]);
      if (o?.type === 'msg' && o.payload.kind === MSG_KIND.TEXT && this.replies < 6) {
        setTimeout(() => this.say(REPLIES[1 + (this.replies % (REPLIES.length - 1))]), between(1800, 4500));
      }
    }
  }

  sendLike(userSignPk: Uint8Array) {
    this.sentLike = true;
    this.room.deliver(this, encodeLike(this.me, userSignPk));
  }

  sendMatch(userSignPk: Uint8Array) {
    this.sentMatch = true;
    this.room.deliver(
      this,
      encodeMatch(this.me, userSignPk, {
        identityPk: this.person.identity.publicKey,
        recKey: this.person.recKey,
        accountId: hex.decode(this.person.uid),
      }),
    );
  }

  private say(text: string) {
    if (!this.key || !this.room.has(this)) return;
    this.replies++;
    this.room.deliver(this, encodeMsg(this.key, textPayload(text)));
  }
}

/** A pretend room: people arrive, drift closer and further, sometimes like you first, and reply. */
export class SimTransport implements Transport {
  readonly kind = 'sim' as const;
  readonly pool: DemoPerson[];
  private present: SimPeer[] = [];
  private ev?: TransportEvents;
  private timer?: ReturnType<typeof setInterval>;
  private mine?: ParsedCard | null;
  private advertising = false;
  private ticks = 0;

  constructor(pool?: DemoPerson[]) {
    this.pool = pool ?? makePeople(16, 99, 'near');
  }

  has(p: SimPeer) {
    return this.present.includes(p);
  }

  async start(o: StartOptions, ev: TransportEvents) {
    this.ev = ev;
    this.mine = parseCard(o.card);
    this.advertising = o.advertise;
    ev.state('on');
    if (!this.present.length) for (let i = 0; i < 4; i++) this.arrive();
    this.timer = setInterval(() => this.tick(), 1000);
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async setCard(card: Uint8Array) {
    this.mine = parseCard(card);
  }

  async setAdvertising(on: boolean) {
    this.advertising = on;
  }

  private arrive() {
    const used = new Set(this.present.map((p) => p.person.uid));
    const next = this.pool.find((p) => !used.has(p.uid));
    if (next) this.present.push(new SimPeer(next, this));
  }

  private tick() {
    this.ticks++;
    if (this.present.length < 11 && (this.ticks < 6 || Math.random() < 0.08)) this.arrive();
    for (const p of [...this.present]) {
      p.rssi = Math.max(-95, Math.min(-42, p.rssi + between(-4, 4)));
      if (!p.key && Math.random() < 0.004) {
        this.present = this.present.filter((x) => x !== p); // walked off
        continue;
      }
      this.ev?.seen(p.deviceId, Math.round(p.rssi));
      const mine = this.mine?.card.signPk;
      if (mine && this.advertising && p.person.likesYou && !p.sentLike && !p.sentMatch && Date.now() - p.arrivedAt > 9000 && Math.random() < 0.02) {
        p.sendLike(mine);
      }
    }
  }

  private find(deviceId: string) {
    const p = this.present.find((x) => x.deviceId === deviceId);
    if (!p) throw new Error('out of range');
    return p;
  }

  async readCard(deviceId: string) {
    await sleep(between(120, 380));
    return this.find(deviceId).card;
  }

  /** Same chunked transfer as the real radio, minus the radio. */
  async readPhoto(deviceId: string) {
    const p = this.find(deviceId);
    const parts: Uint8Array[] = [];
    for (const chunk of photoChunks(p.photo)) {
      await sleep(12);
      const c = parsePhotoChunk(chunk);
      if (!c) throw new Error('bad chunk');
      parts.push(c.data);
    }
    const out = new Uint8Array(parts.reduce((n, x) => n + x.length, 0));
    let o = 0;
    for (const x of parts) {
      out.set(x, o);
      o += x.length;
    }
    return out;
  }

  async send(deviceId: string, envelope: Uint8Array) {
    await sleep(between(60, 180));
    this.find(deviceId).receive(envelope);
  }

  /** A peer writes into our inbox, framed exactly like a real link with a 185-byte MTU. */
  deliver(p: SimPeer, env: Uint8Array) {
    if (!this.advertising || !this.has(p)) return;
    const frames = toFrames(env, 182, Math.floor(Math.random() * 256));
    frames.forEach((f, i) => setTimeout(() => this.ev?.inbox(p.deviceId, f), 30 * i));
  }
}
