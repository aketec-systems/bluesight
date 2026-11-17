import type { DemoPerson } from '../demo/world';
import { BleTransport } from './ble';
import { MuxTransport } from './mux';
import { SimTransport } from './sim';
import type { Transport } from './types';

/** Native: real Bluetooth, optionally with a simulated room mixed in for testing alone. */
export function makeTransport(simulate: boolean, pool?: DemoPerson[]): Transport {
  if (!simulate) return new BleTransport();
  const sim = new SimTransport(pool);
  return BleTransport.isAvailable() ? new MuxTransport(new BleTransport(), sim) : sim;
}
