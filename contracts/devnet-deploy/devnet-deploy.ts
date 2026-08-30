// Real deploy + real circuit call against the LOCAL devnet (docs/adr/0013) -- the working half of
// the "use local devnet for a real cross-chain demo" idea, once real Preprod submission proved
// non-viable (ADR-0011). Unlike testnet-wallet.ts, this actually completes: the local devnet's
// near-empty chain means the wallet-sdk-facade sync bug (ADR-0011) never has enough history to
// matter, and the genesis seed comes pre-funded, so no faucet/DUST-delegation wait is needed.
//
// Uses a SEPARATE compiled output (managed-devnet/, compiler +0.31.1) from the browser bundle's
// managed/ (compiler +0.34.0) -- midnight-js-contracts@4.1.1 depends on compact-runtime@0.16.0
// via midnight-js-protocol, per the official compatibility matrix (compact.compile 0.31.1 / compact
// -runtime 0.16.0 / midnight.js 4.1.1), not the newer runtime the browser bundle was compiled
// against. Same .compact source either way -- see contracts/README.md.
import WebSocket from 'ws';
(globalThis as any).WebSocket = WebSocket;

import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { WalletFacade, WalletEntrySchema } from '@midnight-ntwrk/wallet-sdk-facade';
import type { DefaultConfiguration } from '@midnight-ntwrk/wallet-sdk-facade';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import { UnshieldedWallet, createKeystore, PublicKey } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { InMemoryTransactionHistoryStorage } from '@midnight-ntwrk/wallet-sdk-abstractions';
import * as ledger from '@midnight-ntwrk/ledger-v8';
import * as Rx from 'rxjs';

import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import type { WalletProvider, MidnightProvider } from '@midnight-ntwrk/midnight-js-types';

import { Contract } from './managed-devnet/midnight-pool/contract/index.js';
import { createPrivateState, withStats, witnesses } from '../witnesses.js';

setNetworkId('undeployed' as any);

// Local-devnet-only, pre-funded on the `dev` preset -- never use this for anything real.
const GENESIS_SEED = '0000000000000000000000000000000000000000000000000000000000000001';

const DEVNET_CONFIG = {
  node: 'ws://localhost:9944',
  indexer: 'http://localhost:8088/api/v4/graphql',
  indexerWs: 'ws://localhost:8088/api/v4/graphql/ws',
  proofServer: 'http://localhost:6300',
};

async function buildWallet(seedHex: string) {
  const seed = Buffer.from(seedHex, 'hex');
  const hdWallet = HDWallet.fromSeed(seed);
  if (hdWallet.type !== 'seedOk') throw new Error('Failed to initialize HDWallet');
  const derived = hdWallet.hdWallet.selectAccount(0).selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust]).deriveKeysAt(0);
  if (derived.type !== 'keysDerived') throw new Error('Failed to derive keys');
  hdWallet.hdWallet.clear();

  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(derived.keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(derived.keys[Roles.Dust]);
  const keystore = createKeystore(derived.keys[Roles.NightExternal], 'undeployed');

  const configuration: DefaultConfiguration = {
    networkId: 'undeployed',
    costParameters: { feeBlocksMargin: 5, additionalFeeOverhead: 1_000_000n },
    relayURL: new URL(DEVNET_CONFIG.node),
    provingServerUrl: new URL(DEVNET_CONFIG.proofServer),
    indexerClientConnection: { indexerHttpUrl: DEVNET_CONFIG.indexer, indexerWsUrl: DEVNET_CONFIG.indexerWs },
    txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema),
  };

  const facade = await WalletFacade.init({
    configuration,
    shielded: (c) => ShieldedWallet(c).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (c) => UnshieldedWallet(c).startWithPublicKey(PublicKey.fromKeyStore(keystore)),
    dust: (c) => DustWallet(c).startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust),
  });
  await facade.start(shieldedSecretKeys, dustSecretKey);
  return { facade, shieldedSecretKeys, dustSecretKey };
}

