// Unused by Connect Wallet. midnight-js indexer (Apollo / ws) does not boot in a module worker;
// providers now assemble on the main thread (chain.providers.js, ADR-0018 update 2026-09-16).
// Kept so the worker chunk experiment remains readable.
//
// WHY A WORKER, and why it is not optional: physics runs at a fixed 60Hz on the main thread and
// rendering rides the Pixi ticker, so any synchronous main-thread block over ~8ms is a visible
// stutter mid-shot. ledger-v8 wasm-bindgen (de)serialisation is synchronous and not cheap, and an
// un-awaited promise still resolves on the main thread -- "do not await it" moves jank, it does not
// remove it. Everything heavy lives here instead.
//
// WHY THE WALLET STAYS ON THE MAIN THREAD: the DApp Connector ConnectedAPI is a live object of
// functions injected by the extension. It cannot be structured-cloned into a worker. That would
// normally be fatal for this split -- except the connector transacting surface speaks serialized
// hex strings throughout (balanceUnsealedTransaction(hex) -> hex, submitTransaction(hex) -> void),
// and strings clone perfectly. So the worker owns the SDK and calls back to the main thread for the
// three wallet operations. See chain.js for the other half of the bridge.
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { toHex, fromHex } from '@midnight-ntwrk/midnight-js-utils';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { Transaction } from '@midnight-ntwrk/ledger-v8';

import { Contract, ledger as contractLedger } from '../../contracts/managed/midnight-pool/contract/index.js';
import { createPrivateState, withActiveMatch, withPendingCueTier, withStats, witnesses } from '../../contracts/witnesses.ts';

const PRIVATE_STATE_ID = 'midnight-pool';

// --- bridge back to the main thread for the three wallet calls -------------
let seq = 0;
const pending = new Map();
function callMain(op, payload) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    self.postMessage({ kind: 'wallet-call', id, op, payload });
  });
}

// --- private state ---------------------------------------------------------
// The worker has no localStorage, so the main thread owns persistence and hands the blob over at
// init. Per-shot salts MUST survive a reload, or a mid-match refresh leaves a commitment that can
// never be opened -- the same failure class witnesses.ts already documents for break nonces.
let privateState = null;

const serialisable = (v) => JSON.parse(JSON.stringify(v, (_, x) =>
  typeof x === 'bigint' ? { __bigint: x.toString() }
    : x instanceof Uint8Array ? { __bytes: Array.from(x) } : x));

function makePrivateStateProvider() {
  return {
    set: async (_id, st) => {
      privateState = st;
      self.postMessage({ kind: 'private-state', state: serialisable(st) });
    },
    get: async () => privateState,
    remove: async () => { privateState = null; },
    clear: async () => { privateState = null; },
    setSigningKey: async () => {},
    getSigningKey: async () => null,
    removeSigningKey: async () => {},
    clearSigningKeys: async () => {},
  };
}

function ensurePrivateState(st, secretKeyHex) {
  const base = st ?? createPrivateState(secretKeyHex ? fromHex(secretKeyHex) : undefined);
  if (base.breakSecrets instanceof Map) return base;
  return { ...base, breakSecrets: new Map() };
}

let providers = null;
let config = null;

async function buildProviders(cfg, addresses) {
  config = cfg;
  setNetworkId(cfg.networkId);

  // FetchZkConfigProvider resolves {base}/keys/{circuit}.prover and {base}/zkir/{circuit}.bzkir --
  // verified against the published package, not assumed.
  const zkConfigProvider = new FetchZkConfigProvider(`${cfg.origin}/midnight`, fetch.bind(globalThis));

  return {
    privateStateProvider: makePrivateStateProvider(),
    publicDataProvider: indexerPublicDataProvider(cfg.indexerUri, cfg.indexerWsUri),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(cfg.proverUri, zkConfigProvider),
    walletProvider: {
      getCoinPublicKey: () => addresses.shieldedCoinPublicKey,
      getEncryptionPublicKey: () => addresses.shieldedEncryptionPublicKey,
      // Lace selects fee inputs and binds the tx; only hex crosses the bridge.
      balanceTx: async (tx) => {
        const balancedHex = await callMain('balanceTx', { hex: toHex(tx.serialize()) });
        return Transaction.deserialize('signature', 'proof', 'binding', fromHex(balancedHex));
      },
    },
    midnightProvider: {
      submitTx: async (tx) => {
        await callMain('submitTx', { hex: toHex(tx.serialize()) });
        // Identifier, not explorer hash. Hall/Rail resolve hash via the indexer.
        return tx.identifiers()[0];
      },
    },
  };
}

