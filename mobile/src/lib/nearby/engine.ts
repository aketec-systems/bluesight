import * as Haptics from 'expo-haptics';
import {
  ENV,
  FrameAssembler,
  checkPass,
  encodeLike,
  encodeMatch,
  envelopeType,
  hex,
  openMatchEnvelope,
  openSessionEnvelope,
  parseCard,
  photoHash,
  recognises,
  type ParsedCard,
} from '@bluesight/protocol';
import { closeMatchLocal, flushWaiting, receiveChat } from '../chat';
import { recordBle } from '../data';
import {
  accountIdBytes,
  b64,
  buildMyCard,
  currentSession,
  ensureKeys,
  nowSec,
  recentSessions,
  sessionSid,
  toSession,
  unb64,
} from '../identity';
import { confirmNearbyMatch } from '../matches';
import { getApp, setApp, useUi, type Peer, type PeerSnap, type SessionKey } from '../store';
import type { Transport } from './types';

const CARD_REFRESH_MS = 5 * 60_000;
const PEER_TTL_MS = 45_000;
const EMA = 0.35;

/** Signal strength → how close someone is. Rough on purpose: walls, bodies and pockets all absorb 2.4 GHz. */
export const proximityOf = (rssi: number): 0 | 1 | 2 => (rssi >= -62 ? 0 : rssi >= -76 ? 1 : 2);

interface DeviceInfo {
  sid?: string;
  cardAt: number;
  fails: number;
  retryAt: number;
}

export function snapOf(p: Peer): PeerSnap {
  return {
    signPk: p.signPk,
    name: p.name,
    age: p.age,
    gender: p.gender,
    intent: p.intent,
    vibes: p.vibes,
    bio: p.bio,
    thumbhash: p.thumbhash,
    photoData: p.photoData,
  };
}

/**
 * Everything that happens in a room, over Bluetooth only:
 * discover phones → read their signed cards → pull photos → likes → match handshake → chat.
 */
export class NearbyEngine {
  private t: Transport | null = null;
  private session: SessionKey | null = null;
  private devices = new Map<string, DeviceInfo>();
  private live = new Map<string, { rssi: number; at: number }>();
  private cardQueue: string[] = [];
  private cardBusy = 0;
  private photoQueue: string[] = [];
  private photoBusy = false;
  private asm = new FrameAssembler();
  private tick?: ReturnType<typeof setInterval>;
  private owesMatch = new Set<string>();
  private owesLike = new Set<string>();
  private starting = false;

  get active() {
    return !!this.t;
  }

  get mySid() {
    return this.session ? sessionSid(this.session) : '';
  }

  async start(t: Transport) {
    if (this.t || this.starting || !getApp().profile) return;
    this.starting = true;
    this.pruneOld();
    useUi.setState({ nearby: 'starting', nearbyError: undefined });
    try {
      this.session = currentSession();
      const { card, photo } = buildMyCard(this.session);
      this.t = t;
      await t.start(
        { card, photo, advertise: getApp().settings.visible },
        {
          seen: (id, rssi) => this.onSeen(id, rssi),
          inbox: (from, frame) => this.onFrame(from, frame),
          state: (status, detail) => useUi.setState({ nearby: status, nearbyError: detail }),
        },
      );
      if (useUi.getState().nearby === 'starting') useUi.setState({ nearby: 'on' });
      this.tick = setInterval(() => this.onTick(), 2000);
    } catch (e) {
      this.t = null;
      useUi.setState({ nearby: 'error', nearbyError: e instanceof Error ? e.message : String(e) });
    } finally {
      this.starting = false;
    }
  }

  /** Bluetooth sessions last a day, so swipe and handshake state older than two days is dead weight. */
  private pruneOld() {
    const cutoff = nowSec() - 2 * 86400;
    const keep = <T extends { at: number }>(r: Record<string, T>) => Object.fromEntries(Object.entries(r).filter(([, v]) => v.at > cutoff));
    setApp((s) => ({
      nearbySwipes: keep(s.nearbySwipes),
      incomingLikes: keep(s.incomingLikes),
      sentMatch: Object.fromEntries(Object.entries(s.sentMatch).filter(([, at]) => at > cutoff)),
    }));
  }

  async stop() {
    if (this.tick) clearInterval(this.tick);
    this.tick = undefined;
    const t = this.t;
    this.t = null;
    await t?.stop().catch(() => {});
    this.devices.clear();
    this.live.clear();
    this.cardQueue = [];
    this.photoQueue = [];
    useUi.setState({ nearby: 'off', peers: {} });
  }

  /** Profile or visibility changed: re-sign the card we serve. */
  async refreshCard() {
    if (!this.t || !this.session) return;
    const { card, photo } = buildMyCard(this.session);
    await this.t.setCard(card, photo).catch(() => {});
  }

  async setVisible(visible: boolean) {
    setApp((s) => ({ settings: { ...s.settings, visible } }));
    await this.t?.setAdvertising(visible).catch(() => {});
  }

