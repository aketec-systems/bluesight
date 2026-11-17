import { Platform } from 'react-native';
import { getRandomBytes } from 'expo-crypto';
import { setRandomSource } from '@bluesight/protocol';

// Must run before anything generates keys. Browsers have WebCrypto; Hermes needs expo-crypto.
if (Platform.OS !== 'web') setRandomSource((n) => getRandomBytes(n));
