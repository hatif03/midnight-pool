import { Container, Graphics, Text, Sprite, Rectangle, FillGradient } from 'pixi.js';
import { CANVAS_W, CANVAS_H, CUSHION, TABLE_W, TABLE_H, BALL_R, POCKET_R, BALL_COLORS, HEAD_STRING_X } from './config.js';
import { pocketPositions, predictShot } from './physics.js';

// Table palette, mirroring the CSS tokens in src/styles/tokens.css (docs/adr/0014).
const RAIL = [0xc96a3d, 0x9a3f22, 0x5e2313];
const CUSH = 0xb6502c;
const CUSH_HI = 0xe08a5c;
const FELT = [0x46b0f2, 0x1f7fd0, 0x114f88];
const RIM = 0xffc94d;
const SIGHT = 0xfff3d6;

// How far the cushion mouth pulls back from a pocket centre, so the jaws read as jaws.
const JAW = POCKET_R * 1.15;
// Where the cushion's outer face starts, measured in from the frame edge.
const LIP = 7;

export function drawTable() {
  const g = new Graphics();

  // --- frame -------------------------------------------------------------
  const wood = new FillGradient({
    type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 },
    colorStops: [{ offset: 0, color: RAIL[0] }, { offset: 0.5, color: RAIL[1] }, { offset: 1, color: RAIL[2] }],
    textureSpace: 'local',
  });
  g.roundRect(0, 0, CANVAS_W, CANVAS_H, 18).fill(wood);
  g.roundRect(4, 4, CANVAS_W - 8, CANVAS_H - 8, 15).stroke({ width: 2, color: 0xffd98a, alpha: 0.30 });

  // --- felt --------------------------------------------------------------
  const cloth = new FillGradient({
    type: 'radial',
    innerCenter: { x: 0.5, y: 0.44 }, innerRadius: 0.04,
    outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.72,
    colorStops: [{ offset: 0, color: FELT[0] }, { offset: 0.7, color: FELT[1] }, { offset: 1, color: FELT[2] }],
    textureSpace: 'local',
  });
  g.rect(CUSHION, CUSHION, TABLE_W, TABLE_H).fill(cloth);

  // --- cushions ----------------------------------------------------------
  // Six trapezoids: the sloped face between the rail top and the cushion nose. This is what makes
  // the rails read as three-dimensional rather than as a flat border, and it is the single biggest
  // difference between this table and the old one.
  const x0 = CUSHION, xm = CUSHION + TABLE_W / 2, x1 = CUSHION + TABLE_W;
  const y0 = CUSHION, y1 = CUSHION + TABLE_H;

  // [outer edge start, outer edge end, nose start, nose end] per run, as polygon point lists.
  const runs = [
    // top-left, top-right (split by the middle pocket)
    [x0 + JAW - 6, LIP, xm - JAW + 6, LIP, xm - JAW, y0, x0 + JAW, y0],
    [xm + JAW - 6, LIP, x1 - JAW + 6, LIP, x1 - JAW, y0, xm + JAW, y0],
    // bottom-left, bottom-right
    [x0 + JAW - 6, CANVAS_H - LIP, xm - JAW + 6, CANVAS_H - LIP, xm - JAW, y1, x0 + JAW, y1],
    [xm + JAW - 6, CANVAS_H - LIP, x1 - JAW + 6, CANVAS_H - LIP, x1 - JAW, y1, xm + JAW, y1],
    // left, right (single runs, corner to corner)
    [LIP, y0 + JAW - 6, LIP, y1 - JAW + 6, x0, y1 - JAW, x0, y0 + JAW],
    [CANVAS_W - LIP, y0 + JAW - 6, CANVAS_W - LIP, y1 - JAW + 6, x1, y1 - JAW, x1, y0 + JAW],
  ];
  for (const pts of runs) g.poly(pts).fill(CUSH);

  // Nose highlight: the lit top edge of each cushion, facing the table.
  const noses = [
    [x0 + JAW, y0, xm - JAW, y0], [xm + JAW, y0, x1 - JAW, y0],
    [x0 + JAW, y1, xm - JAW, y1], [xm + JAW, y1, x1 - JAW, y1],
    [x0, y0 + JAW, x0, y1 - JAW], [x1, y0 + JAW, x1, y1 - JAW],
  ];
  for (const [ax, ay, bx, by] of noses) {
    g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: 2.5, color: CUSH_HI, alpha: 0.55 });
  }

  // Contact shadow the cushions cast onto the felt.
  g.rect(CUSHION, CUSHION, TABLE_W, TABLE_H).stroke({ width: 10, color: 0x000000, alpha: 0.16 });
  g.rect(CUSHION + 1, CUSHION + 1, TABLE_W - 2, TABLE_H - 2).stroke({ width: 2, color: 0x000000, alpha: 0.14 });

  // --- head string -------------------------------------------------------
  // Free, and it makes the kitchen rule legible during ball-in-hand instead of invisible.
  g.moveTo(HEAD_STRING_X, CUSHION).lineTo(HEAD_STRING_X, CUSHION + TABLE_H)
    .stroke({ width: 1, color: 0xffffff, alpha: 0.14 });

  // --- sights ------------------------------------------------------------
  // Diamonds, not dots: this is what a real table has and what the reference draws.
  const sights = [];
  for (const f of [0.25, 0.5, 0.75]) {
    sights.push([CUSHION + TABLE_W * f, CUSHION / 2], [CUSHION + TABLE_W * f, CANVAS_H - CUSHION / 2]);
  }
  sights.push([CUSHION / 2, CUSHION + TABLE_H / 2], [CANVAS_W - CUSHION / 2, CUSHION + TABLE_H / 2]);
  for (const [x, y] of sights) {
    g.poly([x, y - 4.5, x + 4.5, y, x, y + 4.5, x - 4.5, y]).fill(SIGHT);
    g.poly([x, y - 4.5, x + 4.5, y, x, y + 4.5, x - 4.5, y]).stroke({ width: 1, color: 0x5e2313, alpha: 0.45 });
  }

  // --- pockets -----------------------------------------------------------
  for (const p of pocketPositions()) {
    g.circle(p.x, p.y, POCKET_R + 7).fill({ color: 0x000000, alpha: 0.35 });
    g.circle(p.x, p.y, POCKET_R + 4).fill(0x7a4a10);
    g.circle(p.x, p.y, POCKET_R + 4).stroke({ width: 3, color: RIM, alpha: 0.9 });
    const hole = new FillGradient({
      type: 'radial', innerCenter: { x: 0.5, y: 0.4 }, innerRadius: 0, outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.5,
      colorStops: [{ offset: 0, color: 0x1a1a1a }, { offset: 1, color: 0x000000 }], textureSpace: 'local',
    });
    g.circle(p.x, p.y, POCKET_R).fill(hole);
  }

  return g;
}

