/** Index 0 means "not shown". Stored as a nibble on the card. */
export const GENDERS = ['Not shown', 'Woman', 'Man', 'Non-binary'] as const;

/** What someone is here for. Index 0 = not shown. */
export const INTENTS = ['Not shown', 'Something casual', 'Dating', 'Something serious', 'New friends'] as const;

/** 32 vibes, one bit each on the card (u32). Order is part of the wire format: append only. */
export const VIBES: ReadonlyArray<{ label: string; emoji: string }> = [
  { label: 'Afrobeats', emoji: '🎶' },
  { label: 'Amapiano', emoji: '🥁' },
  { label: 'Hip-hop', emoji: '🎤' },
  { label: 'Dancehall', emoji: '🔊' },
  { label: 'R&B', emoji: '🎧' },
  { label: 'Highlife', emoji: '🎺' },
  { label: 'Gospel', emoji: '🙌' },
  { label: 'Live music', emoji: '🎸' },
  { label: 'Dancing', emoji: '💃' },
  { label: 'Karaoke', emoji: '🎙️' },
  { label: 'Football', emoji: '⚽' },
  { label: 'Basketball', emoji: '🏀' },
  { label: 'Gym', emoji: '💪' },
  { label: 'Foodie', emoji: '🍲' },
  { label: 'Jollof', emoji: '🍛' },
  { label: 'Cooking', emoji: '👩🏾‍🍳' },
  { label: 'Fashion', emoji: '👗' },
  { label: 'Travel', emoji: '✈️' },
  { label: 'Beach', emoji: '🏖️' },
  { label: 'Movies', emoji: '🎬' },
  { label: 'Gaming', emoji: '🎮' },
  { label: 'Reading', emoji: '📚' },
  { label: 'Art', emoji: '🎨' },
  { label: 'Photography', emoji: '📸' },
  { label: 'Tech', emoji: '💻' },
  { label: 'Hustle', emoji: '📈' },
  { label: 'Faith', emoji: '🕊️' },
  { label: 'Nightlife', emoji: '🌙' },
  { label: 'Chill vibes', emoji: '🌿' },
  { label: 'Deep talks', emoji: '💬' },
  { label: 'Comedy', emoji: '😂' },
  { label: 'Pets', emoji: '🐾' },
];

export const MAX_VIBES = 5;

export function vibesFromMask(mask: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 32; i++) if ((mask >>> i) & 1) out.push(i);
  return out;
}

export function maskFromVibes(list: number[]): number {
  let m = 0;
  for (const i of list) if (i >= 0 && i < 32) m = (m | (1 << i)) >>> 0;
  return m >>> 0;
}

/** "Show me" is private and never leaves the phone over Bluetooth: bit (gender - 1). */
export const SHOW_EVERYONE = 0b111;

export function genderBit(gender: number): number {
  return gender >= 1 && gender <= 3 ? 1 << (gender - 1) : 0;
}

/** People who hide their gender are only shown to those who asked to see everyone. */
export function wantsToSee(showMe: number, theirGender: number): boolean {
  if (!theirGender) return (showMe & SHOW_EVERYONE) === SHOW_EVERYONE;
  return (showMe & genderBit(theirGender)) !== 0;
}

/** Age in whole years from an ISO date (YYYY-MM-DD). Returns null for invalid dates. */
export function ageFromDob(dob: string, now: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!m) return null;
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  let age = now.getUTCFullYear() - y;
  const beforeBirthday = now.getUTCMonth() + 1 < mo || (now.getUTCMonth() + 1 === mo && now.getUTCDate() < d);
  if (beforeBirthday) age--;
  return age >= 0 && age < 130 ? age : null;
}

export const MIN_AGE = 18;
