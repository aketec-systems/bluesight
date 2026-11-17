import {
  LIMITS,
  Reader,
  ageFromDob,
  base64,
  encodeCard,
  hex,
  maskFromVibes,
  newBoxKeyPair,
  newSignKeyPair,
  randomBytes,
  recognitionTag,
  sidOf,
  type Session,
} from '@bluesight/protocol';
import { getApp, setApp, type Keys, type SessionKey } from './store';
import { gradientThumbhash } from './thumbs';

export const b64 = base64.encode;
export const unb64 = base64.decode;
export const nowSec = () => Math.floor(Date.now() / 1000);

/** Long-term identity + recognition key, created once per install. */
export function ensureKeys(): Keys {
  const existing = getApp().keys;
  if (existing) return existing;
  const kp = newBoxKeyPair();
  const keys = { idPk: b64(kp.publicKey), idSk: b64(kp.secretKey), recKey: b64(randomBytes(16)) };
  setApp({ keys });
  return keys;
}

const DAY = 86400;

function prune(list: SessionKey[]) {
  const t = nowSec();
  return list.filter((s) => s.exp > t - DAY);
}

/**
 * Today's Bluetooth identity. Prefers a session the server has vouched for (a "verified" card);
 * falls back to a local one so Nearby works on a phone that has never been online.
 */
export function currentSession(): SessionKey {
  const t = nowSec();
  const sessions = prune(getApp().sessions);
  const usable = sessions.filter((s) => s.exp > t + 3600).sort((a, b) => a.exp - b.exp);
  const pick = usable.find((s) => s.pass) ?? usable[0];
  if (pick) return pick;
  const kp = newSignKeyPair();
  const s: SessionKey = { signPk: b64(kp.publicKey), signSk: b64(kp.secretKey), exp: t + DAY };
  setApp({ sessions: [...sessions, s] });
  return s;
}

/** Recent sessions, to open likes that arrive just after a rotation. */
export function recentSessions(): Session[] {
  return prune(getApp().sessions).map((s) => ({ signPk: unb64(s.signPk), signSk: unb64(s.signSk) }));
}

export const toSession = (s: SessionKey): Session => ({ signPk: unb64(s.signPk), signSk: unb64(s.signSk) });
export const sessionSid = (s: SessionKey) => hex.encode(sidOf(unb64(s.signPk)));

export function passExpiry(pass: string): number {
  return new Reader(unb64(pass)).u32();
}

/** How many more verified days we should fetch passes for. */
export function passesNeeded(): number {
  const t = nowSec();
  const ahead = getApp().sessions.filter((s) => s.pass && s.exp > t + 6 * 3600).length;
  return ahead >= 2 ? 0 : 3;
}

export function newPendingSessions(n: number) {
  return Array.from({ length: n }, () => newSignKeyPair());
}

export function accountIdBytes(): Uint8Array {
  const uid = getApp().account?.uid;
  return uid && /^[0-9a-f]{16}$/.test(uid) ? hex.decode(uid) : new Uint8Array(8);
}

export function myThumbhash(): Uint8Array {
  const { profile } = getApp();
  if (profile?.photo) return unb64(profile.photo.th);
  return gradientThumbhash(profile?.name ?? 'me');
}

/** The signed card this phone serves over Bluetooth, plus the photo it serves alongside. */
export function buildMyCard(session: SessionKey): { card: Uint8Array; photo: Uint8Array | null } {
  const { profile, settings } = getApp();
  const keys = ensureKeys();
  if (!profile) throw new Error('no profile');
  const signPk = unb64(session.signPk);
  let photo = profile.photo && settings.blePhotos ? unb64(profile.photo.s) : null;
  if (photo && photo.length > LIMITS.blePhotoBytes) photo = null;
  const card = encodeCard(
    {
      signPk,
      rtag: recognitionTag(unb64(keys.recKey), sidOf(signPk)),
      age: ageFromDob(profile.dob) ?? 18,
      gender: profile.gender,
      intent: profile.intent,
      vibes: maskFromVibes(profile.vibes),
      name: profile.name,
      bio: profile.bio,
      thumbhash: myThumbhash(),
      photo: photo && profile.photo ? { len: photo.length, hash: hex.decode(profile.photo.hash) } : undefined,
      pass: session.pass ? unb64(session.pass) : undefined,
    },
    unb64(session.signSk),
  );
  return { card, photo };
}
