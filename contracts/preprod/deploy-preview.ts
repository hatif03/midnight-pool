// Deploy MidnightPool to a PUBLIC Midnight network from Node (docs/adr/0018).
//
// Requires:
//   - a funded wallet (see preview-seed.hex; fund its unshielded address at the faucet)
//   - a local proof server on :6300  (docker run -d -p 6300:6300 midnightntwrk/proof-server:8.1.0)
//   - contracts compiled WITH ZK keys (bash scripts/compact-docker/compile.sh)
//
// Whether this can reach a given network depends on midnightntwrk/midnight-wallet#704: the wallet
// leaks while syncing preprod and dies, but stays bounded on preview. Run `npm run probe` first if
// unsure -- this script waits for a synced wallet and will otherwise sit there.
import WebSocket from 'ws';
(globalThis as any).WebSocket = WebSocket;

import fs from 'node:fs';
import * as Rx from 'rxjs';

import { HDWallet, Roles, generateRandomSeed } from '@midnight-ntwrk/wallet-sdk-hd';
import { WalletFacade, WalletEntrySchema } from '@midnight-ntwrk/wallet-sdk-facade';
import type { DefaultConfiguration } from '@midnight-ntwrk/wallet-sdk-facade';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import { UnshieldedWallet, createKeystore, PublicKey } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { InMemoryTransactionHistoryStorage } from '@midnight-ntwrk/wallet-sdk-abstractions';
import * as ledger from '@midnight-ntwrk/ledger-v8';

import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import type { WalletProvider, MidnightProvider } from '@midnight-ntwrk/midnight-js-types';

import { Contract, ledger as contractLedger } from '../managed/midnight-pool/contract/index.js';
import { createPrivateState, withStats, witnesses } from '../witnesses.js';

const NETWORK = process.env.NETWORK ?? 'preview';
const SEED_FILE = process.env.SEED_FILE ?? `${NETWORK}-seed.hex`;
const PROOF_SERVER = process.env.PROOF_SERVER ?? 'http://localhost:6300';
const LEVEL = BigInt(process.env.LEVEL ?? '7');
const WINS = BigInt(process.env.WINS ?? '4');
const THRESHOLD = BigInt(process.env.THRESHOLD ?? '5');

const ENDPOINTS = {
  node: `wss://rpc.${NETWORK}.midnight.network`,
  indexer: `https://indexer.${NETWORK}.midnight.network/api/v4/graphql`,
  indexerWs: `wss://indexer.${NETWORK}.midnight.network/api/v4/graphql/ws`,
};

setNetworkId(NETWORK as any);

const seedHex = fs.existsSync(SEED_FILE)
  ? fs.readFileSync(SEED_FILE, 'utf8').trim()
  : (() => {
      const hex = Buffer.from(generateRandomSeed()).toString('hex');
      fs.writeFileSync(SEED_FILE, hex);
      console.log(`generated a new seed -> ${SEED_FILE}. BACK THIS UP: it owns the contract.`);
      return hex;
    })();

async function buildWallet() {
  const hd = HDWallet.fromSeed(Buffer.from(seedHex, 'hex'));
  if (hd.type !== 'seedOk') throw new Error('HDWallet init failed');
  const derived = hd.hdWallet.selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust]).deriveKeysAt(0);
  if (derived.type !== 'keysDerived') throw new Error('key derivation failed');
  hd.hdWallet.clear();

  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(derived.keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(derived.keys[Roles.Dust]);

  const configuration: DefaultConfiguration = {
    networkId: NETWORK as any,
    costParameters: { feeBlocksMargin: 5, additionalFeeOverhead: 1_000_000n },
    relayURL: new URL(ENDPOINTS.node),
    provingServerUrl: new URL(PROOF_SERVER),
    indexerClientConnection: { indexerHttpUrl: ENDPOINTS.indexer, indexerWsUrl: ENDPOINTS.indexerWs },
    txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema),
  };

  const keystore = createKeystore(derived.keys[Roles.NightExternal], configuration.networkId);
  console.log('network          :', NETWORK);
  console.log('unshielded addr  :', keystore.getBech32Address().asString());

  const facade = await WalletFacade.init({
    configuration,
    shielded: (c: any) => ShieldedWallet(c).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (c: any) => UnshieldedWallet(c).startWithPublicKey(PublicKey.fromKeyStore(keystore)),
    dust: (c: any) => DustWallet(c).startWithSecretKey(
      dustSecretKey, ledger.LedgerParameters.initialParameters().dust),
  } as any);
  await facade.start(shieldedSecretKeys, dustSecretKey);
  return { facade, shieldedSecretKeys, dustSecretKey };
}

