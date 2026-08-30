// League tiers (8-Ball-Pool-style Brass/Bronze/.../Diamond divisions), gated on level or wins —
// not win-rate, deliberately: a win-rate-gated tier would need `losses` added to the compiled
// `PlayerStats`/`commitStats` circuit signature (docs/adr/0006), breaking an already-verified
// contract for no demo value beyond what level/wins gating already shows. Each tier's
// `checkWins` flag says which stat `hookProveThreshold`/`proveThresholdReal` should check.
export const LEAGUES = [
  { id: 'brass', name: 'Brass', threshold: 1, checkWins: false },
  { id: 'bronze', name: 'Bronze', threshold: 5, checkWins: false },
  { id: 'silver', name: 'Silver', threshold: 10, checkWins: false },
  { id: 'gold', name: 'Gold', threshold: 50, checkWins: true },
  { id: 'diamond', name: 'Diamond', threshold: 150, checkWins: true },
];

if (typeof process !== 'undefined' && process.argv[1] && import.meta.url.endsWith('leagues.js') && process.argv[1].endsWith('leagues.js')) {
  const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } };

  assert(LEAGUES.length === 5, 'five league tiers are defined');
  assert(LEAGUES[0].threshold === 1, 'the entry tier (Brass) is reachable by every player');
  for (let i = 1; i < LEAGUES.length; i++) {
    assert(LEAGUES[i].threshold > LEAGUES[i - 1].threshold, `${LEAGUES[i].name}'s threshold is stricter than ${LEAGUES[i - 1].name}'s`);
  }

  console.log('OK — leagues self-test passed');
}
