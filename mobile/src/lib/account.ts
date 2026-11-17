import * as Location from 'expo-location';
import { snapToGrid } from '@bluesight/protocol';
import { config } from './config';
import { canUse, networkBlockReason } from './data';
import { b64 } from './identity';
import { queueOp, queueProfileOp } from './outbox';
import { services } from './services';
import { getApp, setApp, toast, useUi, type AroundCard, type Settings as AppSettings } from './store';

export const hasServer = () => !!services.api;

export function normalizePhone(raw: string) {
  const digits = raw.replace(/[^\d+]/g, '');
  return digits.startsWith('+') ? digits : `+${digits}`;
}

export async function requestCode(phone: string) {
  if (!services.api) throw new Error('no server');
  return services.api.authStart(normalizePhone(phone));
}

export async function verifyCode(phone: string, code: string) {
  if (!services.api) throw new Error('no server');
  const ph = normalizePhone(phone);
  const r = await services.api.authVerify(ph, code.trim());
  setApp({
    account: { uid: r.uid, token: r.tk, phone: ph },
    serverPk: b64(r.spk),
    cursor: 0,
    pendingUploads: { s: true, f: true },
  });
  if (getApp().profile) queueProfileOp();
  services.sync.kick('account');
}

/** Profile edits reach the server on the next sync; the Bluetooth card updates immediately. */
export function profileChanged(photoChanged: boolean) {
  if (getApp().account) {
    queueProfileOp();
    if (photoChanged) setApp({ pendingUploads: { s: true, f: true } });
    services.sync.kick('manual');
  }
  void services.nearby.refreshCard();
}

async function coarseLocation(): Promise<{ lat: number; lon: number } | undefined> {
  if (config.demo) return undefined;
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return getApp().lastLoc;
    const pos = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Lowest }));
    const g = snapToGrid(pos.coords.latitude, pos.coords.longitude);
    setApp({ lastLoc: g });
    return g;
  } catch {
    return getApp().lastLoc;
  }
}

let loading = false;
/** bumps when the search location changes, so a deck still loading for the old place is dropped */
let deckGen = 0;

/** Fetches the next 20 people (~4 KB with headers) near you or in the city you chose, only when the deck runs low. */
export async function loadAroundDeck(force = false) {
  const api = services.api;
  const st = getApp();
  if (!api || !st.account || loading) return;
  const remaining = st.aroundDeck.filter((c) => !(c.u in st.aroundSwipes));
  if (!force && remaining.length >= 6) return;
  if (!canUse('deck')) {
    if (force) toast(networkBlockReason() ?? 'Data is off for now.');
    return;
  }
  loading = true;
  const gen = deckGen;
  try {
    const city = st.settings.searchCity;
    const loc = city ? snapToGrid(city.lat, city.lon) : await coarseLocation();
    const cards = await api.deck(st.account.token, 20, loc, !!city);
    if (gen !== deckGen) return;
    useUi.setState({ aroundNeedsLocation: !city && !loc && cards.length === 0 });
    setApp((s) => {
      const keep = s.aroundDeck.filter((c) => !(c.u in s.aroundSwipes));
      const seen = new Set(keep.map((c) => c.u));
      const fresh: AroundCard[] = cards
        .filter((c) => !seen.has(c.u) && !(c.u in s.aroundSwipes))
        .map((c) => ({ u: c.u, n: c.n, a: c.a, g: c.g, i: c.i, v: c.v, b: c.b, li: c.li, aw: c.aw, th: c.th ? b64(c.th) : undefined, p: c.p, ps: c.ps, d: c.d }));
      return { aroundDeck: [...keep, ...fresh] };
    });
  } catch {
    if (force && gen === deckGen) toast("Couldn't load people. Try again in a bit.");
  } finally {
    loading = false;
    if (gen !== deckGen) void loadAroundDeck(true);
  }
}

/**
 * Search somewhere else, e.g. back home before a trip. The old deck belonged to the old place, so
 * it's dropped (swipes are kept) and the next 20 people come from the new one.
 */
export function setSearchCity(city: AppSettings['searchCity']) {
  const cur = getApp().settings.searchCity;
  if (cur?.name === city?.name && cur?.country === city?.country) return;
  deckGen++;
  useUi.setState({ aroundNeedsLocation: false });
  setApp((s) => ({ settings: { ...s.settings, searchCity: city }, aroundDeck: [] }));
  void loadAroundDeck(true);
}

export function swipeAround(card: AroundCard, liked: boolean) {
  setApp((s) => ({ aroundSwipes: { ...s.aroundSwipes, [card.u]: liked } }));
  queueOp({ k: 'sw', to: card.u, l: liked ? 1 : 0 });
  services.sync.kick('swipe');
  void loadAroundDeck();
}

export function block(target: { uid?: string; sid?: string }) {
  setApp((s) => ({
    blocked: {
      uids: target.uid && !s.blocked.uids.includes(target.uid) ? [...s.blocked.uids, target.uid] : s.blocked.uids,
      sids: target.sid && !s.blocked.sids.includes(target.sid) ? [...s.blocked.sids, target.sid] : s.blocked.sids,
    },
  }));
}

export function report(target: { uid?: string; sid?: string; card?: string }, reason: string, note: string, evidence: string[]) {
  block(target);
  if (target.uid) queueOp({ k: 'rep', to: target.uid, r: reason, note: note || undefined, ev: evidence });
  else if (target.card) queueOp({ k: 'rep', card$: target.card, r: reason, note: note || undefined, ev: evidence });
  services.sync.kick('manual');
}
