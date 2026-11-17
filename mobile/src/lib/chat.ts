import {
  LIMITS,
  MSG_KIND,
  encodeUnmatch,
  hex,
  msgEnvelopeFromSealed,
  randomBytes,
  sealChat,
  textPayload,
  utf8,
  type ChatPayload,
} from '@bluesight/protocol';
import { b64, ensureKeys, nowSec, unb64 } from './identity';
import { dropOps, queueOp } from './outbox';
import { services } from './services';
import { getApp, setApp, useUi, type ChatMsg } from './store';

/**
 * Messages are sealed once, then take whichever road is open:
 *   1. the match is nearby  → straight over Bluetooth (free)
 *   2. the match is online  → queued for the next sync (~100 bytes each)
 *   3. neither yet          → waits, and goes the moment one of the above opens
 * The receiver de-duplicates by message id, so a message that travels both roads shows once.
 */

let openChatId: string | null = null;
export const setOpenChat = (id: string | null) => {
  openChatId = id;
  if (id) setApp((s) => (s.matches[id] ? { matches: { ...s.matches, [id]: { ...s.matches[id], unread: 0 } } } : {}));
};

function addMsg(matchId: string, msg: ChatMsg) {
  setApp((s) => ({ messages: { ...s.messages, [matchId]: [...(s.messages[matchId] ?? []), msg] } }));
}

function updateMsg(matchId: string, id: string, patch: Partial<ChatMsg>) {
  setApp((s) => ({
    messages: { ...s.messages, [matchId]: (s.messages[matchId] ?? []).map((m) => (m.id === id ? { ...m, ...patch } : m)) },
  }));
}

export function canSend(text: string) {
  const t = text.trim();
  return t.length > 0 && [...t].length <= LIMITS.msgChars && utf8.byteLength(t) <= LIMITS.msgBytes;
}

export async function sendText(matchId: string, text: string) {
  const m = getApp().matches[matchId];
  if (!m || m.closed || !canSend(text)) return;
  const payload = textPayload(text.trim());
  const id = hex.encode(payload.msgId);
  const sealed = sealChat(unb64(m.key), payload);
  addMsg(matchId, { id, mine: true, text: text.trim(), at: payload.ts, status: 'sending', sealed: b64(sealed) });
  setApp((s) => ({ matches: { ...s.matches, [matchId]: { ...s.matches[matchId], lastAt: payload.ts } } }));
  await deliver(matchId, id);
}

async function deliver(matchId: string, msgId: string) {
  const { matches, messages, account } = getApp();
  const m = matches[matchId];
  const msg = messages[matchId]?.find((x) => x.id === msgId);
  if (!m || !msg?.sealed) return;
  const peer = services.nearby.peerForMatch(matchId);
  if (peer) {
    try {
      await services.nearby.sendToSid(peer.sid, msgEnvelopeFromSealed(unb64(m.key), unb64(msg.sealed)));
      dropOps((o) => o.mid === msgId);
      updateMsg(matchId, msgId, { status: 'ble', via: 'ble', sealed: undefined });
      return;
    } catch {
      // walked out of range mid-send; fall through to the internet road
    }
  }
  if (m.serverId && account) {
    if (!getApp().outbox.some((o) => o.mid === msgId)) queueOp({ k: 'msg', m: m.serverId, b$: msg.sealed, mid: msgId });
    updateMsg(matchId, msgId, { status: 'queued' });
    services.sync.kick('send');
    return;
  }
  updateMsg(matchId, msgId, { status: 'waiting' });
}

/** Called when a match comes into Bluetooth range or gets linked to the server. */
export function flushWaiting(matchId: string) {
  const list = getApp().messages[matchId] ?? [];
  for (const msg of list) {
    if (msg.mine && msg.sealed && (msg.status === 'waiting' || msg.status === 'queued')) void deliver(matchId, msg.id);
  }
}

export function markSent(msgId: string) {
  const { messages } = getApp();
  for (const [matchId, list] of Object.entries(messages)) {
    if (list.some((m) => m.id === msgId)) updateMsg(matchId, msgId, { status: 'sent', via: 'net', sealed: undefined });
  }
}

export function receiveChat(matchId: string, p: ChatPayload, via: 'ble' | 'net') {
  const id = hex.encode(p.msgId);
  const { messages, matches } = getApp();
  const m = matches[matchId];
  if (!m || (messages[matchId] ?? []).some((x) => x.id === id)) return;
  if (p.kind === MSG_KIND.KEYS) {
    if (p.data.length >= 16) setApp((s) => ({ matches: { ...s.matches, [matchId]: { ...m, recKey: b64(p.data.slice(0, 16)) } } }));
    return;
  }
  if (p.kind !== MSG_KIND.TEXT) return;
  addMsg(matchId, { id, mine: false, text: utf8.decode(p.data), at: Math.min(p.ts, nowSec()), status: 'received', via });
  setApp((s) => ({
    matches: {
      ...s.matches,
      [matchId]: { ...s.matches[matchId], lastAt: nowSec(), unread: openChatId === matchId ? 0 : s.matches[matchId].unread + 1 },
    },
  }));
}

/** After an internet match, send our recognition key so they can spot us in a room later. */
export function sendKeys(matchId: string) {
  const m = getApp().matches[matchId];
  if (!m?.serverId || m.keysSent) return;
  const keys = ensureKeys();
  const sealed = sealChat(unb64(m.key), { msgId: randomBytes(8), ts: nowSec(), kind: MSG_KIND.KEYS, data: unb64(keys.recKey) });
  queueOp({ k: 'msg', m: m.serverId, b$: b64(sealed) });
  setApp((s) => ({ matches: { ...s.matches, [matchId]: { ...m, keysSent: true } } }));
}

export async function unmatch(matchId: string) {
  const m = getApp().matches[matchId];
  if (!m) return;
  const peer = services.nearby.peerForMatch(matchId);
  if (peer) await services.nearby.sendToSid(peer.sid, encodeUnmatch(unb64(m.key))).catch(() => {});
  if (m.serverId) queueOp({ k: 'um', m: m.serverId });
  closeMatchLocal(matchId);
  services.sync.kick('unmatch');
}

export function closeMatchLocal(matchId: string) {
  setApp((s) => (s.matches[matchId] ? { matches: { ...s.matches, [matchId]: { ...s.matches[matchId], closed: true } } } : {}));
  useUi.setState((u) => {
    const peers = { ...u.peers };
    for (const [sid, p] of Object.entries(peers)) if (p.matchId === matchId) peers[sid] = { ...p, matchId: undefined };
    return { peers };
  });
}