// Bridges WalletFacade into the WalletProvider + MidnightProvider pair midnight-js-contracts needs.
// Waits for sync, because balancing needs real UTXOs.
async function createWalletProvider(facade: any, shieldedSecretKeys: any, dustSecretKey: any) {
  let lastLog = 0;
  const state = await Rx.firstValueFrom(
    facade.state().pipe(
      Rx.tap((s: any) => {
        const now = Date.now();
        if (now - lastLog < 15000) return;
        lastLog = now;
        const p = s?.shielded?.progress;
        console.log(`  syncing… shielded=${p?.appliedIndex ?? '?'} heap=${Math.round(process.memoryUsage().heapUsed / 1048576)}MB`);
      }),
      Rx.filter((s: any) => s.isSynced),
    ),
  );

  const bal = (o: any) => JSON.stringify(o ?? {}, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
  console.log('SYNCED.');
  console.log('  shielded balances  :', bal(state.shielded?.balances));
  console.log('  unshielded balances:', bal(state.unshielded?.balances));
  console.log('  dust balances      :', bal(state.dust?.balances));

  return {
    getCoinPublicKey: () => state.shielded.coinPublicKey.toHexString(),
    getEncryptionPublicKey: () => state.shielded.encryptionPublicKey.toHexString(),
    async balanceTx(tx: any, ttl?: Date) {
      const recipe = await facade.balanceUnboundTransaction(
        tx, { shieldedSecretKeys, dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) });
      return facade.finalizeRecipe(recipe);
    },
    submitTx: (tx: any) => facade.submitTransaction(tx),
  } as WalletProvider & MidnightProvider;
}

async function main() {
  const { facade, shieldedSecretKeys, dustSecretKey } = await buildWallet();
  try {
    console.log('waiting for wallet sync (this is the #704 bottleneck — bounded on preview)…');
    const walletProvider = await createWalletProvider(facade, shieldedSecretKeys, dustSecretKey);

    const zkConfigProvider = new NodeZkConfigProvider('../managed/midnight-pool');
    const providers = {
      privateStateProvider: levelPrivateStateProvider({
        privateStateStoreName: `midnight-pool-${NETWORK}`,
        accountId: walletProvider.getCoinPublicKey(),
        privateStoragePasswordProvider: () => Promise.resolve('Local-Only-Not-A-Real-Secret-1'),
      } as any),
      publicDataProvider: indexerPublicDataProvider(ENDPOINTS.indexer, ENDPOINTS.indexerWs),
      zkConfigProvider,
      proofProvider: httpClientProofProvider(PROOF_SERVER, zkConfigProvider),
      walletProvider,
      midnightProvider: walletProvider,
    };

    const compiledContract = CompiledContract.make('MidnightPool', Contract as any).pipe(
      CompiledContract.withWitnesses(witnesses as any),
      CompiledContract.withCompiledFileAssets('../managed/midnight-pool'),
    );

    console.log(`\ndeploying MidnightPool to ${NETWORK}…`);
    const deployed: any = await deployContract(providers as any, {
      compiledContract,
      privateStateId: `midnight-pool-${NETWORK}`,
      initialPrivateState: withStats(createPrivateState(), LEVEL, WINS),
    } as any);

    const pub = deployed.deployTxData.public;
    console.log('\nDEPLOYED');
    console.log('  contractAddress:', pub.contractAddress);
    console.log('  txId           :', pub.txId);
    console.log('  blockHeight    :', pub.blockHeight);

    console.log('\ncalling commitStats…');
    const commitTx = await deployed.callTx.commitStats();
    console.log('  txId:', commitTx.public.txId, 'block:', commitTx.public.blockHeight);

    console.log(`\ncalling proveThreshold(${THRESHOLD}, false)…`);
    const proveTx = await deployed.callTx.proveThreshold(THRESHOLD, false);
    console.log('  txId:', proveTx.public.txId, 'block:', proveTx.public.blockHeight);
    console.log('  result (level >= threshold, the ONLY thing disclosed):', proveTx.private?.result);

    // Read it back the way a third party would, from the public indexer.
    const onChain = await providers.publicDataProvider.queryContractState(pub.contractAddress);
    const led: any = (contractLedger as any)(onChain!.data);
    const commitments = [...led.statsCommitment];
    console.log('\nread back from the public indexer:');
    console.log('  statsCommitment entries:', commitments.length);

    fs.writeFileSync('deployed.json', JSON.stringify({
      network: NETWORK,
      contractAddress: pub.contractAddress,
      deployTxId: pub.txId,
      deployBlockHeight: pub.blockHeight,
      commitStatsTxId: commitTx.public.txId,
      proveThresholdTxId: proveTx.public.txId,
      deployedAt: new Date().toISOString(),
    }, null, 2));
    console.log('\nwrote deployed.json');
  } finally {
    await facade.stop().catch(() => {});
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('\nFAILED:', err?.message ?? err);
  process.exit(1);
});
