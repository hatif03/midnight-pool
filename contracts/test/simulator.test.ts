/**
 * Execution tests for the Midnight Pool contract.
 *
 * These are not compile checks — every circuit is actually run through
 * @midnight-ntwrk/compact-runtime against real ledger state, including the
 * failure paths and the block-time deadline logic.
 *
 * Run with: npm test
 */
import assert from 'node:assert/strict';
import {
  type CircuitContext,
  createCircuitContext,
  createConstructorContext,
} from '@midnight-ntwrk/compact-runtime';
import {
  Contract,
  type Ledger,
  ledger,
} from '../managed/midnight-pool/contract/index.js';
import {
  type MidnightPoolPrivateState,
  createPrivateState,
  withActiveMatch,
  withPendingCueTier,
  withStats,
  witnesses,
} from '../witnesses.js';

const CONTRACT_ADDRESS = '0'.repeat(64);
const COIN_PUBLIC_KEY = '0'.repeat(64);

const contract = new Contract<MidnightPoolPrivateState>(witnesses);

// Block time used by most tests, and a deadline comfortably after it.
const NOW = 1_700_000_000;
const DEADLINE = NOW + 3600;

type Chain = {
  /** Current on-chain state, shared by every player. */
  state: unknown;
};

const bytes32 = (fill: number): Uint8Array => new Uint8Array(32).fill(fill);

