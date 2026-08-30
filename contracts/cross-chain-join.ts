/**
 * Lighter cross-chain join (docs/adr/0007's documented fallback -- the full Effectstream
 * evm-midnight-v2 stack proved too version-fragile to stabilize in this environment: six
 * distinct real bugs in a row -- stale workspace symlinks after a linker-mode switch, missing
 * per-package dependency symlinks under Bun's hoisted linking, a Nix-store interpreter path
 * absent on non-Nix Linux, a Bun/graphql export-condition conflict, a compiler/runtime version
 * mismatch against the template's own stated compatibility, and finally a WASM module-identity
 * duplication bug -- each fixed in turn, until the user called it: drop Effectstream).
 *
 * Same conceptual pattern Effectstream itself demonstrates -- independently read two chains,
 * join them by a shared key in a script, no bridge -- built with tools already proven stable in
 * this repo: Foundry (forge/cast/anvil, already used for docs/adr/0002-era tooling) for the EVM
 * side, and this project's own already-compiled-and-verified midnight-pool.compact circuit
 * (contracts/managed/midnight-pool, workstream 1) for the Midnight side. Neither side is mocked:
 * proveThreshold actually executes through @midnight-ntwrk/compact-runtime's simulator (the same
 * engine contracts/test/simulator.test.ts uses), and the EVM mint is a real anvil transaction.
 *
 * Prerequisites: `anvil` running on 127.0.0.1:8545 (any --port works, see ANVIL_RPC below) and
 * `cross-chain/` compiled (`cd cross-chain && forge build`, already done once).
 *
 * Run: npx tsx cross-chain-join.ts
 *
 * A stronger sibling exists: `devnet-deploy/cross-chain-join-real.ts` (docs/adr/0013) does the
 * same join but with a genuine deploy + circuit call on the local devnet instead of the simulator
 * for the Midnight side -- real ZK proofs, real transactions, real block confirmations on both
 * chains. Slower (needs the local devnet running, ~2-3 min for wallet sync + confirmations) but
 * honestly stronger. This script stays as the fast, no-devnet-required version.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  createCircuitContext,
  createConstructorContext,
} from '@midnight-ntwrk/compact-runtime';
import { Contract, ledger } from './managed/midnight-pool/contract/index.js';
import { createPrivateState, withStats, witnesses } from './witnesses.js';

const ANVIL_RPC = process.env.ANVIL_RPC ?? 'http://127.0.0.1:8545';
// Foundry/anvil's well-known, publicly documented default dev key for account #0 -- safe ONLY
// against a local anvil devnet, never anything real.
const ANVIL_DEPLOYER_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const RANK_THRESHOLD = 5n;

const CONTRACT_ADDRESS = '0'.repeat(64);
const COIN_PUBLIC_KEY = '0'.repeat(64);
const bytes32 = (fill: number) => new Uint8Array(32).fill(fill);
const toHex = (b: Uint8Array) => Buffer.from(b).toString('hex');

function cast(...args: string[]): string {
  return execFileSync('cast', args, { encoding: 'utf8' }).trim();
}

function forge(...args: string[]): string {
  return execFileSync('forge', args, {
    encoding: 'utf8',
    cwd: path.join(import.meta.dirname, '..', 'cross-chain'),
  }).trim();
}

/**
 * The Midnight side: runs the *real* proveThreshold circuit against a committed player, exactly
 * as workstream 1's simulator test does -- discloses only the boolean, never the level. Returns
 * that boolean plus the public key that becomes the EVM join key below.
 */
