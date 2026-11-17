import type { NearbyStatus } from '../store';

export interface TransportEvents {
  /** an advertisement from another Bluesight phone */
  seen(deviceId: string, rssi: number): void;
  /** one frame written into our inbox characteristic */
  inbox(from: string, frame: Uint8Array): void;
  state(status: NearbyStatus, detail?: string): void;
}

export interface StartOptions {
  card: Uint8Array;
  photo: Uint8Array | null;
  /** serve our card and accept writes (off = browse invisibly) */
  advertise: boolean;
}

/**
 * The radio, abstracted. BleTransport talks to real phones; SimTransport fakes a room full of
 * people for the web preview and for testing alone. The engine above is identical for both.
 */
export interface Transport {
  readonly kind: 'ble' | 'sim' | 'mux';
  start(o: StartOptions, ev: TransportEvents): Promise<void>;
  stop(): Promise<void>;
  setCard(card: Uint8Array, photo: Uint8Array | null): Promise<void>;
  setAdvertising(on: boolean): Promise<void>;
  readCard(deviceId: string): Promise<Uint8Array>;
  readPhoto(deviceId: string, expectedLen: number): Promise<Uint8Array>;
  send(deviceId: string, envelope: Uint8Array): Promise<void>;
}
