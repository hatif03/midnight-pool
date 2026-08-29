import {
  TABLE_W, TABLE_H, CUSHION, BALL_R, POCKET_R, BALL_COLORS,
  FRICTION, STOP_SPEED, WALL_RESTITUTION, BALL_RESTITUTION, MAX_SHOT_SPEED,
  SPIN_CURVE, SPIN_FOLLOW,
} from './config.js';

const MIN_X = CUSHION + BALL_R;
const MAX_X = CUSHION + TABLE_W - BALL_R;
const MIN_Y = CUSHION + BALL_R;
const MAX_Y = CUSHION + TABLE_H - BALL_R;

const POCKETS = (() => {
  const x0 = CUSHION, x1 = CUSHION + TABLE_W / 2, x2 = CUSHION + TABLE_W;
  const y0 = CUSHION, y1 = CUSHION + TABLE_H;
  return [
    { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x2, y: y0 },
    { x: x0, y: y1 }, { x: x1, y: y1 }, { x: x2, y: y1 },
  ];
})();

export function pocketPositions() {
  return POCKETS;
}

export function rack() {
  const balls = [];
  const make = (x, y, n) => ({
    x, y, vx: 0, vy: 0, number: n, color: BALL_COLORS[n], potted: false,
    spin: n === 0 ? { x: 0, y: 0 } : null,
  });

  balls.push(make(CUSHION + TABLE_W * 0.25, CUSHION + TABLE_H / 2, 0));

  const apexX = CUSHION + TABLE_W * 0.72;
  const apexY = CUSHION + TABLE_H / 2;
  const rowGap = BALL_R * Math.sqrt(3) + 0.5;
  const colGap = BALL_R * 2 + 0.5;

  let n = 1;
  for (let row = 0; row < 5; row++) {
    for (let i = 0; i <= row; i++) {
      balls.push(make(apexX + row * rowGap, apexY + (i - row / 2) * colGap, n));
      n++;
    }
  }
  return balls;
}

// `spin` is {x, y} in [-1, 1]: x = side-spin/English (curves flight sideways), y = top/backspin
// (follow/draw after contacting a ball). Simplified model — see SPIN_CURVE/SPIN_FOLLOW in
// config.js and the ceiling noted below, not real rigid-body billiards spin.
export function shoot(cue, dirX, dirY, power, spin = { x: 0, y: 0 }) {
  const len = Math.hypot(dirX, dirY) || 1;
  const speed = power * MAX_SHOT_SPEED;
  cue.vx = (dirX / len) * speed;
  cue.vy = (dirY / len) * speed;
  cue.spin = { x: spin.x || 0, y: spin.y || 0 };
}

export function allStopped(balls) {
  return balls.every((b) => b.potted || (b.vx === 0 && b.vy === 0));
}

export function step(balls) {
  const active = balls.filter((b) => !b.potted);
  const hits = [];

  let maxSpeed = 0;
  for (const b of active) maxSpeed = Math.max(maxSpeed, Math.hypot(b.vx, b.vy));
  const sub = Math.min(16, Math.max(1, Math.ceil(maxSpeed / (BALL_R * 0.5))));

  for (let s = 0; s < sub; s++) {
    for (const b of active) {
      b.x += b.vx / sub;
      b.y += b.vy / sub;
      applySpinCurve(b);
    }
    bounceWalls(active, hits);
    collideBalls(active, hits);
  }

  for (const b of active) {
    b.vx *= FRICTION;
    b.vy *= FRICTION;
    if (Math.hypot(b.vx, b.vy) < STOP_SPEED) {
      b.vx = 0;
      b.vy = 0;
    }
  }

  return { potted: sinkPockets(balls), hits };
}

// ponytail: a real curve comes from friction converting spin into lateral force over time, which
// would need per-ball angular velocity tracked and decayed independently of linear velocity. This
// just nudges the cue ball sideways while it's moving, proportional to a fixed spin.x — same
// visual idea (draw/curve), simpler state, no angular-momentum model. Upgrade path if this ever
// needs to be more realistic: track angular velocity per ball and derive the curve force from it.
function applySpinCurve(b) {
  if (!b.spin || !b.spin.x) return;
  const speed = Math.hypot(b.vx, b.vy);
  if (speed < STOP_SPEED) return;
  const px = -b.vy / speed, py = b.vx / speed;
  b.vx += px * b.spin.x * SPIN_CURVE;
  b.vy += py * b.spin.x * SPIN_CURVE;
}