async function proveMidnightSide(level: bigint): Promise<{ pk: Uint8Array; qualifies: boolean }> {
  const contract = new Contract(witnesses);
  const player = withStats(createPrivateState(bytes32(7)), level, 0n);

  const deployed = await contract.initialState(
    createConstructorContext(player, COIN_PUBLIC_KEY),
  );
  let state = deployed.currentContractState;

  const commitCtx = createCircuitContext(
    'commitStats',
    CONTRACT_ADDRESS,
    COIN_PUBLIC_KEY,
    state as never,
    player,
    undefined,
    undefined,
    undefined,
    Math.floor(Date.now() / 1000),
  );
  const committed = await contract.impureCircuits.commitStats(commitCtx);
  state = committed.context.callContext.currentQueryContext.state;

  const proveCtx = createCircuitContext(
    'proveThreshold',
    CONTRACT_ADDRESS,
    COIN_PUBLIC_KEY,
    state as never,
    player,
    undefined,
    undefined,
    undefined,
    Math.floor(Date.now() / 1000),
  );
  const proved = await contract.impureCircuits.proveThreshold(proveCtx, RANK_THRESHOLD, false);

  const [pk] = ledger(state as never).statsCommitment[Symbol.iterator]().next().value as [
    Uint8Array,
    Uint8Array,
  ];
  return { pk, qualifies: proved.result as boolean };
}

/**
 * The EVM side: deploy ChampionBadge fresh (idempotent -- each run gets its own instance), mint
 * only if the Midnight side actually qualified, then read the tier back independently.
 * `evmAddress` is a demo join key: the Midnight public key's first 20 bytes, treated as an
 * address. Not a real address-derivation standard -- just a shared key both sides can compute.
 */
function runEvmSide(evmAddress: string, qualifies: boolean): { deployedAt: string; tier: number } {
  const artifact = JSON.parse(
    readFileSync(
      path.join(import.meta.dirname, '..', 'cross-chain', 'out', 'ChampionBadge.sol', 'ChampionBadge.json'),
      'utf8',
    ),
  );
  if (!artifact.bytecode?.object) {
    forge('build');
  }

  const deployOut = cast(
    'send',
    '--rpc-url', ANVIL_RPC,
    '--private-key', ANVIL_DEPLOYER_KEY,
    '--create',
    JSON.parse(
      readFileSync(
        path.join(import.meta.dirname, '..', 'cross-chain', 'out', 'ChampionBadge.sol', 'ChampionBadge.json'),
        'utf8',
      ),
    ).bytecode.object,
    '--json',
  );
  const deployedAt = JSON.parse(deployOut).contractAddress as string;

  if (qualifies) {
    cast(
      'send',
      '--rpc-url', ANVIL_RPC,
      '--private-key', ANVIL_DEPLOYER_KEY,
      deployedAt,
      'mint(address,uint8)',
      evmAddress,
      '1', // tier 1 == "Champion" for this demo
    );
  }

  const tierHex = cast('call', '--rpc-url', ANVIL_RPC, deployedAt, 'tier(address)(uint8)', evmAddress);
  return { deployedAt, tier: Number.parseInt(tierHex, 10) };
}

async function main() {
  const level = BigInt(process.argv[2] ?? '10'); // try `npx tsx cross-chain-join.ts 2` to see it fail the threshold
  const { pk, qualifies } = await proveMidnightSide(level);
  const evmAddress = '0x' + toHex(pk).slice(0, 40);

  console.log(`Midnight side: proveThreshold(level >= ${RANK_THRESHOLD}) -> ${qualifies} (level itself never disclosed)`);
  console.log(`Join key (Midnight pk, truncated to an EVM-shaped address): ${evmAddress}`);

  const evm = runEvmSide(evmAddress, qualifies);
  console.log(`EVM side: ChampionBadge deployed at ${evm.deployedAt}, tier(${evmAddress}) = ${evm.tier}`);

  const joined = { midnightPublicKey: '0x' + toHex(pk), provenAboveThreshold: qualifies, evmAddress, evmTier: evm.tier };
  console.log('\nJoined cross-chain view:', JSON.stringify(joined, null, 2));

  if (qualifies !== (evm.tier > 0)) {
    throw new Error('Join is inconsistent: the two chains disagree on qualification. This should never happen.');
  }
  console.log('\nOK — join is consistent: EVM tier reflects exactly the Midnight-disclosed qualification.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
