import { Platform } from 'react-native';

/**
 * EXPO_PUBLIC_API_URL  your server, e.g. https://api.bluesight.app (no trailing slash)
 * EXPO_PUBLIC_DEMO=1   run against the built-in demo server and simulated people (the web preview)
 *
 * With neither set, the app still works fully offline over Bluetooth; accounts and "Around" stay off.
 */
const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

export const config = {
  apiUrl,
  demo: process.env.EXPO_PUBLIC_DEMO === '1' || (Platform.OS === 'web' && !apiUrl),
  isWeb: Platform.OS === 'web',
};
