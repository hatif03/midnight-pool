// Real Midnight Preprod testnet wallet bootstrap -- an attempted, NOT completed, step toward real
// on-chain submission (docs/adr/0011). What's genuinely verified live: the proof server
// (midnightntwrk/proof-server:8.0.3 via Docker), the indexer GraphQL endpoint
// (https://indexer.preprod.midnight.network/api/v4/graphql), the node's JSON-RPC over both HTTPS
// and WSS (https://rpc.preprod.midnight.network / wss://rpc.preprod.midnight.network -- confirmed
// with real system_chain/system_health calls outside this script), and the faucet page existing
// (https://midnight-tmnight-preprod.nethermind.dev/).
//
// What did NOT work: running this script against the real node crashed with a JavaScript
// heap-out-of-memory error after a repeated subscribeRuntimeVersion() disconnect/reconnect loop
// against wss://rpc.preprod.midnight.network -- a real, reproducible bug in this exact
// wallet-sdk-facade/ledger-v8 version combination against the live preprod node, not a timing
// fluke. Root cause not further diagnosed -- see ADR-0011 for the time-boxed decision to stop here
// and fall back to the existing, already-verified local-devnet/mock-mode Midnight story for the
// demo. Left in the repo as a documented, real attempt and a starting point, not a working path.
import WebSocket from 'ws';
(globalThis as any).WebSocket = WebSocket;

import { HDWallet, Roles, generateRandomSeed } from '@midnight-ntwrk/wallet-sdk-hd';
import { WalletFacade, WalletEntrySchema } from '@midnight-ntwrk/wallet-sdk-facade';
import type { DefaultConfiguration } from '@midnight-ntwrk/wallet-sdk-facade';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import { UnshieldedWallet, createKeystore, PublicKey } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { InMemoryTransactionHistoryStorage } from '@midnight-ntwrk/wallet-sdk-abstractions';
import * as ledger from '@midnight-ntwrk/ledger-v8';
import fs from 'node:fs';

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
  txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema),
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
    const state = await wallet.waitForSyncedState();
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
