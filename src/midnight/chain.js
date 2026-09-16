// Main-thread Midnight submit path.
//
// Midnight's own dApp Connector skill (midnight-dapp-dev:dapp-connector,
// references/browser-providers.md) builds MidnightProviders on the page thread from
// ConnectedAPI. A Web Worker cannot load `@midnight-ntwrk/midnight-js-indexer-public-data-provider`
// (Apollo + isomorphic-ws + cross-fetch). That is why "Starting the chain worker…" never
// finished. Circuit calls stay fire-and-forget from gameplay (ADR-0018); only Connect Wallet
// and The Rail wait on this module.
//
// Indexer HTTP goes through same-origin `/api/ledger` because the public Preview indexer has
// no CORS for this origin (The Hall already learned that).
import * as audit from './audit.js';
import { getSecretKeyHex } from './secret.js';

const ADDR_KEY = 'mn-contract-address';
const PROVER_KEY = 'mn-prover-uri';
const BAKED_ADDR =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_MN_CONTRACT_ADDRESS)
  || '749fd2e5a6a44161d56a7be1fb00a556bed169cbe18f1834d01d546a7615aaf3';
const PUBLIC_PROVER =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_MN_PROVER_URI)
  || 'https://midnight-pool-prover-147606977567.us-central1.run.app';
const LOCAL_PROVER = 'http://localhost:6300';
const BROKEN_PUBLIC_PROVER = /lace-proof-pub/;
const PRIV_KEY = 'mn-private-state';
const PRIVATE_STATE_ID = 'midnight-pool';

let api = null;
let providers = null;
let privateState = null;
let originBase = '';
let ready = false;
let queue = Promise.resolve();
const enqueue = (fn) => (queue = queue.then(fn, fn));

export const getContractAddress = () => {
  try { return localStorage.getItem(ADDR_KEY) || BAKED_ADDR || ''; } catch { return BAKED_ADDR || ''; }
};
export const setContractAddress = (a) => {
  try { a ? localStorage.setItem(ADDR_KEY, a) : localStorage.removeItem(ADDR_KEY); } catch {}
};

export const getProverUri = (laceUri) => {
  try {
    const stored = localStorage.getItem(PROVER_KEY);
    if (stored) return stored;
  } catch {}
  if (typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    return LOCAL_PROVER;
  }
  if (PUBLIC_PROVER) return PUBLIC_PROVER;
  if (laceUri && !BROKEN_PUBLIC_PROVER.test(laceUri)) return laceUri;
  return LOCAL_PROVER;
};
export const setProverUri = (u) => {
  try { u ? localStorage.setItem(PROVER_KEY, u) : localStorage.removeItem(PROVER_KEY); } catch {}
};

export function detectWallets() {
  const src = (typeof window !== 'undefined' && window.midnight) || {};
  const laceFirst = (w) => (/lace/i.test(w.name) || w.key === 'mnLace' ? 0 : 1);
  return Object.entries(src)
    .filter(([, w]) => w && typeof w.connect === 'function')
    .map(([key, w]) => ({ key, name: w.name || key, rdns: w.rdns || '', apiVersion: w.apiVersion || '' }))
    .sort((a, b) => laceFirst(a) - laceFirst(b));
}

function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

const describeError = (e) => {
  if (e && typeof e === 'object' && e.type === 'DAppConnectorAPIError') {
    return `${e.code}: ${e.reason || ''}`.trim();
  }
  return String((e && e.message) || e);
};

const serialisable = (v) => JSON.parse(JSON.stringify(v, (_, x) =>
  typeof x === 'bigint' ? { __bigint: x.toString() }
    : x instanceof Uint8Array ? { __bytes: Array.from(x) } : x));

const revive = (v) => {
  if (Array.isArray(v)) return v.map(revive);
  if (v && typeof v === 'object') {
    if (v.__bigint !== undefined) return BigInt(v.__bigint);
    if (v.__bytes !== undefined) return Uint8Array.from(v.__bytes);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revive(x)]));
  }
  return v;
};

function loadPrivateState() {
  try {
    const raw = localStorage.getItem(PRIV_KEY);
    return raw ? revive(JSON.parse(raw)) : null;
  } catch { return null; }
}

function persistPrivateState(st) {
  try { localStorage.setItem(PRIV_KEY, JSON.stringify(serialisable(st))); } catch { /* ignore */ }
}

function indexerQueryUri() {
  if (typeof location === 'undefined') return 'https://indexer.preview.midnight.network/api/v4/graphql';
  return `${location.origin}/api/ledger`;
}

