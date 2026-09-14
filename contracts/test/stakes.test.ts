/**
 * Execution tests for the match-stakes contract (docs/adr/0008).
 *
 * Not compile checks — every circuit is actually run through
 * @midnight-ntwrk/compact-runtime against real ledger state, including the
 * write-once "first attestation wins" resolution rule.
 *
 * Run with: npm test
 */
import assert from 'node:assert/strict';
import {
  type CircuitContext,
  createCircuitContext,
  createConstructorContext,
} from '@midnight-ntwrk/compact-runtime';
import { Contract, type Ledger, ledger } from '../managed/stakes/contract/index.js';

const CONTRACT_ADDRESS = '0'.repeat(64);
const COIN_PUBLIC_KEY = '0'.repeat(64);

type PrivateState = Record<string, never>;
const witnesses = {};
const contract = new Contract<PrivateState>(witnesses);

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
// Harness: thread ledger state across calls, one shared chain, no private state.
// ---------------------------------------------------------------------------

type Chain = { state: unknown };

const deploy = async (): Promise<Chain> => {
  const result = await contract.initialState(createConstructorContext({}, COIN_PUBLIC_KEY));
  return { state: result.currentContractState };
};

const call = async <R>(
  chain: Chain,
  circuitId: string,
  invoke: (ctx: CircuitContext<PrivateState>) => Promise<{
    result: R;
    context: CircuitContext<PrivateState>;
  }>,
): Promise<R> => {
  const ctx = createCircuitContext<PrivateState>(
    CONTRACT_ADDRESS,
    COIN_PUBLIC_KEY,
    chain.state as never,
    {},
    undefined,
    undefined,
    1_700_000_000,
  );
  const { result, context } = await invoke(ctx);
  const inner = context.callContext ?? context;
  chain.state = inner.currentQueryContext.state;
  return result;
};

const readLedger = (chain: Chain): Ledger => ledger(chain.state as never);

// ---------------------------------------------------------------------------

const testOpenStake = async (): Promise<void> => {
  console.log('\nopenStake');

  await test('records a proposed amount', async () => {
    const chain = await deploy();
    await call(chain, 'openStake', (ctx) => contract.impureCircuits.openStake(ctx, bytes32(1), 1n, 100n));
    assert.equal(readLedger(chain).stakeOpened.size(), 1n);
  });

  await test('rejects role 0', async () => {
    const chain = await deploy();
    await rejects(
      () => call(chain, 'openStake', (ctx) => contract.impureCircuits.openStake(ctx, bytes32(1), 0n, 100n)),
      'role must be 1 or 2',
    );
  });

  await test('rejects a second open for the same role', async () => {
    const chain = await deploy();
    await call(chain, 'openStake', (ctx) => contract.impureCircuits.openStake(ctx, bytes32(1), 1n, 100n));
    await rejects(
      () => call(chain, 'openStake', (ctx) => contract.impureCircuits.openStake(ctx, bytes32(1), 1n, 100n)),
      'already opened',
    );
  });

  await test('the second role must match the first amount', async () => {
    const chain = await deploy();
    await call(chain, 'openStake', (ctx) => contract.impureCircuits.openStake(ctx, bytes32(1), 1n, 100n));
    await rejects(
      () => call(chain, 'openStake', (ctx) => contract.impureCircuits.openStake(ctx, bytes32(1), 2n, 50n)),
      'does not match',
    );
  });

  await test('matching amounts from both roles succeed', async () => {
    const chain = await deploy();
    await call(chain, 'openStake', (ctx) => contract.impureCircuits.openStake(ctx, bytes32(1), 1n, 100n));
    await call(chain, 'openStake', (ctx) => contract.impureCircuits.openStake(ctx, bytes32(1), 2n, 100n));
    assert.equal(readLedger(chain).stakeOpened.size(), 2n);
  });

  await test('different matches do not share slots', async () => {
    const chain = await deploy();
    await call(chain, 'openStake', (ctx) => contract.impureCircuits.openStake(ctx, bytes32(1), 1n, 100n));
    await call(chain, 'openStake', (ctx) => contract.impureCircuits.openStake(ctx, bytes32(2), 1n, 999n));
    assert.equal(readLedger(chain).stakeOpened.size(), 2n);
  });
};

