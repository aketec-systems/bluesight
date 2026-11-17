import { Platform } from 'react-native';

/**
 * Bluesight's colour tells you what costs money:
 *   blue     = Bluetooth, people close by, free (the "blue" in the name)
 *   amber    = internet, uses data, and gentle warnings
 *   hibiscus = people and affection (likes, matches, your messages)
 * Everything else is midnight indigo, built for dark rooms and OLED batteries.
 */
export const C = {
  midnight: '#170F33',
  dusk: '#221946',
  dusk2: '#2B2157',
  haze: '#3A2F6B',
  cream: '#FFF1E0',
  lavender: '#B9AEDB',
  dim: '#8A7FB3',
  blue: '#5AB4FF',
  blueSoft: '#A8D6FF',
  amber: '#FFB21F',
  hibiscus: '#FF4F6D',
  ink: '#120A2A',
} as const;

export const F = {
  display: 'DelaGothicOne',
  body: Platform.select({ web: 'system-ui, -apple-system, Roboto, "Segoe UI", sans-serif', default: undefined }),
} as const;

/** Type scale (sp). Display face only for the wordmark, short titles and the match moment. */
export const T = {
  hero: 34,
  title: 22,
  head: 18,
  body: 16,
  small: 14,
  tiny: 12,
} as const;

export const R = {
  card: 28,
  panel: 20,
  input: 14,
  pill: 999,
} as const;

export const S = (n: number) => n * 4;

/** Proximity buckets from Bluetooth signal strength. */
export const PROXIMITY = [
  { label: 'Right here', color: C.blue },
  { label: 'Close by', color: C.blueSoft },
  { label: 'Nearby', color: C.lavender },
] as const;

/** Absolute fill as a plain object (StyleSheet.absoluteFillObject is gone in RN 0.88). */
export const fill = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;
