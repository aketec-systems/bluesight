import { hex, maskFromVibes, randomBytes } from '@bluesight/protocol';
import { ensureKeys, unb64 } from './identity';
import { getApp, setApp, type OutboxOp } from './store';

export const rid = () => hex.encode(randomBytes(6));

/** Everything the server needs to hear about waits here until the next (batched) sync. */
export function queueOp(op: { k: string; [field: string]: unknown }): string {
  const id = rid();
  setApp((s) => ({ outbox: [...s.outbox, { ...op, id } as OutboxOp] }));
  return id;
}

export function dropOps(pred: (o: OutboxOp) => boolean) {
  setApp((s) => ({ outbox: s.outbox.filter((o) => !pred(o)) }));
}

/** Fields ending in "$" are stored as base64 (JSON-safe) and sent as binary. Client-only fields are stripped. */
export function toWire(op: OutboxOp): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(op)) {
    if (k === 'mid') continue;
    if (k.endsWith('$') && typeof v === 'string') out[k.slice(0, -1)] = unb64(v);
    else out[k] = v;
  }
  return out;
}

/** Only the latest profile matters, so a new edit replaces any queued one. */
export function queueProfileOp() {
  const { profile } = getApp();
  if (!profile) return;
  const keys = ensureKeys();
  setApp((s) => ({
    outbox: [
      ...s.outbox.filter((o) => o.k !== 'me'),
      {
        id: rid(),
        k: 'me',
        n: profile.name,
        dob: profile.dob,
        g: profile.gender,
        sm: profile.showMe,
        amin: profile.ageMin,
        amax: profile.ageMax,
        i: profile.intent,
        v: maskFromVibes(profile.vibes),
        b: profile.bio,
        r: profile.radiusKm,
        li: profile.livesIn || undefined,
        pk$: keys.idPk,
      },
    ],
  }));
}
