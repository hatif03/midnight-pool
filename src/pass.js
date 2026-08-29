const TOTAL_TIERS = 20;
const POINTS_PER_TIER = 100;
export const PREMIUM_UNLOCK_COST_CASH = 1000;

function tierReward(tier) {
  return {
    free: { coins: 50 + tier * 10 },
    premium: tier % 5 === 0 ? { cash: 5 } : { coins: 100 + tier * 15 },
  };
}

export function tierForPoints(points) {
  return Math.min(TOTAL_TIERS, Math.floor(points / POINTS_PER_TIER));
}

// `pass` = { points, premium, claimedTier }. Returns the tier numbers newly available to claim.
export function claimableTiers(pass) {
  const current = tierForPoints(pass.points);
  const claimed = pass.claimedTier || 0;
  const tiers = [];
  for (let t = claimed + 1; t <= current; t++) tiers.push(t);
  return tiers;
}

// Reward for one tier, respecting whether the premium lane is unlocked.
export function rewardForTier(tier, premiumUnlocked) {
  const r = tierReward(tier);
  return premiumUnlocked ? [r.free, r.premium] : [r.free];
}

if (typeof process !== 'undefined' && process.argv[1] && import.meta.url.endsWith('pass.js') && process.argv[1].endsWith('pass.js')) {
  const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } };

  assert(tierForPoints(0) === 0, 'zero points is tier 0 (nothing claimable yet)');
  assert(tierForPoints(100) === 1, '100 points reaches tier 1');
  assert(tierForPoints(POINTS_PER_TIER * TOTAL_TIERS + 500) === TOTAL_TIERS, 'tier progress caps at the last tier');

  let tiers = claimableTiers({ points: 250, claimedTier: 0 });
  assert(tiers.length === 2 && tiers[0] === 1 && tiers[1] === 2, 'unclaimed tiers up to current progress are all returned');

  tiers = claimableTiers({ points: 250, claimedTier: 2 });
  assert(tiers.length === 0, 'nothing claimable once caught up');

  assert(rewardForTier(1, false).length === 1, 'free-only pass gets just the free reward');
  assert(rewardForTier(1, true).length === 2, 'premium-unlocked pass gets both lanes');

  console.log('OK — pass self-test passed');
}
