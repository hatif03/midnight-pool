import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';
import type { Ledger, PlayerStats, Witnesses } from './managed/midnight-pool/contract/index.js';

// ---------------------------------------------------------------------------
// Private state
//
// Everything here stays on the player's device. The contract only ever sees
// commitments, hashes and the single boolean that `proveThreshold` discloses.
// ---------------------------------------------------------------------------

/** A per-match commit-reveal secret for the break-order coin flip. */
export type BreakSecret = {
  readonly nonce: Uint8Array;
  readonly salt: Uint8Array;
};

export type MidnightPoolPrivateState = {
  /** Root secret. Every public key and nullifier is derived from this. */
  readonly secretKey: Uint8Array;
  /** Level and win count mirrored from the game's local profile. */
  readonly stats: PlayerStats;
  /** Blinding factor for the stats commitment. */
  readonly statsSalt: Uint8Array;
  /** Cue tier that the next `claimCue` call should claim. */
  readonly pendingCueTier: bigint;
  /** `${matchIdHex}:${role}` slot the next break-order call refers to. */
  readonly activeBreakKey: string;
  /** Break secrets kept per slot, so reveal can reopen what commit sealed. */
  readonly breakSecrets: ReadonlyMap<string, BreakSecret>;
};

const randomBytes = (length: number): Uint8Array =>
  globalThis.crypto.getRandomValues(new Uint8Array(length));

export const createPrivateState = (
  secretKey: Uint8Array = randomBytes(32),
): MidnightPoolPrivateState => ({
  secretKey,
  stats: { level: 0n, wins: 0n },
  statsSalt: randomBytes(32),
  pendingCueTier: 0n,
  activeBreakKey: '',
  breakSecrets: new Map(),
});

// --- helpers the game calls before invoking a circuit -----------------------

/**
 * Mirror the game's current profile into private state.
 *
 * The salt is deliberately kept, not regenerated: re-committing with the same
 * salt keeps `proveThreshold` able to reopen the newest commitment. Rotate it
 * only when unlinkability between successive commitments matters more than
 * being able to prove against the previous one.
 */
export const withStats = (
  state: MidnightPoolPrivateState,
  level: bigint,
  wins: bigint,
): MidnightPoolPrivateState => ({ ...state, stats: { level, wins } });

export const withPendingCueTier = (
  state: MidnightPoolPrivateState,
  tier: bigint,
): MidnightPoolPrivateState => ({ ...state, pendingCueTier: tier });

/**
 * Point the break-order witnesses at one (match, role) slot, minting that
 * slot's nonce and salt if it does not exist yet. `matchId` is 32 bytes.
 *
 * Randomness is drawn HERE, not inside a witness. Witnesses must be pure
 * functions of private state: a proof server, a retry after a failed submit,
 * or a private-state reload can re-invoke them from the pre-call state, and a
 * witness that minted a fresh nonce each time would bake a different nonce
 * into the proof than the one sealed in the commitment — leaving a commitment
 * that can never be opened. Minting here keeps all six witnesses pure reads.
 *
 * Call this once per slot before `commitBreakChoice`, and again with the same
 * arguments before `revealBreakChoice` (the second call is a no-op lookup).
 * `role` must match the `role` argument passed to the circuit — witnesses
 * cannot see circuit arguments, so this is the only thing binding them.
 */
export const withActiveMatch = (
  state: MidnightPoolPrivateState,
  matchId: Uint8Array,
  role: bigint,
): MidnightPoolPrivateState => {
  const key = breakKey(matchId, role);
  if (state.breakSecrets.has(key)) return { ...state, activeBreakKey: key };

  const breakSecrets = new Map(state.breakSecrets);
  breakSecrets.set(key, { nonce: randomBytes(32), salt: randomBytes(32) });
  return { ...state, activeBreakKey: key, breakSecrets };
};

/** Drop a finished match's secrets so private state does not grow forever. */
export const forgetMatch = (
  state: MidnightPoolPrivateState,
  matchId: Uint8Array,
): MidnightPoolPrivateState => {
  const prefix = `${toHex(matchId)}:`;
  const breakSecrets = new Map(
    [...state.breakSecrets].filter(([key]) => !key.startsWith(prefix)),
  );
  const activeBreakKey = state.activeBreakKey.startsWith(prefix)
    ? ''
    : state.activeBreakKey;
  return { ...state, activeBreakKey, breakSecrets };
};

export const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** Slots are keyed by match AND role: one player self-playing both roles must
 *  not reuse a single nonce, which would make the flip deterministic. */
const breakKey = (matchId: Uint8Array, role: bigint): string =>
  `${toHex(matchId)}:${role}`;

const activeBreakSecret = (state: MidnightPoolPrivateState): BreakSecret => {
  const secret = state.breakSecrets.get(state.activeBreakKey);
  if (secret === undefined) {
    throw new Error(
      'No active break slot: call withActiveMatch(state, matchId, role) before commitBreakChoice or revealBreakChoice',
    );
  }
  return secret;
};

// ---------------------------------------------------------------------------
// Witness implementations
// ---------------------------------------------------------------------------

export const witnesses: Witnesses<MidnightPoolPrivateState> = {
  localSecretKey: ({
    privateState,
  }: WitnessContext<Ledger, MidnightPoolPrivateState>): [
    MidnightPoolPrivateState,
    Uint8Array,
  ] => [privateState, privateState.secretKey],

  localStats: ({
    privateState,
  }: WitnessContext<Ledger, MidnightPoolPrivateState>): [
    MidnightPoolPrivateState,
    PlayerStats,
  ] => [privateState, privateState.stats],

  localStatsSalt: ({
    privateState,
  }: WitnessContext<Ledger, MidnightPoolPrivateState>): [
    MidnightPoolPrivateState,
    Uint8Array,
  ] => [privateState, privateState.statsSalt],

  localCueTier: ({
    privateState,
  }: WitnessContext<Ledger, MidnightPoolPrivateState>): [
    MidnightPoolPrivateState,
    bigint,
  ] => [privateState, privateState.pendingCueTier],

  localBreakNonce: ({
    privateState,
  }: WitnessContext<Ledger, MidnightPoolPrivateState>): [
    MidnightPoolPrivateState,
    Uint8Array,
  ] => [privateState, activeBreakSecret(privateState).nonce],

  localBreakSalt: ({
    privateState,
  }: WitnessContext<Ledger, MidnightPoolPrivateState>): [
    MidnightPoolPrivateState,
    Uint8Array,
  ] => [privateState, activeBreakSecret(privateState).salt],
};
