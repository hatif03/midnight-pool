// Real Midnight Preprod testnet wallet bootstrap -- an attempted, NOT completed, step toward real
// on-chain submission (docs/adr/0011). What's genuinely verified live: the proof server
// (midnightntwrk/proof-server:8.0.3 via Docker), the indexer GraphQL endpoint
// (https://indexer.preprod.midnight.network/api/v4/graphql), the node's JSON-RPC over both HTTPS
// and WSS (https://rpc.preprod.midnight.network / wss://rpc.preprod.midnight.network -- confirmed
// with real system_chain/system_health calls outside this script), and the faucet page existing
// (https://midnight-tmnight-preprod.nethermind.dev/).
//
// What did NOT work, narrowed down (see ADR-0011's "Update" section): syncing this WalletFacade
// against real Preprod leaks memory linearly with shielded.progress.appliedIndex until OOM --
// confirmed NOT caused by InMemoryTransactionHistoryStorage (a no-op replacement crashes at the
// same rate) and NOT a generic reconnect-loop issue (a local-devnet control run logs the same
// "disconnected... Normal Closure" line then syncs fine on a near-empty chain). This is a real bug
// in wallet-sdk-facade@4.0.1/wallet-sdk-shielded@3.0.1's own sync-state tracking when processing a
// populated chain's real history -- not something this script's config can work around. Left in
// the repo as a documented, real attempt and a starting point; the next avenue is the browser/Lace
// DApp Connector path, which uses different sync machinery entirely.
import WebSocket from 'ws';
(globalThis as any).WebSocket = WebSocket;

import { HDWallet, Roles, generateRandomSeed } from '@midnight-ntwrk/wallet-sdk-hd';
import { WalletFacade, WalletEntrySchema } from '@midnight-ntwrk/wallet-sdk-facade';
import type { DefaultConfiguration } from '@midnight-ntwrk/wallet-sdk-facade';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import { UnshieldedWallet, createKeystore, PublicKey } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import * as ledger from '@midnight-ntwrk/ledger-v8';
import fs from 'node:fs';

// Diagnostic control (docs/adr/0011 follow-up): InMemoryTransactionHistoryStorage retains every
// upserted entry forever. Swapping in a discard-everything implementation isolates whether the
// observed memory growth lives in this layer or deeper in the wallet's own internal state.
const NoopTransactionHistoryStorage = {
  async upsert() {},
  async getAll() { return []; },
  async get() { return undefined; },
  async serialize() { return { entries: [] } as any; },
};

const SEED_FILE = 'testnet-seed.hex';
const seedHex = fs.existsSync(SEED_FILE)
  ? fs.readFileSync(SEED_FILE, 'utf8').trim()
  : (() => {
      const hex = Buffer.from(generateRandomSeed()).toString('hex');
      fs.writeFileSync(SEED_FILE, hex);
      return hex;
    })();
const seed = Buffer.from(seedHex, 'hex');

const hdWallet = HDWallet.fromSeed(seed);
if (hdWallet.type !== 'seedOk') throw new Error('Failed to initialize HDWallet');

const derivationResult = hdWallet.hdWallet
  .selectAccount(0)
  .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
  .deriveKeysAt(0);
if (derivationResult.type !== 'keysDerived') throw new Error('Failed to derive keys');
hdWallet.hdWallet.clear();

const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(derivationResult.keys[Roles.Zswap]);
const dustSecretKey = ledger.DustSecretKey.fromSeed(derivationResult.keys[Roles.Dust]);

const configuration: DefaultConfiguration = {
  networkId: 'preprod',
  costParameters: {
    feeBlocksMargin: 5,
    additionalFeeOverhead: 1_000_000n,
  },
  relayURL: new URL('wss://rpc.preprod.midnight.network'),
  provingServerUrl: new URL('http://localhost:6300'),
  indexerClientConnection: {
    indexerHttpUrl: 'https://indexer.preprod.midnight.network/api/v4/graphql',
    indexerWsUrl: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
  },
  txHistoryStorage: NoopTransactionHistoryStorage as any,
};

const unshieldedKeystore = createKeystore(derivationResult.keys[Roles.NightExternal], configuration.networkId);

export async function getWallet() {
  const wallet: WalletFacade = await WalletFacade.init({
    configuration,
    shielded: (config) => ShieldedWallet(config).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (config) => UnshieldedWallet(config).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
    dust: (config) => DustWallet(config).startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust),
  });
  await wallet.start(shieldedSecretKeys, dustSecretKey);
  return wallet;
}

if (import.meta.url.endsWith('testnet-wallet.ts') && process.argv[1]?.endsWith('testnet-wallet.ts')) {
  (async () => {
    console.log('Seed file:', SEED_FILE, '(reused if present, so re-running keeps the same address)');
    const wallet = await getWallet();
    console.log('Wallet started, waiting for initial sync against the real preprod indexer...');
    const fmt = (p?: { appliedIndex?: bigint; highestIndex?: bigint }) =>
      p ? `${p.appliedIndex ?? '?'}/${p.highestIndex ?? '?'}` : 'n/a';
    const sub = wallet.state().subscribe({
      next: (s) => {
        const mem = process.memoryUsage();
        console.log(
          'progress',
          JSON.stringify({
            shielded: fmt(s?.shielded?.progress),
            unshielded: fmt(s?.unshielded?.progress),
            dust: fmt(s?.dust?.progress),
            isSynced: s?.isSynced,
            rssMB: Math.round(mem.rss / 1e6),
            heapUsedMB: Math.round(mem.heapUsed / 1e6),
          }),
        );
      },
      error: (e) => console.log('state() observable error (non-fatal, continuing):', String(e?.message || e)),
    });
    const state = await wallet.waitForSyncedState();
    sub.unsubscribe();
    console.log('SYNCED.');
    console.log('Unshielded address:', state.unshielded.address);
    console.log('Shielded address:', state.shielded.address);
    console.log('Unshielded balances:', state.unshielded.balances);
    console.log('Shielded balances:', state.shielded.balances);
    await wallet.stop();
    process.exit(0);
  })().catch((err) => {
    console.error('FAILED:', err);
    process.exit(1);
  });
}
