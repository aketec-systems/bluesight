import { encode } from '@msgpack/msgpack';
import {
  MSG_KIND,
  hex,
  issuePass,
  openChat,
  randomBytes,
  sealChat,
  sharedKey,
  textPayload,
  wantsToSee,
} from '@bluesight/protocol';
import { recordBytes } from '../data';
import { REPLIES, demoServer, jpegDataUri, makePeople, portraitJpeg, type DemoPerson } from '../demo/world';
import type { Category } from '../store';
import { ApiError, type Api, type SyncResponse, type WireCard, type WireChange } from './types';

const DEMO_CODE = '123456';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A pretend server that lives in the page, for the web preview. It speaks the same shapes as the
 * real one and meters what each call *would* cost on mobile data (MessagePack bodies + headers).
 */
export class DemoApi implements Api {
  readonly kind = 'demo' as const;
  private around: DemoPerson[] = makePeople(24, 7, 'around');
  private casts = new Map<string, DemoPerson[]>();
  /** people browsing from abroad, and where they live */
  private abroad = new Map<string, string>();
  private marked = new WeakSet<DemoPerson[]>();
  private byUid = new Map<string, DemoPerson>();
  private changes: { seq: number; ch: WireChange }[] = [];
  private seq = 0;
  private matches = new Map<string, { person: DemoPerson; key: Uint8Array; replies: number }>();
  private swiped = new Set<string>();
  private me: { uid: string; pk?: Uint8Array; showMe: number; ageMin: number; ageMax: number } = { uid: '', showMe: 7, ageMin: 18, ageMax: 99 };
  private uploads = new Map<string, string>();
  private push?: () => void;

  constructor(nearbyPool: DemoPerson[] = []) {
    for (const p of [...this.around, ...nearbyPool]) this.byUid.set(p.uid, p);
  }

  onPush(cb: () => void) {
    this.push = cb;
  }

  private meter(cat: Category, req: unknown, res: unknown, extra = 0) {
    recordBytes(cat, encode(req ?? {}).length + encode(res ?? {}).length + 420 + extra);
  }

  private add(ch: WireChange) {
    this.changes.push({ seq: ++this.seq, ch });
  }

  async info() {
    const res = { spk: demoServer.sign.publicKey };
    this.meter('account', undefined, res);
    return res;
  }

  async authStart(ph: string) {
    await sleep(500);
    if (!/^\+[1-9]\d{7,14}$/.test(ph)) throw new ApiError('bad_phone', 400);
    const res = { ok: 1, dev: DEMO_CODE };
    this.meter('account', { ph }, res);
    return res;
  }

  async authVerify(ph: string, code: string) {
    await sleep(500);
    if (code !== DEMO_CODE) throw new ApiError('wrong_code', 400);
    this.me.uid = hex.encode(randomBytes(8));
    const res = { tk: 'demo-token', uid: this.me.uid, spk: demoServer.sign.publicKey };
    this.meter('account', { ph, code }, res);
    return res;
  }

  async sync(_token: string, c: number, ops: unknown[]): Promise<SyncResponse> {
    await sleep(250 + Math.random() * 250);
    const acks: string[] = [];
    for (const raw of ops) {
      const op = raw as Record<string, unknown>;
      try {
        this.apply(op);
      } catch {}
      acks.push(String(op.id));
    }
    const res: SyncResponse = { c: this.seq, acks, ch: this.changes.filter((x) => x.seq > c).map((x) => x.ch) };
    this.meter('sync', { c, ops }, res);
    return res;
  }

  private apply(op: Record<string, unknown>) {
    switch (op.k) {
      case 'me':
        this.me = {
          ...this.me,
          pk: op.pk as Uint8Array,
          showMe: (op.sm as number) ?? 7,
          ageMin: (op.amin as number) ?? 18,
          ageMax: (op.amax as number) ?? 99,
        };
        return;
      case 'sw': {
        this.swiped.add(String(op.to));
        const p = this.byUid.get(String(op.to));
        if (op.l === 1 && p?.likesYou) this.match(p, 'around');
        return;
      }
      case 'nl': {
        const p = this.byUid.get(String(op.to));
        if (p) this.match(p, 'nearby');
        return;
      }
      case 'msg': {
        const m = this.matches.get(String(op.m));
        if (!m) return;
        const payload = openChat(m.key, op.b as Uint8Array);
        if (payload?.kind === MSG_KIND.TEXT && m.person.chatty && m.replies < 6) {
          m.replies++;
          setTimeout(() => {
            this.add({ k: 'x', m: String(op.m), f: m.person.uid, b: sealChat(m.key, textPayload(REPLIES[1 + (m.replies % (REPLIES.length - 1))])), at: Math.floor(Date.now() / 1000) });
            this.push?.();
          }, 2500 + Math.random() * 3000);
        }
        return;
      }
      default:
        return;
    }
  }

