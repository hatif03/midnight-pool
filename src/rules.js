export function groupOf(n) {
  return n === 0 ? 'cue' : n === 8 ? 'eight' : n <= 7 ? 'solids' : 'stripes';
}

function otherPlayer(p) {
  return p === 1 ? 2 : 1;
}

// Is it legal for the cue ball's first contact to be `firstContactBall`?
export function isLegalFirstContact(firstContactBall, openTable, shooterGroup, groupCleared) {
  if (firstContactBall === null) return false; // total miss
  const g = groupOf(firstContactBall);
  if (g === 'cue') return false; // cue can't contact itself
  if (openTable) return g !== 'eight'; // any object ball except the 8 is legal while open
  if (g === 'eight') return groupCleared; // 8 is legal first contact only once your group is clear
  return g === shooterGroup;
}

// A legal break needs a pot or at least 4 distinct object balls (1-15) driven to a cushion — the
// actual WPA rule, and Miniclip's own 8 Ball Pool enforces the same idea. Simplified from the full
// official rule (which gives the incoming player a 3-way choice: accept the table, re-rack and
// break, or re-rack and let the offending player break again) to a plain foul — a fiddly 3-way
// choice UI isn't worth it for how rarely a break actually fails this.
export function isIllegalBreak({ isBreakShot, potted, ballsToRail }) {
  return isBreakShot && potted.length === 0 && ballsToRail < 4;
}

export function isFoul({ cueFoul, anyContact, firstContactBall, anyRailAfterContact, potted, openTable, shooterGroup, groupCleared, isBreakShot, ballsToRail }) {
  if (cueFoul) return true;
  if (isIllegalBreak({ isBreakShot, potted, ballsToRail })) return true;
  if (!anyContact) return true; // total miss
  if (!isLegalFirstContact(firstContactBall, openTable, shooterGroup, groupCleared)) return true;
  if (potted.length === 0 && !anyRailAfterContact) return true; // no rail after contact, nothing potted
  return false;
}

function groupsFromPotted(numberedPotted) {
  const groups = new Set(numberedPotted.map(groupOf));
  return groups.size === 1 ? [...groups][0] : null;
}

/**
 * Resolve one completed shot. Pure function — no DOM, no ball objects, just the facts of the shot.
 *
 * @param {object} p
 * @param {1|2} p.shooter
 * @param {boolean} p.openTable - table state BEFORE this shot
 * @param {'solids'|'stripes'|null} p.shooterGroup - shooter's group BEFORE this shot (null if open)
 * @param {{1: string|null, 2: string|null}} p.groups - BEFORE this shot
 * @param {number[]} p.potted - ball numbers potted this shot (may include 0 and/or 8)
 * @param {number|null} p.firstContactBall - ball number the cue ball first hit, or null if it hit nothing
 * @param {boolean} p.anyContact - cue ball touched at least one other ball
 * @param {boolean} p.anyRailAfterContact - any ball reached a cushion after the first contact
 * @param {boolean} p.cueFoul - cue ball was potted (scratch)
 * @param {boolean} p.groupCleared - shooter's group (pre-shot) has no balls left on the table,
 *   accounting for this shot's pots — only meaningful once groups are assigned
 * @param {boolean} [p.isBreakShot] - this is the first shot of the rack (game.shots === 1)
 * @param {number} [p.ballsToRail] - count of distinct object balls (1-15) that touched a cushion
 */
