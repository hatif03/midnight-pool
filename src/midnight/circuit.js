// Real client-side execution of midnight-pool.compact's circuits, via
// @midnight-ntwrk/compact-runtime's simulator -- the same engine
// contracts/test/simulator.test.ts and contracts/cross-chain-join.ts already use and have
// verified. This runs the EXACT compiled circuit in the browser, a strictly more honest claim
// than hooks.js's hand-rolled mock (which just re-implements the comparison in plain JS without
// touching the compiled contract at all) -- it just does not yet generate a cryptographic ZK
// proof or submit anywhere (see docs/adr/0006): that needs a live proof server/indexer, which
// this project doesn't have.
//
// State here lives only in this browser tab (module-level + localStorage for the private
// witnesses), reinitialized fresh each page load -- there is no shared on-chain ledger, so
// multiplayer actions (break-order, stakes) are NOT run through this module; only the
// single-player relation checks are (commitStats, proveThreshold, claimCue).
import {
  createCircuitContext,
  createConstructorContext,
} from '@midnight-ntwrk/compact-runtime';
import { Contract, ledger } from '../../contracts/managed/midnight-pool/contract/index.js';
import {
  createPrivateState,
  withPendingCueTier,
  withStats,
  witnesses,
} from '../../contracts/witnesses.ts';

const CONTRACT_ADDRESS = '0'.repeat(64);
const COIN_PUBLIC_KEY = '0'.repeat(64);
const SECRET_KEY_STORAGE = 'mn-real-secret-key';

const contract = new Contract(witnesses);
let chainState = null;
let privateState = null;

function loadSecretKey() {
  let hex = localStorage.getItem(SECRET_KEY_STORAGE);
  if (!hex) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(SECRET_KEY_STORAGE, hex);
  }
  return new Uint8Array(hex.match(/../g).map((b) => Number.parseInt(b, 16)));
}

async function ensureInit() {
  if (chainState) return;
  privateState = createPrivateState(loadSecretKey());
  const deployed = await contract.initialState(
    createConstructorContext(privateState, COIN_PUBLIC_KEY),
  );
  chainState = deployed.currentContractState;
}

function callCtx(circuitId) {
  return createCircuitContext(
    circuitId,
    CONTRACT_ADDRESS,
    COIN_PUBLIC_KEY,
    chainState,
    privateState,
    undefined,
    undefined,
    undefined,
    Math.floor(Date.now() / 1000),
  );
}

async function commitStats(level, wins) {
  privateState = withStats(privateState, BigInt(level), BigInt(wins));
  const { context } = await contract.impureCircuits.commitStats(callCtx('commitStats'));
  chainState = context.callContext.currentQueryContext.state;
  privateState = context.callContext.currentPrivateState;
}

/**
 * Runs the real commitStats + proveThreshold circuits for the given level/wins. Returns the
 * disclosed boolean -- the level/wins values themselves never leave this function's call stack.
 */
export async function proveThresholdReal(level, wins, threshold, checkWins) {
  await ensureInit();
  await commitStats(level, wins);
  const { result, context } = await contract.impureCircuits.proveThreshold(
    callCtx('proveThreshold'),
    BigInt(threshold),
    checkWins,
  );
  chainState = context.callContext.currentQueryContext.state;
  privateState = context.callContext.currentPrivateState;
  return result;
}

/** Runs the real soulbound claimCue circuit for the given tier. Throws if already claimed. */
export async function claimCueReal(tierId) {
  await ensureInit();
  privateState = withPendingCueTier(privateState, BigInt(tierId));
  const { context } = await contract.impureCircuits.claimCue(callCtx('claimCue'));
  chainState = context.callContext.currentQueryContext.state;
  privateState = context.callContext.currentPrivateState;
}

/** Read-only: how many stats commitments exist on this local simulated ledger (demo/debug aid). */
export async function statsCommitmentCount() {
  await ensureInit();
  return ledger(chainState).statsCommitment.size();
}