function bounceWalls(active, hits) {
  for (const b of active) {
    let hit = 0;
    if (b.x < MIN_X) {
      b.x = MIN_X;
      hit = Math.abs(b.vx);
      b.vx = Math.abs(b.vx) * WALL_RESTITUTION;
    } else if (b.x > MAX_X) {
      b.x = MAX_X;
      hit = Math.abs(b.vx);
      b.vx = -Math.abs(b.vx) * WALL_RESTITUTION;
    }
    if (b.y < MIN_Y) {
      b.y = MIN_Y;
      hit = Math.max(hit, Math.abs(b.vy));
      b.vy = Math.abs(b.vy) * WALL_RESTITUTION;
    } else if (b.y > MAX_Y) {
      b.y = MAX_Y;
      hit = Math.max(hit, Math.abs(b.vy));
      b.vy = -Math.abs(b.vy) * WALL_RESTITUTION;
    }
    if (hit > 1.5) hits.push({ type: 'rail', ball: b.number, speed: hit });
  }
}

function collideBalls(active, hits) {
  const minDist = BALL_R * 2;
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i], b = active[j];
      let dx = b.x - a.x, dy = b.y - a.y;
      let dist = Math.hypot(dx, dy);
      if (dist === 0) { dx = 0.01; dist = 0.01; }
      if (dist >= minDist) continue;

      const nx = dx / dist, ny = dy / dist;
      const overlap = (minDist - dist) / 2;
      a.x -= nx * overlap; a.y -= ny * overlap;
      b.x += nx * overlap; b.y += ny * overlap;

      const rvn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (rvn <= 0) continue;

      // Capture pre-impulse direction for the cue ball before its velocity changes below —
      // follow/draw kicks in that direction, approximating topspin continuing forward through
      // contact (follow) or backspin pulling it back (draw). See applySpinCurve for the same
      // "simplified, not rigid-body" caveat.
      const cueBall = a.number === 0 ? a : b.number === 0 ? b : null;
      let cueDir = null;
      if (cueBall && cueBall.spin && cueBall.spin.y) {
        const cueSpeed = Math.hypot(cueBall.vx, cueBall.vy) || 1;
        cueDir = { x: cueBall.vx / cueSpeed, y: cueBall.vy / cueSpeed };
      }

      const jimp = ((1 + BALL_RESTITUTION) / 2) * rvn;
      a.vx -= jimp * nx; a.vy -= jimp * ny;
      b.vx += jimp * nx; b.vy += jimp * ny;

      if (cueDir) {
        const kick = cueBall.spin.y * SPIN_FOLLOW * rvn;
        cueBall.vx += cueDir.x * kick;
        cueBall.vy += cueDir.y * kick;
      }

      // Two balls can collide with a third in the same sub-step; order here is array order,
      // not true physical time. Fine for a casual game — see rules.js for what depends on it.
      if (rvn > 1.5) hits.push({ type: 'ball', a: a.number, b: b.number, speed: rvn });
    }
  }
}

function sinkPockets(balls) {
  const pockets = pocketPositions();
  const justPotted = [];
  for (const b of balls) {
    if (b.potted) continue;
    for (const p of pockets) {
      if (Math.hypot(b.x - p.x, b.y - p.y) < POCKET_R) {
        b.potted = true;
        b.vx = 0;
        b.vy = 0;
        justPotted.push(b);
        break;
      }
    }
  }
  return justPotted;
}

