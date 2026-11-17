import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';

export type DataMode = 'zero' | 'lite' | 'full';
export type Category = 'sync' | 'deck' | 'photos' | 'upload' | 'account';

export interface Photo {
  /** 320 px JPEG, base64 — served over Bluetooth and used for Lite mode */
  s: string;
  /** 800 px JPEG, base64 — uploaded only on Wi-Fi */
  f?: string;
  /** thumbhash, base64 (~25 bytes) */
  th: string;
  /** 4-byte hash of `s`, hex */
  hash: string;
  sBytes: number;
}

export interface Profile {
  name: string;
  dob: string;
  gender: number;
  /** private: bitmask of genders to show (never sent over Bluetooth) */
  showMe: number;
  ageMin: number;
  ageMax: number;
  intent: number;
  vibes: number[];
  bio: string;
  photo?: Photo;
  radiusKm: number;
  /** optional, e.g. "Maryland, USA"; shown on your card when you browse another city */
  livesIn?: string;
}

export interface Keys {
  /** long-term X25519 identity (base64) */
  idPk: string;
  idSk: string;
  /** lets matches recognise this phone's rotating cards (base64, 16 bytes) */
  recKey: string;
}

export interface SessionKey {
  signPk: string;
  signSk: string;
  /** nearby pass from the server (base64), absent when the phone has never been online */
  pass?: string;
  /** unix seconds */
  exp: number;
}

export interface Account {
  uid: string;
  token: string;
  phone: string;
}

export interface Match {
  id: string;
  serverId?: string;
  peerUid?: string;
  name: string;
  age: number;
  gender: number;
  intent: number;
  vibes: number;
  bio: string;
  /** where they live, if they said (matches made on Around) */
  livesIn?: string;
  thumbhash?: string;
  /** data URI of a photo pulled over Bluetooth */
  photoData?: string;
  /** server photo key */
  photoKey?: string;
  identityPk: string;
  key: string;
  recKey?: string;
  source: 'nearby' | 'around';
  createdAt: number;
  lastAt: number;
  unread: number;
  closed?: boolean;
  /** our recognition key was delivered to them */
  keysSent?: boolean;
}

export type MsgStatus = 'sending' | 'ble' | 'queued' | 'sent' | 'waiting' | 'received';

export interface ChatMsg {
  id: string;
  mine: boolean;
  text: string;
  at: number;
  status: MsgStatus;
  via?: 'ble' | 'net';
  /** sealed payload kept until delivered (base64) */
  sealed?: string;
}

export interface AroundCard {
  u: string;
  n: string;
  a: number;
  g: number;
  i: number;
  v: number;
  b: string;
  li?: string;
  /** browsing this city from elsewhere */
  aw?: 1;
  th?: string;
  p?: string;
  ps?: [number, number];
  d: string;
}

export interface OutboxOp {
  id: string;
  k: string;
  /** fields ending in `$` hold base64 and are sent as binary */
  [field: string]: unknown;
}

export interface Usage {
  month: string;
  cell: Record<Category, number>;
  wifi: number;
  /** bytes Bluetooth carried that would otherwise have cost data */
  ble: number;
}

export interface Settings {
  dataMode: DataMode;
  budgetMB: number;
  visible: boolean;
  verifiedOnly: boolean;
  blePhotos: boolean;
  /** adds simulated people nearby, for trying the app alone */
  simulate: boolean;
  wifiFree: boolean;
  /** Around searches here instead of where you are (e.g. back home). null = near me. */
  searchCity: { name: string; country: string; lat: number; lon: number } | null;
}

/** What we remember about someone we liked over Bluetooth, so a late match can still be shown. */
export interface PeerSnap {
  signPk: string;
  name: string;
  age: number;
  gender: number;
  intent: number;
  vibes: number;
  bio: string;
  thumbhash: string;
  photoData?: string;
}