  private match(p: DemoPerson, src: 'around' | 'nearby') {
    if (!this.me.pk || [...this.matches.values()].some((m) => m.person.uid === p.uid)) return;
    const id = hex.encode(randomBytes(6));
    const key = sharedKey(this.me.pk, p.identity.secretKey);
    this.matches.set(id, { person: p, key, replies: 0 });
    this.add({
      k: 'm',
      m: id,
      src,
      at: Math.floor(Date.now() / 1000),
      u: {
        id: p.uid,
        n: p.name,
        a: p.age,
        g: p.gender,
        i: p.intent,
        v: p.vibes,
        b: p.bio,
        li: this.abroad.get(p.uid),
        th: p.thumbhash,
        p: `demo-${p.uid}`,
        ps: [11800, 52000],
        pk: p.identity.publicKey,
      },
    });
    if (src === 'around' && p.chatty) {
      setTimeout(() => {
        this.add({ k: 'x', m: id, f: p.uid, b: sealChat(key, textPayload(REPLIES[0])), at: Math.floor(Date.now() / 1000) });
        this.push?.();
      }, 6000);
    }
  }

  /** Searching another city shows a different crowd; a few are browsing there from abroad too. */
  private castFor(loc?: { lat: number; lon: number }) {
    let cast = this.around;
    if (loc) {
      const key = `${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}`;
      const known = this.casts.get(key);
      if (known) cast = known;
      else {
        const seed = [...key].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
        cast = makePeople(24, seed, `city-${key}`);
        for (const p of cast) this.byUid.set(p.uid, p);
        this.casts.set(key, cast);
      }
    }
    if (!this.marked.has(cast)) {
      const homes = ['Maryland, USA', 'London, UK', 'Philadelphia, USA', 'Toronto, Canada'];
      cast.forEach((p, i) => i % 6 === 4 && this.abroad.set(p.uid, homes[Math.floor(i / 6) % homes.length]));
      this.marked.add(cast);
    }
    return cast;
  }

  async deck(_token: string, n: number, loc?: { lat: number; lon: number }): Promise<WireCard[]> {
    await sleep(400);
    const cards: WireCard[] = this.castFor(loc)
      .filter((p) => !this.swiped.has(p.uid) && wantsToSee(this.me.showMe, p.gender) && p.age >= this.me.ageMin && p.age <= this.me.ageMax)
      .slice(0, n)
      .map((p) => ({
        u: p.uid,
        n: p.name,
        a: p.age,
        g: p.gender,
        i: p.intent,
        v: p.vibes,
        b: p.bio,
        th: p.thumbhash,
        p: `demo-${p.uid}`,
        ps: [11800, 52000] as [number, number],
        li: this.abroad.get(p.uid),
        aw: this.abroad.has(p.uid) ? (1 as const) : undefined,
        d: this.abroad.has(p.uid) ? 'Not in town' : ['Under 3 km', 'Under 10 km', 'Under 25 km'][p.uid.charCodeAt(p.uid.length - 1) % 3],
      }));
    this.meter('deck', { n }, { cards });
    return cards;
  }

  async uploadPhoto(_token: string, v: 's' | 'f', img: Uint8Array, th?: Uint8Array) {
    await sleep(600);
    const key = `me-${v}`;
    this.uploads.set(key, jpegDataUri(img));
    this.meter('upload', { v, img, th }, { p: key });
    return key;
  }

  async passes(_token: string, pks: Uint8Array[]) {
    const now = Math.floor(Date.now() / 1000);
    const ps = pks.map((pk, i) =>
      issuePass({
        sessionSignPk: pk,
        accountId: hex.decode(this.me.uid || '0000000000000000'),
        expiresAt: now + (i + 1) * 86400,
        serverSignSk: demoServer.sign.secretKey,
        serverSecret: demoServer.passSecret,
      }),
    );
    this.meter('account', { pks }, { ps });
    return ps;
  }

  photoUrl(key: string, v: 's' | 'f') {
    if (key.startsWith('me-')) return this.uploads.get(key) ?? '';
    const p = this.byUid.get(key.replace(/^demo-/, ''));
    return p ? jpegDataUri(portraitJpeg(p.uid + p.name, v === 'f' ? 480 : 300)) : '';
  }
}
