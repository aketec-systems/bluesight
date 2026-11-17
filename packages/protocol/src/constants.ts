export const PROTOCOL_VERSION = 1;

/** GATT layout every Bluesight phone exposes while Nearby is on. Only the service UUID is advertised. */
export const BLE_UUIDS = {
  service: 'a9bea750-f935-4078-b5d8-95cba1596cd9',
  /** read: the signed profile card (≤ 512 bytes) */
  card: 'a9bea751-f935-4078-b5d8-95cba1596cd9',
  /** write (with response): framed envelopes — likes, match handshakes, messages */
  inbox: 'a9bea752-f935-4078-b5d8-95cba1596cd9',
  /** write u16 start index, then read repeatedly: profile photo in chunks */
  photo: 'a9bea753-f935-4078-b5d8-95cba1596cd9',
} as const;

export const LIMITS = {
  nameBytes: 30,
  bioBytes: 140,
  thumbhashBytes: 40,
  /** what the composer allows */
  msgChars: 300,
  /** hard cap after UTF-8 encoding so a message envelope always fits one 512-byte write */
  msgBytes: 440,
  /** max attribute value size in BLE */
  attrBytes: 512,
  /** payload bytes per photo chunk (chunk = 4-byte header + payload ≤ 512) */
  photoChunk: 480,
  /** largest photo we'll serve or accept over Bluetooth */
  blePhotoBytes: 32_000,
  /** envelopes are split into frames when a link can't carry 512 bytes at once */
  maxFrames: 64,
} as const;

export const TIMING = {
  /** a Nearby session (and its pass) lasts a day */
  sessionSeconds: 24 * 3600,
  /** reject envelopes with timestamps this far from our clock */
  maxSkewSeconds: 12 * 3600,
} as const;

/** 4 bytes of the pass: expiry. 24: encrypted account id. 64: server signature. */
export const PASS_BYTES = 92;
