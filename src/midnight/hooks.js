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
// Real mode (a wallet connected via wallet.js) is architecturally anticipated
// but NOT submitted to an actual deployed contract in this pass: that needs
// the pinned @midnight-ntwrk/midnight-js-* packages (not added as dependencies
// here) plus a live indexer/proof-server, neither of which this environment
// can install and verify against. Calling any circuit while
// wallet.getMode() === 'real' logs an explicit "not implemented" audit entry
// instead of pretending to submit one -- see contracts/README.md for the exact
// circuit interface this must eventually call.
import * as audit from './audit.js';
import * as wallet from './wallet.js';

const SECRET_KEY_STORAGE = 'mn-secret-key';

function getOrCreateSecretKeyHex() {
  let hex = localStorage.getItem(SECRET_KEY_STORAGE);
  if (!hex) {
    hex = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(SECRET_KEY_STORAGE, hex);
  }
  return hex;
}

// Display-only stand-in for the contract's derivePublicKey(persistentHash) --
// never used for any check, only to label audit-log rows consistently.
const localPk = (secretKeyHex) => secretKeyHex.slice(0, 16);

/** This browser's stable pseudonymous id -- also used as the relay attestation's `pk` (attest.js). */
export function getPublicKey() {
  return localPk(getOrCreateSecretKeyHex());
}

async function run(circuit, disclosed, fn) {
  if (wallet.getMode() === 'real') {
    audit.record({ circuit, mode: 'real', disclosed, ok: false, note: 'real-mode submission not wired in this pass' });
    return { ok: false, real: true };
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
  return run('commitStats', { pk }, async () => {
    const KEY = 'mn-mock-stats';
    const stats = JSON.parse(localStorage.getItem(KEY) || '{}');
    stats[pk] = { level: profile.level, wins: profile.wins || 0 };
    localStorage.setItem(KEY, JSON.stringify(stats));
  });
}

/** Mirrors `proveThreshold`: resolves a boolean, never the underlying number. */
export async function hookProveThreshold(profile, threshold, checkWins) {
  const pk = localPk(getOrCreateSecretKeyHex());
  if (wallet.getMode() === 'real') {
    audit.record({ circuit: 'proveThreshold', mode: 'real', disclosed: { pk, threshold, checkWins }, ok: false, note: 'real-mode submission not wired in this pass' });
    return false;
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
  });
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
  return run('resolveBreak', { matchId, role, winner }, async () => {});
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
