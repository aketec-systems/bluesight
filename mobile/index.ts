// Must be first: seeds the crypto library with a secure random source before any keys exist.
import './src/lib/prng';
import { registerRootComponent } from 'expo';

import App from './App';

registerRootComponent(App);
