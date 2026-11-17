import { AppState, Platform } from 'react-native';
import { DemoApi } from './api/demo';
import { HttpApi } from './api/http';
import type { Api } from './api/types';
import { config } from './config';
import { startNetWatch } from './data';
import { demoServer, makePeople, type DemoPerson } from './demo/world';
import { b64, ensureKeys } from './identity';
import { NearbyEngine } from './nearby/engine';
import { makeTransport } from './nearby/transport';
import { SyncEngine } from './sync';
import { flushPersist, getApp, setApp } from './store';

/** The app's long-lived parts, created once. Screens talk to these through small helper modules. */
export const services: {
  api: Api | null;
  nearby: NearbyEngine;
  sync: SyncEngine;
  demoPool: DemoPerson[] | null;
} = {
  api: null,
  nearby: new NearbyEngine(),
  sync: new SyncEngine(),
  demoPool: null,
};

let initialised = false;

export function initServices() {
  if (initialised) return;
  initialised = true;
  ensureKeys();
  if (config.demo) {
    services.demoPool = makePeople(16, 99, 'near');
    services.api = new DemoApi(services.demoPool);
    if (!getApp().serverPk) setApp({ serverPk: b64(demoServer.sign.publicKey) });
  } else if (config.apiUrl) {
    services.api = new HttpApi(config.apiUrl);
  }
  startNetWatch();
  services.sync.start();
  AppState.addEventListener('change', (s) => {
    if (s === 'active') {
      void startNearby();
      services.sync.kick('open');
    } else if (s === 'background') {
      void flushPersist();
      // Phones stop Bluetooth for backgrounded apps anyway; stopping cleanly saves battery.
      if (Platform.OS !== 'web') void services.nearby.stop();
    }
  });
  if (getApp().profile) {
    void startNearby();
    services.sync.kick('open');
  }
}

export async function startNearby() {
  const st = getApp();
  if (!st.profile) return;
  await services.nearby.start(makeTransport(st.settings.simulate || config.demo, services.demoPool ?? undefined));
}

export async function restartNearby() {
  await services.nearby.stop();
  await startNearby();
}
