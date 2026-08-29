const CYCLE_LENGTH = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export const REWARDS = [
  { coins: 50 }, { coins: 75 }, { coins: 100 }, { coins: 150, cash: 1 },
  { coins: 200 }, { coins: 250 }, { coins: 500, cash: 5 },
];

export function rewardForDay(day) {
  return REWARDS[(day - 1) % CYCLE_LENGTH];
}

// `streak` = { day, lastClaim }; lastClaim is a ms timestamp or null. `now` is injectable so this
// stays pure/testable without mocking the clock.
export function canClaim(streak, now = Date.now()) {
  if (!streak.lastClaim) return true;
  return Math.floor((now - streak.lastClaim) / DAY_MS) >= 1;
}

// Returns { streak, reward } or null if not claimable yet. Missing a full day resets to day 1 —
// no ad-reclaim/grace period, per the plan's deliberate scope cut.
export function claim(streak, now = Date.now()) {
  if (!canClaim(streak, now)) return null;
  const elapsedDays = streak.lastClaim ? Math.floor((now - streak.lastClaim) / DAY_MS) : 1;
  const nextDay = elapsedDays > 1 ? 1 : (streak.day % CYCLE_LENGTH) + 1;
  return { streak: { day: nextDay, lastClaim: now }, reward: rewardForDay(nextDay) };
}

if (typeof process !== 'undefined' && process.argv[1] && import.meta.url.endsWith('dailyReward.js') && process.argv[1].endsWith('dailyReward.js')) {
  const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } };

  assert(REWARDS.length === CYCLE_LENGTH, 'reward table has exactly one entry per cycle day');
  assert(JSON.stringify(rewardForDay(8)) === JSON.stringify(rewardForDay(1)), 'day 8 wraps back to day 1\'s reward');

  const fresh = { day: 0, lastClaim: null };
  assert(canClaim(fresh), 'a never-claimed streak can claim immediately');

  const now = 1_700_000_000_000;
  let r = claim(fresh, now);
  assert(r.streak.day === 1, 'first claim starts at day 1');
  assert(!canClaim(r.streak, now), 'cannot claim again the same moment');
  assert(!canClaim(r.streak, now + DAY_MS * 0.5), 'cannot claim again half a day later');

  r = claim(r.streak, now + DAY_MS);
  assert(r.streak.day === 2, 'claiming the very next day continues the streak');

  r = claim(r.streak, now + DAY_MS * 4); // skipped two full days
  assert(r.streak.day === 1, 'missing a full day resets the streak to day 1');

  console.log('OK — dailyReward self-test passed');
}
