import { requireOptionalNativeModule } from 'expo';

export interface NearbyBleStartOptions {
  serviceUuid: string;
  cardUuid: string;
  inboxUuid: string;
  photoUuid: string;
  /** base64 */
  card: string;
  /** base64, or null for no photo */
  photo: string | null;
}

export interface InboxEvent {
  /** the writing phone's address (MAC on Android, UUID on iOS) */
  from: string;
  /** base64 bytes of one frame */
  data: string;
}

export interface StateEvent {
  state: 'advertising' | 'stopped' | 'error';
  message?: string;
}

type Sub = { remove(): void };

export interface NearbyBleModule {
  isSupported(): Promise<boolean>;
  start(options: NearbyBleStartOptions): Promise<void>;
  setCard(card: string): Promise<void>;
  setPhoto(photo: string | null): Promise<void>;
  stop(): Promise<void>;
  addListener(event: 'onInbox', listener: (e: InboxEvent) => void): Sub;
  addListener(event: 'onState', listener: (e: StateEvent) => void): Sub;
}

/** null on web and in Expo Go — the app falls back to simulated people there. */
const NearbyBle = requireOptionalNativeModule<NearbyBleModule>('NearbyBle');
export default NearbyBle;
