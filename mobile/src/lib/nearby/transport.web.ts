import type { DemoPerson } from '../demo/world';
import { SimTransport } from './sim';
import type { Transport } from './types';

/** Browsers can't advertise over Bluetooth, so the web build always uses the simulated room. */
export function makeTransport(_simulate: boolean, pool?: DemoPerson[]): Transport {
  return new SimTransport(pool);
}
