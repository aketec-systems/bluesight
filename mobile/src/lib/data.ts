import NetInfo from '@react-native-community/netinfo';
import { config } from './config';
import { emptyUsage, getApp, monthKey, setApp, useUi, type Category, type Usage } from './store';

/**
 * The data meter and the rules for when the app may touch the network.
 * Mobile data counts against the monthly limit; Wi-Fi is tracked separately and treated as free
 * by default. Bluetooth traffic is counted as "carried for free".
 */

export function startNetWatch(): () => void {
  if (config.demo && config.isWeb) {
    // The web preview pretends to be on mobile data so the meter shows real-world costs.
    useUi.setState({ online: true, metered: true });
    return () => {};
  }
  return NetInfo.addEventListener((s) => {
    const details = s.details as { isConnectionExpensive?: boolean } | null;
    useUi.setState({
      online: !!s.isConnected && s.isInternetReachable !== false,
      metered: s.type === 'cellular' || details?.isConnectionExpensive === true || s.type === 'unknown',
    });
  });
}

function current(u: Usage): Usage {
  return u.month === monthKey() ? u : emptyUsage();
}

export function recordBytes(category: Category, bytes: number) {
  const metered = useUi.getState().metered;
  setApp((s) => {
    const u = current(s.usage);
    return {
      usage: metered ? { ...u, cell: { ...u.cell, [category]: u.cell[category] + bytes } } : { ...u, wifi: u.wifi + bytes },
    };
  });
}

export function recordBle(bytes: number) {
  setApp((s) => {
    const u = current(s.usage);
    return { usage: { ...u, ble: u.ble + bytes } };
  });
}

export const cellTotal = (u: Usage) => Object.values(u.cell).reduce((a, b) => a + b, 0);

export function overBudget(): boolean {
  const { usage, settings } = getApp();
  return cellTotal(current(usage)) >= settings.budgetMB * 1024 * 1024;
}

export type NetUse = 'sync' | 'deck' | 'photoAuto' | 'photoTap' | 'uploadSmall' | 'uploadFull' | 'account' | 'passes';

export function canUse(kind: NetUse): boolean {
  const { online, metered } = useUi.getState();
  const { settings, outbox } = getApp();
  if (!online) return false;
  if (!metered && settings.wifiFree) return true;
  if (kind === 'account') return true; // always an explicit tap
  if (settings.dataMode === 'zero') return false;
  if (overBudget()) return kind === 'sync' && outbox.some((o) => o.k === 'msg');
  switch (kind) {
    case 'photoAuto':
      return settings.dataMode === 'full';
    case 'uploadFull':
      return false; // the big photo waits for Wi-Fi
    default:
      return true;
  }
}

/** Why the network is off right now, in words for the UI. */
export function networkBlockReason(): string | null {
  const { online, metered } = useUi.getState();
  const { settings } = getApp();
  if (!online) return "You're offline. Bluetooth still works.";
  if (!metered && settings.wifiFree) return null;
  if (settings.dataMode === 'zero') return 'Zero-data mode is on. Only Bluetooth is used.';
  if (overBudget()) return `You've used your ${settings.budgetMB} MB monthly limit. Only messages still sync.`;
  return null;
}