const testAttestAndResolve = async (): Promise<void> => {
  console.log('\nattestResult / resolveStake');

  await test('a role that has not opened cannot attest', async () => {
    const chain = await deploy();
    await rejects(
      () => call(chain, 'attestResult', (ctx) => contract.impureCircuits.attestResult(ctx, bytes32(1), 1n, 1n)),
      'has not opened',
    );
  });

  await test('an opened role can attest, and resolveStake reads it back', async () => {
    const chain = await deploy();
    await call(chain, 'openStake', (ctx) => contract.impureCircuits.openStake(ctx, bytes32(1), 1n, 100n));
    await call(chain, 'attestResult', (ctx) => contract.impureCircuits.attestResult(ctx, bytes32(1), 1n, 1n));
    const winner = await call(chain, 'resolveStake', (ctx) => contract.impureCircuits.resolveStake(ctx, bytes32(1)));
    assert.equal(winner, 1n);
  });

  await test('resolveStake fails before anyone has attested', async () => {
    const chain = await deploy();
    await call(chain, 'openStake', (ctx) => contract.impureCircuits.openStake(ctx, bytes32(1), 1n, 100n));
    await rejects(
      () => call(chain, 'resolveStake', (ctx) => contract.impureCircuits.resolveStake(ctx, bytes32(1))),
      'no attestation recorded',
    );
  });

  await test('a second, agreeing attestation is still rejected (write-once)', async () => {
    const chain = await deploy();
    await call(chain, 'openStake', (ctx) => contract.impureCircuits.openStake(ctx, bytes32(1), 1n, 100n));
    await call(chain, 'openStake', (ctx) => contract.impureCircuits.openStake(ctx, bytes32(1), 2n, 100n));
    await call(chain, 'attestResult', (ctx) => contract.impureCircuits.attestResult(ctx, bytes32(1), 1n, 1n));
    await rejects(
      () => call(chain, 'attestResult', (ctx) => contract.impureCircuits.attestResult(ctx, bytes32(1), 2n, 1n)),
      'already has a recorded attestation',
    );
  });

  // The exploit ADR-0008 closes: a losing host stays silent, but the guest already
  // attested the true result honestly and first -- the host's later, self-favoring
  // claim cannot displace it, no matter when it arrives or whether a deadline passed.
  await test('the first attestation wins even if a conflicting one arrives later', async () => {
    const chain = await deploy();
    await call(chain, 'openStake', (ctx) => contract.impureCircuits.openStake(ctx, bytes32(1), 1n, 100n));
    await call(chain, 'openStake', (ctx) => contract.impureCircuits.openStake(ctx, bytes32(1), 2n, 100n));
    // Guest (role 2) honestly attests it won.
    await call(chain, 'attestResult', (ctx) => contract.impureCircuits.attestResult(ctx, bytes32(1), 2n, 2n));
    // A late, self-favoring host claim cannot overwrite it.
    await rejects(
      () => call(chain, 'attestResult', (ctx) => contract.impureCircuits.attestResult(ctx, bytes32(1), 1n, 1n)),
      'already has a recorded attestation',
    );
    const winner = await call(chain, 'resolveStake', (ctx) => contract.impureCircuits.resolveStake(ctx, bytes32(1)));
    assert.equal(winner, 2n, 'the honest, first-submitted attestation stands');
  });

  await test('matches are independent', async () => {
    const chain = await deploy();
    await call(chain, 'openStake', (ctx) => contract.impureCircuits.openStake(ctx, bytes32(1), 1n, 100n));
    await call(chain, 'openStake', (ctx) => contract.impureCircuits.openStake(ctx, bytes32(2), 1n, 100n));
    await call(chain, 'attestResult', (ctx) => contract.impureCircuits.attestResult(ctx, bytes32(1), 1n, 1n));
    await call(chain, 'attestResult', (ctx) => contract.impureCircuits.attestResult(ctx, bytes32(2), 1n, 2n));
    const w1 = await call(chain, 'resolveStake', (ctx) => contract.impureCircuits.resolveStake(ctx, bytes32(1)));
    const w2 = await call(chain, 'resolveStake', (ctx) => contract.impureCircuits.resolveStake(ctx, bytes32(2)));
    assert.equal(w1, 1n);
    assert.equal(w2, 2n);
  });
};

(async () => {
  await testOpenStake();
  await testAttestAndResolve();
  console.log(`\n${passed} checks passed`);
})();
