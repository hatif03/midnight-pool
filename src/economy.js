// Pure economy math — XP curve and per-match awards. No DOM, no localStorage (that's
// profile.js's job); self-tested the same way rules.js/physics.js are.

export function xpToNext(level) {
  return 100 + (level - 1) * 50;
}

export function awardForMatch({ mode, won }) {
  if (mode === 'solo') return { coins: 5, xp: 5, loyaltyPoints: 0 };
  return won
    ? { coins: 50, xp: 30, loyaltyPoints: 1, wins: 1 }
    : { coins: 10, xp: 10, loyaltyPoints: 1, losses: 1 };
}

export function applyAward(profile, award) {
  const p = { ...profile };
  p.coins = Math.max(0, p.coins + (award.coins || 0));
  p.cash = Math.max(0, p.cash + (award.cash || 0));
  p.loyaltyPoints = Math.max(0, p.loyaltyPoints + (award.loyaltyPoints || 0));
  p.wins = (p.wins || 0) + (award.wins || 0);
  p.losses = (p.losses || 0) + (award.losses || 0);
  // Win streak drives the lobby's streak pips. Keyed off award.wins/losses rather than a `won`
  // flag so solo practice — which awards neither — can't build or break a streak.
  if (award.wins) p.winStreak = (p.winStreak || 0) + 1;
  else if (award.losses) p.winStreak = 0;
  p.xp += award.xp || 0;
  while (p.xp >= xpToNext(p.level)) {
    p.xp -= xpToNext(p.level);
    p.level += 1;
  }
  return p;
}

// Win rate as a [0,1] fraction; 0 with no games played yet rather than NaN/dividing by zero —
// an untested player isn't "0% skilled," they just have no record, but 0 is the sane display
// default and callers already treat 0 wins as "no badge/no record shown" elsewhere.
export function winRate(profile) {
  const total = (profile.wins || 0) + (profile.losses || 0);
  return total === 0 ? 0 : profile.wins / total;
}

// Applies a match stake (docs/adr/0008): the winner gains `amount` coins, the loser loses it,
// each side computing this independently from its own local result, same as awardForMatch/
// applyAward above — there's no shared/server-authoritative economy here either. Also tracks
// lifetime net stake winnings (can go negative — that's the honest record of a losing streak,
// unlike coins/cash which are clamped at 0 since you can't hold negative currency).
export function applyStake(profile, won, amount) {
  return {
    ...profile,
    coins: Math.max(0, profile.coins + (won ? amount : -amount)),
    lifetimeWinnings: (profile.lifetimeWinnings || 0) + (won ? amount : -amount),
  };
}

// Returns the profile with `amount` deducted from `currency`, or null if funds are insufficient —
// the caller decides how to react (e.g. show "not enough coins"), this never goes negative itself.
export function spend(profile, currency, amount) {
  if (amount < 0) throw new Error('spend amount must be non-negative');
  if (profile[currency] < amount) return null;
  return { ...profile, [currency]: profile[currency] - amount };
}

if (typeof process !== 'undefined' && process.argv[1] && import.meta.url.endsWith('economy.js') && process.argv[1].endsWith('economy.js')) {
  const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } };

  assert(xpToNext(1) < xpToNext(2) && xpToNext(2) < xpToNext(3), 'xp requirement grows with level');

  const base = { coins: 100, cash: 0, xp: 0, level: 1, loyaltyPoints: 0, wins: 0, losses: 0 };
  let p = applyAward(base, awardForMatch({ mode: 'host', won: true }));
  assert(p.coins === 150, 'multiplayer win awards coins');
  assert(p.loyaltyPoints === 1, 'multiplayer win awards a loyalty point');
  assert(p.wins === 1, 'multiplayer win increments the win counter');
  assert(p.losses === 0, 'multiplayer win does not increment the loss counter');

  p = applyAward(base, awardForMatch({ mode: 'host', won: false }));
  assert(p.wins === 0, 'multiplayer loss does not increment the win counter');
  assert(p.losses === 1, 'multiplayer loss increments the loss counter');

  p = applyAward(base, awardForMatch({ mode: 'solo', won: true }));
  assert(p.coins === 105 && p.loyaltyPoints === 0, 'solo practice awards reduced coins, no loyalty points');
  assert(p.wins === 0 && p.losses === 0, 'solo practice does not count toward the win/loss record');

  assert(winRate({ wins: 0, losses: 0 }) === 0, 'win rate with no games played is 0, not NaN');
  assert(winRate({ wins: 3, losses: 1 }) === 0.75, 'win rate is wins over total games');
  assert(winRate({ wins: 0, losses: 5 }) === 0, 'an all-loss record is 0, not undefined');

  p = applyAward({ ...base, xp: xpToNext(1) - 5 }, { xp: 20 });
  assert(p.level === 2, 'crossing the xp threshold levels up');
  assert(p.xp === 15, 'leftover xp carries over into the new level');

  assert(applyAward(base, { coins: -99999 }).coins === 0, 'a currency mutation never goes negative');

  const win = awardForMatch({ mode: 'host', won: true });
  const loss = awardForMatch({ mode: 'host', won: false });
  p = applyAward(applyAward(base, win), win);
  assert(p.winStreak === 2, 'consecutive wins build the streak');
  assert(applyAward(p, loss).winStreak === 0, 'a loss resets the streak to zero');
  assert(applyAward({ ...base, winStreak: 3 }, awardForMatch({ mode: 'solo', won: true })).winStreak === 3,
    'solo practice neither builds nor breaks the streak');

  let s = spend({ ...base, coins: 50 }, 'coins', 30);
  assert(s.coins === 20, 'spend deducts the amount');
  assert(spend({ ...base, coins: 10 }, 'coins', 30) === null, 'spend refuses insufficient funds');

  assert(applyStake({ ...base, coins: 100 }, true, 50).coins === 150, 'winning a stake adds the amount');
  assert(applyStake({ ...base, coins: 100 }, false, 50).coins === 50, 'losing a stake subtracts the amount');
  assert(applyStake({ ...base, coins: 20 }, false, 50).coins === 0, 'losing a stake never goes negative');
  assert(applyStake({ ...base, lifetimeWinnings: 10 }, true, 50).lifetimeWinnings === 60, 'lifetime winnings accumulate on a stake win');
  assert(applyStake({ ...base, lifetimeWinnings: 10 }, false, 50).lifetimeWinnings === -40, 'lifetime winnings can go negative, unlike coins');

  console.log('OK — economy self-test passed');
}