  peerForMatch(matchId: string): Peer | undefined {
    if (!this.t) return undefined;
    return Object.values(useUi.getState().peers).find((p) => p.matchId === matchId && Date.now() - p.lastSeen < 20_000);
  }

  async sendToSid(sid: string, envelope: Uint8Array) {
    const p = useUi.getState().peers[sid];
    if (!p || !this.t) throw new Error('not nearby');
    await this.t.send(p.deviceId, envelope);
    recordBle(envelope.length);
  }

  /* ---------------- discovery ---------------- */

  private onSeen(deviceId: string, rssi: number) {
    const now = Date.now();
    this.live.set(deviceId, { rssi, at: now });
    let d = this.devices.get(deviceId);
    if (!d) this.devices.set(deviceId, (d = { cardAt: 0, fails: 0, retryAt: 0 }));
    const stale = !d.sid || now - d.cardAt > CARD_REFRESH_MS;
    if (stale && now >= d.retryAt && !this.cardQueue.includes(deviceId)) {
      this.cardQueue.push(deviceId);
      this.pump();
    }
  }

  private pump() {
    if (!this.t) return;
    while (this.cardBusy < 2 && this.cardQueue.length) {
      const id = this.cardQueue.shift()!;
      this.cardBusy++;
      void this.readCard(id).finally(() => {
        this.cardBusy--;
        this.pump();
      });
    }
    if (!this.photoBusy && !this.cardQueue.length && this.photoQueue.length) {
      const sid = this.photoQueue.shift()!;
      this.photoBusy = true;
      void this.readPhoto(sid)
        .catch(() => {})
        .finally(() => {
          this.photoBusy = false;
          this.pump();
        });
    }
  }

  private async readCard(deviceId: string) {
    const d = this.devices.get(deviceId);
    if (!d || !this.t) return;
    try {
      const bytes = await this.t.readCard(deviceId);
      recordBle(bytes.length);
      const parsed = parseCard(bytes);
      if (!parsed) throw new Error('invalid card');
      d.sid = hex.encode(parsed.sid);
      d.cardAt = Date.now();
      d.fails = 0;
      if (d.sid !== this.mySid) this.upsertPeer(deviceId, parsed, bytes);
    } catch {
      d.fails++;
      d.retryAt = Date.now() + Math.min(60_000, 2500 * 2 ** d.fails);
    }
  }

  private upsertPeer(deviceId: string, parsed: ParsedCard, bytes: Uint8Array) {
    const { serverPk, matches, blocked, settings } = getApp();
    const sid = hex.encode(parsed.sid);
    if (blocked.sids.includes(sid)) return;
    const c = parsed.card;
    const verified = !!(c.pass && serverPk && checkPass(c.pass, c.signPk, unb64(serverPk), nowSec()));
    const match = Object.values(matches).find((m) => !m.closed && m.recKey && recognises(unb64(m.recKey), parsed));
    if (match?.peerUid && blocked.uids.includes(match.peerUid)) return;
    const prev = useUi.getState().peers[sid];
    const rssi = prev?.rssi ?? this.live.get(deviceId)?.rssi ?? -80;
    const peer: Peer = {
      sid,
      deviceId,
      signPk: b64(c.signPk),
      name: c.name,
      age: c.age,
      gender: c.gender,
      intent: c.intent,
      vibes: c.vibes,
      bio: c.bio,
      thumbhash: b64(c.thumbhash),
      photoLen: c.photo?.len,
      photoHash: c.photo ? hex.encode(c.photo.hash) : undefined,
      photoData: prev?.photoData ?? (match?.photoData || undefined),
      verified,
      card: b64(bytes),
      rssi,
      proximity: proximityOf(rssi),
      firstSeen: prev?.firstSeen ?? Date.now(),
      lastSeen: Date.now(),
      matchId: match?.id,
    };
    useUi.setState((u) => ({ peers: { ...u.peers, [sid]: peer } }));
    if (match) flushWaiting(match.id);
    if (this.owesMatch.has(sid)) void this.sendMatch(sid);
    if (this.owesLike.has(sid)) void this.sendLike(sid);
    if (c.photo && settings.blePhotos && !peer.photoData && !this.photoQueue.includes(sid)) {
      this.photoQueue.push(sid);
      this.pump();
    }
  }

  private async readPhoto(sid: string) {
    const p = useUi.getState().peers[sid];
    if (!p || !p.photoLen || p.photoData || !this.t) return;
    const bytes = await this.t.readPhoto(p.deviceId, p.photoLen);
    if (p.photoHash && hex.encode(photoHash(bytes)) !== p.photoHash) throw new Error('photo hash mismatch');
    recordBle(bytes.length);
    const photoData = `data:image/jpeg;base64,${b64(bytes)}`;
    useUi.setState((u) => (u.peers[sid] ? { peers: { ...u.peers, [sid]: { ...u.peers[sid], photoData } } } : {}));
    if (p.matchId) {
      setApp((s) => {
        const m = s.matches[p.matchId!];
        return m && !m.photoData ? { matches: { ...s.matches, [m.id]: { ...m, photoData } } } : {};
      });
    }
  }

