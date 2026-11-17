import { PermissionsAndroid, Platform } from 'react-native';
import { BLE_UUIDS, LIMITS, base64, concat, parsePhotoChunk, photoStartRequest, toFrames } from '@bluesight/protocol';
import NearbyBle from '../../../modules/nearby-ble';
import type { StartOptions, Transport, TransportEvents } from './types';

type BleModule = typeof import('react-native-ble-manager');

/** Loaded lazily: the native module is absent on web and in Expo Go. */
function loadBle(): BleModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-ble-manager') as BleModule;
  } catch {
    return null;
  }
}

const SVC = BLE_UUIDS.service;

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${what} timed out`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** One GATT operation chain per remote phone; Android in particular falls over with parallel ops. */
class Lock {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn, fn);
    this.tail = next.catch(() => undefined);
    return next;
  }
}

interface Link {
  maxWrite: number;
  idle?: ReturnType<typeof setTimeout>;
}

/**
 * Real Bluetooth: react-native-ble-manager for the central role (scan, connect, read, write) and
 * our own NearbyBle module for the peripheral role (advertise + serve card/inbox/photo).
 */
export class BleTransport implements Transport {
  readonly kind = 'ble' as const;
  private mod = loadBle();
  private subs: { remove(): void }[] = [];
  private links = new Map<string, Link>();
  private locks = new Map<string, Lock>();
  private ev?: TransportEvents;
  private scanning = false;
  private advertising = false;
  private card: Uint8Array = new Uint8Array(0);
  private photo: Uint8Array | null = null;

  static isAvailable() {
    return !!NearbyBle && !!loadBle();
  }

  private get ble() {
    if (!this.mod) throw new Error('Bluetooth unavailable');
    return this.mod.default;
  }

  async start(o: StartOptions, ev: TransportEvents) {
    this.ev = ev;
    this.card = o.card;
    this.photo = o.photo;
    if (!this.mod || !NearbyBle) {
      ev.state('unsupported', 'This build has no Bluetooth module. Install a development or release build.');
      return;
    }
    if (!(await this.requestPermissions())) {
      ev.state('denied', 'Allow Nearby devices / Bluetooth to find people around you.');
      return;
    }
    await this.ble.start({ showAlert: false });
    const state = await this.ble.checkState();
    if (state !== 'on') {
      if (Platform.OS === 'android') {
        try {
          await this.ble.enableBluetooth();
        } catch {
          ev.state('bt-off');
          return;
        }
      } else {
        ev.state('bt-off');
        return;
      }
    }
    this.subs.push(
      this.ble.onDiscoverPeripheral((p) => this.ev?.seen(p.id, p.rssi)),
      this.ble.onStopScan(() => {
        if (this.scanning) setTimeout(() => void this.scan(), 400);
      }),
      this.ble.onDisconnectPeripheral((e) => {
        const l = this.links.get(e.peripheral);
        if (l?.idle) clearTimeout(l.idle);
        this.links.delete(e.peripheral);
      }),
      NearbyBle.addListener('onInbox', (e) => this.ev?.inbox(e.from, base64.decode(e.data))),
      NearbyBle.addListener('onState', (e) => {
        if (e.state === 'error') this.ev?.state('error', e.message);
      }),
    );
    await this.setAdvertising(o.advertise);
    this.scanning = true;
    await this.scan();
    ev.state('on');
  }

  private async scan() {
    if (!this.mod) return;
    await this.ble.scan({
      serviceUUIDs: [SVC],
      seconds: 0,
      allowDuplicates: true,
      scanMode: this.mod.BleScanMode.LowLatency,
    });
  }

  async stop() {
    this.scanning = false;
    for (const s of this.subs) s.remove();
    this.subs = [];
    if (!this.mod) return;
    await this.ble.stopScan().catch(() => {});
    await NearbyBle?.stop().catch(() => {});
    this.advertising = false;
    for (const [id, l] of this.links) {
      if (l.idle) clearTimeout(l.idle);
      await this.ble.disconnect(id).catch(() => {});
    }
    this.links.clear();
  }

  async setCard(card: Uint8Array, photo: Uint8Array | null) {
    this.card = card;
    this.photo = photo;
    if (!this.advertising || !NearbyBle) return;
    await NearbyBle.setCard(base64.encode(card));
    await NearbyBle.setPhoto(photo ? base64.encode(photo) : null);
  }

  async setAdvertising(on: boolean) {
    if (!NearbyBle) return;
    if (on) {
      await NearbyBle.start({
        serviceUuid: SVC,
        cardUuid: BLE_UUIDS.card,
        inboxUuid: BLE_UUIDS.inbox,
        photoUuid: BLE_UUIDS.photo,
        card: base64.encode(this.card),
        photo: this.photo ? base64.encode(this.photo) : null,
      });
    } else if (this.advertising) {
      await NearbyBle.stop();
    }
    this.advertising = on;
  }

  private lock(id: string) {
    let l = this.locks.get(id);
    if (!l) this.locks.set(id, (l = new Lock()));
    return l;
  }

  /** Connects (or reuses a warm link), discovers our service and works out the write size. */
  private async open(id: string): Promise<number> {
    const warm = this.links.get(id);
    if (warm) {
      if (warm.idle) clearTimeout(warm.idle);
      return warm.maxWrite;
    }
    try {
      await withTimeout(this.ble.connect(id), 6000, 'connect');
      await withTimeout(this.ble.retrieveServices(id, [SVC]), 6000, 'discover');
    } catch (e) {
      await this.ble.disconnect(id).catch(() => {});
      throw e;
    }
    let maxWrite = 20;
    if (Platform.OS === 'android') {
      try {
        maxWrite = Math.max(20, (await withTimeout(this.ble.requestMTU(id, 517), 3000, 'mtu')) - 3);
      } catch {}
    } else {
      try {
        maxWrite = await this.ble.getMaximumWriteValueLengthForWithoutResponse(id);
      } catch {
        maxWrite = 182;
      }
    }
    this.links.set(id, { maxWrite });
    return maxWrite;
  }

  /** Keep the link warm briefly so a card read can be followed by a photo read or a like. */
  private release(id: string) {
    const l = this.links.get(id);
    if (!l) return;
    l.idle = setTimeout(() => {
      this.links.delete(id);
      this.ble.disconnect(id).catch(() => {});
    }, 2500);
  }

  private withLink<T>(id: string, fn: (maxWrite: number) => Promise<T>): Promise<T> {
    return this.lock(id).run(async () => {
      const maxWrite = await this.open(id);
      try {
        return await fn(maxWrite);
      } catch (e) {
        this.links.delete(id);
        await this.ble.disconnect(id).catch(() => {});
        throw e;
      } finally {
        this.release(id);
      }
    });
  }

  readCard(id: string) {
    return this.withLink(id, async () => Uint8Array.from(await withTimeout(this.ble.read(id, SVC, BLE_UUIDS.card), 5000, 'read card')));
  }

  readPhoto(id: string, expectedLen: number) {
    return this.withLink(id, async () => {
      const start = photoStartRequest(0);
      await withTimeout(this.ble.write(id, SVC, BLE_UUIDS.photo, Array.from(start), start.length), 5000, 'photo start');
      const parts: Uint8Array[] = [];
      let count = 1;
      for (let i = 0; i < count && i < 80; i++) {
        const raw = Uint8Array.from(await withTimeout(this.ble.read(id, SVC, BLE_UUIDS.photo), 5000, 'read photo'));
        const chunk = parsePhotoChunk(raw);
        if (!chunk || chunk.index !== i) throw new Error('photo transfer out of sync');
        count = chunk.count;
        parts.push(chunk.data);
      }
      const photo = concat(...parts);
      if (photo.length !== expectedLen || photo.length > LIMITS.blePhotoBytes) throw new Error('photo size mismatch');
      return photo;
    });
  }

  send(id: string, envelope: Uint8Array) {
    return this.withLink(id, async (maxWrite) => {
      const frames = toFrames(envelope, Math.min(maxWrite, LIMITS.attrBytes), Math.floor(Math.random() * 256));
      for (const f of frames) {
        await withTimeout(this.ble.write(id, SVC, BLE_UUIDS.inbox, Array.from(f), f.length), 5000, 'write');
      }
    });
  }

  private async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    const P = PermissionsAndroid.PERMISSIONS;
    if (Number(Platform.Version) >= 31) {
      const r = await PermissionsAndroid.requestMultiple([P.BLUETOOTH_SCAN, P.BLUETOOTH_CONNECT, P.BLUETOOTH_ADVERTISE]);
      return Object.values(r).every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
    }
    const r = await PermissionsAndroid.request(P.ACCESS_FINE_LOCATION);
    return r === PermissionsAndroid.RESULTS.GRANTED;
  }
}