// Bridges WalletFacade into the WalletProvider+MidnightProvider pair midnight-js-contracts needs
// (compact-cli-dev:core's documented pattern) -- waits for sync since balanceTx needs real UTXOs.
async function createWalletProvider(
  facade: WalletFacade,
  shieldedSecretKeys: ledger.ZswapSecretKeys,
  dustSecretKey: ledger.DustSecretKey,
): Promise<WalletProvider & MidnightProvider> {
  const state = await Rx.firstValueFrom(facade.state().pipe(Rx.filter((s) => s.isSynced)));
  return {
    getCoinPublicKey: () => state.shielded.coinPublicKey.toHexString(),
    getEncryptionPublicKey: () => state.shielded.encryptionPublicKey.toHexString(),
    async balanceTx(tx: any, ttl?: Date) {
      const recipe = await facade.balanceUnboundTransaction(tx, { shieldedSecretKeys, dustSecretKey }, { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) });
      return facade.finalizeRecipe(recipe);
    },
    submitTx: (tx: any) => facade.submitTransaction(tx),
  } as WalletProvider & MidnightProvider;
}

export async function deployAndProveThreshold(level: bigint, wins: bigint, threshold: bigint, checkWins: boolean) {
  const { facade, shieldedSecretKeys, dustSecretKey } = await buildWallet(GENESIS_SEED);
  try {
    console.log('Waiting for genesis wallet to sync against the local devnet...');
    const walletProvider = await createWalletProvider(facade, shieldedSecretKeys, dustSecretKey);
    console.log('Synced. Coin public key:', walletProvider.getCoinPublicKey());

    const zkConfigProvider = new NodeZkConfigProvider('./managed-devnet/midnight-pool');
    const providers = {
      privateStateProvider: levelPrivateStateProvider({
        privateStateStoreName: 'midnight-pool-devnet-deploy',
        accountId: walletProvider.getCoinPublicKey(),
        // Local-devnet-only, ephemeral on-disk store -- not protecting anything sensitive.
        privateStoragePasswordProvider: () => Promise.resolve('Local-Devnet-Only-Not-A-Real-Secret-1'),
      } as any),
      publicDataProvider: indexerPublicDataProvider(DEVNET_CONFIG.indexer, DEVNET_CONFIG.indexerWs),
      zkConfigProvider,
      proofProvider: httpClientProofProvider(DEVNET_CONFIG.proofServer, zkConfigProvider),
      walletProvider,
      midnightProvider: walletProvider,
    };

    const compiledContract = CompiledContract.make('MidnightPool', Contract as any).pipe(
      CompiledContract.withWitnesses(witnesses as any),
      CompiledContract.withCompiledFileAssets('./managed-devnet/midnight-pool'),
    );

    const privateState = withStats(createPrivateState(), level, wins);
    console.log('Deploying MidnightPool to the local devnet...');
    const deployed = await deployContract(providers as any, {
      compiledContract,
      privateStateId: 'midnight-pool-devnet-deploy',
      initialPrivateState: privateState,
    } as any);
    console.log('DEPLOYED.', {
      contractAddress: (deployed as any).deployTxData.public.contractAddress,
      txId: (deployed as any).deployTxData.public.txId,
      blockHeight: (deployed as any).deployTxData.public.blockHeight,
    });

    console.log('Calling commitStats...');
    const commitTx = await (deployed as any).callTx.commitStats();
    console.log('commitStats confirmed.', { txId: commitTx.public.txId, blockHeight: commitTx.public.blockHeight });

    console.log('Calling proveThreshold...');
    const proveTx = await (deployed as any).callTx.proveThreshold(threshold, checkWins);
    console.log('proveThreshold confirmed.', {
      txId: proveTx.public.txId,
      blockHeight: proveTx.public.blockHeight,
      result: proveTx.private?.result,
    });

    return {
      contractAddress: (deployed as any).deployTxData.public.contractAddress,
      commitTxId: commitTx.public.txId,
      proveTxId: proveTx.public.txId,
    };
  } finally {
    await facade.stop();
  }
}

if (import.meta.url.endsWith('devnet-deploy.ts') && process.argv[1]?.endsWith('devnet-deploy.ts')) {
  deployAndProveThreshold(7n, 4n, 5n, false)
    .then((r) => { console.log('OK', r); process.exit(0); })
    .catch((err) => { console.error('FAILED:', err); process.exit(1); });
}