function faceGraphics(number, color) {
  const g = new Container();
  const isCue = number === 0;
  const isStripe = number >= 9;

  g.addChild(new Graphics().circle(0, 0, BALL_R).fill(isCue || isStripe ? 0xffffff : color));

  if (isStripe) {
    const band = new Graphics().rect(-BALL_R, -BALL_R * 0.5, BALL_R * 2, BALL_R).fill(color);
    const mask = new Graphics().circle(0, 0, BALL_R).fill(0xffffff);
    g.addChild(band, mask);
    band.mask = mask;
  }

  if (!isCue) {
    g.addChild(new Graphics().circle(0, 0, BALL_R * 0.48).fill(0xfbf7ec));
    const label = new Text({ text: String(number), style: { fontFamily: 'Arial, sans-serif', fontSize: 9, fontWeight: 'bold', fill: 0x111111 } });
    label.anchor.set(0.5);
    g.addChild(label);
  }

  return g;
}

function overlayGraphics() {
  const g = new Container();
  const shade = new FillGradient({
    type: 'radial',
    innerCenter: { x: 0.38, y: 0.34 }, innerRadius: 0.1,
    outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.52,
    colorStops: [
      { offset: 0, color: 'rgba(0,0,0,0)' },
      { offset: 0.65, color: 'rgba(0,0,0,0)' },
      { offset: 1, color: 'rgba(0,0,0,0.5)' },
    ],
    textureSpace: 'local',
  });
  g.addChild(new Graphics().circle(0, 0, BALL_R).fill(shade));
  g.addChild(new Graphics().ellipse(-BALL_R * 0.34, -BALL_R * 0.38, BALL_R * 0.4, BALL_R * 0.28).fill({ color: 0xffffff, alpha: 0.45 }));
  g.addChild(new Graphics().circle(-BALL_R * 0.4, -BALL_R * 0.44, BALL_R * 0.12).fill({ color: 0xffffff, alpha: 0.7 }));
  g.addChild(new Graphics().circle(0, 0, BALL_R).stroke({ width: 1, color: 0x000000, alpha: 0.25 }));
  return g;
}

let TEX = null;

export function initBallTextures(renderer) {
  if (TEX) return;

  const bake = (node, half) => {
    const texture = renderer.generateTexture({ target: node, frame: new Rectangle(-half, -half, half * 2, half * 2), resolution: 2, antialias: true });
    node.destroy({ children: true });
    return texture;
  };

  const R = BALL_R + 2;
  const faces = new Map();
  for (let n = 0; n <= 15; n++) faces.set(n, bake(faceGraphics(n, BALL_COLORS[n]), R));
  const shadow = new Graphics().ellipse(0, 0, BALL_R * 1.05, BALL_R * 0.9).fill({ color: 0x000000, alpha: 0.3 });

  TEX = {
    faces,
    overlay: bake(overlayGraphics(), R),
    shadow: bake(shadow, BALL_R + 4),
    // Baked once like the balls, rather than rebuilt as a Graphics on every pointermove.
    cue: renderer.generateTexture({ target: cueGraphics(), resolution: 2, antialias: true }),
    spark: renderer.generateTexture({
      target: new Graphics().circle(0, 0, 4).fill(0xffffff),
      resolution: 2, antialias: true,
    }),
  };
}

