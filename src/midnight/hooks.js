// Fire-and-forget bridge into the Midnight privacy layer (contracts/midnight-pool.compact),
// shaped after Among-Midnight's "Shadow Protocol" bridge: a handful of calls hooked into
// specific existing-game moments, each non-blocking, each logged to the local audit
// log (audit.js) regardless of outcome. See docs/adr/0006.
//
// Mock mode (the default) runs the same relations as the real circuits in pure
// JS/localStorage, no network or proof server involved, so the game and its
// Midnight features keep working with nothing installed -- the reliability
// rationale documented in the plan and in Shadow Protocol's own MN_MODE=mock.
//
// Real mode submits to the shared Preview contract via chain.js, which owns a Web Worker running
// midnight-js against the wallet's own indexer (docs/adr/0018). It is opt-in: mock stays the
// default so the game works with nothing installed.
//
// Real mode NEVER blocks gameplay. chain.js is dynamically imported so its multi-MB WASM never
// touches the gameplay bundle, every submission goes through a serial queue off the main thread,
// and any failure -- no wallet, rejected prompt, no contract deployed, unreachable indexer --
// falls back to running the mock relation so play continues, with the failure recorded.
import * as audit from './audit.js';
import * as wallet from './wallet.js';
import { getOrCreateSecretKeyHex, hexToBytes } from './secret.js';

// Display-only stand-in for the contract's derivePublicKey(persistentHash) --
// never used for any check, only to label audit-log rows consistently.
const localPk = (secretKeyHex) => secretKeyHex.slice(0, 16);

/** This browser's stable pseudonymous id -- also used as the relay attestation's `pk` (attest.js). */
export function getPublicKey() {
  return localPk(getOrCreateSecretKeyHex());
}

// Circuits submitted in real mode. Break is still negotiated peer-to-peer first
// (breakOrder.js) so the rack never waits on a block; these three are fire-and-forget after.
const ON_CHAIN = new Set([
  'commitStats', 'proveThreshold', 'claimCue',
  'commitBreakChoice', 'revealBreakChoice', 'resolveBreak',
]);

// Dynamically imported so midnight-js and the ledger WASM are never in the gameplay bundle.
let chainMod = null;
const chain = async () => (chainMod ??= await import('./chain.js'));

async function run(circuit, disclosed, fn, realArgs, extras) {
  if (wallet.getMode() === 'real' && ON_CHAIN.has(circuit)) {
    try {
      const c = await chain();
      if (c.isReady() && c.getContractAddress()) {
        const r = await c.call(circuit, realArgs ?? [], extras);
        // chain.call already writes its own audit row with the txId.
        return { ok: true, real: true, txId: r.txId, result: r.result };
      }
      audit.record({
        circuit, mode: 'real', disclosed, ok: false,
        note: c.isReady() ? 'no contract address -- deploy or join one in Settings'
                          : 'wallet not connected',
      });
    } catch (err) {
      audit.record({ circuit, mode: 'real', disclosed, ok: false, error: String(err?.message || err) });
    }
    // Fall through to the mock relation: a chain problem must never cost the player the feature.
  }
  try {
    await fn();
    audit.record({ circuit, mode: 'mock', disclosed, ok: true });
    return { ok: true };
  } catch (err) {
    audit.record({ circuit, mode: 'mock', disclosed, ok: false, error: String(err?.message || err) });
    return { ok: false, error: err };
  }
}

/** Mirrors `commitStats`: commit the player's level/wins. Fire-and-forget. */
export function hookCommitStats(profile) {
  const pk = localPk(getOrCreateSecretKeyHex());
  const extras = { stats: { level: profile.level, wins: profile.wins || 0 } };
  return run('commitStats', { pk }, async () => {
    const KEY = 'mn-mock-stats';
    const stats = JSON.parse(localStorage.getItem(KEY) || '{}');
    stats[pk] = { level: profile.level, wins: profile.wins || 0 };
    localStorage.setItem(KEY, JSON.stringify(stats));
  }, [], extras);
}

