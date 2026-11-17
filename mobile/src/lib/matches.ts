import * as Haptics from 'expo-haptics';
import { hex, randomBytes, sharedKey, type MatchPayload } from '@bluesight/protocol';
import type { WireChange } from './api/types';
import { flushWaiting, sendKeys } from './chat';
import { b64, ensureKeys, nowSec, unb64 } from './identity';
import { queueOp } from './outbox';
import { services } from './services';
import { getApp, setApp, useUi, type Match, type PeerSnap } from './store';

const isZero = (b: Uint8Array) => b.every((x) => x === 0);

function celebrate(id: string) {
  useUi.setState({ matchSplash: id });
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/** Both phones liked each other over Bluetooth and swapped identities. */
export function confirmNearbyMatch(sid: string, p: MatchPayload, snap: PeerSnap): string | null {
  const keys = ensureKeys();
  const idPk = b64(p.identityPk);
  const st = getApp();
  const uid = isZero(p.accountId) ? undefined : hex.encode(p.accountId);
  if (uid && st.blocked.uids.includes(uid)) return null;
  const existing = Object.values(st.matches).find((m) => m.identityPk === idPk && !m.closed);
  const id = existing?.id ?? hex.encode(randomBytes(6));
  if (!existing) {
    const t = nowSec();
    const m: Match = {
      id,
      peerUid: uid,
      name: snap.name,
      age: snap.age,
      gender: snap.gender,
      intent: snap.intent,
      vibes: snap.vibes,
      bio: snap.bio,
      thumbhash: snap.thumbhash,
      photoData: snap.photoData,
      identityPk: idPk,
      key: b64(sharedKey(p.identityPk, unb64(keys.idSk))),
      recKey: b64(p.recKey),
      source: 'nearby',
      createdAt: t,
      lastAt: t,
      unread: 0,
      keysSent: true,
    };
    setApp((s) => ({ matches: { ...s.matches, [id]: m } }));
    celebrate(id);
    // Both have accounts: ask the server to carry the chat after the night ends.
    if (uid && st.account) {
      queueOp({ k: 'nl', to: uid });
      services.sync.kick('match');
    }
  }
  useUi.setState((u) => (u.peers[sid] ? { peers: { ...u.peers, [sid]: { ...u.peers[sid], matchId: id } } } : {}));
  return id;
}

/** A match announced by the server: an "Around" match, or a Bluetooth match that just moved online. */
export function applyServerMatch(ch: Extract<WireChange, { k: 'm' }>) {
  const st = getApp();
  if (Object.values(st.matches).some((m) => m.serverId === ch.m)) return;
  const local = Object.values(st.matches).find((m) => m.peerUid === ch.u.id && !m.serverId && !m.closed);
  if (local) {
    setApp((s) => ({ matches: { ...s.matches, [local.id]: { ...local, serverId: ch.m, photoKey: ch.u.p ?? local.photoKey } } }));
    flushWaiting(local.id);
    return;
  }
  if (!ch.u.pk || st.blocked.uids.includes(ch.u.id)) return;
  const keys = ensureKeys();
  const id = hex.encode(randomBytes(6));
  const t = nowSec();
  const m: Match = {
    id,
    serverId: ch.m,
    peerUid: ch.u.id,
    name: ch.u.n,
    age: ch.u.a,
    gender: ch.u.g,
    intent: ch.u.i,
    vibes: ch.u.v,
    bio: ch.u.b,
    livesIn: ch.u.li,
    thumbhash: ch.u.th ? b64(ch.u.th) : undefined,
    photoKey: ch.u.p,
    identityPk: b64(ch.u.pk),
    key: b64(sharedKey(ch.u.pk, unb64(keys.idSk))),
    source: ch.src,
    createdAt: t,
    lastAt: t,
    unread: 0,
  };
  setApp((s) => ({ matches: { ...s.matches, [id]: m } }));
  sendKeys(id);
  celebrate(id);
}

export function findByServerId(serverId: string): Match | undefined {
  return Object.values(getApp().matches).find((m) => m.serverId === serverId);
}
