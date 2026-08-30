process.env.DB_PATH = ':memory:';
const { recordAttestation, latestConfirmedStats } = await import('./db.js');
const { signStats } = await import('./attest.js');

const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } };

// One side attesting alone never confirms -- this is the whole point of the check.
let r = recordAttestation({ matchId: 'm1', pk: 'alice', role: 1, winner: 1, level: 5, wins: 3 });
assert(r.confirmed === false, 'a lone attestation is not confirmed');
assert(latestConfirmedStats('alice') === null, 'no confirmed stats before the second side attests');

// Both sides agreeing confirms the match.
r = recordAttestation({ matchId: 'm1', pk: 'bob', role: 2, winner: 1, level: 2, wins: 0 });
assert(r.confirmed === true, 'two sides agreeing on the winner confirms the match');
const stats = latestConfirmedStats('alice');
assert(stats && stats.level === 5 && stats.wins === 3, 'confirmed stats reflect what alice attested to');

// Disagreement (a lone dishonest peer) never confirms.
recordAttestation({ matchId: 'm2', pk: 'alice', role: 1, winner: 1, level: 6, wins: 4 });
r = recordAttestation({ matchId: 'm2', pk: 'carol', role: 2, winner: 2, level: 0, wins: 0 });
assert(r.confirmed === false, 'disagreeing sides never confirm a match');

// Re-attesting the same (matchId, pk) updates rather than duplicating.
recordAttestation({ matchId: 'm1', pk: 'alice', role: 1, winner: 1, level: 9, wins: 9 });
const updated = latestConfirmedStats('alice');
assert(updated.level === 9, 're-attesting the same match+pk overwrites, not duplicates');

// Signatures are deterministic for the same input and differ when the input differs.
const sigA = signStats('alice', 9, 9);
const sigB = signStats('alice', 9, 9);
const sigC = signStats('alice', 9, 8);
assert(sigA.signature === sigB.signature, 'signing the same stats twice is deterministic');
assert(sigA.signature !== sigC.signature, 'different stats produce a different signature');

if (process.exitCode) {
  console.error('Attestation self-test FAILED');
} else {
  console.log('OK — attestation self-test passed');
}