const compiled = () => CompiledContract.make('MidnightPool', Contract).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets(`${config.origin}/midnight`),
);

// --- serial queue ----------------------------------------------------------
// One transaction at a time: concurrent txs contend for the same UTXOs and the wallet rejects the
// loser. This is what lets gameplay fire calls freely without reasoning about ordering.
// ponytail: serial queue, one tx at a time -- parallelise only if a rack visibly backs up.
let queue = Promise.resolve();
const enqueue = (fn) => (queue = queue.then(fn, fn));

self.onmessage = async (e) => {
  const m = e.data;

  if (m.kind === 'wallet-result') {
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.error) p.reject(new Error(m.error));
    else p.resolve(m.result);
    return;
  }

  const reply = (ok, payload) => self.postMessage({ kind: 'result', id: m.id, ok, ...payload });

  try {
    if (m.kind === 'init') {
      privateState = ensurePrivateState(m.privateState, m.secretKeyHex);
      providers = await buildProviders(m.config, m.addresses);
      return reply(true, { ready: true });
    }

    if (m.kind === 'deploy') {
      return enqueue(async () => {
        try {
          const deployed = await deployContract(providers, {
            compiledContract: compiled(),
            privateStateId: PRIVATE_STATE_ID,
            initialPrivateState: withStats(
              privateState ?? createPrivateState(), BigInt(m.level ?? 1), BigInt(m.wins ?? 0)),
          });
          const pub = deployed.deployTxData.public;
          reply(true, { contractAddress: pub.contractAddress, txId: pub.txId, blockHeight: pub.blockHeight });
        } catch (err) {
          reply(false, { error: String(err && err.message ? err.message : err) });
        }
      });
    }

    if (m.kind === 'call') {
      return enqueue(async () => {
        try {
          if (m.extras?.stats) {
            privateState = withStats(
              ensurePrivateState(privateState),
              BigInt(m.extras.stats.level),
              BigInt(m.extras.stats.wins || 0),
            );
          }
          if (m.extras?.cueTier != null) {
            privateState = withPendingCueTier(privateState, BigInt(m.extras.cueTier));
          }
          if (m.extras?.break?.matchIdHex) {
            privateState = withActiveMatch(
              ensurePrivateState(privateState),
              fromHex(m.extras.break.matchIdHex),
              BigInt(m.extras.break.role),
            );
          }
          const found = await findDeployedContract(providers, {
            compiledContract: compiled(),
            contractAddress: m.contractAddress,
            privateStateId: PRIVATE_STATE_ID,
          });
          const tx = await found.callTx[m.circuit](...(m.args ?? []));
          reply(true, {
            txId: tx.public.txId,
            blockHeight: tx.public.blockHeight,
            result: tx.private && tx.private.result !== undefined ? tx.private.result : null,
          });
        } catch (err) {
          reply(false, { error: String(err && err.message ? err.message : err) });
        }
      });
    }

    if (m.kind === 'read') {
      const st = await providers.publicDataProvider.queryContractState(m.contractAddress);
      if (!st) return reply(true, { state: null });
      const led = contractLedger(st.data);
      // Only counts cross the bridge: ledger handles are WASM objects and cannot be cloned.
      return reply(true, {
        state: {
          statsCommitments: [...led.statsCommitment].length,
          claimedCues: [...led.claimedCues].length,
        },
      });
    }
  } catch (err) {
    reply(false, { error: String(err && err.message ? err.message : err) });
  }
};