export function resolveShot({
  shooter, openTable, shooterGroup, groups, potted,
  firstContactBall, anyContact, anyRailAfterContact, cueFoul, groupCleared,
  isBreakShot = false, ballsToRail = 0,
}) {
  const foul = isFoul({ cueFoul, anyContact, firstContactBall, anyRailAfterContact, potted, openTable, shooterGroup, groupCleared, isBreakShot, ballsToRail });
  // Kitchen-restricted ball-in-hand is specifically for a break *scratch* — an illegal break with
  // no scratch (too few rails, nothing potted) still gets anywhere ball-in-hand, matching Miniclip.
  const kitchenOnly = isBreakShot && cueFoul;
  const numberedPotted = potted.filter((n) => n !== 0 && n !== 8);

  if (potted.includes(8)) {
    const won = groupCleared && !foul;
    return { foul, kitchenOnly, gameOver: true, winner: won ? shooter : otherPlayer(shooter), openTable, groups, keepShooting: false };
  }

  let newOpenTable = openTable;
  let newGroups = groups;
  if (openTable && !foul && numberedPotted.length) {
    const decided = groupsFromPotted(numberedPotted);
    if (decided) {
      newOpenTable = false;
      newGroups = { ...groups, [shooter]: decided, [otherPlayer(shooter)]: decided === 'solids' ? 'stripes' : 'solids' };
    }
  }

  let keepShooting;
  if (foul) keepShooting = false;
  else if (newOpenTable) keepShooting = numberedPotted.length > 0;
  else keepShooting = numberedPotted.some((n) => groupOf(n) === newGroups[shooter]);

  return { foul, kitchenOnly, gameOver: false, winner: null, openTable: newOpenTable, groups: newGroups, keepShooting };
}

