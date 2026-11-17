export interface WireCard {
  u: string;
  n: string;
  a: number;
  g: number;
  i: number;
  v: number;
  b: string;
  li?: string;
  aw?: 1;
  th?: Uint8Array;
  p?: string;
  ps?: [number, number];
  d: string;
}

export interface WireProfile {
  id: string;
  n: string;
  a: number;
  g: number;
  i: number;
  v: number;
  b: string;
  li?: string;
  th?: Uint8Array;
  p?: string;
  ps?: [number, number];
  pk?: Uint8Array;
}

export type WireChange =
  | { k: 'm'; m: string; src: 'around' | 'nearby'; at: number; u: WireProfile }
  | { k: 'x'; m: string; f: string; b: Uint8Array; at: number }
  | { k: 'um'; m: string };

export interface SyncResponse {
  c: number;
  acks: string[];
  errs?: { id: string; e: string }[];
  ch: WireChange[];
  more?: 1;
}

export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
  }
}

export interface Api {
  readonly kind: 'http' | 'demo';
  info(): Promise<{ spk: Uint8Array }>;
  authStart(phone: string): Promise<{ dev?: string }>;
  authVerify(phone: string, code: string): Promise<{ tk: string; uid: string; spk: Uint8Array }>;
  sync(token: string, cursor: number, ops: unknown[]): Promise<SyncResponse>;
  /** away: the location is a city the person chose to search, not where they are */
  deck(token: string, n: number, loc?: { lat: number; lon: number }, away?: boolean): Promise<WireCard[]>;
  uploadPhoto(token: string, v: 's' | 'f', img: Uint8Array, th?: Uint8Array): Promise<string>;
  passes(token: string, pks: Uint8Array[]): Promise<Uint8Array[]>;
  photoUrl(key: string, v: 's' | 'f'): string;
  /** Demo only: the fake server "pushes" when something arrives, like a push notification would. */
  onPush?(cb: () => void): void;
}

/** Human copy for server error codes. */
export function apiErrorText(e: unknown): string {
  const code = e instanceof ApiError ? e.code : e instanceof Error ? e.message : String(e);
  const map: Record<string, string> = {
    bad_phone: 'Enter your number with the country code, like +231 77 123 4567.',
    wrong_code: "That code isn't right. Check the SMS and try again.",
    code_expired: 'That code has expired. Send a new one.',
    too_many_codes: 'Too many codes sent. Wait 15 minutes and try again.',
    too_many_attempts: 'Too many wrong codes. Send a new one.',
    underage: 'Bluesight is for adults 18 and over.',
    network: "Couldn't reach the server. Check your connection.",
  };
  return map[code] ?? 'Something went wrong. Try again.';
}
