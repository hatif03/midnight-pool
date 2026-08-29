import { Container, Graphics, Text, Sprite, Rectangle, FillGradient } from 'pixi.js';
import { CANVAS_W, CANVAS_H, CUSHION, TABLE_W, TABLE_H, BALL_R, POCKET_R, BALL_COLORS } from './config.js';
import { pocketPositions } from './physics.js';

export function drawTable() {
  const g = new Graphics();

  const wood = new FillGradient({
    type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 },
    colorStops: [{ offset: 0, color: 0x8a5a30 }, { offset: 0.5, color: 0x5c3b1d }, { offset: 1, color: 0x36230f }],
    textureSpace: 'local',
  });
  g.roundRect(0, 0, CANVAS_W, CANVAS_H, 16).fill(wood);
  g.roundRect(3, 3, CANVAS_W - 6, CANVAS_H - 6, 13).stroke({ width: 2, color: 0xffe2b0, alpha: 0.18 });

  g.rect(CUSHION - 8, CUSHION - 8, TABLE_W + 16, TABLE_H + 16).fill(0x1b6e3a);

  const cloth = new FillGradient({
    type: 'radial',
    innerCenter: { x: 0.5, y: 0.42 }, innerRadius: 0.04,
    outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.66,
    colorStops: [{ offset: 0, color: 0x24c55c }, { offset: 0.7, color: 0x12953f }, { offset: 1, color: 0x0a6b2c }],
    textureSpace: 'local',
  });
  g.rect(CUSHION, CUSHION, TABLE_W, TABLE_H).fill(cloth);
  g.rect(CUSHION, CUSHION, TABLE_W, TABLE_H).stroke({ width: 8, color: 0x000000, alpha: 0.18 });
  g.rect(CUSHION + 2, CUSHION + 2, TABLE_W - 4, TABLE_H - 4).stroke({ width: 2, color: 0x000000, alpha: 0.12 });

  const dots = [];
  for (const f of [0.25, 0.5, 0.75]) {
    dots.push([CUSHION + TABLE_W * f, CUSHION / 2], [CUSHION + TABLE_W * f, CANVAS_H - CUSHION / 2]);
  }
  dots.push([CUSHION / 2, CUSHION + TABLE_H / 2], [CANVAS_W - CUSHION / 2, CUSHION + TABLE_H / 2]);
  for (const [x, y] of dots) {
    g.circle(x, y, 3.5).fill(0xfff0cf);
    g.circle(x, y, 3.5).stroke({ width: 1, color: 0x4a3a1f, alpha: 0.5 });
  }

  for (const p of pocketPositions()) {
    g.circle(p.x, p.y, POCKET_R + 6).fill({ color: 0x000000, alpha: 0.4 });
    g.circle(p.x, p.y, POCKET_R + 3).fill(0x4a3a1f);
    g.circle(p.x, p.y, POCKET_R + 3).stroke({ width: 2, color: 0xd9b15a, alpha: 0.7 });
    const hole = new FillGradient({
      type: 'radial', innerCenter: { x: 0.5, y: 0.4 }, innerRadius: 0, outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.5,
      colorStops: [{ offset: 0, color: 0x101010 }, { offset: 1, color: 0x000000 }], textureSpace: 'local',
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