if (typeof process !== 'undefined' && process.argv[1] && import.meta.url.endsWith('rules.js') && process.argv[1].endsWith('rules.js')) {
  const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } };

  const openGroups = { 1: null, 2: null };

  // Open table, legal pot of a solid assigns groups and keeps the shooter shooting.
  let r = resolveShot({
    shooter: 1, openTable: true, shooterGroup: null, groups: openGroups, potted: [3],
    firstContactBall: 3, anyContact: true, anyRailAfterContact: false, cueFoul: false, groupCleared: false,
  });
  assert(!r.foul, 'legal open-table pot is not a foul');
  assert(r.openTable === false, 'table closes once a group is decided');
  assert(r.groups[1] === 'solids' && r.groups[2] === 'stripes', 'groups assigned from the potted ball');
  assert(r.keepShooting, 'shooter continues after potting their own new group');

  // Open table, potting balls from both groups leaves the table open.
  r = resolveShot({
    shooter: 1, openTable: true, shooterGroup: null, groups: openGroups, potted: [3, 9],
    firstContactBall: 3, anyContact: true, anyRailAfterContact: false, cueFoul: false, groupCleared: false,
  });
  assert(r.openTable === true, 'mixed pot on an open table stays open');

  // Wrong-group first contact is a foul once groups are assigned.
  r = resolveShot({
    shooter: 1, openTable: false, shooterGroup: 'solids', groups: { 1: 'solids', 2: 'stripes' }, potted: [],
    firstContactBall: 9, anyContact: true, anyRailAfterContact: true, cueFoul: false, groupCleared: false,
  });
  assert(r.foul, 'hitting the wrong group first is a foul');
  assert(!r.keepShooting, 'a foul always passes the turn');

  // Total miss is a foul.
  r = resolveShot({
    shooter: 1, openTable: false, shooterGroup: 'solids', groups: { 1: 'solids', 2: 'stripes' }, potted: [],
    firstContactBall: null, anyContact: false, anyRailAfterContact: false, cueFoul: false, groupCleared: false,
  });
  assert(r.foul, 'a total miss is a foul');

  // Legal contact, nothing potted, no rail reached — foul.
  r = resolveShot({
    shooter: 1, openTable: false, shooterGroup: 'solids', groups: { 1: 'solids', 2: 'stripes' }, potted: [],
    firstContactBall: 3, anyContact: true, anyRailAfterContact: false, cueFoul: false, groupCleared: false,
  });
  assert(r.foul, 'no rail after contact and nothing potted is a foul');

  // Legal contact, nothing potted, but a rail was reached — a legal safety, not a foul.
  r = resolveShot({
    shooter: 1, openTable: false, shooterGroup: 'solids', groups: { 1: 'solids', 2: 'stripes' }, potted: [],
    firstContactBall: 3, anyContact: true, anyRailAfterContact: true, cueFoul: false, groupCleared: false,
  });
  assert(!r.foul, 'a rail reached after legal contact is not a foul');
  assert(!r.keepShooting, 'a safety with nothing potted passes the turn');

  // 8-ball potted with group cleared and no foul: win.
  r = resolveShot({
    shooter: 1, openTable: false, shooterGroup: 'solids', groups: { 1: 'solids', 2: 'stripes' }, potted: [8],
    firstContactBall: 8, anyContact: true, anyRailAfterContact: false, cueFoul: false, groupCleared: true,
  });
  assert(r.gameOver && r.winner === 1, '8-ball potted with group cleared and no foul wins');

  // 8-ball potted early (group not cleared): loss.
  r = resolveShot({
    shooter: 1, openTable: false, shooterGroup: 'solids', groups: { 1: 'solids', 2: 'stripes' }, potted: [8],
    firstContactBall: 8, anyContact: true, anyRailAfterContact: false, cueFoul: false, groupCleared: false,
  });
  assert(r.gameOver && r.winner === 2, '8-ball potted before the group is cleared loses');

  // 8-ball potted with group cleared, but also a scratch: loss despite clearance.
  r = resolveShot({
    shooter: 1, openTable: false, shooterGroup: 'solids', groups: { 1: 'solids', 2: 'stripes' }, potted: [8, 0],
    firstContactBall: 8, anyContact: true, anyRailAfterContact: false, cueFoul: true, groupCleared: true,
  });
  assert(r.gameOver && r.winner === 2, '8-ball + scratch on the same shot loses even if the group was clear');

  // 8-ball is a legal first contact once the group is cleared.
  assert(isLegalFirstContact(8, false, 'solids', true), '8-ball is legal first contact once cleared');
  assert(!isLegalFirstContact(8, false, 'solids', false), '8-ball is illegal first contact before cleared');
  assert(!isLegalFirstContact(8, true, null, false), '8-ball is illegal first contact on an open table');

  // Illegal break (no pot, fewer than 4 rails): foul, but anywhere ball-in-hand (not kitchen-only)
  // — that restriction is specifically for a break *scratch*.
  r = resolveShot({
    shooter: 1, openTable: true, shooterGroup: null, groups: openGroups, potted: [],
    firstContactBall: 1, anyContact: true, anyRailAfterContact: true, cueFoul: false, groupCleared: false,
    isBreakShot: true, ballsToRail: 2,
  });
  assert(r.foul, 'a break with fewer than 4 rails and no pot is an illegal break');
  assert(!r.kitchenOnly, 'an illegal break without a scratch is NOT kitchen-restricted');

  // A legal break (4+ rails, no pot) is not a foul on its own.
  r = resolveShot({
    shooter: 1, openTable: true, shooterGroup: null, groups: openGroups, potted: [],
    firstContactBall: 1, anyContact: true, anyRailAfterContact: true, cueFoul: false, groupCleared: false,
    isBreakShot: true, ballsToRail: 4,
  });
  assert(!r.foul, 'a break with 4+ rails is legal even with nothing potted');

  // Break scratch: foul AND kitchen-restricted.
  r = resolveShot({
    shooter: 1, openTable: true, shooterGroup: null, groups: openGroups, potted: [0],
    firstContactBall: 1, anyContact: true, anyRailAfterContact: true, cueFoul: true, groupCleared: false,
    isBreakShot: true, ballsToRail: 4,
  });
  assert(r.foul && r.kitchenOnly, 'a break scratch is a foul with kitchen-restricted ball-in-hand');

  // A normal (non-break) mid-game scratch is unaffected — still anywhere ball-in-hand.
  r = resolveShot({
    shooter: 1, openTable: false, shooterGroup: 'solids', groups: { 1: 'solids', 2: 'stripes' }, potted: [0],
    firstContactBall: 3, anyContact: true, anyRailAfterContact: true, cueFoul: true, groupCleared: false,
  });
  assert(r.foul && !r.kitchenOnly, 'a normal mid-game scratch is not kitchen-restricted');

  console.log('OK — rules self-test passed');
}
