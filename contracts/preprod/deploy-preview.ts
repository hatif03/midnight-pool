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

// Imported from INSIDE this package, not ../managed/, and that matters: Node resolves a compiled
// module's imports from the module's own location (ADR-0013). Loading it from ../managed/ makes the
// compiled contract resolve onchain-runtime-v3 from the ROOT node_modules while compact-js resolves
// it from this package's -- two copies of one wasm-bindgen module, two JS classes for one Rust type,
// and `expected instance of ContractMaintenanceAuthority` from _assertClass.
import { Contract, ledger as contractLedger } from './managed/midnight-pool/contract/index.js';
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
    // 1_000_000n is the LOCAL DEVNET value, where the per-block fee rate is ~0 and the overhead
    // exists only to stop the fee being literally zero (error 117, NotNormalized). On a real
    // network the fee is real, and the DUST spend proof commits to `output = input - declaredFee`
    // -- too small an overhead and the declared fee disagrees with what the proof proves, which the
    // node rejects as error 170, InvalidDustSpendProof. The documented value for wallets that
    // submit contract calls is 300_000_000_000_000n.
    costParameters: { feeBlocksMargin: 5, additionalFeeOverhead: 300_000_000_000_000n },
    relayURL: new URL(ENDPOINTS.node),
    provingServerUrl: new URL(PROOF_SERVER),
    indexerClientConnection: { indexerHttpUrl: ENDPOINTS.indexer, indexerWsUrl: ENDPOINTS.indexerWs },
    txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema),
    // Default batch size is 10; that is what OOMs WalletFacade on a populated chain
    // (midnight-wallet#704 / #425). Operators independently synced Preprod with size 5000.
    batchUpdates: { size: 5000, timeout: 1, spacing: 4 },
  } as DefaultConfiguration;

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
  return { facade, shieldedSecretKeys, dustSecretKey, keystore };
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
  console.log('  dust coins         :', (state.dust?.availableCoins ?? []).length,
              'available,', dustTotal(state).toString(), 'Specks generated');

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


const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// DustWalletState has NO `balances` property -- it exposes totalCoins / availableCoins /
// pendingCoins, each a DustFullInfo carrying `generatedNow` ("current amount of Dust available, in
// Specks"). Reading `.balances` here returned undefined and summed to 0n, which looked exactly like
// "no DUST has accrued" and sent me chasing the chain for an hour. The DUST was there; the accessor
// was wrong.
const dustTotal = (st: any): bigint =>
  (st?.dust?.availableCoins ?? []).reduce((a: bigint, c: any) => a + BigInt(c?.generatedNow ?? 0n), 0n);

async function ensureDust(facade: any, keystore: any, shieldedSecretKeys: any, dustSecretKey: any) {
  let st: any = await Rx.firstValueFrom(facade.state().pipe(Rx.filter((s: any) => s.isSynced)));
  if (dustTotal(st) > 0n) {
    console.log('DUST already available:', dustTotal(st).toString(), 'Specks');
    return;
  }

  const coins = st.unshielded?.availableCoins ?? [];
  const unregistered = coins.filter((u: any) => !u.meta?.registeredForDustGeneration);

  if (coins.length === 0) {
    throw new Error('no NIGHT UTxOs at all: fund the unshielded address at the faucet first');
  }

  // Already registered but nothing accrued yet is the NORMAL state on a re-run -- registering again
  // would be wrong. DUST builds up from the registered UTxO over time, so the only thing to do here
  // is wait.
  if (unregistered.length === 0) {
    console.log(`
all ${coins.length} NIGHT UTxO(s) already registered for DUST generation; waiting for it to accrue…`);
    return waitForDust(facade);
  }

  console.log(`
no DUST yet; ${unregistered.length} unregistered NIGHT UTxO(s) -> registering for DUST generation…`);

  try {
    const est = await facade.estimateRegistration(unregistered);
    console.log('  estimated registration fee:', String(est.fee), 'Specks');
  } catch (e: any) {
    console.log('  (fee estimate unavailable:', String(e?.message ?? e).slice(0, 90) + ')');
  }

  const recipe = await facade.registerNightUtxosForDustGeneration(
    unregistered,
    keystore.getPublicKey(),
    (payload: Uint8Array) => keystore.signData(payload),
  );
  const tx = await facade.finalizeRecipe(recipe);
  const txId = await facade.submitTransaction(tx);
  console.log('  registration submitted:', txId);

  return waitForDust(facade);
}

// DUST accrues from a registered NIGHT UTxO over time -- the docs put full accrual at about a week,
// but a deploy needs only a few transactions' worth.
async function waitForDust(facade: any, minutes = Number(process.env.DUST_WAIT_MIN ?? 30)) {
  const deadline = Date.now() + minutes * 60 * 1000;
  let first = true;
  while (Date.now() < deadline) {
    await sleep(20000);
    const st = await Rx.firstValueFrom(facade.state().pipe(Rx.filter((s: any) => s.isSynced)));
    const d = dustTotal(st);

    if (first) {
      first = false;
      // Printed once: if DUST never appears, the question is whether the wallet is even LOOKING at
      // the right place -- whether its dust sync has reached the registration block, and whether
      // the generating UTxO pays the address this wallet watches.
      try {
        const dustAddr = st.dust?.address;
        console.log('  dust address      :', dustAddr?.asString?.() ?? dustAddr?.toString?.() ?? JSON.stringify(dustAddr));
        console.log('  dust sync progress:', JSON.stringify(st.dust?.progress ?? {}, (_, v) => typeof v === 'bigint' ? v.toString() : v));
        console.log('  registered UTxOs  :', (st.unshielded?.availableCoins ?? [])
          .filter((u: any) => u.meta?.registeredForDustGeneration).length,
          'of', (st.unshielded?.availableCoins ?? []).length);
        for (const c of (st.dust?.availableCoins ?? [])) {
          console.log('  dust coin         : generatedNow=', String(c.generatedNow),
                      'maxCap=', String(c.maxCap), 'capAt=', String(c.maxCapReachedAt));
        }
      } catch {}
    }

    const left = Math.round((deadline - Date.now()) / 60000);
    console.log(`  waiting for DUST… ${d.toString()} Specks (${left}m left)`);
    if (d > 0n) { console.log('DUST available.'); return; }
  }
  throw new Error(`registered for DUST generation but none accrued within ${minutes} minutes`);
}

async function main() {
  const { facade, shieldedSecretKeys, dustSecretKey, keystore } = await buildWallet();
  try {
    console.log('waiting for wallet sync (this is the #704 bottleneck — bounded on preview)…');
    const walletProvider = await createWalletProvider(facade, shieldedSecretKeys, dustSecretKey);

    // ---- DUST bootstrap -------------------------------------------------
    // Fees are paid in DUST, and DUST is generated by NIGHT UTXOs that have been REGISTERED for it.
    // A freshly funded wallet holds NIGHT but generates nothing, so a deploy would fail on fees for
    // a reason that has nothing to do with the contract. This is the "delegate in your wallet" step
    // from the docs, done through the SDK so it needs no browser wallet.
    await ensureDust(facade, keystore, shieldedSecretKeys, dustSecretKey);

    const zkConfigProvider = new NodeZkConfigProvider('./managed/midnight-pool');
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
      CompiledContract.withCompiledFileAssets('./managed/midnight-pool'),
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
