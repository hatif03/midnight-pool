// MidnightProviders assembly — main thread only.
// Pattern: midnight-dapp-dev:dapp-connector / references/browser-providers.md
// (ConnectedAPI → walletProvider + midnightProvider; FetchZkConfigProvider; httpClientProofProvider).
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { toHex, fromHex } from '@midnight-ntwrk/midnight-js-utils';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { Transaction } from '@midnight-ntwrk/ledger-v8';
import { Contract, ledger as contractLedger } from '../../contracts/managed/midnight-pool/contract/index.js';
import {
  createPrivateState, withActiveMatch, withPendingCueTier, withStats, witnesses,
} from '../../contracts/witnesses.ts';

const PRIVATE_STATE_ID = 'midnight-pool';

export function ensurePrivateState(st, secretKeyHex) {
  const base = st ?? createPrivateState(secretKeyHex ? fromHex(secretKeyHex) : undefined);
  if (base.breakSecrets instanceof Map) return base;
  return { ...base, breakSecrets: new Map() };
}

function makePrivateStateProvider(privateStateRef) {
  const signingKeys = new Map();
  return {
    setContractAddress: () => {},
    set: async (_id, st) => { privateStateRef.set(st); },
    get: async () => privateStateRef.get(),
    remove: async () => { privateStateRef.set(null); },
    clear: async () => { privateStateRef.set(null); },
    setSigningKey: async (address, key) => { signingKeys.set(address, key); },
    getSigningKey: async (address) => signingKeys.get(address) ?? null,
    removeSigningKey: async (address) => { signingKeys.delete(address); },
    clearSigningKeys: async () => { signingKeys.clear(); },
    exportPrivateStates: async () => { throw new Error('not supported'); },
    importPrivateStates: async () => { throw new Error('not supported'); },
    exportSigningKeys: async () => { throw new Error('not supported'); },
    importSigningKeys: async () => { throw new Error('not supported'); },
  };
}

export async function buildProviders({
  api, addresses, networkId, indexerHttp, indexerWs, proverUri, origin, privateStateRef,
}) {
  setNetworkId(networkId);

  const zkConfigProvider = new FetchZkConfigProvider(
    `${origin}/midnight`,
    fetch.bind(typeof window !== 'undefined' ? window : globalThis),
  );

  return {
    privateStateProvider: makePrivateStateProvider(privateStateRef),
    publicDataProvider: indexerPublicDataProvider(indexerHttp, indexerWs),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(proverUri, zkConfigProvider),
    walletProvider: {
      getCoinPublicKey: () => addresses.shieldedCoinPublicKey,
      getEncryptionPublicKey: () => addresses.shieldedEncryptionPublicKey,
      balanceTx: async (tx) => {
        const { tx: balancedHex } = await api.balanceUnsealedTransaction(toHex(tx.serialize()), {});
        return Transaction.deserialize('signature', 'proof', 'binding', fromHex(balancedHex));
      },
    },
    midnightProvider: {
      submitTx: async (tx) => {
        await api.submitTransaction(toHex(tx.serialize()));
        return tx.identifiers()[0];
      },
    },
  };
}

const compiled = (origin) => CompiledContract.make('MidnightPool', Contract).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets(`${origin}/midnight`),
);

export async function deployContractTx(providers, privateState, { level, wins }) {
  const origin = typeof location !== 'undefined' ? location.origin : '';
  const deployed = await deployContract(providers, {
    compiledContract: compiled(origin),
    privateStateId: PRIVATE_STATE_ID,
    initialPrivateState: withStats(
      privateState ?? createPrivateState(), BigInt(level ?? 1), BigInt(wins ?? 0)),
  });
  const pub = deployed.deployTxData.public;
  return {
    contractAddress: pub.contractAddress,
    txId: pub.txId,
    blockHeight: pub.blockHeight,
    privateState: providers.privateStateProvider ? await providers.privateStateProvider.get() : privateState,
  };
}

export async function callCircuit(providers, { contractAddress, circuit, args, extras, privateStateRef }) {
  let st = ensurePrivateState(privateStateRef.get());
  if (extras?.stats) {
    st = withStats(st, BigInt(extras.stats.level), BigInt(extras.stats.wins || 0));
  }
  if (extras?.cueTier != null) {
    st = withPendingCueTier(st, BigInt(extras.cueTier));
  }
  if (extras?.break?.matchIdHex) {
    st = withActiveMatch(st, fromHex(extras.break.matchIdHex), BigInt(extras.break.role));
  }
  privateStateRef.set(st);

  const origin = typeof location !== 'undefined' ? location.origin : '';
  const found = await findDeployedContract(providers, {
    compiledContract: compiled(origin),
    contractAddress,
    privateStateId: PRIVATE_STATE_ID,
  });
  const tx = await found.callTx[circuit](...(args ?? []));
  return {
    txId: tx.public.txId,
    blockHeight: tx.public.blockHeight,
    result: tx.private && tx.private.result !== undefined ? tx.private.result : null,
  };
}

export async function readLedgerState(providers, contractAddress) {
  const st = await providers.publicDataProvider.queryContractState(contractAddress);
  if (!st) return null;
  const led = contractLedger(st.data);
  return {
    statsCommitments: [...led.statsCommitment].length,
    claimedCues: [...led.claimedCues].length,
  };
}
