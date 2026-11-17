import type { StartOptions, Transport, TransportEvents } from './types';

/** Runs real Bluetooth and the simulated room side by side (device ids from the sim start with "sim:"). */
export class MuxTransport implements Transport {
  readonly kind = 'mux' as const;
  constructor(
    private readonly real: Transport,
    private readonly sim: Transport,
  ) {}

  private pick(deviceId: string) {
    return deviceId.startsWith('sim:') ? this.sim : this.real;
  }

  async start(o: StartOptions, ev: TransportEvents) {
    await this.sim.start(o, ev);
    await this.real.start(o, {
      ...ev,
      // the simulated room keeps the screen alive even if the radio is unavailable
      state: (s, d) => (s === 'on' ? ev.state('on') : ev.state('on', d)),
    });
  }
  async stop() {
    await Promise.all([this.sim.stop(), this.real.stop()]);
  }
  async setCard(card: Uint8Array, photo: Uint8Array | null) {
    await Promise.all([this.sim.setCard(card, photo), this.real.setCard(card, photo)]);
  }
  async setAdvertising(on: boolean) {
    await Promise.all([this.sim.setAdvertising(on), this.real.setAdvertising(on)]);
  }
  readCard(id: string) {
    return this.pick(id).readCard(id);
  }
  readPhoto(id: string, len: number) {
    return this.pick(id).readPhoto(id, len);
  }
  send(id: string, env: Uint8Array) {
    return this.pick(id).send(id, env);
  }
}
