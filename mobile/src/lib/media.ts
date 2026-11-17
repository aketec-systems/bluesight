import { canUse } from './data';
import { services } from './services';
import { getApp, setApp, type Match } from './store';

/** URL for a server photo, or undefined when the data plan says not to fetch it yet. */
export function remotePhoto(key: string | undefined, ownerId: string | undefined, v: 's' | 'f' = 's'): string | undefined {
  if (!key || !services.api) return undefined;
  const st = getApp();
  if ((ownerId && st.revealedPhotos[ownerId]) || canUse('photoAuto')) return services.api.photoUrl(key, v) || undefined;
  return undefined;
}

export function revealPhoto(ownerId: string) {
  setApp((s) => ({ revealedPhotos: { ...s.revealedPhotos, [ownerId]: true } }));
}

export function matchPhoto(m: Match): string | undefined {
  return m.photoData ?? remotePhoto(m.photoKey, m.peerUid);
}
