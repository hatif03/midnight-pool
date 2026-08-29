// Loyalty Points accrue from cumulative play (matches/XP) here, not purchases — a deliberate
// substitution for the reference game's purchase-based accrual, since there's nothing to purchase.
// A single static catalog rather than a truly time-rotating one — the "rotation" mechanic isn't
// essential to demonstrate the loyalty-shop concept and would need a schedule/index system to do
// properly; noted as a scope simplification, not an oversight.
export const LOYALTY_SHOP = [
  { id: 'frame-gold', name: 'Gold Avatar Frame', cost: 50 },
  { id: 'chat-pack-1', name: 'Victory Chat Pack', cost: 30 },
  { id: 'cue-skin-classic', name: 'Classic Cue Skin', cost: 80 },
];

export function canRedeem(loyaltyPoints, item) {
  return loyaltyPoints >= item.cost;
}

export function redeem(loyaltyPoints, item) {
  return canRedeem(loyaltyPoints, item) ? loyaltyPoints - item.cost : null;
}

if (typeof process !== 'undefined' && process.argv[1] && import.meta.url.endsWith('loyalty.js') && process.argv[1].endsWith('loyalty.js')) {
  const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } };

  const item = LOYALTY_SHOP[0];
  assert(!canRedeem(item.cost - 1, item), 'cannot redeem with insufficient points');
  assert(canRedeem(item.cost, item), 'can redeem with exactly enough points');
  assert(redeem(item.cost, item) === 0, 'redeeming deducts the exact cost');
  assert(redeem(item.cost - 1, item) === null, 'redeem refuses insufficient funds rather than going negative');

  console.log('OK — loyalty self-test passed');
}
