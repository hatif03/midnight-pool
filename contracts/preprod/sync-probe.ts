// Does a WalletFacade sync against real, public Preprod without exhausting memory?
//
// This is the gate on whether a public deployment is reachable from Node at all, and it is a direct
// re-measurement of midnightntwrk/midnight-wallet#704, where a maintainer said the leak "should be
// already fixed" without naming a version. Columns match the original report so the traces compare.
//
// Preprod was at block 2,330,285 when #704 was filed; it is past 2,530,000 now.
import WebSocket from 'ws';
(globalThis as any).WebSocket = WebSocket;

import fs from 'node:fs';
import { HDWallet, Roles, generateRandomSeed } from '@midnight-ntwrk/wallet-sdk-hd';
import { WalletFacade, WalletEntrySchema } from '@midnight-ntwrk/wallet-sdk-facade';
import type { DefaultConfiguration } from '@midnight-ntwrk/wallet-sdk-facade';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import { UnshieldedWallet, createKeystore, PublicKey } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { InMemoryTransactionHistoryStorage } from '@midnight-ntwrk/wallet-sdk-abstractions';
import * as ledger from '@midnight-ntwrk/ledger-v8';

const SEED_FILE = process.env.SEED_FILE ?? 'preprod-seed.hex';
const BUDGET_MS = Number(process.env.BUDGET_MS ?? 600_000);

const seedHex = fs.existsSync(SEED_FILE)
  ? fs.readFileSync(SEED_FILE, 'utf8').trim()
  : (() => {
      const hex = Buffer.from(generateRandomSeed()).toString('hex');
      fs.writeFileSync(SEED_FILE, hex);
      console.log(`generated a new seed -> ${SEED_FILE} (keep it: it owns any funds sent to these addresses)`);
      return hex;
    })();

const hd = HDWallet.fromSeed(Buffer.from(seedHex, 'hex'));
if (hd.type !== 'seedOk') throw new Error('HDWallet init failed');
const derived = hd.hdWallet.selectAccount(0)
  .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust]).deriveKeysAt(0);
if (derived.type !== 'keysDerived') throw new Error('key derivation failed');
hd.hdWallet.clear();

const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(derived.keys[Roles.Zswap]);
const dustSecretKey = ledger.DustSecretKey.fromSeed(derived.keys[Roles.Dust]);

const configuration: DefaultConfiguration = {
  networkId: 'preprod',
  costParameters: { feeBlocksMargin: 5, additionalFeeOverhead: 1_000_000n },
  relayURL: new URL('wss://rpc.preprod.midnight.network'),
  provingServerUrl: new URL(process.env.PROOF_SERVER ?? 'http://localhost:6300'),
  indexerClientConnection: {
    indexerHttpUrl: 'https://indexer.preprod.midnight.network/api/v4/graphql',
    indexerWsUrl: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
  },
  txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema),
};

const keystore = createKeystore(derived.keys[Roles.NightExternal], configuration.networkId);
const pubKey = PublicKey.fromKeyStore(keystore);

console.log('unshielded address:', keystore.getBech32Address?.().asString?.() ?? String((pubKey as any).address ?? ''));

const wallet = await WalletFacade.init({
  configuration,
  shielded: (c: any) => ShieldedWallet(c).startWithSecretKeys(shieldedSecretKeys),
  unshielded: (c: any) => UnshieldedWallet(c).startWithPublicKey(pubKey),
  dust: (c: any) => DustWallet(c).startWithSecretKey(
    dustSecretKey, ledger.LedgerParameters.initialParameters().dust),
} as any);

await wallet.start(shieldedSecretKeys, dustSecretKey);

const t0 = Date.now();
let last = 0, peak = 0, lastApplied = 0, samples = 0;
const sub: any = (wallet as any).state().subscribe((s: any) => {
  const now = Date.now();
  if (now - last < 5000) return;
  last = now; samples++;
  const m = process.memoryUsage();
  const heap = Math.round(m.heapUsed / 1048576);
  peak = Math.max(peak, heap);
  const sh = s?.shielded?.progress, du = s?.dust?.progress;
  lastApplied = Number(sh?.appliedIndex ?? lastApplied);
  console.log(JSON.stringify({
    t: Math.round((now - t0) / 1000),
    shielded: `${sh?.appliedIndex ?? '?'}/${sh?.highestIndex ?? '?'}`,
    dust: `${du?.appliedIndex ?? '?'}/${du?.highestIndex ?? '?'}`,
    heapMB: heap, rssMB: Math.round(m.rss / 1048576), synced: !!s?.isSynced,
  }));
});

const outcome = await Promise.race([
  wallet.waitForSyncedState().then(() => 'SYNCED' as const),
  new Promise<'TIMEOUT'>((r) => setTimeout(() => r('TIMEOUT'), BUDGET_MS)),
]).catch((e) => { console.error('sync threw:', e?.message ?? e); return 'ERROR' as const; });

const secs = Math.round((Date.now() - t0) / 1000);
console.log(`\nRESULT: ${outcome}  elapsed=${secs}s  peakHeapMB=${peak}  lastAppliedIndex=${lastApplied}  samples=${samples}`);
if (outcome !== 'SYNCED') {
  console.log(`rate: ${lastApplied && secs ? (lastApplied / secs).toFixed(1) : '?'} entries/s, ` +
              `${lastApplied ? (peak * 1024 / lastApplied).toFixed(1) : '?'} KB/entry (peak heap over applied)`);
}

try { sub?.unsubscribe?.(); } catch {}
try { await wallet.stop(); } catch {}
process.exit(outcome === 'SYNCED' ? 0 : 2);