export function placeCue(cue, balls, x, y) {
  let nx = Math.min(Math.max(x, MIN_X), MAX_X);
  let ny = Math.min(Math.max(y, MIN_Y), MAX_Y);
  for (const b of balls) {
    if (b === cue || b.potted) continue;
    const dx = nx - b.x, dy = ny - b.y;
    const dist = Math.hypot(dx, dy) || 0.01;
    if (dist < BALL_R * 2) {
      nx = b.x + (dx / dist) * BALL_R * 2;
      ny = b.y + (dy / dist) * BALL_R * 2;
    }
  }
  cue.x = Math.min(Math.max(nx, MIN_X), MAX_X);
  cue.y = Math.min(Math.max(ny, MIN_Y), MAX_Y);
  cue.vx = 0;
  cue.vy = 0;
  cue.potted = false;
}

if (typeof process !== 'undefined' && process.argv[1] && import.meta.url.endsWith('physics.js') && process.argv[1].endsWith('physics.js')) {
  const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } };

  let balls = rack();
  assert(balls.length === 16, '16 balls racked');
  assert(balls.filter((b) => b.number === 0).length === 1, 'one cue ball');

  for (let i = 1; i < balls.length; i++)
    for (let j = i + 1; j < balls.length; j++)
      assert(Math.hypot(balls[i].x - balls[j].x, balls[i].y - balls[j].y) >= BALL_R * 2 - 0.6, `no overlap ${i},${j}`);

  const cue = balls.find((b) => b.number === 0);
  shoot(cue, 1, 0.04, 1);
  let frames = 0;
  while (!allStopped(balls) && frames < 4000) {
    step(balls);
    frames++;
  }
  assert(frames < 4000, 'simulation comes to rest');
  for (const b of balls) {
    if (b.potted) continue;
    assert(b.x >= MIN_X - 1 && b.x <= MAX_X + 1 && b.y >= MIN_Y - 1 && b.y <= MAX_Y + 1, `ball ${b.number} stayed on table`);
  }

  balls = [
    { x: 200, y: 300, vx: 20, vy: 0, number: 0, potted: false },
    { x: 300, y: 300, vx: 0, vy: 0, number: 1, potted: false },
  ];
  let sawContact = false;
  for (let i = 0; i < 20; i++) {
    const { hits } = step(balls);
    for (const h of hits) {
      if (h.type === 'ball' && ((h.a === 0 && h.b === 1) || (h.a === 1 && h.b === 0))) sawContact = true;
    }
  }
  assert(balls[1].x > 300, 'struck ball moved forward');
  assert(sawContact, 'ball-ball hit records both ball numbers');

  balls = [{ x: 1000, y: 300, vx: 15, vy: 0, number: 0, potted: false }];
  let sawRail = false;
  for (let i = 0; i < 30 && !sawRail; i++) {
    const { hits } = step(balls);
    for (const h of hits) if (h.type === 'rail' && h.ball === 0) sawRail = true;
  }
  assert(sawRail, 'rail hit records the ball number');

  const straight = [{ x: 100, y: 250, vx: 10, vy: 0, number: 0, potted: false, spin: { x: 0, y: 0 } }];
  const curved = [{ x: 100, y: 250, vx: 10, vy: 0, number: 0, potted: false, spin: { x: 1, y: 0 } }];
  for (let i = 0; i < 20; i++) { step(straight); step(curved); }
  assert(Math.abs(straight[0].y - 250) < 0.5, 'no side-spin travels straight');
  assert(Math.abs(curved[0].y - 250) > 3, 'side-spin curves the cue ball off a straight line');

  const noFollow = [
    { x: 300, y: 300, vx: 15, vy: 0, number: 0, potted: false, spin: { x: 0, y: 0 } },
    { x: 340, y: 300, vx: 0, vy: 0, number: 1, potted: false, spin: null },
  ];
  const follow = [
    { x: 300, y: 300, vx: 15, vy: 0, number: 0, potted: false, spin: { x: 0, y: 1 } },
    { x: 340, y: 300, vx: 0, vy: 0, number: 1, potted: false, spin: null },
  ];
  for (let i = 0; i < 15; i++) { step(noFollow); step(follow); }
  assert(follow[0].vx > noFollow[0].vx, 'topspin (follow) keeps the cue ball moving forward more than no spin after contact');

  console.log(`OK — break settled in ${frames} frames (~${(frames / 60).toFixed(1)}s)`);
}