  private onTick() {
    const now = Date.now();
    const peers = useUi.getState().peers;
    const next = { ...peers };
    let changed = false;
    for (const [sid, p] of Object.entries(peers)) {
      const live = this.live.get(p.deviceId);
      const lastSeen = Math.max(p.lastSeen, live?.at ?? 0);
      if (now - lastSeen > PEER_TTL_MS) {
        delete next[sid];
        changed = true;
        continue;
      }
      if (live) {
        const rssi = p.rssi + EMA * (live.rssi - p.rssi);
        const proximity = proximityOf(rssi);
        if (Math.abs(rssi - p.rssi) > 0.5 || proximity !== p.proximity || lastSeen !== p.lastSeen) {
          next[sid] = { ...p, rssi, proximity, lastSeen };
          changed = true;
        }
      }
    }
    if (changed) useUi.setState({ peers: next });
    for (const [id, l] of this.live) if (now - l.at > 120_000) this.live.delete(id);
    this.pump();
  }

  /* ---------------- likes and the match handshake ---------------- */

  async like(sid: string): Promise<'sent' | 'invisible' | 'gone'> {
    const p = useUi.getState().peers[sid];
    if (!p) return 'gone';
    if (!getApp().settings.visible) return 'invisible';
    setApp((s) => ({ nearbySwipes: { ...s.nearbySwipes, [sid]: { liked: true, at: nowSec(), snap: snapOf(p) } } }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (getApp().incomingLikes[sid]) await this.sendMatch(sid);
    else await this.sendLike(sid);
    return 'sent';
  }

  pass(sid: string) {
    setApp((s) => ({ nearbySwipes: { ...s.nearbySwipes, [sid]: { liked: false, at: nowSec() } } }));
  }

  private signPkOf(sid: string): string | undefined {
    const st = getApp();
    return useUi.getState().peers[sid]?.signPk ?? st.incomingLikes[sid]?.signPk ?? st.nearbySwipes[sid]?.snap?.signPk;
  }

  private async sendLike(sid: string) {
    const pk = this.signPkOf(sid);
    if (!pk || !this.session) return;
    try {
      await this.sendToSid(sid, encodeLike(toSession(this.session), unb64(pk)));
      this.owesLike.delete(sid);
    } catch {
      this.owesLike.add(sid);
    }
  }

  private async sendMatch(sid: string) {
    const pk = this.signPkOf(sid);
    if (!pk || !this.session) return;
    const keys = ensureKeys();
    const env = encodeMatch(toSession(this.session), unb64(pk), {
      identityPk: unb64(keys.idPk),
      recKey: unb64(keys.recKey),
      accountId: accountIdBytes(),
    });
    try {
      await this.sendToSid(sid, env);
      this.owesMatch.delete(sid);
      this.owesLike.delete(sid);
      setApp((s) => ({ sentMatch: { ...s.sentMatch, [sid]: nowSec() } }));
    } catch {
      this.owesMatch.add(sid);
    }
  }

  private onFrame(from: string, frame: Uint8Array) {
    const env = this.asm.push(from, frame);
    if (env) void this.onEnvelope(env);
  }

  private async onEnvelope(env: Uint8Array) {
    recordBle(env.length);
    const type = envelopeType(env);
    if (type === ENV.LIKE || type === ENV.MATCH) {
      const o = openSessionEnvelope(env, recentSessions());
      if (!o) return;
      const sid = hex.encode(o.fromSid);
      const st = getApp();
      if (st.blocked.sids.includes(sid)) return;
      const liked = st.nearbySwipes[sid]?.liked === true;
      if (!st.incomingLikes[sid]) {
        setApp((s) => ({ incomingLikes: { ...s.incomingLikes, [sid]: { at: nowSec(), signPk: b64(o.fromSignPk) } } }));
      }
      if (!liked) return; // they like you; it becomes a match if you like them back
      if (o.type === 'like') {
        await this.sendMatch(sid);
        return;
      }
      if (!getApp().sentMatch[sid]) await this.sendMatch(sid);
      const peer = useUi.getState().peers[sid];
      const snap = peer ? snapOf(peer) : getApp().nearbySwipes[sid]?.snap;
      if (snap) confirmNearbyMatch(sid, o, snap);
      return;
    }
    if (type === ENV.MSG || type === ENV.UNMATCH) {
      const list = Object.values(getApp().matches)
        .filter((m) => !m.closed)
        .map((m) => ({ id: m.id, key: unb64(m.key) }));
      const o = openMatchEnvelope(env, list);
      if (!o) return;
      if (o.type === 'msg') receiveChat(o.match.id, o.payload, 'ble');
      else closeMatchLocal(o.match.id);
    }
  }
}
