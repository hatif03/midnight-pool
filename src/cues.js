// Cue collections — original names, not "Predator" (a real registered cue trademark, see
// docs/adr/0001 and PROJECT_LOG.md). Stat deltas are deliberately modest (see the fairness
// mitigation in the plan): since there's no real-money purchase path, this is earned advantage
// from playtime, not bought advantage — but the deltas still need to stay small to keep matches
// close to skill-based. powerMult scales max shot speed, aimBonus extends the aim-assist guide
// line length (px), spinCap is the max |spin.x|/|spin.y| this cue allows (0 = spin locked).
export const CUE_COLLECTIONS = [
  {
    id: 'house', name: 'House Cue',
    tiers: [
      { id: 'house', name: 'House Cue', rarity: 'common', powerMult: 1.0, aimBonus: 0, spinCap: 0, piecesNeeded: 0 },
    ],
  },
  {
    id: 'comet', name: 'Comet',
    tiers: [
      { id: 'comet-1', name: 'Comet I', rarity: 'uncommon', powerMult: 1.03, aimBonus: 4, spinCap: 0.3, piecesNeeded: 4 },
      { id: 'comet-2', name: 'Comet II', rarity: 'rare', powerMult: 1.06, aimBonus: 8, spinCap: 0.55, piecesNeeded: 8 },
    ],
  },
  {
    id: 'vortex', name: 'Vortex',
    tiers: [
      { id: 'vortex-1', name: 'Vortex I', rarity: 'rare', powerMult: 1.08, aimBonus: 10, spinCap: 0.7, piecesNeeded: 6 },
      { id: 'vortex-2', name: 'Vortex II', rarity: 'epic', powerMult: 1.12, aimBonus: 14, spinCap: 1.0, piecesNeeded: 10 },
    ],
  },
];

export function allCues() {
  return CUE_COLLECTIONS.flatMap((c) => c.tiers.map((t) => ({ ...t, collection: c.id, collectionName: c.name })));
}

export function getCue(id) {
  return allCues().find((c) => c.id === id) || allCues()[0];
}

// Coin cost to unlock a tier once its pieces are complete (upgrading spends coins, per the plan).
export function upgradeCost(tier) {
  return tier.piecesNeeded * 200;
}

if (typeof process !== 'undefined' && process.argv[1] && import.meta.url.endsWith('cues.js') && process.argv[1].endsWith('cues.js')) {
  const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } };

  const cues = allCues();
  assert(cues.length > 0 && cues[0].id === 'house', 'house cue is the default/first entry');
  assert(getCue('house').powerMult === 1.0 && getCue('house').spinCap === 0, 'house cue has no stat advantage and no spin');

  // Fairness mitigation from the plan: keep deltas modest (~5-12% power range across tiers).
  for (const c of cues) {
    assert(c.powerMult >= 1.0 && c.powerMult <= 1.12, `${c.id} power multiplier stays within the agreed modest range`);
    assert(c.spinCap >= 0 && c.spinCap <= 1, `${c.id} spin cap is a valid [0,1] value`);
  }

  console.log('OK — cues self-test passed');
}