export async function connect(walletKey, networkId = 'preview', onProgress) {
  const note = (stage) => { try { onProgress?.(stage); } catch { /* ignore */ } };
  const src = (typeof window !== 'undefined' && window.midnight) || {};
  const wallet = walletKey ? src[walletKey] : Object.values(src).find((w) => w && typeof w.connect === 'function');
  if (!wallet) throw new Error('no-wallet');

  ready = false;
  providers = null;
  originBase = typeof location !== 'undefined' ? location.origin : '';

  note('approve');
  try {
    api = await withTimeout(
      wallet.connect(networkId),
      120_000,
      'Lace did not finish connecting. Check the extension popup (Preview network), wait until it is synced, then try again.',
    );
  } catch (e) {
    throw new Error(describeError(e));
  }

  if (typeof api.hintUsage === 'function') {
    try {
      await withTimeout(
        api.hintUsage([
          'getConfiguration',
          'getShieldedAddresses',
          'getDustBalance',
          'balanceUnsealedTransaction',
          'submitTransaction',
        ]),
        30_000,
        'Lace did not grant method permissions. Approve the hint prompt and try again.',
      );
    } catch {
      // Older Lace builds may not wait on hintUsage; continue.
    }
  }

  note('config');
  const cfg = await withTimeout(
    api.getConfiguration(),
    20_000,
    'Lace did not return network config. Confirm the wallet is on Preview.',
  );

  note('addresses');
  const addresses = await withTimeout(
    api.getShieldedAddresses(),
    45_000,
    'Lace is still syncing addresses. Wait until Lace shows tDUST, then Connect Wallet again.',
  );

  note('worker');
  const sdk = await import('./chain.providers.js');
  privateState = sdk.ensurePrivateState(loadPrivateState(), getSecretKeyHex());
  providers = await sdk.buildProviders({
    api,
    addresses,
    networkId: cfg.networkId,
    indexerHttp: indexerQueryUri(),
    indexerWs: cfg.indexerWsUri || 'wss://indexer.preview.midnight.network/api/v4/graphql',
    proverUri: getProverUri(cfg.proverServerUri),
    origin: originBase,
    privateStateRef: {
      get: () => privateState,
      set: (st) => { privateState = st; persistPrivateState(st); },
    },
  });

  ready = true;
  audit.record({ circuit: 'walletConnect', mode: 'real', disclosed: { networkId: cfg.networkId }, ok: true });
  return { networkId: cfg.networkId, indexerUri: cfg.indexerUri, addresses };
}

export const isReady = () => ready;
export const currentApi = () => api;

/** Drop ConnectedAPI in-app. Lace has no connector disconnect method — same as the
 *  midnight-dapp-dev hook: set connectedApi to null. Private state and the baked
 *  contract address stay on the device. */
export function disconnect() {
  ready = false;
  api = null;
  providers = null;
}

export async function deploy({ level = 1, wins = 0 } = {}) {
  if (!ready) throw new Error('not-connected');
  const r = await enqueue(() => import('./chain.providers.js').then((sdk) => sdk.deployContractTx(providers, privateState, { level, wins })));
  privateState = r.privateState || privateState;
  persistPrivateState(privateState);
  setContractAddress(r.contractAddress);
  audit.record({
    circuit: 'deployContract', mode: 'real',
    disclosed: { contractAddress: r.contractAddress, txId: r.txId, blockHeight: r.blockHeight }, ok: true,
  });
  return r;
}

export async function call(circuit, args = [], extras = {}) {
  if (!ready) throw new Error('not-connected');
  const contractAddress = getContractAddress();
  if (!contractAddress) throw new Error('no-contract');
  try {
    const r = await enqueue(() => import('./chain.providers.js').then((sdk) => sdk.callCircuit(providers, {
      contractAddress,
      circuit,
      args,
      extras,
      privateStateRef: {
        get: () => privateState,
        set: (st) => { privateState = st; persistPrivateState(st); },
      },
    })));
    audit.record({
      circuit, mode: 'real',
      disclosed: { txId: r.txId, blockHeight: r.blockHeight, ...(r.result !== null ? { result: r.result } : {}) },
      ok: true,
    });
    return r;
  } catch (err) {
    audit.record({ circuit, mode: 'real', disclosed: {}, ok: false, note: String(err.message || err) });
    throw err;
  }
}

export async function readState(contractAddress = getContractAddress()) {
  if (!ready || !contractAddress) return null;
  const sdk = await import('./chain.providers.js');
  return sdk.readLedgerState(providers, contractAddress);
}