let passed = 0;
const test = async (name: string, fn: () => Promise<void>): Promise<void> => {
  try {
    await fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}`);
    throw err;
  }
};

/** Assert that a circuit call rejects, and that the message matches. */
const rejects = async (fn: () => Promise<unknown>, expected: string): Promise<void> => {
  let threw = false;
  try {
    await fn();
  } catch (err) {
    threw = true;
    const message = String(err);
    assert.ok(
      message.includes(expected),
      `expected error containing ${JSON.stringify(expected)}, got: ${message}`,
    );
  }
  assert.ok(threw, `expected a rejection containing ${JSON.stringify(expected)}`);
};

// ---------------------------------------------------------------------------
// Harness: thread ledger state across calls, keep private state per player.
// ---------------------------------------------------------------------------

const deploy = async (
  privateState: MidnightPoolPrivateState,
): Promise<Chain> => {
  const result = await contract.initialState(
    createConstructorContext(privateState, COIN_PUBLIC_KEY),
  );
  return { state: result.currentContractState };
};

type CallResult<R> = {
  result: R;
  privateState: MidnightPoolPrivateState;
};

/**
 * Run one circuit against the shared chain state with a given player's private
 * state, at a given block time. On success the chain state advances.
 */
const call = async <R>(
  chain: Chain,
  privateState: MidnightPoolPrivateState,
  circuitId: string,
  invoke: (ctx: CircuitContext<MidnightPoolPrivateState>) => Promise<{
    result: R;
    context: CircuitContext<MidnightPoolPrivateState>;
  }>,
  time: number = NOW,
): Promise<CallResult<R>> => {
  const ctx = createCircuitContext<MidnightPoolPrivateState>(
    circuitId,
    CONTRACT_ADDRESS,
    COIN_PUBLIC_KEY,
    chain.state as never,
    privateState,
    undefined,
    undefined,
    undefined,
    time,
  );
  const { result, context } = await invoke(ctx);
  chain.state = context.callContext.currentQueryContext.state;
  return {
    result,
    privateState: context.callContext.currentPrivateState as MidnightPoolPrivateState,
  };
};

const readLedger = (chain: Chain): Ledger => ledger(chain.state as never);

// ---------------------------------------------------------------------------
// 1. Stat commitment
// ---------------------------------------------------------------------------

const testStatCommitment = async (): Promise<void> => {
  console.log('\ncommitStats');

  await test('publishes exactly one commitment under the player key', async () => {
    const player = withStats(createPrivateState(bytes32(1)), 10n, 7n);
    const chain = await deploy(player);

    await call(chain, player, 'commitStats', (ctx) =>
      contract.impureCircuits.commitStats(ctx),
    );

    assert.equal(readLedger(chain).statsCommitment.size(), 1n);
  });

  await test('re-committing overwrites rather than adding an entry', async () => {
    let player = withStats(createPrivateState(bytes32(1)), 10n, 7n);
    const chain = await deploy(player);

    await call(chain, player, 'commitStats', (ctx) =>
      contract.impureCircuits.commitStats(ctx),
    );
    const first = [...readLedger(chain).statsCommitment][0][1];

    // Player levels up, commits again.
    player = withStats(player, 11n, 9n);
    await call(chain, player, 'commitStats', (ctx) =>
      contract.impureCircuits.commitStats(ctx),
    );

    const after = readLedger(chain).statsCommitment;
    assert.equal(after.size(), 1n, 'same player must not create a second entry');
    assert.notDeepEqual(
      [...after][0][1],
      first,
      'commitment must change when stats change',
    );
  });

  await test('different players get different keys', async () => {
    const p1 = withStats(createPrivateState(bytes32(1)), 10n, 7n);
    const p2 = withStats(createPrivateState(bytes32(2)), 10n, 7n);
    const chain = await deploy(p1);

    await call(chain, p1, 'commitStats', (ctx) =>
      contract.impureCircuits.commitStats(ctx),
    );
    await call(chain, p2, 'commitStats', (ctx) =>
      contract.impureCircuits.commitStats(ctx),
    );

    assert.equal(readLedger(chain).statsCommitment.size(), 2n);
  });

  await test('identical stats under different keys produce different commitments', async () => {
    const p1 = withStats(createPrivateState(bytes32(1)), 10n, 7n);
    const p2 = withStats(createPrivateState(bytes32(2)), 10n, 7n);
    const chain = await deploy(p1);

    await call(chain, p1, 'commitStats', (ctx) =>
      contract.impureCircuits.commitStats(ctx),
    );
    await call(chain, p2, 'commitStats', (ctx) =>
      contract.impureCircuits.commitStats(ctx),
    );

    const entries = [...readLedger(chain).statsCommitment];
    assert.notDeepEqual(
      entries[0][1],
      entries[1][1],
      'salts differ, so equal stats must not collide',
    );
  });
};

// ---------------------------------------------------------------------------
// 2. Threshold credential proof
// ---------------------------------------------------------------------------

const testThreshold = async (): Promise<void> => {
  console.log('\nproveThreshold');

  const setup = async (): Promise<[Chain, MidnightPoolPrivateState]> => {
    const player = withStats(createPrivateState(bytes32(1)), 10n, 7n);
    const chain = await deploy(player);
    await call(chain, player, 'commitStats', (ctx) =>
      contract.impureCircuits.commitStats(ctx),
    );
    return [chain, player];
  };

  await test('level >= threshold is true at and below the real level', async () => {
    const [chain, player] = await setup();
    for (const threshold of [0n, 1n, 9n, 10n]) {
      const { result } = await call(chain, player, 'proveThreshold', (ctx) =>
        contract.impureCircuits.proveThreshold(ctx, threshold, false),
      );
      assert.equal(result, true, `level 10 should satisfy >= ${threshold}`);
    }
  });

  await test('level >= threshold is false above the real level', async () => {
    const [chain, player] = await setup();
    for (const threshold of [11n, 50n, 1_000_000n]) {
      const { result } = await call(chain, player, 'proveThreshold', (ctx) =>
        contract.impureCircuits.proveThreshold(ctx, threshold, false),
      );
      assert.equal(result, false, `level 10 should not satisfy >= ${threshold}`);
    }
  });

  await test('checkWins selects the win count, not the level', async () => {
    const [chain, player] = await setup();
    // wins = 7: true at 7, false at 8. Level is 10, so a level-based answer
    // would wrongly report true at 8.
    const atSeven = await call(chain, player, 'proveThreshold', (ctx) =>
      contract.impureCircuits.proveThreshold(ctx, 7n, true),
    );
    const atEight = await call(chain, player, 'proveThreshold', (ctx) =>
      contract.impureCircuits.proveThreshold(ctx, 8n, true),
    );
    assert.equal(atSeven.result, true);
    assert.equal(atEight.result, false);
  });

  await test('boundary: exactly at the threshold is true, one above is false', async () => {
    const [chain, player] = await setup();
    const at = await call(chain, player, 'proveThreshold', (ctx) =>
      contract.impureCircuits.proveThreshold(ctx, 10n, false),
    );
    const above = await call(chain, player, 'proveThreshold', (ctx) =>
      contract.impureCircuits.proveThreshold(ctx, 11n, false),
    );
    assert.equal(at.result, true, '>= must include equality');
    assert.equal(above.result, false);
  });

  await test('rejects a player who never committed', async () => {
    const [chain] = await setup();
    const stranger = withStats(createPrivateState(bytes32(9)), 99n, 99n);
    await rejects(
      () =>
        call(chain, stranger, 'proveThreshold', (ctx) =>
          contract.impureCircuits.proveThreshold(ctx, 1n, false),
        ),
      'no stats committed for this player',
    );
  });

  await test('rejects stats that do not match the on-chain commitment', async () => {
    const [chain, player] = await setup();
    // Same secret key (same ledger entry), but inflated stats at proving time.
    const liar = withStats(player, 999n, 999n);
    await rejects(
      () =>
        call(chain, liar, 'proveThreshold', (ctx) =>
          contract.impureCircuits.proveThreshold(ctx, 500n, false),
        ),
      'stats do not match the on-chain commitment',
    );
  });

  await test('rejects a swapped salt even with the committed stats', async () => {
    const [chain, player] = await setup();
    const wrongSalt: MidnightPoolPrivateState = {
      ...player,
      statsSalt: bytes32(0xab),
    };
    await rejects(
      () =>
        call(chain, wrongSalt, 'proveThreshold', (ctx) =>
          contract.impureCircuits.proveThreshold(ctx, 1n, false),
        ),
      'stats do not match the on-chain commitment',
    );
  });
};

// ---------------------------------------------------------------------------
// 3. Soulbound cue-ownership claim
// ---------------------------------------------------------------------------

const testCueClaim = async (): Promise<void> => {
  console.log('\nclaimCue');

  await test('records a claim', async () => {
    const player = withPendingCueTier(createPrivateState(bytes32(1)), 3n);
    const chain = await deploy(player);
    await call(chain, player, 'claimCue', (ctx) =>
      contract.impureCircuits.claimCue(ctx),
    );
    assert.equal(readLedger(chain).claimedCues.size(), 1n);
  });

  await test('rejects a double claim of the same tier', async () => {
    const player = withPendingCueTier(createPrivateState(bytes32(1)), 3n);
    const chain = await deploy(player);
    await call(chain, player, 'claimCue', (ctx) =>
      contract.impureCircuits.claimCue(ctx),
    );
    await rejects(
      () =>
        call(chain, player, 'claimCue', (ctx) =>
          contract.impureCircuits.claimCue(ctx),
        ),
      'cue tier already claimed',
    );
    assert.equal(readLedger(chain).claimedCues.size(), 1n, 'set must not grow');
  });

  await test('the same player can claim a different tier', async () => {
    let player = withPendingCueTier(createPrivateState(bytes32(1)), 3n);
    const chain = await deploy(player);
    await call(chain, player, 'claimCue', (ctx) =>
      contract.impureCircuits.claimCue(ctx),
    );
    player = withPendingCueTier(player, 4n);
    await call(chain, player, 'claimCue', (ctx) =>
      contract.impureCircuits.claimCue(ctx),
    );
    assert.equal(readLedger(chain).claimedCues.size(), 2n);
  });

  await test('different players can each claim the same tier', async () => {
    const p1 = withPendingCueTier(createPrivateState(bytes32(1)), 3n);
    const p2 = withPendingCueTier(createPrivateState(bytes32(2)), 3n);
    const chain = await deploy(p1);
    await call(chain, p1, 'claimCue', (ctx) =>
      contract.impureCircuits.claimCue(ctx),
    );
    await call(chain, p2, 'claimCue', (ctx) =>
      contract.impureCircuits.claimCue(ctx),
    );
    assert.equal(readLedger(chain).claimedCues.size(), 2n);
  });

  await test('the cue nullifier is not the stats public key', async () => {
    const player = withPendingCueTier(
      withStats(createPrivateState(bytes32(1)), 10n, 7n),
      3n,
    );
    const chain = await deploy(player);
    await call(chain, player, 'commitStats', (ctx) =>
      contract.impureCircuits.commitStats(ctx),
    );
    await call(chain, player, 'claimCue', (ctx) =>
      contract.impureCircuits.claimCue(ctx),
    );

    const state = readLedger(chain);
    const statsKey = [...state.statsCommitment][0][0];
    const nullifier = [...state.claimedCues][0];
    assert.notDeepEqual(
      nullifier,
      statsKey,
      'domain separation must keep these uncorrelated',
    );
  });
};

// ---------------------------------------------------------------------------
// 4. Provably-fair break order
// ---------------------------------------------------------------------------

const MATCH = bytes32(0x42);

const testBreakOrder = async (): Promise<void> => {
  console.log('\nbreak order (commit / reveal / resolve)');

  /** Two players staked to the same match, sharing one chain. */
  const match = async (
    matchId: Uint8Array = MATCH,
  ): Promise<[Chain, MidnightPoolPrivateState, MidnightPoolPrivateState]> => {
    const p1 = withActiveMatch(createPrivateState(bytes32(1)), matchId, 1n);
    const p2 = withActiveMatch(createPrivateState(bytes32(2)), matchId, 2n);
    return [await deploy(p1), p1, p2];
  };

  await test('both players commit, both reveal, a winner is decided', async () => {
    const [chain, p1Init, p2Init] = await match();

    const c1 = await call(chain, p1Init, 'commitBreakChoice', (ctx) =>
      contract.impureCircuits.commitBreakChoice(ctx, MATCH, 1n, BigInt(DEADLINE)),
    );
    const c2 = await call(chain, p2Init, 'commitBreakChoice', (ctx) =>
      contract.impureCircuits.commitBreakChoice(ctx, MATCH, 2n, BigInt(DEADLINE)),
    );

    assert.equal(readLedger(chain).breakCommitment.size(), 2n);
    assert.equal(readLedger(chain).breakDeadline.size(), 1n);
    assert.equal(readLedger(chain).breakReveal.size(), 0n);

    await call(chain, c1.privateState, 'revealBreakChoice', (ctx) =>
      contract.impureCircuits.revealBreakChoice(ctx, MATCH, 1n),
    );
    await call(chain, c2.privateState, 'revealBreakChoice', (ctx) =>
      contract.impureCircuits.revealBreakChoice(ctx, MATCH, 2n),
    );
    assert.equal(readLedger(chain).breakReveal.size(), 2n);

    const { result } = await call(chain, c1.privateState, 'resolveBreak', (ctx) =>
      contract.impureCircuits.resolveBreak(ctx, MATCH),
    );
    assert.ok(result === 1n || result === 2n, `winner must be 1 or 2, got ${result}`);
    assert.equal(readLedger(chain).breakWinner.lookup(MATCH), result);
  });

  await test('resolution is idempotent', async () => {
    const [chain, p1Init, p2Init] = await match();
    const c1 = await call(chain, p1Init, 'commitBreakChoice', (ctx) =>
      contract.impureCircuits.commitBreakChoice(ctx, MATCH, 1n, BigInt(DEADLINE)),
    );
    const c2 = await call(chain, p2Init, 'commitBreakChoice', (ctx) =>
      contract.impureCircuits.commitBreakChoice(ctx, MATCH, 2n, BigInt(DEADLINE)),
    );
    await call(chain, c1.privateState, 'revealBreakChoice', (ctx) =>
      contract.impureCircuits.revealBreakChoice(ctx, MATCH, 1n),
    );
    await call(chain, c2.privateState, 'revealBreakChoice', (ctx) =>
      contract.impureCircuits.revealBreakChoice(ctx, MATCH, 2n),
    );

    const first = await call(chain, c1.privateState, 'resolveBreak', (ctx) =>
      contract.impureCircuits.resolveBreak(ctx, MATCH),
    );
    const second = await call(chain, c2.privateState, 'resolveBreak', (ctx) =>
      contract.impureCircuits.resolveBreak(ctx, MATCH),
    );
    assert.equal(first.result, second.result, 're-resolving must not flip the outcome');
  });

  await test('the flip is not stuck on one side across many matches', async () => {
    const winners: bigint[] = [];
    for (let i = 0; i < 24; i += 1) {
      const matchId = bytes32(i);
      const [chain, p1Init, p2Init] = await match(matchId);
      const c1 = await call(chain, p1Init, 'commitBreakChoice', (ctx) =>
        contract.impureCircuits.commitBreakChoice(ctx, matchId, 1n, BigInt(DEADLINE)),
      );
      const c2 = await call(chain, p2Init, 'commitBreakChoice', (ctx) =>
        contract.impureCircuits.commitBreakChoice(ctx, matchId, 2n, BigInt(DEADLINE)),
      );
      await call(chain, c1.privateState, 'revealBreakChoice', (ctx) =>
        contract.impureCircuits.revealBreakChoice(ctx, matchId, 1n),
      );
      await call(chain, c2.privateState, 'revealBreakChoice', (ctx) =>
        contract.impureCircuits.revealBreakChoice(ctx, matchId, 2n),
      );
      const { result } = await call(chain, c1.privateState, 'resolveBreak', (ctx) =>
        contract.impureCircuits.resolveBreak(ctx, matchId),
      );
      winners.push(result);
    }
    assert.ok(winners.includes(1n), 'player 1 never won across 24 flips');
    assert.ok(winners.includes(2n), 'player 2 never won across 24 flips');
  });

  await test('a tampered reveal cannot open the commitment', async () => {
    const [chain, p1Init] = await match();
    const c1 = await call(chain, p1Init, 'commitBreakChoice', (ctx) =>
      contract.impureCircuits.commitBreakChoice(ctx, MATCH, 1n, BigInt(DEADLINE)),
    );

    // Swap in a different nonce for the same match, keeping the original salt.
    const matchKey = c1.privateState.activeBreakKey;
    const swapped = new Map(c1.privateState.breakSecrets);
    const original = swapped.get(matchKey);
    assert.ok(original, 'commit should have stored a break secret');
    swapped.set(matchKey, { nonce: bytes32(0xee), salt: original.salt });
    const cheat: MidnightPoolPrivateState = {
      ...c1.privateState,
      breakSecrets: swapped,
    };

    await rejects(
      () =>
        call(chain, cheat, 'revealBreakChoice', (ctx) =>
          contract.impureCircuits.revealBreakChoice(ctx, MATCH, 1n),
        ),
      'reveal does not open the stored commitment',
    );
  });

  await test('rejects an invalid role', async () => {
    const [chain, p1Init] = await match();
    await rejects(
      () =>
        call(chain, p1Init, 'commitBreakChoice', (ctx) =>
          contract.impureCircuits.commitBreakChoice(ctx, MATCH, 3n, BigInt(DEADLINE)),
        ),
      'role must be 1 or 2',
    );
  });

  await test('rejects a second commit for the same role', async () => {
    const [chain, p1Init] = await match();
    const c1 = await call(chain, p1Init, 'commitBreakChoice', (ctx) =>
      contract.impureCircuits.commitBreakChoice(ctx, MATCH, 1n, BigInt(DEADLINE)),
    );
    await rejects(
      () =>
        call(chain, c1.privateState, 'commitBreakChoice', (ctx) =>
          contract.impureCircuits.commitBreakChoice(ctx, MATCH, 1n, BigInt(DEADLINE)),
        ),
      'this role already committed',
    );
  });

  await test('rejects a deadline already in the past', async () => {
    const [chain, p1Init] = await match();
    await rejects(
      () =>
        call(
          chain,
          p1Init,
          'commitBreakChoice',
          (ctx) =>
            contract.impureCircuits.commitBreakChoice(
              ctx,
              MATCH,
              1n,
              BigInt(NOW - 10),
            ),
          NOW,
        ),
      'reveal deadline is already in the past',
    );
  });

  await test('rejects revealing without a commitment', async () => {
    const [chain, p1Init] = await match();
    await rejects(
      () =>
        call(chain, p1Init, 'revealBreakChoice', (ctx) =>
          contract.impureCircuits.revealBreakChoice(ctx, MATCH, 1n),
        ),
      'nothing committed for this role',
    );
  });

  await test('rejects revealing twice', async () => {
    const [chain, p1Init] = await match();
    const c1 = await call(chain, p1Init, 'commitBreakChoice', (ctx) =>
      contract.impureCircuits.commitBreakChoice(ctx, MATCH, 1n, BigInt(DEADLINE)),
    );
    await call(chain, c1.privateState, 'revealBreakChoice', (ctx) =>
      contract.impureCircuits.revealBreakChoice(ctx, MATCH, 1n),
    );
    await rejects(
      () =>
        call(chain, c1.privateState, 'revealBreakChoice', (ctx) =>
          contract.impureCircuits.revealBreakChoice(ctx, MATCH, 1n),
        ),
      'this role already revealed',
    );
  });

  await test('rejects revealing after the deadline', async () => {
    const [chain, p1Init] = await match();
    const c1 = await call(chain, p1Init, 'commitBreakChoice', (ctx) =>
      contract.impureCircuits.commitBreakChoice(ctx, MATCH, 1n, BigInt(DEADLINE)),
    );
    await rejects(
      () =>
        call(
          chain,
          c1.privateState,
          'revealBreakChoice',
          (ctx) => contract.impureCircuits.revealBreakChoice(ctx, MATCH, 1n),
          DEADLINE + 1,
        ),
      'reveal deadline has passed',
    );
  });

  await test('cannot resolve a match with no reveals', async () => {
    const [chain, p1Init, p2Init] = await match();
    const c1 = await call(chain, p1Init, 'commitBreakChoice', (ctx) =>
      contract.impureCircuits.commitBreakChoice(ctx, MATCH, 1n, BigInt(DEADLINE)),
    );
    await call(chain, p2Init, 'commitBreakChoice', (ctx) =>
      contract.impureCircuits.commitBreakChoice(ctx, MATCH, 2n, BigInt(DEADLINE)),
    );
    await rejects(
      () =>
        call(
          chain,
          c1.privateState,
          'resolveBreak',
          (ctx) => contract.impureCircuits.resolveBreak(ctx, MATCH),
          DEADLINE + 1,
        ),
      'no reveals recorded for this match',
    );
  });

  await test('a lone revealer cannot claim the flip before the deadline', async () => {
    const [chain, p1Init, p2Init] = await match();
    const c1 = await call(chain, p1Init, 'commitBreakChoice', (ctx) =>
      contract.impureCircuits.commitBreakChoice(ctx, MATCH, 1n, BigInt(DEADLINE)),
    );
    await call(chain, p2Init, 'commitBreakChoice', (ctx) =>
      contract.impureCircuits.commitBreakChoice(ctx, MATCH, 2n, BigInt(DEADLINE)),
    );
    await call(chain, c1.privateState, 'revealBreakChoice', (ctx) =>
      contract.impureCircuits.revealBreakChoice(ctx, MATCH, 1n),
    );

    await rejects(
      () =>
        call(chain, c1.privateState, 'resolveBreak', (ctx) =>
          contract.impureCircuits.resolveBreak(ctx, MATCH),
        ),
      'only one player revealed and the deadline has not passed yet',
    );
  });

  await test('after the deadline the lone revealer wins by forfeit', async () => {
    const [chain, p1Init, p2Init] = await match();
    const c1 = await call(chain, p1Init, 'commitBreakChoice', (ctx) =>
      contract.impureCircuits.commitBreakChoice(ctx, MATCH, 1n, BigInt(DEADLINE)),
    );
    await call(chain, p2Init, 'commitBreakChoice', (ctx) =>
      contract.impureCircuits.commitBreakChoice(ctx, MATCH, 2n, BigInt(DEADLINE)),
    );
    await call(chain, c1.privateState, 'revealBreakChoice', (ctx) =>
      contract.impureCircuits.revealBreakChoice(ctx, MATCH, 1n),
    );

    const { result } = await call(
      chain,
      c1.privateState,
      'resolveBreak',
      (ctx) => contract.impureCircuits.resolveBreak(ctx, MATCH),
      DEADLINE + 1,
    );
    assert.equal(result, 1n, 'the player who revealed must win the forfeit');
  });

  await test('forfeit works the other way round too', async () => {
    const [chain, p1Init, p2Init] = await match();
    await call(chain, p1Init, 'commitBreakChoice', (ctx) =>
      contract.impureCircuits.commitBreakChoice(ctx, MATCH, 1n, BigInt(DEADLINE)),
    );
    const c2 = await call(chain, p2Init, 'commitBreakChoice', (ctx) =>
      contract.impureCircuits.commitBreakChoice(ctx, MATCH, 2n, BigInt(DEADLINE)),
    );
    await call(chain, c2.privateState, 'revealBreakChoice', (ctx) =>
      contract.impureCircuits.revealBreakChoice(ctx, MATCH, 2n),
    );

    const { result } = await call(
      chain,
      c2.privateState,
      'resolveBreak',
      (ctx) => contract.impureCircuits.resolveBreak(ctx, MATCH),
      DEADLINE + 1,
    );
    assert.equal(result, 2n, 'the player who revealed must win the forfeit');
  });

  await test('the second committer inherits the first deadline', async () => {
    const [chain, p1Init, p2Init] = await match();
    await call(chain, p1Init, 'commitBreakChoice', (ctx) =>
      contract.impureCircuits.commitBreakChoice(ctx, MATCH, 1n, BigInt(DEADLINE)),
    );
    // Player 2 tries to buy themselves a much later deadline.
    await call(chain, p2Init, 'commitBreakChoice', (ctx) =>
      contract.impureCircuits.commitBreakChoice(
        ctx,
        MATCH,
        2n,
        BigInt(DEADLINE + 100_000),
      ),
    );
    assert.equal(
      readLedger(chain).breakDeadline.lookup(MATCH),
      BigInt(DEADLINE),
      'the first deadline must stand',
    );
  });

  await test('witnesses are pure: re-running a commit from the same private state is identical', async () => {
    // Guards the reason randomness is minted in withActiveMatch rather than
    // inside the witness. A proof server, a submit retry, or a private-state
    // reload can re-invoke witnesses from the PRE-call state; if that produced
    // a fresh nonce, the proof would disagree with the stored commitment and
    // the reveal could never open it.
    const [chainA, p1] = await match();
    await call(chainA, p1, 'commitBreakChoice', (ctx) =>
      contract.impureCircuits.commitBreakChoice(ctx, MATCH, 1n, BigInt(DEADLINE)),
    );
    const first = readLedger(chainA).breakCommitment;

    // Same starting private state, replayed onto a fresh chain.
    const chainB = await deploy(p1);
    await call(chainB, p1, 'commitBreakChoice', (ctx) =>
      contract.impureCircuits.commitBreakChoice(ctx, MATCH, 1n, BigInt(DEADLINE)),
    );
    const second = readLedger(chainB).breakCommitment;

    assert.deepEqual(
      [...first][0][1],
      [...second][0][1],
      're-running from identical private state must yield an identical commitment',
    );
  });

  await test('self-play: one player as both roles gets distinct nonces per role', async () => {
    // Slots are keyed by (matchId, role), so a single private state committing
    // as both roles must not reuse one nonce — that would make the flip
    // deterministic instead of random.
    const base = createPrivateState(bytes32(7));
    const asOne = withActiveMatch(base, MATCH, 1n);
    const asTwo = withActiveMatch(asOne, MATCH, 2n);
    const chain = await deploy(asTwo);

    await call(chain, asTwo, 'commitBreakChoice', (ctx) =>
      contract.impureCircuits.commitBreakChoice(ctx, MATCH, 1n, BigInt(DEADLINE)),
    );
    const slotOne = withActiveMatch(asTwo, MATCH, 1n);
    assert.notDeepEqual(
      slotOne.breakSecrets.get(slotOne.activeBreakKey)?.nonce,
      asTwo.breakSecrets.get(asTwo.activeBreakKey)?.nonce,
      'role 1 and role 2 must hold different nonces',
    );
  });

  await test('matches are independent', async () => {
    const matchA = bytes32(0xa1);
    const matchB = bytes32(0xb2);
    const [chain, p1Init, p2Init] = await match(matchA);

    await call(chain, p1Init, 'commitBreakChoice', (ctx) =>
      contract.impureCircuits.commitBreakChoice(ctx, matchA, 1n, BigInt(DEADLINE)),
    );
    await call(chain, p2Init, 'commitBreakChoice', (ctx) =>
      contract.impureCircuits.commitBreakChoice(ctx, matchA, 2n, BigInt(DEADLINE)),
    );

    const state = readLedger(chain);
    assert.equal(state.breakDeadline.member(matchA), true);
    assert.equal(state.breakDeadline.member(matchB), false);
  });
};

// ---------------------------------------------------------------------------

const main = async (): Promise<void> => {
  await testStatCommitment();
  await testThreshold();
  await testCueClaim();
  await testBreakOrder();
  console.log(`\n${passed} checks passed`);
};

await main();
