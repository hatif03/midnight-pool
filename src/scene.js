import { Container, Graphics, Text, Sprite, Rectangle, FillGradient } from 'pixi.js';
import { CANVAS_W, CANVAS_H, CUSHION, TABLE_W, TABLE_H, BALL_R, POCKET_R, BALL_COLORS, HEAD_STRING_X } from './config.js';
import { pocketPositions } from './physics.js';

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
  };
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

export function drawAim(g, cue, mx, my, power = 1, aimBonus = 0) {
  g.clear();
  g.moveTo(cue.x, cue.y).lineTo(mx, my).stroke({ width: 1, color: 0xffffff, alpha: 0.25 });

  const len = Math.hypot(cue.x - mx, cue.y - my) || 1;
  let dx = (cue.x - mx) / len, dy = (cue.y - my) / len;
  let x = cue.x, y = cue.y, remaining = 50 + power * 260 + aimBonus;
  const minX = CUSHION + BALL_R, maxX = CUSHION + TABLE_W - BALL_R;
  const minY = CUSHION + BALL_R, maxY = CUSHION + TABLE_H - BALL_R;

  g.moveTo(x, y);
  for (let bounces = 0; bounces < 3 && remaining > 0; bounces++) {
    let t = Infinity;
    if (dx > 0) t = Math.min(t, (maxX - x) / dx);
    else if (dx < 0) t = Math.min(t, (minX - x) / dx);
    if (dy > 0) t = Math.min(t, (maxY - y) / dy);
    else if (dy < 0) t = Math.min(t, (minY - y) / dy);
    t = Math.min(t, remaining);
    if (!isFinite(t) || t <= 0) break;

    const nx = x + dx * t, ny = y + dy * t;
    g.lineTo(nx, ny);
    remaining -= t;
    if (Math.abs(nx - minX) < 0.6 || Math.abs(nx - maxX) < 0.6) dx = -dx;
    if (Math.abs(ny - minY) < 0.6 || Math.abs(ny - maxY) < 0.6) dy = -dy;
    x = nx; y = ny;
  }
  g.stroke({ width: 1, color: 0xff5050, alpha: 0.3 });
}

export function drawPower(g, label, frac) {
  const x = 24, y = CANVAS_H - 22, w = 200, h = 12;
  const r = Math.round(255 * frac), gr = Math.round(255 * (1 - frac));
  g.clear();
  g.rect(x, y, w, h).fill({ color: 0x000000, alpha: 0.5 }).stroke({ width: 1, color: 0xffffff, alpha: 0.6 });
  g.rect(x + 1, y + 1, (w - 2) * frac, h - 2).fill((r << 16) | (gr << 8));
  label.visible = true;
}
