// Wallet detection/connection for the Midnight DApp Connector (window.midnight.*),
// plus the mock/real mode switch. Mock mode is the default -- see docs/adr/0006:
// the game must keep working when no wallet extension or live network is
// available, which is the common case for anyone just trying the demo.
const MODE_KEY = 'mn-mode';

export function getMode() {
  return localStorage.getItem(MODE_KEY) === 'real' ? 'real' : 'mock';
}

export function setMode(mode) {
  localStorage.setItem(MODE_KEY, mode === 'real' ? 'real' : 'mock');
}

/** Record a live DApp Connector session. Connect Wallet uses chain.js, not connect() below. */
export function markConnected({ id, name, api: connectedApi } = {}) {
  connected = { id: id || 'wallet', name: name || 'Lace', api: connectedApi || null };
  setMode('real');
}

/** Every wallet extension the page can see, keyed by its own injected id (not a fixed key -- see the dapp-connector skill). */
export function detectWallets() {
  return Object.entries(window.midnight ?? {})
    .filter(([, w]) => w != null && typeof w.connect === 'function')
    .map(([id, api]) => ({ id, name: api.name ?? id, api }));
}

let connected = null; // { id, name, api: ConnectedAPI }

export function isConnected() {
  return connected !== null;
}

export function current() {
  return connected;
}

/**
 * Connects to one detected wallet. Real on-chain submission is wired through
 * chain.js (docs/adr/0018): connect here flips mock → real so hooks.js will
 * submit commitStats / proveThreshold / claimCue (and best-effort break) to
 * the shared Preview contract.
 */
export async function connect(walletId, networkId = 'preview') {
  const wallet = detectWallets().find((w) => w.id === walletId);
  if (!wallet) throw new Error(`no wallet found for id "${walletId}"`);
  const api = await wallet.api.connect(networkId);
  connected = { id: walletId, name: wallet.name, api };
  setMode('real');
  return connected;
}

/** In-app session only. Lace DApp Connector has no disconnect method (midnight-dapp-dev
 *  drops ConnectedAPI). Call chain.disconnect() from the UI as well. */
export function disconnect() {
  connected = null;
  setMode('mock');
}
