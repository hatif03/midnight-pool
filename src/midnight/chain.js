// Main-thread half of the real on-chain path (docs/adr/0018).
//
// Owns the DApp Connector wallet (which cannot cross into a worker -- it is a live object of
// injected functions) and proxies the three transacting calls for the worker, all of which speak
// serialized hex strings and therefore clone cleanly. The worker owns the SDK and the ledger WASM,
// so nothing heavy runs on the thread driving the 60Hz physics loop.
//
// Nothing here ever blocks gameplay: every entry point is fire-and-forget from the caller's point
// of view, and a missing wallet, a rejected prompt or an unreachable indexer resolves to a recorded
// failure rather than a thrown error on the shot path.
import * as audit from './audit.js';

const ADDR_KEY = 'mn-contract-address';
const PRIV_KEY = 'mn-private-state';

let worker = null;
let api = null;          // ConnectedAPI
let ready = false;
let seq = 0;
const pending = new Map();

export const getContractAddress = () => {
  try { return localStorage.getItem(ADDR_KEY) || ''; } catch { return ''; }
};
export const setContractAddress = (a) => {
  try { a ? localStorage.setItem(ADDR_KEY, a) : localStorage.removeItem(ADDR_KEY); } catch {}
};

// Enumerate every injected wallet rather than assuming a key: the connector is CAIP-372-compatible
// and each wallet installs its InitialAPI under its own UUID. Lace also aliases window.midnight.mnLace,
// but relying on that alone would miss any other wallet.
export function detectWallets() {
  const src = (typeof window !== 'undefined' && window.midnight) || {};
  return Object.entries(src)
    .filter(([, w]) => w && typeof w.connect === 'function')
    .map(([key, w]) => ({ key, name: w.name || key, rdns: w.rdns || '', apiVersion: w.apiVersion || '' }));
}

// DApp Connector errors are plain objects serialized across the extension boundary, so instanceof
// never matches -- check the discriminant.
const describeError = (e) => {
  if (e && typeof e === 'object' && e.type === 'DAppConnectorAPIError') {
    return `${e.code}: ${e.reason || ''}`.trim();
  }
  return String((e && e.message) || e);
};

export async function connect(walletKey, networkId = 'preprod') {
  const src = (typeof window !== 'undefined' && window.midnight) || {};
  const wallet = walletKey ? src[walletKey] : Object.values(src).find((w) => w && typeof w.connect === 'function');
  if (!wallet) throw new Error('no-wallet');

  try {
    api = await wallet.connect(networkId);
  } catch (e) {
    throw new Error(describeError(e));
  }

  const cfg = await api.getConfiguration();
  const addresses = await api.getShieldedAddresses();

  worker = new Worker(new URL('./chain.worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = onWorkerMessage;

  await request({
    kind: 'init',
    config: {
      networkId: cfg.networkId,
      indexerUri: cfg.indexerUri,
      indexerWsUri: cfg.indexerWsUri,
      // proverServerUri is on Configuration but the skill docs omit it; fall back to the local
      // proof server, which is what a developer running the devnet stack has.
      proverUri: cfg.proverServerUri || 'http://localhost:6300',
      origin: location.origin,
    },
    addresses,
    privateState: loadPrivateState(),
  });

  ready = true;
  audit.record({ circuit: 'walletConnect', mode: 'real', disclosed: { networkId: cfg.networkId }, ok: true });
  return { networkId: cfg.networkId, indexerUri: cfg.indexerUri, addresses };
}

export const isReady = () => ready;
export const currentApi = () => api;

function loadPrivateState() {
  try {
    const raw = localStorage.getItem(PRIV_KEY);
    return raw ? revive(JSON.parse(raw)) : null;
  } catch { return null; }
}

const revive = (v) => {
  if (Array.isArray(v)) return v.map(revive);
  if (v && typeof v === 'object') {
    if (v.__bigint !== undefined) return BigInt(v.__bigint);
    if (v.__bytes !== undefined) return Uint8Array.from(v.__bytes);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revive(x)]));
  }
  return v;
};

function request(msg) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ ...msg, id });
  });
}

async function onWorkerMessage(e) {
  const m = e.data;

  // The worker asking us to do a wallet call it structurally cannot do itself.
  if (m.kind === 'wallet-call') {
    try {
      let result;
      if (m.op === 'balanceTx') {
        const r = await api.balanceUnsealedTransaction(m.payload.hex, {});
        result = r.tx;
      } else if (m.op === 'submitTx') {
        await api.submitTransaction(m.payload.hex);
        result = true;
      } else {
        throw new Error(`unknown wallet op ${m.op}`);
      }
      worker.postMessage({ kind: 'wallet-result', id: m.id, result });
    } catch (err) {
      worker.postMessage({ kind: 'wallet-result', id: m.id, error: describeError(err) });
    }
    return;
  }

  if (m.kind === 'private-state') {
    try { localStorage.setItem(PRIV_KEY, JSON.stringify(m.state)); } catch {}
    return;
  }

  if (m.kind === 'result') {
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.ok) p.resolve(m);
    else p.reject(new Error(m.error || 'worker call failed'));
  }
}

// --- public operations -----------------------------------------------------

export async function deploy({ level = 1, wins = 0 } = {}) {
  if (!ready) throw new Error('not-connected');
  const r = await request({ kind: 'deploy', level, wins });
  setContractAddress(r.contractAddress);
  audit.record({
    circuit: 'deployContract', mode: 'real',
    disclosed: { contractAddress: r.contractAddress, txId: r.txId, blockHeight: r.blockHeight }, ok: true,
  });
  return r;
}

export async function call(circuit, args = []) {
  if (!ready) throw new Error('not-connected');
  const contractAddress = getContractAddress();
  if (!contractAddress) throw new Error('no-contract');
  try {
    const r = await request({ kind: 'call', contractAddress, circuit, args });
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

// Reads public ledger state straight from the indexer -- this is the same query any third party
// would run, which is the point: it is what makes the contract independently checkable.
export async function readState(contractAddress = getContractAddress()) {
  if (!ready || !contractAddress) return null;
  const r = await request({ kind: 'read', contractAddress });
  return r.state;
}
