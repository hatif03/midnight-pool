export const TABLE_W = 1000;
export const TABLE_H = 500;
export const CUSHION = 30;

export const CANVAS_W = TABLE_W + CUSHION * 2;
export const CANVAS_H = TABLE_H + CUSHION * 2;

export const BALL_R = 12;
export const POCKET_R = 22;

export const MAX_SHOT_SPEED = 40;
export const FRICTION = 0.986;
export const STOP_SPEED = 0.38;
export const WALL_RESTITUTION = 0.76;
export const BALL_RESTITUTION = 0.93;
export const POWER_CURVE = 1.6;

export const MAX_DRAG = 210;
export const MIN_DRAG = 10;

// Simplified English/spin model (see docs/adr and src/physics.js) — not real rigid-body billiards
// spin physics, just enough curve/follow-draw feel to make cue-tier spin stats mean something.
export const SPIN_CURVE = 0.16; // side-spin lateral acceleration per sub-step while moving
export const SPIN_FOLLOW = 0.5; // top/backspin post-collision follow(+)/draw(-) kick strength
export const SPIN_THROW = 0.12; // side-spin's tangential "throw" deflection on the struck ball

// Standard pool geometry: the head string sits a quarter of the table length from the head rail —
// already implicitly used as the cue ball's own break/rack position below, just named here so
// rules.js/main.js can reference "the kitchen" boundary without re-deriving it.
export const HEAD_STRING_X = CUSHION + TABLE_W * 0.25;

export const BALL_COLORS = [
  0xffffff,
  0xe8c000, 0x1f48d8, 0xd81f1f, 0x6a1fb0, 0xe8742a, 0x1f8a3a, 0x8a1f1f, 0x161616,
  0xe8c000, 0x1f48d8, 0xd81f1f, 0x6a1fb0, 0xe8742a, 0x1f8a3a, 0x8a1f1f,
];
