// Silver/Gold/Diamond — generic, non-proprietary tier names (not trying to look like any
// specific real game's boxes). Each tier's outcome weights must sum to 1 (asserted below);
// obtained via Spin & Win, pass/level-up rewards, or bought with Cash.
export const BOX_TIERS = {
  silver: {
    coinsRange: [50, 500],
    outcomes: [
      { type: 'coins', weight: 0.70 },
      { type: 'coins+piece', weight: 0.28 },
      { type: 'coins+cash', weight: 0.02, cash: 1 },
    ],
  },
  gold: {
    coinsRange: [200, 2000],
    outcomes: [
      { type: 'coins', weight: 0.50 },
      { type: 'coins+piece', weight: 0.42 },
      { type: 'coins+cash', weight: 0.08, cash: 5 },
    ],
  },
  diamond: {
    coinsRange: [1000, 10000],
    outcomes: [
      { type: 'coins', weight: 0.20 },
      { type: 'coins+piece', weight: 0.55 },
      { type: 'coins+cash', weight: 0.25, cash: 20 },
    ],
  },
};

function randomInRange([min, max], rand) {
  return Math.round(min + rand() * (max - min));
}

// `rand` is injectable (defaults to Math.random) so outcomes are reproducible in tests.
export function openBox(tierId, rand = Math.random) {
  const tier = BOX_TIERS[tierId];
  const coins = randomInRange(tier.coinsRange, rand);
  const roll = rand();
  let acc = 0;
  let outcome = tier.outcomes[tier.outcomes.length - 1];
  for (const o of tier.outcomes) {
    acc += o.weight;
    if (roll < acc) { outcome = o; break; }
  }
  const reward = { coins };
  if (outcome.type === 'coins+piece') reward.cuePiece = true;
  if (outcome.type === 'coins+cash') reward.cash = outcome.cash;
  return reward;
}

if (typeof process !== 'undefined' && process.argv[1] && import.meta.url.endsWith('lootbox.js') && process.argv[1].endsWith('lootbox.js')) {
  const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } };

  for (const [id, tier] of Object.entries(BOX_TIERS)) {
    const total = tier.outcomes.reduce((s, o) => s + o.weight, 0);
    assert(Math.abs(total - 1) < 1e-9, `${id} outcome weights sum to 1 (got ${total})`);
  }

  // Deterministic rand: first call picks the coin amount fraction, second picks the outcome roll.
  const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };

  let reward = openBox('silver', seq([0, 0])); // min coins, roll 0 -> first outcome ('coins')
  assert(reward.coins === BOX_TIERS.silver.coinsRange[0], 'roll 0 gives the minimum coin amount');
  assert(!reward.cuePiece && !reward.cash, 'the "coins" outcome branch gives only coins');

  reward = openBox('silver', seq([1, 0.99])); // max coins, roll near 1 -> last outcome ('coins+cash')
  assert(reward.coins === BOX_TIERS.silver.coinsRange[1], 'roll 1 gives the maximum coin amount');
  assert(reward.cash === 1, 'a high roll lands in the coins+cash branch');

  reward = openBox('gold', seq([0.5, 0.75])); // squarely in the 'coins+piece' band (0.50-0.92)
  assert(reward.cuePiece === true, 'a mid roll lands in the coins+piece branch');

  for (const id of Object.keys(BOX_TIERS)) {
    for (let i = 0; i < 200; i++) {
      const r = openBox(id);
      assert(r.coins >= BOX_TIERS[id].coinsRange[0] && r.coins <= BOX_TIERS[id].coinsRange[1], `${id} coin reward stays within its documented range`);
    }
  }

  console.log('OK — lootbox self-test passed');
}
