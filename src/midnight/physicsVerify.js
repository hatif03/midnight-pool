// Guest-side physics verification (docs/adr/0010): only the host ever runs
// physics (src/main.js's physicsFrame() no-ops for the guest), so a dishonest
// host could fabricate a shot's outcome and the guest would unknowingly
// co-sign it in awardMatchResult() -- the gap ADR-0008 documented and left
// open. This replays the exact same deterministic step()/shoot() loop the
// host already ran, from the same pre-shot snapshot and inputs the host
// broadcasts, and diffs the settled result against what the host claims.
//
// Not full anti-cheat: it verifies the host's *math*, not the shot the human
// player actually intended, and a small epsilon is required because
// Math.hypot (used in step()'s speed/spin-curve math) isn't spec-guaranteed
// correctly-rounded, so cross-browser float drift over hundreds of sub-steps
// is real, if bounded. A mismatch is logged as a flag for the audit
// dashboard, never used to alter gameplay -- same "observe, don't gate"
// contract as every other Midnight-adjacent hook in this codebase.
import { shoot, step, allStopped } from '../physics.js';

const EPSILON = 3; // table units (BALL_R = 12) -- absorbs float drift, not real divergence
const MAX_STEPS = 3000; // generous upper bound (a real shot settles in well under 300, see breakOrder.js's own test)

/** `preShotBalls`: [{number, x, y, potted}], the host's resting positions right before shoot(). */
export function replayShot(preShotBalls, { dx, dy, power, spin }) {
  const balls = preShotBalls.map((b) => ({
    number: b.number, x: b.x, y: b.y, potted: b.potted, vx: 0, vy: 0,
    spin: b.number === 0 ? { x: 0, y: 0 } : null,
  }));
  const cue = balls.find((b) => b.number === 0);
  shoot(cue, dx, dy, power, spin);
  let steps = 0;
  while (!allStopped(balls) && steps < MAX_STEPS) {
    step(balls);
    steps++;
  }
  return balls;
}

/** `hostFinal`: the `balls` array shape from a `state` message ({n, x, y, p}). */
export function diffFinalState(replayed, hostFinal) {
  const mismatches = [];
  for (const rb of replayed) {
    const hb = hostFinal.find((b) => b.n === rb.number);
    if (!hb) continue;
    if (rb.potted !== hb.p) { mismatches.push({ n: rb.number, reason: 'potted-mismatch' }); continue; }
    if (rb.potted) continue;
    const dist = Math.hypot(rb.x - hb.x, rb.y - hb.y);
    if (dist > EPSILON) mismatches.push({ n: rb.number, reason: 'position-mismatch', dist: Math.round(dist * 100) / 100 });
  }
  return mismatches;
}

if (typeof process !== 'undefined' && process.argv[1] && import.meta.url.endsWith('physicsVerify.js') && process.argv[1].endsWith('physicsVerify.js')) {
  const { rack } = await import('../physics.js');
  const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } };

  const pre = rack().map((b) => ({ number: b.number, x: b.x, y: b.y, potted: b.potted }));
  const shotInput = { dx: -1, dy: 0, power: 0.9, spin: { x: 0, y: 0 } };

  const replayA = replayShot(pre, shotInput);
  const replayB = replayShot(pre, shotInput);
  const asHostFinal = replayA.map((b) => ({ n: b.number, x: b.x, y: b.y, p: b.potted }));

  assert(diffFinalState(replayB, asHostFinal).length === 0, 'replaying the same shot twice from the same snapshot agrees with itself (determinism)');

  const tampered = asHostFinal.map((b) => (b.n === 1 ? { ...b, x: b.x + 500 } : b));
  const mismatches = diffFinalState(replayB, tampered);
  assert(mismatches.length === 1 && mismatches[0].n === 1, 'a tampered final position is caught as a mismatch');

  const honestNoise = asHostFinal.map((b) => (b.n === 1 ? { ...b, x: b.x + 0.5 } : b));
  assert(diffFinalState(replayB, honestNoise).length === 0, 'sub-epsilon float noise is not flagged as a mismatch');

  console.log('OK — physics-verify self-test passed');
}
