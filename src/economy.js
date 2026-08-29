// Pure economy math — XP curve and per-match awards. No DOM, no localStorage (that's
// profile.js's job); self-tested the same way rules.js/physics.js are.

export function xpToNext(level) {
  return 100 + (level - 1) * 50;
}

export function awardForMatch({ mode, won }) {
  if (mode === 'solo') return { coins: 5, xp: 5, loyaltyPoints: 0 };
  return won
    ? { coins: 50, xp: 30, loyaltyPoints: 1, wins: 1 }
    : { coins: 10, xp: 10, loyaltyPoints: 1 };
}

export function applyAward(profile, award) {
  const p = { ...profile };
  p.coins = Math.max(0, p.coins + (award.coins || 0));
  p.cash = Math.max(0, p.cash + (award.cash || 0));
  p.loyaltyPoints = Math.max(0, p.loyaltyPoints + (award.loyaltyPoints || 0));
  p.wins = (p.wins || 0) + (award.wins || 0);
  p.xp += award.xp || 0;
  while (p.xp >= xpToNext(p.level)) {
    p.xp -= xpToNext(p.level);
    p.level += 1;
  }
  return p;
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

  const base = { coins: 100, cash: 0, xp: 0, level: 1, loyaltyPoints: 0, wins: 0 };
  let p = applyAward(base, awardForMatch({ mode: 'host', won: true }));
  assert(p.coins === 150, 'multiplayer win awards coins');
  assert(p.loyaltyPoints === 1, 'multiplayer win awards a loyalty point');
  assert(p.wins === 1, 'multiplayer win increments the win counter');

  p = applyAward(base, awardForMatch({ mode: 'host', won: false }));
  assert(p.wins === 0, 'multiplayer loss does not increment the win counter');

  p = applyAward(base, awardForMatch({ mode: 'solo', won: true }));
  assert(p.coins === 105 && p.loyaltyPoints === 0, 'solo practice awards reduced coins, no loyalty points');
  assert(p.wins === 0, 'solo practice does not count toward the win counter');

  p = applyAward({ ...base, xp: xpToNext(1) - 5 }, { xp: 20 });
  assert(p.level === 2, 'crossing the xp threshold levels up');
  assert(p.xp === 15, 'leftover xp carries over into the new level');

  assert(applyAward(base, { coins: -99999 }).coins === 0, 'a currency mutation never goes negative');

  let s = spend({ ...base, coins: 50 }, 'coins', 30);
  assert(s.coins === 20, 'spend deducts the amount');
  assert(spend({ ...base, coins: 10 }, 'coins', 30) === null, 'spend refuses insufficient funds');

  console.log('OK — economy self-test passed');
}
