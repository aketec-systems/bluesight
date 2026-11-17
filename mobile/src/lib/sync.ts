import { openChat } from '@bluesight/protocol';
import { ApiError, type WireChange } from './api/types';
import { closeMatchLocal, markSent, receiveChat } from './chat';
import { canUse } from './data';
import { b64, newPendingSessions, passExpiry, passesNeeded, unb64 } from './identity';
import { applyServerMatch, findByServerId } from './matches';
import { toWire } from './outbox';
import { services } from './services';
import { getApp, setApp, toast, useUi } from './store';

/**
 * One round trip carries everything both ways. How often it runs depends on the data mode:
 * Full ≈ every 2 minutes, Lite ≈ every 10 minutes, plus right after you send a message.
 * Swipes are batched for a few seconds so ten swipes cost one request, not ten.
 */
export class SyncEngine {
  private running = false;
  private again = false;
  private kickTimer?: ReturnType<typeof setTimeout>;
  private timer?: ReturnType<typeof setInterval>;
  private lastRun = 0;

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.onTimer(), 30_000);
    services.api?.onPush?.(() => this.kick('push'));
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private onTimer() {
    const every = getApp().settings.dataMode === 'full' ? 120_000 : 600_000;
    if (Date.now() - this.lastRun > every) void this.run();
  }

  kick(reason: 'open' | 'send' | 'swipe' | 'push' | 'match' | 'account' | 'manual' | 'unmatch' | 'again') {
    const full = getApp().settings.dataMode === 'full';
    const delay = reason === 'swipe' ? (full ? 1500 : 6000) : reason === 'account' ? 50 : 600;
    if (this.kickTimer) clearTimeout(this.kickTimer);
    this.kickTimer = setTimeout(() => void this.run(), delay);
  }

  async run() {
    const api = services.api;
    if (!api || !getApp().account || !canUse('sync')) return;
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    useUi.setState({ syncing: true });
    try {
      for (let round = 0; round < 6; round++) {
        const { outbox, cursor, account } = getApp();
        if (!account) break;
        const ops = outbox.slice(0, 50);
        const res = await api.sync(account.token, cursor, ops.map(toWire));
        const done = new Set([...res.acks, ...(res.errs ?? []).map((e) => e.id)]);
        for (const op of ops) if (op.k === 'msg' && typeof op.mid === 'string' && done.has(op.id)) markSent(op.mid);
        setApp((s) => ({ outbox: s.outbox.filter((o) => !done.has(o.id)), cursor: res.c }));
        for (const ch of res.ch) this.apply(ch);
        if (!res.more && ops.length < 50) break;
      }
      this.lastRun = Date.now();
      await this.afterSync();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setApp({ account: undefined });
        toast('Your sign-in expired. Verify your number again in Me.');
      }
    } finally {
      this.running = false;
      useUi.setState({ syncing: false });
      if (this.again) {
        this.again = false;
        this.kick('again');
      }
    }
  }

  private apply(ch: WireChange) {
    if (ch.k === 'm') return applyServerMatch(ch);
    const m = findByServerId(ch.m);
    if (!m) return;
    if (ch.k === 'um') return closeMatchLocal(m.id);
    const payload = openChat(unb64(m.key), ch.b);
    if (payload) receiveChat(m.id, payload, 'net');
  }

  /** Small housekeeping that rides on a successful sync: photo upload and tomorrow's passes. */
  private async afterSync() {
    const api = services.api!;
    const st = getApp();
    const token = st.account?.token;
    if (!token) return;
    try {
      if (!st.serverPk) setApp({ serverPk: b64((await api.info()).spk) });
      const photo = st.profile?.photo;
      if (photo && st.pendingUploads.s && canUse('uploadSmall')) {
        await api.uploadPhoto(token, 's', unb64(photo.s), unb64(photo.th));
        setApp((s) => ({ pendingUploads: { ...s.pendingUploads, s: false } }));
      }
      if (photo?.f && getApp().pendingUploads.f && !getApp().pendingUploads.s && canUse('uploadFull')) {
        await api.uploadPhoto(token, 'f', unb64(photo.f));
        setApp((s) => ({ pendingUploads: { ...s.pendingUploads, f: false } }));
      }
      const n = passesNeeded();
      if (n && st.profile && canUse('passes')) {
        const kps = newPendingSessions(n);
        const ps = await api.passes(token, kps.map((k) => k.publicKey));
        setApp((s) => ({
          sessions: [
            ...s.sessions,
            ...ps.map((p, i) => ({ signPk: b64(kps[i].publicKey), signSk: b64(kps[i].secretKey), pass: b64(p), exp: passExpiry(b64(p)) })),
          ],
        }));
      }
    } catch {
      // retried on the next sync
    }
  }
}