export interface AppState {
  profile?: Profile;
  keys?: Keys;
  sessions: SessionKey[];
  account?: Account;
  serverPk?: string;
  settings: Settings;
  usage: Usage;
  matches: Record<string, Match>;
  messages: Record<string, ChatMsg[]>;
  nearbySwipes: Record<string, { liked: boolean; at: number; snap?: PeerSnap }>;
  incomingLikes: Record<string, { at: number; signPk: string }>;
  sentMatch: Record<string, number>;
  aroundDeck: AroundCard[];
  aroundSwipes: Record<string, boolean>;
  revealedPhotos: Record<string, true>;
  outbox: OutboxOp[];
  cursor: number;
  blocked: { uids: string[]; sids: string[] };
  pendingUploads: { s?: boolean; f?: boolean };
  lastLoc?: { lat: number; lon: number };
}

export const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export const emptyUsage = (): Usage => ({
  month: monthKey(),
  cell: { sync: 0, deck: 0, photos: 0, upload: 0, account: 0 },
  wifi: 0,
  ble: 0,
});

export const initialState: AppState = {
  sessions: [],
  settings: {
    dataMode: 'lite',
    budgetMB: 20,
    visible: true,
    verifiedOnly: false,
    blePhotos: true,
    simulate: false,
    wifiFree: true,
    searchCity: null,
  },
  usage: emptyUsage(),
  matches: {},
  messages: {},
  nearbySwipes: {},
  incomingLikes: {},
  sentMatch: {},
  aroundDeck: [],
  aroundSwipes: {},
  revealedPhotos: {},
  outbox: [],
  cursor: 0,
  blocked: { uids: [], sids: [] },
  pendingUploads: {},
};

/** Writes are debounced: the store changes often, the disk shouldn't. */
let pendingWrite: { name: string; value: string } | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;

async function writeNow() {
  if (!pendingWrite) return;
  const { name, value } = pendingWrite;
  pendingWrite = null;
  try {
    await AsyncStorage.setItem(name, value);
  } catch {
    // storage full or unavailable (private browsing); the app keeps working in memory
  }
}

export function flushPersist() {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = null;
  return writeNow();
}

const storage: PersistStorage<AppState> = {
  async getItem(name) {
    try {
      const raw = await AsyncStorage.getItem(name);
      return raw ? (JSON.parse(raw) as StorageValue<AppState>) : null;
    } catch {
      return null;
    }
  },
  setItem(name, value) {
    pendingWrite = { name, value: JSON.stringify(value) };
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(writeNow, 800);
  },
  async removeItem(name) {
    try {
      await AsyncStorage.removeItem(name);
    } catch {}
  },
};

export const useApp = create<AppState>()(
  persist(() => initialState, {
    name: 'bluesight-v1',
    storage,
    version: 1,
    merge: (persisted, current) => {
      const p = (persisted ?? {}) as Partial<AppState>;
      return { ...current, ...p, settings: { ...current.settings, ...p.settings } };
    },
  }),
);

export const getApp = () => useApp.getState();
export const setApp = (partial: Partial<AppState> | ((s: AppState) => Partial<AppState>)) =>
  useApp.setState(partial as Partial<AppState>);

export function resetApp() {
  useApp.setState({ ...initialState, usage: emptyUsage() }, true);
  void flushPersist();
}

/* ---------- ephemeral state (never persisted) ---------- */

export type NearbyStatus = 'off' | 'starting' | 'on' | 'bt-off' | 'denied' | 'unsupported' | 'error';

export interface Peer {
  sid: string;
  deviceId: string;
  signPk: string;
  name: string;
  age: number;
  gender: number;
  intent: number;
  vibes: number;
  bio: string;
  thumbhash: string;
  photoLen?: number;
  photoHash?: string;
  photoData?: string;
  verified: boolean;
  /** raw signed card, kept so a report can prove what was shown */
  card: string;
  rssi: number;
  proximity: 0 | 1 | 2;
  firstSeen: number;
  lastSeen: number;
  matchId?: string;
}

export interface UiState {
  peers: Record<string, Peer>;
  nearby: NearbyStatus;
  nearbyError?: string;
  online: boolean;
  metered: boolean;
  syncing: boolean;
  matchSplash?: string;
  toast?: { text: string; id: number };
  /** Around found nobody because we don't know where "near me" is (no location permission yet) */
  aroundNeedsLocation?: boolean;
}

export const useUi = create<UiState>()(() => ({
  peers: {},
  nearby: 'off',
  online: true,
  metered: true,
  syncing: false,
}));

let toastId = 0;
export function toast(text: string) {
  useUi.setState({ toast: { text, id: ++toastId } });
}