/** Mirrors `proveThreshold`: resolves a boolean, never the underlying number. */
export async function hookProveThreshold(profile, threshold, checkWins) {
  const pk = localPk(getOrCreateSecretKeyHex());

  if (wallet.getMode() === 'real') {
    try {
      const c = await chain();
      if (c.isReady() && c.getContractAddress()) {
        // The circuit discloses only the boolean; the level/win count never leaves the device.
        const r = await c.call('proveThreshold', [BigInt(threshold), !!checkWins]);
        if (typeof r.result === 'boolean') return r.result;
      } else {
        audit.record({
          circuit: 'proveThreshold', mode: 'real', disclosed: { pk, threshold, checkWins }, ok: false,
          note: c.isReady() ? 'no contract address -- deploy or join one in Settings' : 'wallet not connected',
        });
      }
    } catch (err) {
      audit.record({ circuit: 'proveThreshold', mode: 'real', disclosed: { pk, threshold, checkWins }, ok: false, error: String(err?.message || err) });
    }
    // Fall through rather than returning false: a chain problem must not read as "you do not qualify".
  }

  const value = checkWins ? (profile.wins || 0) : profile.level;
  const result = value >= threshold;
  audit.record({ circuit: 'proveThreshold', mode: 'mock', disclosed: { pk, threshold, checkWins, result }, ok: true });
  return result;
}

const CLAIMED_CUES_KEY = 'mn-mock-claimed-cues';
const cueNullifier = (tierId) => `${getOrCreateSecretKeyHex().slice(0, 8)}:${tierId}`;

/** Mirrors `claimCue`: one-time, non-transferable claim per tier. */
export function hookClaimCue(tierId) {
  const nullifier = cueNullifier(tierId); // stand-in nullifier; the real derivation lives in the contract
  return run('claimCue', { nullifier }, async () => {
    const claimed = new Set(JSON.parse(localStorage.getItem(CLAIMED_CUES_KEY) || '[]'));
    if (claimed.has(nullifier)) throw new Error('cue tier already claimed');
    claimed.add(nullifier);
    localStorage.setItem(CLAIMED_CUES_KEY, JSON.stringify([...claimed]));
  }, [], { cueTier: tierId });
}

/** Whether this tier was unlocked through the soulbound claimCue flow (a status-symbol badge,
 *  not an entitlement check -- claimCue has none, see docs/adr/0006). */
export function isCueClaimed(tierId) {
  const claimed = new Set(JSON.parse(localStorage.getItem(CLAIMED_CUES_KEY) || '[]'));
  return claimed.has(cueNullifier(tierId));
}

/**
 * Records the break-order commit/reveal that gameplay already resolved via
 * breakOrder.js's P2P handshake, as the tamper-evident audit entry. Never
 * gates `game.turn` -- called after the fact, fire-and-forget.
 */
export function hookRecordBreakOrder({ matchId, role, winner }) {
  // P2P already decided game.turn. On-chain is fire-and-forget and incomplete until the
  // opponent also submits (their wallet may be missing). Never await this from the rack.
  audit.record({
    circuit: 'resolveBreak', mode: 'p2p',
    disclosed: { matchId, role, winner },
    ok: true,
    note: 'P2P flip stands; on-chain Rack is best-effort and needs both wallets',
  });
  queueBreakOnChain(matchId, role).catch(() => {});
  return { ok: true };
}

async function queueBreakOnChain(matchId, role) {
  if (wallet.getMode() !== 'real') return;
  let matchIdBytes;
  try { matchIdBytes = hexToBytes(matchId); } catch { return; }
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const extras = { break: { matchIdHex: matchId, role } };
  await run('commitBreakChoice', { matchId, role }, async () => {},
    [matchIdBytes, BigInt(role), deadline], extras);
  await run('revealBreakChoice', { matchId, role }, async () => {},
    [matchIdBytes, BigInt(role)], extras);
  await run('resolveBreak', { matchId, role }, async () => {},
    [matchIdBytes], extras);
}

/**
 * Mirrors `stakes.compact`'s openStake -- records this side's proposed stake
 * for the audit trail (docs/adr/0008). The actual Coins transfer at match end
 * happens client-side regardless of whether this call ever lands anywhere.
 */
export function hookOpenStake({ matchId, role, amount }) {
  return run('openStake', { matchId, role, amount }, async () => {});
}

/**
 * Mirrors `stakes.compact`'s attestResult -- records this side's claimed
 * winner for the audit trail. Fire-and-forget, same as hookRecordBreakOrder;
 * the Coins award already happened locally by the time this is called.
 */
export function hookAttestResult({ matchId, role, winner }) {
  return run('attestResult', { matchId, role, winner }, async () => {});
}