// A tapered cue, tip at x=0 so the sprite's anchor sits on the tip and pull-back is a single
// scalar with no trigonometry at the butt end.
const CUE_LEN = 340;
function cueGraphics() {
  const c = new Container();
  const g = new Graphics();
  const L = CUE_LEN;
  g.poly([0, -2.6, L, -6.5, L, 6.5, 0, 2.6]).fill(0xd9a441);
  g.poly([0, 0, L, 0, L, 6.5, 0, 2.6]).fill({ color: 0x000000, alpha: 0.22 });
  g.poly([0, -2.6, L, -6.5, L, -3.6, 0, -1.2]).fill({ color: 0xffffff, alpha: 0.30 });
  g.poly([L * 0.655, -5.8, L, -6.5, L, 6.5, L * 0.655, 5.8]).fill(0x5a2a12);
  g.rect(L * 0.60, -5.6, L * 0.055, 11.2).fill(0x1c1c1c);
  g.rect(0, -2.6, 5, 5.2).fill(0xf2ead8);
  g.circle(2, 0, 2.4).fill(0x2f6fa8);
  c.addChild(g);
  return c;
}

export function makeCueSprite() {
  const s = new Sprite(TEX.cue);
  s.anchor.set(0, 0.5);
  s.visible = false;
  return s;
}

export function makeSpark() {
  const s = new Sprite(TEX.spark);
  s.anchor.set(0.5);
  s.visible = false;
  return s;
}

// Positions the stick behind the cue ball along the shot direction. `power` (0..1) sets pull-back;
// `recoil` is used by the strike animation to drive it forward through the ball.
export function placeCueStick(sprite, cue, dirX, dirY, power, recoil = 0) {
  const len = Math.hypot(dirX, dirY) || 1;
  const ux = dirX / len, uy = dirY / len;
  const gap = BALL_R + 6 + power * 52 - recoil;
  sprite.rotation = Math.atan2(-uy, -ux);
  sprite.position.set(cue.x - ux * gap, cue.y - uy * gap);
  sprite.visible = true;
}

export function buildBallVisual(ball) {
  const c = new Container();
  const shadow = new Sprite(TEX.shadow);
  shadow.anchor.set(0.5);
  shadow.position.set(2.5, 3.5);
  const face = new Sprite(TEX.faces.get(ball.number));
  face.anchor.set(0.5);
  const overlay = new Sprite(TEX.overlay);
  overlay.anchor.set(0.5);
  c.addChild(shadow, face, overlay);
  c.spin = face;
  return c;
}

// Ghost-ball aim guide (docs/adr/0017).
//
// Replaces the old three-bounce rail prediction, which passed straight through other balls and so
// lied about the most common shot in the game. What's drawn now is what actually happens: the line
// to first contact, the ghost ball at the contact point, the object ball's departure, and the cue
// ball's tangent deflection.
//
// `aimBonus` (a cue stat) extends the projected lines. That is the reference's model -- a long
// guideline is what a better cue buys you -- and it gives the stat real competitive meaning
// instead of "a longer bounce prediction", which is what it used to control.
export function drawAim(g, balls, cue, dirX, dirY, aimBonus = 0) {
  g.clear();
  const p = predictShot(balls, cue, dirX, dirY);

  // Line from the cue ball to first contact.
  g.moveTo(cue.x, cue.y).lineTo(p.x, p.y).stroke({ width: 2, color: 0xffffff, alpha: 0.55 });

  // The ghost: where the cue ball will be at the moment of contact.
  g.circle(p.x, p.y, BALL_R).fill({ color: 0xffffff, alpha: 0.10 });
  g.circle(p.x, p.y, BALL_R).stroke({ width: 1.5, color: 0xffffff, alpha: 0.85 });

  if (p.kind !== 'ball') return;

  // Target ring on the ball being hit.
  g.circle(p.ball.x, p.ball.y, BALL_R + 3.5).stroke({ width: 2, color: 0xffe07a, alpha: 0.8 });

  // Where the object ball goes.
  const objLen = 54 + aimBonus * 4;
  g.moveTo(p.ball.x, p.ball.y)
    .lineTo(p.ball.x + p.ox * objLen, p.ball.y + p.oy * objLen)
    .stroke({ width: 2, color: 0xffe07a, alpha: 0.7 });

  // Where the cue ball goes: along the tangent, on whichever side it is actually travelling.
  const side = (p.ux * p.tx + p.uy * p.ty) >= 0 ? 1 : -1;
  const cueLen = 34 + aimBonus * 2;
  g.moveTo(p.x, p.y)
    .lineTo(p.x + p.tx * side * cueLen, p.y + p.ty * side * cueLen)
    .stroke({ width: 1.5, color: 0x9fd8ff, alpha: 0.45 });
}
