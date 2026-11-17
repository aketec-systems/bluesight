import type { Db } from './db';
import type { ServerKeys } from './keys';
import type { SmsProvider } from './sms';

export interface Ctx {
  db: Db;
  keys: ServerKeys;
  sms: SmsProvider;
  dataDir: string;
  /** dev mode returns OTP codes in the API response */
  dev: boolean;
}
