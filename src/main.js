import { Application, Container, Graphics, Text } from 'pixi.js';
import QRCode from 'qrcode';
import { CANVAS_W, CANVAS_H, MAX_DRAG, MIN_DRAG, POWER_CURVE, HEAD_STRING_X, BALL_COLORS } from './config.js';
import { rack, step, allStopped, shoot, placeCue } from './physics.js';
import { groupOf, resolveShot } from './rules.js';
import { drawTable, buildBallVisual, drawAim, initBallTextures, makeCueSprite, placeCueStick, makeSpark } from './scene.js';
import { host, join, findMatch } from './net.js';
import * as ui from './ui.js';
import * as audio from './audio.js';
import * as identity from './identity.js';
import { t, setLang, getLang, applyStatic } from './i18n.js';
import { loadProfile, saveProfile, isVirginProfile } from './profile.js';
import * as economy from './economy.js';
import { getCue, allCues, upgradeCost } from './cues.js';
import * as dailyReward from './dailyReward.js';
import * as passSys from './pass.js';
import * as lootbox from './lootbox.js';
import * as loyalty from './loyalty.js';
import * as breakOrder from './midnight/breakOrder.js';
import * as mnHooks from './midnight/hooks.js';
import * as mnAudit from './midnight/audit.js';
import * as mnWallet from './midnight/wallet.js';
import * as mnAttest from './midnight/attest.js';
import * as passkeyTable from './midnight/passkeyTable.js';
import {
  HALL, explorerTxUrl, fetchContractAction, knownTxHash, parseContractAction, resolveTxHashes, stripHex,
} from './midnight/ledgerPublic.js';
import { wireInstallPrompt } from './pwaInstall.js';
import { replayShot, diffFinalState } from './midnight/physicsVerify.js';
import { LEAGUES } from './leagues.js';

const other = (p) => (p === 1 ? 2 : 1);
const RANKED_LEVEL_THRESHOLD = 5;

let profile = loadProfile();
let currentSpin = { x: 0, y: 0 };
// Power set on the slider, 0..1, persisting between shots so the rail does not snap to empty.
let powerFrac = 0;

const equippedCue = () => getCue(profile.cues.equipped);

function updateWallet() {
  ui.el('wallet-coins').textContent = profile.coins;
  ui.el('wallet-cash').textContent = profile.cash;
  ui.el('wallet-level').textContent = profile.level;
  const wins = profile.wins || 0;
  const losses = profile.losses || 0;
  ui.el('wallet-record').textContent = (wins + losses) === 0
    ? '—'
    : `W${wins}-L${losses} · ${Math.round(economy.winRate(profile) * 100)}%`;

  // Lobby widgets (docs/adr/0014). All of these read state that already existed -- nothing here
  // invents a number, which is why the bars can be trusted to mean something.
  const nick = identity.getNickname();
  ui.el('lobby-name').textContent = nick;
  ui.el('lobby-avatar').style.setProperty('--av-color', identity.avatarFor(nick).color);

  const need = economy.xpToNext(profile.level);
  ui.el('lobby-xp').parentElement.style.setProperty('--p', need ? Math.min(1, profile.xp / need) : 0);
  ui.el('pass-bar').parentElement.style.setProperty('--p', passSys.tierForPoints(profile.pass.points) / 20);

  renderStreakPips();
  tickDailyChest();
}

// Five pips, the fifth marked as the reward. profile.winStreak is maintained in economy.applyAward.
function renderStreakPips() {
  const box = ui.el('streak-pips');
  const streak = Math.min(profile.winStreak || 0, 5);
  box.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const pip = document.createElement('i');
    pip.className = `pip${i < streak ? ' on' : ''}${i === 4 ? ' goal' : ''}`;
    box.appendChild(pip);
  }
}

// Live countdown on the daily chest. dailyReward.js already owns the rules; this only formats the
// remaining time. Guarded to the lobby being visible so it does no work during a match.
const DAY_MS = 864e5;
function tickDailyChest() {
  const el = ui.el('daily-countdown');
  if (!el) return;
  const ready = dailyReward.canClaim(profile.streak);
  el.classList.toggle('ready', ready);
  if (ready) { el.textContent = t('chestReady'); return; }
  const ms = Math.max(0, (profile.streak.lastClaim || 0) + DAY_MS - Date.now());
  const p2 = (n) => String(n).padStart(2, '0');
  el.textContent = `${p2(ms / 36e5 | 0)}:${p2((ms / 6e4 | 0) % 60)}:${p2((ms / 1e3 | 0) % 60)}`;
}

function persistProfile() {
  saveProfile(profile);
  updateWallet();
  passkeyTable.schedulePush({ profile, nickname: identity.getNickname() });
}

function resetTurnTimer() {
  if (!game.timedMode) return;
  const bonus = game.turn === game.myPlayer ? equippedCue().timeBonus : game.opponentTimeBonus;
  game.turnTimeLeft = 60 + bonus;
}

// Function names kept as-is (syncSpinGrid/wireSpinGrid) even though the control is no longer a
// grid — every call site (enterGame transitions, quick-match, solo) already calls these, so
// keeping the names means only this implementation needed to change, not every caller.
function syncSpinGrid() {
  const cap = equippedCue().spinCap;
  currentSpin = { x: 0, y: 0 };
  const widget = document.getElementById('spin-widget');
  widget.classList.add('show');
  widget.classList.toggle('disabled', cap === 0);
  const dot = document.getElementById('spin-dot');
  dot.style.left = '50%';
  dot.style.top = '50%';
}

function wireSpinGrid() {
  const widget = document.getElementById('spin-widget');
  const dot = document.getElementById('spin-dot');
  let dragging = false;

  const setFromPointer = (e) => {
    const r = widget.getBoundingClientRect();
    const radius = r.width / 2;
    const cx = r.left + radius, cy = r.top + radius;
    let x = (e.clientX - cx) / radius, y = (e.clientY - cy) / radius;
    const mag = Math.hypot(x, y);
    if (mag > 1) { x /= mag; y /= mag; }
    currentSpin = { x, y };
    dot.style.left = `${50 + x * 50}%`;
    dot.style.top = `${50 + y * 50}%`;
  };

  widget.addEventListener('pointerdown', (e) => {
    if (widget.classList.contains('disabled')) return;
    dragging = true;
    audio.uiClick();
    setFromPointer(e);
  });
  window.addEventListener('pointermove', (e) => { if (dragging) setFromPointer(e); });
  window.addEventListener('pointerup', () => { dragging = false; });
}

// Power readout. `show` false hides the rail entirely rather than leaving an empty one on screen.
function setPower(frac, show = true) {
  const el = document.getElementById('power-slider');
  el.classList.toggle('show', show);
  el.style.setProperty('--pw', show ? frac : 0);
}

const game = {
  mode: 'solo', myPlayer: 1, turn: 1, started: false, pendingBreakNegotiation: null,
  stakeEligible: false, stakeAmount: 0, currentMatchId: null, pendingReplay: null,
  balls: null, cue: null, sprites: null, byNumber: null,
  shots: 0, shooting: false, shotPotted: [], cueFoul: false,
  groups: { 1: null, 2: null }, openTable: true, gameOver: false, winner: null,
  firstContactBall: null, anyContact: false, anyRailAfterContact: false, shotRailBalls: new Set(),
  net: null, settled: true, cuePotted: false, ballInHand: false, kitchenOnly: false,
  opponentName: null, opponentLevel: 1, opponentTimeBonus: 0,
  timedMode: false, turnTimeLeft: 0, aimDir: null, myFouls: 0,
  sfxBall: 0, sfxRail: 0, sfxPocket: 0,
};

function updatePlayersDisplay() {
  ui.updatePlayers(game.mode, identity.getNickname(), profile.level, game.opponentName || t('rival'), game.opponentLevel);
  ui.showReactions(game.mode);
}

function vibrateTurn() {
  if (identity.getVibrateOnTurn() && navigator.vibrate) navigator.vibrate(200);
}

let app, ballLayer, fxLayer, aimLine, cueStick, frame = 0;
// { t, power, dx, dy } while the strike animation is playing, else null.
let strike = null;
let bannerQ = [], bannerBusy = false;
let lastPhysics = 0;
let shareUrl = '';

function updateShareLink(code) {
  const name = encodeURIComponent(identity.getNickname());
  shareUrl = `${location.origin}/i/${code}?n=${name}`;
  QRCode.toCanvas(document.getElementById('host-qr'), shareUrl, { width: 160, margin: 1 }, () => {});
}

async function shareInvite() {
  const text = t('shareText').replace('{name}', identity.getNickname()).replace('{code}', ui.el('host-code').textContent);
  if (navigator.share) {
    try { await navigator.share({ text, url: shareUrl }); } catch {}
    return;
  }
  try {
    await navigator.clipboard.writeText(`${text} ${shareUrl}`);
    ui.toast(t('linkCopied'));
  } catch {}
}

async function main() {
  app = new Application();
  await app.init({ width: CANVAS_W, height: CANVAS_H, backgroundColor: 0x0e2a44, antialias: true });
  app.ticker.maxFPS = 60;
  document.getElementById('app').appendChild(app.canvas);

  app.stage.addChild(drawTable());
  // fxLayer sits BELOW ballLayer so the cue stick passes behind the balls, which is what the
  // reference does and what makes the stick read as lying on the cloth rather than on top of it.
  fxLayer = new Container();
  ballLayer = new Container();
  app.stage.addChild(fxLayer, ballLayer);
  aimLine = new Graphics();
  app.stage.addChild(aimLine);

  initBallTextures(app.renderer);
  cueStick = makeCueSprite();
  fxLayer.addChild(cueStick);
  // Sparks go ABOVE the balls (the cue stick goes below), so a pot burst reads as coming out of
  // the pocket rather than from under the felt.
  const sparkLayerC = new Container();
  app.stage.addChild(sparkLayerC);
  initSparks(sparkLayerC);
  applyStatic();

  const markLang = () => document.querySelectorAll('#lang-seg .seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.lang === getLang()));
  // Icon-only buttons (no data-i18n text) still get a localized tooltip.
  const refreshIconTitles = () => {
    ui.el('btn-settings').title = t('settings');
    ui.el('btn-leagues').title = t('leaguesTitle');
    ui.el('btn-cues').title = t('cuesTitle');
    ui.el('btn-hall').title = t('hallTitle');
    ui.el('btn-shop').title = t('shopTitle');
  };
  document.querySelectorAll('#lang-seg .seg-btn').forEach((b) => {
    b.onclick = () => { audio.resume(); audio.uiClick(); setLang(b.dataset.lang); markLang(); refreshIconTitles(); refreshHud(); ui.updateTurn(game.mode, game.turn === game.myPlayer); updateMidnightWalletStatus(); };
  });
  markLang();
  refreshIconTitles();

  const nickInput = document.getElementById('nickname-input');
  nickInput.value = identity.getNickname();
  nickInput.addEventListener('change', () => {
    identity.setNickname(nickInput.value);
    nickInput.value = identity.getNickname();
    updatePlayersDisplay();
    persistProfile();
  });

  const vibrateToggle = document.getElementById('vibrate-toggle');
  vibrateToggle.checked = identity.getVibrateOnTurn();
  vibrateToggle.addEventListener('change', () => identity.setVibrateOnTurn(vibrateToggle.checked));

  setupRack();
  setupInput();
  updatePlayersDisplay();
  updateWallet();
  wireSpinGrid();
  wireEconomyMenus();
  wireMidnightMenu();
  wireInstallPrompt();

  lastPhysics = performance.now();
  setInterval(physicsLoop, 1000 / 60);
  app.ticker.add(renderFrame);

  // One timer for one countdown, and it does nothing while a match is on screen. Not a generic
  // scheduler -- the chest is the only thing in the app that counts down in real time.
  setInterval(() => {
    if (!ui.el('menu').classList.contains('hidden')) tickDailyChest();
  }, 1000);

  wireMenu();
  applyJoinLinkIfAny();

  const kick = () => {
    audio.resume();
    audio.startMusic();
    // Best-effort only — iOS Safari supports neither the Fullscreen nor the Screen Orientation
    // Lock API (even installed as a PWA), and most browsers require fullscreen before an
    // orientation lock will succeed at all. The CSS rotate overlay (index.html) is what actually
    // enforces landscape everywhere; this just hides browser chrome and locks rotation on the
    // platforms (mainly Android/Chrome) where it's available.
    const root = document.documentElement;
    const requestFs = root.requestFullscreen || root.webkitRequestFullscreen;
    try { requestFs?.call(root)?.catch?.(() => {}); } catch {}
    try { screen.orientation?.lock?.('landscape').catch(() => {}); } catch {}
    window.removeEventListener('pointerdown', kick);
  };
  window.addEventListener('pointerdown', kick);
}

function applyJoinLinkIfAny() {
  const code = new URLSearchParams(location.search).get('join');
  if (!code) return;
  history.replaceState(null, '', location.pathname);
  ui.el('join-code').value = code.toUpperCase();
  ui.setStatus('join-status', '');
  ui.showScreen('screen-join');
}

function physicsLoop() {
  const now = performance.now();
  let n = Math.round((now - lastPhysics) / (1000 / 60));
  if (n < 1) return;
  lastPhysics = now;
  if (n > 150) n = 150;
  for (let i = 0; i < n; i++) physicsFrame();
}


// ---------------------------------------------------------------------------
// Juice (docs/adr/0014). No animation dependency: GSAP is ~25KB gzipped to run a handful of tweens
// and canvas-confetti is 6KB for twenty lines of CSS. Everything here runs inside the existing
// renderFrame ticker -- no second loop, no requestAnimationFrame of its own.
// ---------------------------------------------------------------------------

// Fixed pool of spark sprites, recycled. Allocating during a break would be the one moment in the
// game where a GC pause is most visible.
const SPARKS = [];
const SPARK_COUNT = 28;
let sparkLayer = null;

function initSparks(layer) {
  sparkLayer = layer;
  for (let i = 0; i < SPARK_COUNT; i++) {
    const s = makeSpark();
    s.life = 0;
    layer.addChild(s);
    SPARKS.push(s);
  }
}

// Burst at a pocket, tinted to the ball that just went down.
function burst(x, y, colour) {
  let used = 0;
  for (const s of SPARKS) {
    if (s.life > 0) continue;
    const a = Math.random() * Math.PI * 2;
    const sp = 1.4 + Math.random() * 2.6;
    s.vx = Math.cos(a) * sp;
    s.vy = Math.sin(a) * sp;
    s.life = 1;
    s.tint = colour;
    s.position.set(x, y);
    s.scale.set(0.5 + Math.random() * 0.5);
    s.alpha = 1;
    s.visible = true;
    if (++used >= 9) break;
  }
}

function stepSparks() {
  for (const s of SPARKS) {
    if (s.life <= 0) continue;
    s.life -= 0.055;
    if (s.life <= 0) { s.visible = false; continue; }
    s.x += s.vx;
    s.y += s.vy;
    s.vx *= 0.92;
    s.vy *= 0.92;
    s.alpha = s.life;
    s.scale.set(s.life * 0.9);
  }
}

// Balls used to vanish the instant they were potted. Shrinking them into the pocket over a few
// frames is the cheapest feel-per-line change in the whole overhaul.
const SINKING = new Map();
function sinkBall(spr) { SINKING.set(spr, 1); }

function stepSinking() {
  for (const [spr, life] of SINKING) {
    const next = life - 0.13;
    if (next <= 0) { spr.visible = false; spr.scale.set(1); spr.alpha = 1; SINKING.delete(spr); continue; }
    SINKING.set(spr, next);
    spr.visible = true;
    spr.scale.set(next);
    spr.alpha = next;
  }
}

// Screen shake on the break. A CSS keyframe on the canvas element rather than moving the Pixi
// stage: compositor-only, and safe because canShoot() is false while the balls are moving, so no
// pointer maths reads the shifted bounding box mid-shake.
function shakeCanvas() {
  const c = app.canvas;
  c.classList.remove('shake');
  void c.offsetWidth;
  c.classList.add('shake');
  c.addEventListener('animationend', () => c.classList.remove('shake'), { once: true });
}

// Coins flying to a target element. DOM, because they cross stacking contexts the canvas cannot
// reach -- from the game-over modal out to the lobby wallet chip.
function flyCoins(toEl, n = 8) {
  if (!toEl) return;
  const r = toEl.getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i');
    c.className = 'coin-fly';
    c.style.setProperty('--i', i);
    c.style.setProperty('--tx', `${r.left + r.width / 2}px`);
    c.style.setProperty('--ty', `${r.top + r.height / 2}px`);
    c.style.setProperty('--sx', `${(Math.random() - 0.5) * 40}vw`);
    c.style.setProperty('--sy', `${(Math.random() - 0.5) * 30}vh`);
    document.body.appendChild(c);
    c.addEventListener('animationend', () => c.remove(), { once: true });
  }
}

function confetti(n = 40) {
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i');
    c.className = 'confetti';
    c.style.setProperty('--x', `${Math.random() * 100}vw`);
    c.style.setProperty('--r', `${Math.random() * 360}deg`);
    c.style.setProperty('--d', `${1.6 + Math.random() * 1.4}s`);
    c.style.setProperty('--delay', `${Math.random() * 0.5}s`);
    c.style.background = ['#ffd15a', '#4ee892', '#5aa6ff', '#ff5a91', '#c78bff'][i % 5];
    document.body.appendChild(c);
    c.addEventListener('animationend', () => c.remove(), { once: true });
  }
}

function physicsFrame() {
  if (game.mode === 'guest') return;
  const audible = !document.hidden;
  const { potted, hits } = step(game.balls);

  for (const h of hits) {
    if (h.type === 'ball') {
      if (audible) audio.ballHit(h.speed);
      game.sfxBall = Math.max(game.sfxBall, h.speed);
      if (h.a === 0 || h.b === 0) {
        game.anyContact = true;
        if (game.firstContactBall === null) game.firstContactBall = h.a === 0 ? h.b : h.a;
      }
    } else {
      if (audible) audio.railHit(h.speed);
      game.sfxRail = Math.max(game.sfxRail, h.speed);
      if (game.firstContactBall !== null) game.anyRailAfterContact = true;
      if (h.ball !== 0) game.shotRailBalls.add(h.ball);
    }
  }

  for (const b of potted) {
    if (audible) audio.pocket();
    game.sfxPocket++;
    game.shotPotted.push(b.number);
    if (b.number === 0) game.cueFoul = true;
    burst(b.x, b.y, BALL_COLORS[b.number] || 0xffffff);
    const spr = game.sprites.get(b);
    if (spr) sinkBall(spr);
  }

  // The break is the one shot that should feel like it hit something.
  if (game.shots === 1 && game.sfxBall > 22 && !document.hidden) shakeCanvas();

  if (potted.length) refreshHud();
  if (game.shooting && allStopped(game.balls)) {
    if (game.mode === 'host') resolveTurn();
    else resolveSoloShot();
  }

  // Quick Match only — the clock runs whenever it's this player's turn to act (aiming OR placing
  // a ball-in-hand — pausing for placement would let a player stall indefinitely by exploiting
  // it), pausing only while balls are actually in motion (`game.shooting`). Only the host ticks
  // it; the guest just displays whatever sendState() tells it, avoiding clock drift between two
  // independently-running timers.
  if (game.timedMode && game.mode === 'host' && game.started && !game.shooting && !game.gameOver) {
    game.turnTimeLeft -= 1 / 60;
    if (game.turnTimeLeft <= 0) {
      game.turnTimeLeft = 0;
      game.cueFoul = true;
      resolveTurn();
    }
  }

  if (game.mode === 'host' && game.started && game.net && (++frame % 2 === 0)) sendState();
}

function renderFrame() {
  const guest = game.mode === 'guest';
  stepSparks();
  stepSinking();
  for (const [ball, spr] of game.sprites) {
    // A ball mid-sink is still drawn; SINKING owns its visibility until the animation finishes.
    if (!SINKING.has(spr)) spr.visible = !ball.potted;
    if (ball.potted) continue;
    if (guest) {
      ball.x += ((ball.tx ?? ball.x) - ball.x) * 0.35;
      ball.y += ((ball.ty ?? ball.y) - ball.y) * 0.35;
    } else {
      const sp = Math.hypot(ball.vx, ball.vy);
      spr.spin.rotation += (ball.vx >= 0 ? 1 : -1) * sp * 0.04;
    }
    spr.position.set(ball.x, ball.y);
  }
  // Cue strike: 75ms of forward thrust from the pulled-back position, then the stick is gone.
  // Rides this ticker rather than adding a second loop or a tween library.
  if (strike) {
    strike.t += 1 / 60;
    const k = Math.min(1, strike.t / 0.075);
    placeCueStick(cueStick, game.cue, strike.dx, strike.dy, strike.power * (1 - k) - k * 0.04);
    if (strike.t > 0.13) { strike = null; cueStick.visible = false; }
  }

  // The ring needs the turn's full duration to render a fraction, and that duration depends on
  // whose turn it is -- each side's equipped cue carries its own timeBonus.
  const turnBase = 60 + (game.turn === game.myPlayer ? equippedCue().timeBonus : game.opponentTimeBonus);
  ui.updateTimer(game.turnTimeLeft, game.timedMode && game.started && !game.gameOver, turnBase);
}

function setupRack() {
  ballLayer.removeChildren();
  game.balls = rack();
  game.cue = game.balls.find((b) => b.number === 0);
  game.sprites = new Map();
  game.byNumber = new Map();

  for (const b of game.balls) {
    const v = buildBallVisual(b);
    game.sprites.set(b, v);
    game.byNumber.set(b.number, { ball: b, spr: v });
    ballLayer.addChild(v);
  }
  for (const b of game.balls) {
    b.tx = b.x;
    b.ty = b.y;
  }

  game.shots = 0;
  game.shooting = false;
  game.shotPotted = [];
  game.cueFoul = false;
  game.gameOver = false;
  game.winner = null;
  game.ballInHand = false;
  // A fresh rack must not inherit the last rack's aim, or the guide points somewhere the player
  // never chose the moment the table appears.
  game.aimDir = null;
  game.myFouls = 0;
  powerFrac = 0;
  ui.hideGameOver();
  refreshHud();
}

function refreshHud() {
  // The shots/potted counters and the solids-stripes pill are gone (docs/adr/0014) -- the rack of
  // ball dots already carries both, so this is now just the rack plus the stake chip.
  ui.updateBallsLeft(game.mode, game.balls, game.groups, game.myPlayer);
  ui.setPot(game.stakeAmount > 0 ? game.stakeAmount * 2 : 0);
  // The aim guide, cue stick and power rail are all gated on canShoot(), and every path that can
  // change that answer -- a shot landing, a turn passing, a rack being set, ball-in-hand being
  // granted -- already calls through here. One hook instead of six call sites.
  syncShotControls();
}

function canShoot() {
  if (game.gameOver || game.ballInHand) return false;
  const stopped = game.mode === 'guest' ? game.settled : allStopped(game.balls);
  if (!stopped) return false;
  if (game.mode === 'guest') return !game.cuePotted && game.turn === game.myPlayer;
  if (game.cue.potted) return false;
  if (game.mode === 'solo') return true;
  return game.turn === game.myPlayer;
}

function canPlaceCue() {
  if (game.gameOver || !game.ballInHand) return false;
  const stopped = game.mode === 'guest' ? game.settled : allStopped(game.balls);
  if (!stopped) return false;
  if (game.mode === 'solo') return true;
  return game.turn === game.myPlayer;
}

// Called on every pointermove during a ball-in-hand drag — cheap (just clamping/collision-avoidance
// math), local-only, no network traffic. Lets the player reposition freely, as many times as they
// want, before committing (matching physics.placeCue's own doc comment on this).
function previewCuePlacement(x, y) {
  placeCue(game.cue, game.balls, x, y, game.kitchenOnly ? HEAD_STRING_X : undefined);
  game.cue.tx = game.cue.x;
  game.cue.ty = game.cue.y;
}

function commitCuePlacement(x, y) {
  previewCuePlacement(x, y);
  game.ballInHand = false;
  game.kitchenOnly = false;
  ui.el('hint').textContent = t('aimHint');
  ui.showHint();
}

function placeCueAt(x, y) {
  if (game.mode === 'guest') {
    game.net.send({ type: 'place', x, y });
    return;
  }
  commitCuePlacement(x, y);
  if (game.mode === 'host') sendState();
}

function doShoot(dx, dy, power, spin = { x: 0, y: 0 }) {
  // Guest-side physics verification (docs/adr/0010): only the host runs step()/shoot(), so before
  // mutating anything, snapshot the resting positions and broadcast them + the exact inputs. The
  // guest replays the same deterministic loop locally and diffs it against the state this shot
  // eventually settles into -- catching a host that fabricates a shot's outcome, the gap ADR-0008
  // left open. Fire-and-forget: never gates or delays this shot either way.
  if (game.mode === 'host' && game.net) {
    game.net.send({
      type: 'shotInput', dx, dy, power, spin,
      pre: game.balls.map((b) => ({ number: b.number, x: b.x, y: b.y, potted: b.potted })),
    });
  }
  shoot(game.cue, dx, dy, power, spin);
  audio.cueStrike();
  game.shots++;
  game.shooting = true;
  game.shotPotted = [];
  game.cueFoul = false;
  game.firstContactBall = null;
  game.anyContact = false;
  game.anyRailAfterContact = false;
  game.shotRailBalls = new Set();
  refreshHud();
  ui.hideHint();
}

function resolveSoloShot() {
  game.shooting = false;
  if (game.cueFoul || game.shotPotted.includes(0)) {
    game.ballInHand = true;
    ui.el('hint').textContent = t('placeCueHint');
    ui.showHint();
  }
  game.shotPotted = [];
  game.cueFoul = false;
  refreshHud();
}

function resolveTurn() {
  game.shooting = false;
  const shooter = game.turn;
  const shooterGroup = game.groups[shooter];
  const potted = game.shotPotted;
  const groupCleared = shooterGroup
    ? game.balls.filter((b) => groupOf(b.number) === shooterGroup && !b.potted).length === 0
    : false;

  const result = resolveShot({
    shooter,
    openTable: game.openTable,
    shooterGroup,
    groups: game.groups,
    potted,
    firstContactBall: game.firstContactBall,
    anyContact: game.anyContact,
    anyRailAfterContact: game.anyRailAfterContact,
    cueFoul: game.cueFoul || potted.includes(0),
    groupCleared,
    isBreakShot: game.shots === 1,
    ballsToRail: game.shotRailBalls.size,
  });

  game.openTable = result.openTable;
  game.groups = result.groups;

  if (result.gameOver) {
    endGame(result.winner);
    return;
  }

  if (result.foul && shooter === game.myPlayer) game.myFouls++;
  if (!result.keepShooting) game.turn = other(shooter);
  game.ballInHand = result.foul;
  game.kitchenOnly = result.kitchenOnly;
  game.shotPotted = [];
  game.cueFoul = false;
  resetTurnTimer();
  refreshHud();
  announceTurn();
  sendState();
}

// Each side awards its OWN local profile from its OWN perspective of the result — there's no
// shared/server-authoritative economy, so this runs independently on host and guest. Solo practice
// deliberately doesn't award anything: it has no natural match-completion boundary (no win/loss,
// just an open-ended rack you can restart anytime), and awarding on restart would be exploitable.
function awardMatchResult(winner) {
  if (game.mode === 'solo') return null;
  const won = winner === game.myPlayer;
  const award = economy.awardForMatch({ mode: game.mode, won });
  // Snapshot before mutating: the celebration animates the XP bar from where the player was to
  // where they ended up, which needs both.
  const before = { xp: profile.xp, level: profile.level };
  profile = economy.applyAward(profile, award);
  profile.pass.points += award.xp || 0;
  if (game.stakeAmount > 0 && game.currentMatchId) {
    profile = economy.applyStake(profile, won, game.stakeAmount);
    mnHooks.hookAttestResult({ matchId: game.currentMatchId, role: game.myPlayer, winner });
  }
  persistProfile();
  mnHooks.hookCommitStats(profile);
  reportMatchResultToRelay(winner);

  const stakeDelta = game.stakeAmount > 0 ? (won ? game.stakeAmount : -game.stakeAmount) : 0;
  return {
    won,
    coins: (award.coins || 0) + stakeDelta,
    xpFrom: before.xp, xpTo: profile.xp, xpNeed: economy.xpToNext(profile.level),
    levelFrom: before.level, levelTo: profile.level,
  };
}

// Both peers independently POST their own view of the result to the relay
// (docs/adr/0009) -- once the server sees two sides agree, it'll sign this
// player's (pk, level, wins) on request, disclosed alongside the existing
// commitStats commitment as a real, checkable server attestation. Never
// blocks or gates anything; a slow/unreachable relay just means no receipt.
function reportMatchResultToRelay(winner) {
  if (!game.currentMatchId) return;
  const pk = mnHooks.getPublicKey();
  mnAttest.attestMatchResult({
    matchId: game.currentMatchId, pk, role: game.myPlayer, winner,
    level: profile.level, wins: profile.wins || 0,
  }).then(() => mnAttest.fetchStatsSignature(pk)).then((sig) => {
    if (sig) mnAudit.record({ circuit: 'serverSignedStats', mode: 'server', disclosed: sig, ok: true });
  });
}

function endGame(winner) {
  game.gameOver = true;
  game.winner = winner;
  const award = awardMatchResult(winner);
  refreshHud();
  showEndBanner(award);
  sendState();
}

// `award` is whatever awardMatchResult returned (null in solo, which has no match economy).
function showEndBanner(award) {
  const won = game.winner === game.myPlayer;
  const text = won ? t('won') : t('lost');
  ui.banner(text);

  // Stars are earned, not decorative: one for the win, one for leaving the opponent on a full rack,
  // one for a foul-free match.
  let stars = 0;
  if (won) {
    stars = 1;
    const oppGroup = game.groups[other(game.myPlayer)];
    const oppLeft = oppGroup
      ? game.balls.filter((b) => groupOf(b.number) === oppGroup && !b.potted).length
      : 7;
    if (oppLeft === 7) stars++;
    if (game.myFouls === 0) stars++;
  }

  ui.showGameOver({ won, text, stars, ...(award || {}) });
  won ? audio.win() : audio.lose();
  if (won) { confetti(); flyCoins(document.getElementById('gameover-coins')); }
}

function announceTurn() {
  ui.updateTurn(game.mode, game.turn === game.myPlayer);
  if (game.ballInHand && game.turn === game.myPlayer) {
    queueBanner(t('ballInHandYou'));
    ui.el('hint').textContent = t('placeCueHint');
    ui.showHint();
  } else {
    queueBanner(game.turn === game.myPlayer ? t('yourTurn') : t('rivalTurn'));
  }
  if (game.turn === game.myPlayer) {
    audio.turnChime();
    vibrateTurn();
  }
  maybeNotifyTurn();
}

// Pot shown on the VS screen is the real number: the actual stake pot, or the actual win reward.
// Never a decorative figure.
function vsData() {
  return {
    meName: identity.getNickname(),
    meLevel: profile.level,
    oppName: game.opponentName || t('rival'),
    oppLevel: game.opponentLevel,
    pot: game.stakeAmount > 0
      ? game.stakeAmount * 2
      : economy.awardForMatch({ mode: game.mode, won: true }).coins,
  };
}

function announceGroupAndTurn() {
  const mg = game.groups[game.myPlayer];
  queueBanner(game.openTable ? t('tableOpen') : mg === 'stripes' ? t('mustStripes') : t('mustSolids'));
  queueBanner(game.turn === game.myPlayer ? t('yourTurn') : t('rivalTurn'));
  ui.updateTurn(game.mode, game.turn === game.myPlayer);
  if (game.turn === game.myPlayer) {
    audio.turnChime();
    vibrateTurn();
    maybeNotifyTurn();
  }
  refreshHud();
}

function queueBanner(text) {
  bannerQ.push(text);
  if (!bannerBusy) nextBanner();
}

function nextBanner() {
  if (!bannerQ.length) {
    bannerBusy = false;
    return;
  }
  bannerBusy = true;
  ui.banner(bannerQ.shift());
  setTimeout(nextBanner, 2500);
}

function stopBanners() {
  bannerQ = [];
  bannerBusy = false;
  ui.clearBanner();
}

function maybeNotifyTurn() {
  if (game.mode === 'solo' || game.turn !== game.myPlayer || !document.hidden) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification('Pool', { body: t('notifTurnBody'), tag: 'pool-turn', renotify: true });
  } catch {}
}

function maybeAskNotifications() {
  return new Promise((resolve) => {
    if (!('Notification' in window) || Notification.permission !== 'default') {
      resolve();
      return;
    }
    const m = ui.el('notif-modal'), a = ui.el('notif-accept'), r = ui.el('notif-reject');
    m.classList.add('show');
    const close = () => {
      m.classList.remove('show');
      a.onclick = null;
      r.onclick = null;
    };
    a.onclick = async () => {
      close();
      try {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          audio.notify();
          ui.toast(t('notifEnabled'));
        }
      } catch {}
      resolve();
    };
    r.onclick = () => {
      close();
      resolve();
    };
  });
}

function sendState() {
  game.net.send({
    type: 'state', turn: game.turn, settled: allStopped(game.balls), cuePotted: game.cue.potted,
    ballInHand: game.ballInHand, kitchenOnly: game.kitchenOnly, openTable: game.openTable,
    turnTimeLeft: game.turnTimeLeft,
    shots: game.shots, groups: game.groups, gameOver: game.gameOver, winner: game.winner,
    sfx: { b: game.sfxBall, r: game.sfxRail, p: game.sfxPocket },
    balls: game.balls.map((b) => ({ n: b.number, x: b.x, y: b.y, r: game.sprites.get(b).spin.rotation, p: b.potted })),
  });
  game.sfxBall = 0;
  game.sfxRail = 0;
  game.sfxPocket = 0;
}

function applyState(m) {
  const prevTurn = game.turn, prevOver = game.gameOver;
  game.turn = m.turn;
  game.settled = m.settled;
  game.cuePotted = m.cuePotted;
  game.shots = m.shots;
  game.groups = m.groups;
  game.openTable = m.openTable;
  game.gameOver = m.gameOver;
  game.winner = m.winner;
  game.ballInHand = m.ballInHand;
  game.kitchenOnly = m.kitchenOnly;
  if (game.timedMode) game.turnTimeLeft = m.turnTimeLeft;

  for (const bs of m.balls) {
    const e = game.byNumber.get(bs.n);
    if (!e) continue;
    e.ball.tx = bs.x;
    e.ball.ty = bs.y;
    e.ball.potted = bs.p;
    e.spr.spin.rotation = bs.r;
  }

  if (m.sfx && !document.hidden) {
    if (m.sfx.b > 0) audio.ballHit(m.sfx.b);
    if (m.sfx.r > 0) audio.railHit(m.sfx.r);
    for (let i = 0; i < m.sfx.p; i++) audio.pocket();
  }

  // The first settled snapshot after a pending replay is the host's authoritative final state for
  // that shot (docs/adr/0010) -- diff it and clear, regardless of outcome, so a stalled/mismatched
  // replay can never accumulate across shots.
  if (game.pendingReplay && m.settled) {
    const mismatches = diffFinalState(game.pendingReplay, m.balls);
    mnAudit.record({
      circuit: 'guestPhysicsVerification', mode: 'p2p',
      disclosed: { matchId: game.currentMatchId, mismatchCount: mismatches.length },
      ok: mismatches.length === 0,
      ...(mismatches.length ? { note: JSON.stringify(mismatches) } : {}),
    });
    game.pendingReplay = null;
  }

  refreshHud();
  ui.updateTurn(game.mode, game.turn === game.myPlayer);

  if (m.turn !== prevTurn) {
    if (game.ballInHand && game.turn === game.myPlayer) {
      queueBanner(t('ballInHandYou'));
      ui.el('hint').textContent = t('placeCueHint');
      ui.showHint();
    } else {
      queueBanner(game.turn === game.myPlayer ? t('yourTurn') : t('rivalTurn'));
    }
    if (game.turn === game.myPlayer) {
      audio.turnChime();
      vibrateTurn();
    }
    maybeNotifyTurn();
  }

  if (game.gameOver && !prevOver) {
    showEndBanner(awardMatchResult(game.winner));
  }
}

// Two-stage shot input (docs/adr/0017), matching the reference:
//   stage 1  drag anywhere on the table  -> sets the ANGLE only
//   stage 2  drag the power slider       -> sets power; releasing it shoots
//
// Why: with one gesture your thumb sits on the table while you aim, covering the very thing you
// are trying to line up. Splitting them keeps the table clear during aiming and puts power on a
// control at the edge of the screen. It is worth the rebuild only if it feels better in the hand,
// so that is the thing to check on a real device.
//
// Aiming semantics are deliberately UNCHANGED -- the direction is still (cue ball - pointer), the
// pull-back metaphor -- so existing muscle memory survives and only the power source moves.
//
// The net protocol is untouched: a guest still sends { type: 'shoot', dx, dy, power, spin }. Only
// the local gesture that produces those four values changed.
function setupInput() {
  let aiming = false;
  let placingCue = false;
  let slidingPower = false;

  const pos = (e) => {
    const r = app.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (app.canvas.width / r.width), y: (e.clientY - r.top) * (app.canvas.height / r.height) };
  };

  const redrawAim = () => {
    if (!game.aimDir || !canShoot()) return;
    drawAim(aimLine, game.balls, game.cue, game.aimDir.x, game.aimDir.y, equippedCue().aimBonus);
    placeCueStick(cueStick, game.cue, game.aimDir.x, game.aimDir.y, powerFrac);
  };

  const setAimFromPointer = (p) => {
    const dx = game.cue.x - p.x, dy = game.cue.y - p.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;                       // a tap on the ball itself carries no direction
    game.aimDir = { x: dx / len, y: dy / len };
    redrawAim();
  };

  // ---- stage 1: angle, on the table ----
  app.canvas.addEventListener('pointerdown', (e) => {
    if (!document.hasFocus()) return;
    const p = pos(e);
    if (canPlaceCue()) {
      placingCue = true;
      previewCuePlacement(p.x, p.y);
      return;
    }
    if (!canShoot()) return;
    aiming = true;
    setAimFromPointer(p);
  });

  window.addEventListener('pointermove', (e) => {
    if (placingCue) {
      const p = pos(e);
      previewCuePlacement(p.x, p.y);
      return;
    }
    if (aiming) setAimFromPointer(pos(e));
  });

  window.addEventListener('pointerup', () => {
    if (placingCue) {
      // Free drag-and-reposition, not tap-to-place: the final position is already set by the last
      // previewCuePlacement() call above, live throughout the drag. Releasing just commits it --
      // canPlaceCue() stays true until an actual shot is taken, so a new pointerdown on the ball
      // starts another placement attempt, naturally allowing as many repositions as wanted.
      placingCue = false;
      placeCueAt(game.cue.x, game.cue.y);
      syncShotControls();
      return;
    }
    aiming = false;
  });

  // ---- stage 2: power, on the slider ----
  const slider = document.getElementById('power-slider');

  const powerFromPointer = (e) => {
    const r = slider.getBoundingClientRect();
    const frac = 1 - (e.clientY - r.top) / r.height;
    powerFrac = Math.max(0, Math.min(1, frac));
    setPower(powerFrac);
    redrawAim();
  };

  slider.addEventListener('pointerdown', (e) => {
    if (!canShoot() || !game.aimDir) return;
    slidingPower = true;
    slider.setPointerCapture(e.pointerId);
    audio.resume();
    powerFromPointer(e);
  });

  slider.addEventListener('pointermove', (e) => { if (slidingPower) powerFromPointer(e); });

  const releasePower = () => {
    if (!slidingPower) return;
    slidingPower = false;
    if (!canShoot() || !game.aimDir) return;
    // Below this the player is cancelling, not tapping a feather shot -- snapping back to zero is
    // kinder than launching a shot they did not mean to take.
    if (powerFrac < 0.04) { powerFrac = 0; setPower(0); redrawAim(); return; }

    // Scaled here, at the sending side, with the shooter's OWN local cue stats -- each player's
    // profile is local-only, so the host can't look up the guest's equipped cue. This way the
    // message already carries the effective, fairness-capped values regardless of who shoots.
    const cue = equippedCue();
    const dx = game.aimDir.x, dy = game.aimDir.y;
    const power = Math.pow(powerFrac, POWER_CURVE) * cue.powerMult;
    const spin = { x: currentSpin.x * cue.spinCap, y: currentSpin.y * cue.spinCap };

    strike = { t: 0, power: powerFrac, dx, dy };
    if (game.mode === 'guest') game.net.send({ type: 'shoot', dx, dy, power, spin });
    else doShoot(dx, dy, power, spin);

    powerFrac = 0;
    setPower(0, false);
    aimLine.clear();
  };

  slider.addEventListener('pointerup', releasePower);
  slider.addEventListener('pointercancel', releasePower);
}

// Shows or hides the aim guide, cue stick and power rail to match whether a shot is possible right
// now. Called wherever turn/settled state changes rather than polled every frame.
function syncShotControls() {
  const ready = canShoot();
  setPower(ready ? powerFrac : 0, ready);
  if (!ready) {
    aimLine.clear();
    if (!strike) cueStick.visible = false;
    return;
  }
  if (game.aimDir) {
    drawAim(aimLine, game.balls, game.cue, game.aimDir.x, game.aimDir.y, equippedCue().aimBonus);
    placeCueStick(cueStick, game.cue, game.aimDir.x, game.aimDir.y, powerFrac);
  }
}

function closeNet() {
  if (game.net) {
    game.net.close();
    game.net = null;
  }
  game.started = false;
}

function leaveGame() {
  const wasMulti = game.mode !== 'solo';
  closeNet();
  game.mode = 'solo';
  stopBanners();
  ui.hideGameOver();
  ui.backToMenu();
  document.getElementById('spin-widget').classList.remove('show');
  if (wasMulti) ui.toast(t('youLeft'));
}

function onMessage(m) {
  if (m.type === 'start' && game.mode === 'guest') {
    setupRack();
    game.groups = m.groups;
    game.openTable = m.openTable;
    game.turn = m.turn;
    game.started = true;
    game.gameOver = false;
    game.opponentName = m.hostName || game.opponentName;
    game.opponentLevel = m.hostLevel || 1;
    game.opponentTimeBonus = m.hostTimeBonus || 0;
    game.timedMode = !!m.timedMode;
    game.turnTimeLeft = game.timedMode ? 60 + (game.turn === game.myPlayer ? equippedCue().timeBonus : game.opponentTimeBonus) : 0;
    game.currentMatchId = m.matchId || null;
    game.stakeAmount = m.stake || 0;
    openStakeIfAny(2);
    if (game.stakeAmount > 0) ui.toast(t('stakingToast').replace('{amount}', game.stakeAmount));
    updatePlayersDisplay();
    ui.enterGame();
    syncSpinGrid();
    maybeAskNotifications().then(() => ui.vsIntro(vsData())).then(announceGroupAndTurn);
  } else if (m.type === 'state' && game.mode === 'guest') {
    applyState(m);
  } else if (m.type === 'shotInput' && game.mode === 'guest') {
    game.pendingReplay = replayShot(m.pre, { dx: m.dx, dy: m.dy, power: m.power, spin: m.spin });
  } else if (m.type === 'hello') {
    game.opponentName = m.name;
    game.opponentLevel = m.level || 1;
    game.opponentTimeBonus = m.timeBonus || 0;
    updatePlayersDisplay();
    // The host shows the VS screen before knowing who joined -- waiting on `hello` would hang match
    // start if a peer never sent one. The name pops in mid-animation instead, which reads as
    // intentional rather than as a stall.
    ui.vsUpdateOpponent(game.opponentName, game.opponentLevel);
  } else if (m.type === 'reaction') {
    ui.toast(m.emoji);
  } else if (m.type === 'shoot' && game.mode === 'host' && game.turn === 2 && !game.gameOver) {
    doShoot(m.dx, m.dy, m.power, m.spin);
  } else if (m.type === 'place' && game.mode === 'host' && game.turn === 2 && game.ballInHand) {
    commitCuePlacement(m.x, m.y);
    sendState();
  } else if (m.type === 'restart' && game.mode === 'host') {
    restartHostRack();
  } else if (m.type === 'breakCommit' && m.role === 1 && game.mode === 'guest' && !game.pendingBreakNegotiation) {
    // Guest's half of the break-order handshake (breakOrder.js): the host just
    // sent its fixed commitment, matchId included, so this is where the guest
    // learns about the negotiation and joins in.
    const { promise, handleMessage } = breakOrder.negotiate({ role: 2, matchId: m.matchId, send: (msg) => game.net.send(msg) });
    game.pendingBreakNegotiation = handleMessage;
    handleMessage(m);
    promise
      .then(({ winner }) => mnHooks.hookRecordBreakOrder({ matchId: m.matchId, role: 2, winner }))
      .catch(() => {})
      .finally(() => { game.pendingBreakNegotiation = null; });
  } else if ((m.type === 'breakCommit' || m.type === 'breakReveal') && game.pendingBreakNegotiation) {
    game.pendingBreakNegotiation(m);
  }
}

function newMatchGroups() {
  game.groups = { 1: null, 2: null };
  game.openTable = true;
  game.turn = 1; // fallback -- negotiateBreakOrder() below overrides this before 'start' is sent
  resetTurnTimer();
}

// Provably-fair break order (docs/adr/0006): host and guest run a 3-message
// commit-reveal handshake over the existing P2P channel (breakOrder.js) so the
// host can no longer just always break first. This only runs for the host --
// the guest never decides `turn` locally, it just receives whatever 'start'
// says, same as before; the guest's half of the handshake lives in onMessage.
// The result is also fire-and-forget into The Rail and, when a wallet is connected,
// the Compact break circuits (hookRecordBreakOrder). This call never gates the rack.
// A peer that doesn't respond within the timeout forfeits the flip back to "host breaks".
async function negotiateBreakOrder() {
  if (game.mode !== 'host') return;
  const matchId = breakOrder.toHex(breakOrder.newMatchId());
  game.currentMatchId = matchId;
  const { promise, handleMessage } = breakOrder.negotiate({
    role: 1,
    matchId,
    send: (m) => game.net.send(m),
  });
  game.pendingBreakNegotiation = handleMessage;
  try {
    const { winner } = await promise;
    game.turn = winner;
    mnHooks.hookRecordBreakOrder({ matchId, role: 1, winner });
  } catch {
    game.turn = 1;
    mnAudit.record({ circuit: 'resolveBreak', mode: 'p2p', disclosed: { matchId }, ok: false, note: 'negotiation timed out, defaulted to host breaking' });
  } finally {
    game.pendingBreakNegotiation = null;
  }
}

// Match stakes (docs/adr/0008) -- host-created (code-based) matches only, never Quick
// Match (game.stakeEligible is only ever set true by startHost()). Recording the
// open is fire-and-forget audit only; the actual Coins transfer happens client-side
// in awardMatchResult() regardless of whether this call ever lands anywhere.
function openStakeIfAny(role) {
  if (game.stakeAmount > 0 && game.currentMatchId) {
    mnHooks.hookOpenStake({ matchId: game.currentMatchId, role, amount: game.stakeAmount });
  }
}

async function hostJoinedHandler() {
  setupRack();
  newMatchGroups();
  game.stakeAmount = game.stakeEligible ? Math.max(0, parseInt(ui.el('stake-amount').value, 10) || 0) : 0;
  await negotiateBreakOrder();
  openStakeIfAny(1);
  game.started = true;
  game.opponentName = null;
  updatePlayersDisplay();
  audio.notify();
  ui.toast(t('rivalJoined'));
  ui.enterGame();
  syncSpinGrid();
  game.net.send({ type: 'start', groups: game.groups, openTable: game.openTable, turn: game.turn, matchId: game.currentMatchId, stake: game.stakeAmount, hostName: identity.getNickname(), hostLevel: profile.level, hostTimeBonus: equippedCue().timeBonus, timedMode: game.timedMode });
  sendState();
  maybeAskNotifications().then(() => ui.vsIntro(vsData())).then(announceGroupAndTurn);
}

async function restartHostRack() {
  setupRack();
  stopBanners();
  newMatchGroups();
  await negotiateBreakOrder();
  openStakeIfAny(1);
  game.net.send({ type: 'start', groups: game.groups, openTable: game.openTable, turn: game.turn, matchId: game.currentMatchId, stake: game.stakeAmount, hostName: identity.getNickname(), hostLevel: profile.level, hostTimeBonus: equippedCue().timeBonus, timedMode: game.timedMode });
  sendState();
  announceGroupAndTurn();
}

function guestConnectedHandler() {
  game.net.send({ type: 'hello', name: identity.getNickname(), level: profile.level, timeBonus: equippedCue().timeBonus });
}

function startHost() {
  closeNet();
  game.mode = 'host';
  game.myPlayer = 1;
  game.timedMode = false;
  game.stakeEligible = true;
  ui.el('host-code').textContent = '····';
  game.net = host({
    ready: (code) => { ui.el('host-code').textContent = code; updateShareLink(code); },
    joined: hostJoinedHandler,
    message: onMessage,
    left: () => ui.toast(t('rivalLeft')),
    error: () => {},
  });
}

function startJoin() {
  const code = ui.el('join-code').value.trim().toUpperCase();
  if (code.length < 4) {
    ui.setStatus('join-status', t('code4'), true);
    return;
  }
  closeNet();
  game.mode = 'guest';
  game.myPlayer = 2;
  game.timedMode = false;
  ui.setStatus('join-status', t('connecting'));
  game.net = join(code, {
    connected: () => { ui.setStatus('join-status', t('waitingHost')); guestConnectedHandler(); },
    message: onMessage,
    left: () => ui.setStatus('join-status', t('closed'), true),
    error: () => ui.setStatus('join-status', t('notFound'), true),
  });
}

function startQuickMatch() {
  closeNet();
  game.timedMode = true;
  game.stakeEligible = false;
  ui.setStatus('quick-status', t('searching'));
  game.net = findMatch(identity.getNickname(), {
    assigned: (role) => {
      game.mode = role === 'host' ? 'host' : 'guest';
      game.myPlayer = role === 'host' ? 1 : 2;
    },
    ready: () => {},
    joined: hostJoinedHandler,
    connected: () => { ui.setStatus('quick-status', t('waitingHost')); guestConnectedHandler(); },
    message: onMessage,
    left: () => ui.toast(t('rivalLeft')),
    error: () => ui.setStatus('quick-status', t('notFound'), true),
    timeout: () => ui.setStatus('quick-status', t('quickTimeout'), true),
  });
}

function renderDailyModal() {
  const claimable = dailyReward.canClaim(profile.streak);
  const nextDay = (profile.streak.day % 7) + 1;
  const days = ui.el('daily-days');
  days.innerHTML = '';
  for (let d = 1; d <= 7; d++) {
    const pip = document.createElement('div');
    pip.className = 'pip' + (profile.streak.lastClaim && d <= profile.streak.day ? ' done' : '') + (d === nextDay && claimable ? ' today' : '');
    pip.textContent = d;
    days.appendChild(pip);
  }
  ui.el('daily-claim').disabled = !claimable;
  ui.el('daily-status').textContent = claimable ? '' : t('alreadyClaimedToday');
}

function renderCuesModal() {
  const list = ui.el('cues-list');
  list.innerHTML = '';
  for (const cue of allCues()) {
    const owned = profile.cues.owned.includes(cue.id);
    const equipped = profile.cues.equipped === cue.id;
    const row = document.createElement('div');
    row.className = `item-row rarity-${cue.rarity}`;
    const info = document.createElement('div');
    info.className = 'info';
    const spinTxt = cue.spinCap ? `${Math.round(cue.spinCap * 100)}%` : '—';
    const verifiedBadge = owned && mnHooks.isCueClaimed(cue.id)
      ? `<span class="midnight-badge">${t('midnightVerified')}</span>` : '';
    info.innerHTML = `<span class="name">${cue.name}${verifiedBadge}</span><span class="sub">Power +${Math.round((cue.powerMult - 1) * 100)}% · Aim +${cue.aimBonus} · Spin ${spinTxt}</span>`;
    row.appendChild(info);
    const btn = document.createElement('button');
    btn.className = 'btn btn--compact';
    if (equipped) {
      btn.textContent = t('equipped');
      btn.disabled = true;
    } else if (owned) {
      btn.textContent = t('equip');
      btn.onclick = () => { profile.cues.equipped = cue.id; persistProfile(); renderCuesModal(); };
    } else {
      const cost = upgradeCost(cue);
      btn.textContent = `${t('unlock')} (${cue.piecesNeeded}\u{1F9E9} ${cost}\u{1FA99})`;
      btn.disabled = profile.cues.pieces < cue.piecesNeeded || profile.coins < cost;
      btn.onclick = () => {
        profile.cues.pieces -= cue.piecesNeeded;
        profile.coins -= cost;
        profile.cues.owned.push(cue.id);
        persistProfile();
        mnHooks.hookClaimCue(cue.id);
        renderCuesModal();
      };
    }
    row.appendChild(btn);
    list.appendChild(row);
  }
}

// Each row starts unresolved, then calls the real hookProveThreshold check on demand -- exact
// stats never render, only the resolved pass/fail per tier (docs/adr/0006).
function renderLeaguesModal() {
  const list = ui.el('leagues-list');
  list.innerHTML = '';
  for (const league of LEAGUES) {
    const row = document.createElement('div');
    row.className = 'item-row league-row';
    const statLabel = league.checkWins ? t('leagueByWins') : t('leagueByLevel');
    row.innerHTML = `<div class="info"><span class="name"><span class="status-icon">⏳</span>${league.name}</span><span class="sub">${statLabel.replace('{threshold}', league.threshold)}</span></div>`;
    list.appendChild(row);
    mnHooks.hookProveThreshold(profile, league.threshold, league.checkWins).then((qualifies) => {
      const icon = row.querySelector('.status-icon');
      icon.textContent = qualifies ? '✅' : '🔒';
      row.querySelector('.sub').textContent = `${qualifies ? t('leagueQualified') : t('leagueLocked')} — ${statLabel.replace('{threshold}', league.threshold)}`;
    });
  }
}

function renderPassModal() {
  const tiers = passSys.claimableTiers(profile.pass);
  ui.el('pass-status').textContent = `${profile.pass.points} pts · Tier ${passSys.tierForPoints(profile.pass.points)}/20`;
  const list = ui.el('pass-tiers');
  list.innerHTML = '';
  if (tiers.length === 0) {
    const row = document.createElement('div');
    row.className = 'item-row';
    row.innerHTML = `<div class="info"><span class="name">${t('noPassRewards')}</span></div>`;
    list.appendChild(row);
  } else {
    for (const tnum of tiers) {
      const rewards = passSys.rewardForTier(tnum, profile.pass.premium);
      const sub = rewards.map((r) => Object.entries(r).map(([k, v]) => `${v} ${k}`).join(', ')).join(' + ');
      const row = document.createElement('div');
      row.className = 'item-row';
      row.innerHTML = `<div class="info"><span class="name">Tier ${tnum}</span><span class="sub">${sub}</span></div>`;
      list.appendChild(row);
    }
  }
  ui.el('pass-claim').disabled = tiers.length === 0;
  ui.el('pass-unlock').disabled = profile.pass.premium || profile.cash < passSys.PREMIUM_UNLOCK_COST_CASH;
  ui.el('pass-unlock').textContent = profile.pass.premium ? t('equipped') : t('unlockPremium');
}

function renderLoyaltyList() {
  const list = ui.el('loyalty-list');
  list.innerHTML = '';
  for (const item of loyalty.LOYALTY_SHOP) {
    const row = document.createElement('div');
    row.className = 'item-row';
    row.innerHTML = `<div class="info"><span class="name">${item.name}</span><span class="sub">${item.cost} pts</span></div>`;
    const btn = document.createElement('button');
    btn.className = 'btn btn--compact btn--gold';
    btn.textContent = t('redeem');
    btn.disabled = !loyalty.canRedeem(profile.loyaltyPoints, item);
    btn.onclick = () => {
      const remaining = loyalty.redeem(profile.loyaltyPoints, item);
      if (remaining === null) { ui.toast(t('notEnoughLoyalty')); return; }
      profile.loyaltyPoints = remaining;
      persistProfile();
      ui.toast(`${t('redeemed')}: ${item.name}`);
      renderLoyaltyList();
    };
    row.appendChild(btn);
    list.appendChild(row);
  }
}

function buyBox(tier, cost) {
  const spent = economy.spend(profile, 'cash', cost);
  if (!spent) { ui.toast(t('notEnoughCash')); return; }
  profile = spent;
  const reward = lootbox.openBox(tier);
  profile = economy.applyAward(profile, { coins: reward.coins, cash: reward.cash || 0 });
  if (reward.cuePiece) profile.cues.pieces += 1;
  persistProfile();
  const parts = [`+${reward.coins} coins`];
  if (reward.cash) parts.push(`+${reward.cash} cash`);
  if (reward.cuePiece) parts.push('+1 cue piece');
  ui.el('reveal-text').textContent = parts.join(', ');
  ui.el('shop-modal').classList.remove('show');
  ui.el('reveal-modal').classList.add('show');
}

function hallItem(name, sub, href) {
  const row = document.createElement('div');
  row.className = 'item-row';
  const subHtml = href
    ? `<a class="hall-link" href="${href}" target="_blank" rel="noopener">${sub}</a>`
    : sub;
  row.innerHTML = `<div class="info"><span class="name">${name}</span><span class="sub">${subHtml}</span></div>`;
  return row;
}

async function openHall() {
  ui.el('hall-modal').classList.add('show');
  const status = ui.el('hall-status');
  const body = ui.el('hall-body');
  status.textContent = t('hallLoading');
  body.innerHTML = '';
  body.appendChild(hallItem(t('hallNetwork'), HALL.network));
  body.appendChild(hallItem(t('hallContract'), HALL.contractAddress, HALL.explorerContract));
  body.appendChild(hallItem(t('hallDeploy'), HALL.deployTxHash || HALL.deployTxId, explorerTxUrl(HALL.deployTxHash || HALL.deployTxId)));
  body.appendChild(hallItem(t('hallCommit'), HALL.commitStatsTxHash || HALL.commitStatsTxId, explorerTxUrl(HALL.commitStatsTxHash || HALL.commitStatsTxId)));
  body.appendChild(hallItem(t('hallProve'), HALL.proveThresholdTxHash || HALL.proveThresholdTxId, explorerTxUrl(HALL.proveThresholdTxHash || HALL.proveThresholdTxId)));
  body.appendChild(hallItem(t('hallExplorers'), HALL.explorerMidnight, HALL.explorerMidnight));
  body.appendChild(hallItem('Subscan', HALL.explorerSubscan, HALL.explorerSubscan));
  try {
    const json = await fetchContractAction(HALL.contractAddress);
    const parsed = parseContractAction(json);
    status.textContent = parsed.ok
      ? t('hallLiveOk').replace('{type}', parsed.typename || 'ContractAction')
      : t('hallLiveErr').replace('{error}', parsed.error || 'unknown');
  } catch (err) {
    status.textContent = t('hallLiveErr').replace('{error}', String(err?.message || err));
  }
}

async function renderAuditModal() {
  const list = ui.el('audit-list');
  list.innerHTML = '';
  const entries = mnAudit.readAll().filter((e) => e.mode !== 'mock');
  if (entries.length === 0) {
    const row = document.createElement('div');
    row.className = 'item-row';
    row.innerHTML = `<div class="info"><span class="name">${t('auditEmpty')}</span></div>`;
    list.appendChild(row);
    return;
  }
  const ids = entries.map((e) => e.disclosed && e.disclosed.txId).filter(Boolean);
  let hashes = new Map();
  try { hashes = await resolveTxHashes(ids); } catch { /* contract page fallback below */ }
  for (const e of entries) {
    const row = document.createElement('div');
    row.className = 'item-row';
    const when = new Date(e.at).toLocaleTimeString();
    const status = e.ok ? '✅' : '⚠️';
    const detail = e.note || e.error || JSON.stringify(e.disclosed || {});
    const modeKey = e.mode === 'real' ? 'auditReal' : e.mode === 'mock' ? 'auditMock' : '';
    const modeLabel = modeKey ? t(modeKey) : e.mode;
    const tx = e.disclosed && e.disclosed.txId;
    const hash = (tx && (hashes.get(stripHex(tx)) || knownTxHash(tx))) || '';
    const href = hash ? explorerTxUrl(hash) : (tx ? HALL.explorerContract : '');
    const txLink = href
      ? ` <a class="hall-link" href="${href}" target="_blank" rel="noopener">${t('auditTx')}</a>`
      : '';
    row.innerHTML = `<div class="info"><span class="name">${status} ${e.circuit} · <span class="audit-mode ${e.mode || ''}">${modeLabel}</span>${txLink}</span><span class="sub">${when} — ${detail}</span></div>`;
    list.appendChild(row);
  }
}

function isPhoneLike() {
  return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 520);
}

function updateMidnightWalletStatus() {
  const w = mnWallet.current();
  ui.el('mn-wallet-status').textContent = w
    ? t('walletConnected').replace('{name}', w.name)
    : t('walletMockMode');
  const hint = ui.el('mn-wallet-hint');
  if (!hint) return;
  if (w) {
    hint.textContent = t('walletHintConnected');
    return;
  }
  const found = mnWallet.detectWallets();
  if (found.length === 0 && isPhoneLike()) {
    hint.textContent = `${t('walletHintPhone')} ${t('oneAmHint')}`;
  } else {
    hint.textContent = t('walletHintDesktop');
  }
}

function reloadTableFromStorage() {
  profile = loadProfile();
  const nickInput = ui.el('nickname-input');
  if (nickInput) nickInput.value = identity.getNickname();
  persistProfile();
}

// Only connects to the first detected wallet rather than offering a picker --
// one wallet (Lace) is the realistic case for this demo; add a picker if/when
// that stops being true.
function wireMidnightMenu() {
  const click = (id, fn) => { ui.el(id).onclick = () => { audio.resume(); audio.uiClick(); fn(); }; };

  updateMidnightWalletStatus();

  // Which public network to ask the wallet for. 'preview' is Midnight's public testnet for
  // integration testing; 'preprod' is the pre-production chain and is ~3x larger. Overridable so a
  // local devnet ('undeployed') can be used without a code change.
  const mnNetwork = () => {
    try { return localStorage.getItem('mn-network') || 'preview'; } catch { return 'preview'; }
  };

  click('btn-mn-continue', async () => {
    const btn = ui.el('btn-mn-continue');
    btn.disabled = true;
    try {
      const r = await passkeyTable.continueTable();
      reloadTableFromStorage();
      const msg = r.prf ? t('continueOk') : t('continueOkNoPrf');
      ui.setStatus('mn-continue-status', msg);
      ui.toast(msg);
      await passkeyTable.pushBlob(passkeyTable.gatherBlobPayload({
        profile,
        nickname: identity.getNickname(),
      }));
    } catch (err) {
      ui.setStatus('mn-continue-status', t('continueFailed').replace('{error}', String(err?.message || err)), true);
    } finally {
      btn.disabled = false;
    }
  });

  click('btn-mn-recovery-export', async () => {
    const pin = ui.el('mn-recovery-pin').value;
    if (String(pin).length < 4) { ui.toast(t('recoveryNeedPin')); return; }
    try {
      const packed = await passkeyTable.exportRecovery(pin, { profile, nickname: identity.getNickname() });
      const code = passkeyTable.recoveryCodeString(packed);
      ui.el('mn-recovery-code').value = code;
      const canvas = ui.el('mn-recovery-qr');
      canvas.hidden = false;
      QRCode.toCanvas(canvas, code, { width: 180, margin: 1, errorCorrectionLevel: 'L' }, (err) => {
        if (err) canvas.hidden = true;
      });
      ui.toast(t('recoveryCopied'));
    } catch (err) {
      ui.toast(t('recoveryBad').replace('{error}', String(err?.message || err)));
    }
  });

  click('btn-mn-recovery-import', async () => {
    const pin = ui.el('mn-recovery-pin').value;
    if (String(pin).length < 4) { ui.toast(t('recoveryNeedPin')); return; }
    try {
      const packed = passkeyTable.parseRecoveryCode(ui.el('mn-recovery-code').value);
      await passkeyTable.importRecovery(pin, packed);
      reloadTableFromStorage();
      ui.toast(t('recoveryImported'));
    } catch (err) {
      ui.toast(t('recoveryBad').replace('{error}', String(err?.message || err)));
    }
  });

  // Connecting a wallet is what turns mock mode into real on-chain submission (docs/adr/0018).
  // chain.js is dynamically imported so midnight-js and the ledger WASM -- an 800KB worker chunk --
  // never load for a player who just wants to shoot pool.
  click('btn-mn-connect', async () => {
    const btn = ui.el('btn-mn-connect');
    btn.disabled = true;
    try {
      const chain = await import('./midnight/chain.js');
      const wallets = chain.detectWallets();
      if (wallets.length === 0) {
        ui.toast(isPhoneLike() ? t('walletHintPhone') : t('walletNotFound'));
        updateMidnightWalletStatus();
        return;
      }
      const STAGE = {
        approve: t('walletConnectingApprove'),
        config: t('walletConnecting'),
        addresses: t('walletConnectingSync'),
        worker: t('walletConnectingWorker'),
      };
      ui.el('mn-wallet-status').textContent = STAGE.approve;
      const info = await chain.connect(wallets[0].key, mnNetwork(), (stage) => {
        ui.el('mn-wallet-status').textContent = STAGE[stage] || t('walletConnecting');
      });
      mnWallet.markConnected({
        id: wallets[0].key,
        name: wallets[0].name,
        api: chain.currentApi(),
      });
      ui.setStatus('mn-chain-status', t('chainConnected').replace('{network}', info.networkId));
      ui.el('mn-chain').hidden = false;
      ui.el('mn-contract-input').value = chain.getContractAddress();
      updateMidnightWalletStatus();
      ui.toast(t('walletConnected').replace('{name}', wallets[0].name));
      if (!isVirginProfile(profile) && passkeyTable.tableUnlocked()) {
        mnHooks.hookCommitStats(profile);
      }
    } catch (err) {
      ui.toast(String(err?.message || err));
      updateMidnightWalletStatus();
    } finally {
      btn.disabled = false;
    }
  });

  // Point the app at a contract someone else deployed -- this is how a second player, or a judge,
  // verifies against the same on-chain state rather than their own private copy.
  click('btn-mn-join', async () => {
    const addr = ui.el('mn-contract-input').value.trim();
    if (!addr) return;
    const chain = await import('./midnight/chain.js');
    chain.setContractAddress(addr);
    ui.setStatus('mn-deploy-status', t('contractSet'));
  });

  click('btn-mn-deploy-show', () => {
    ui.el('mn-deploy-advanced').hidden = false;
  });

  click('btn-mn-deploy', async () => {
    if (!window.confirm(t('deployConfirm'))) return;
    const btn = ui.el('btn-mn-deploy');
    btn.disabled = true;
    ui.setStatus('mn-deploy-status', t('deploying'));
    try {
      const chain = await import('./midnight/chain.js');
      const r = await chain.deploy({ level: profile.level, wins: profile.wins || 0 });
      ui.el('mn-contract-input').value = r.contractAddress;
      ui.setStatus('mn-deploy-status', t('deployed').replace('{address}', r.contractAddress));
    } catch (err) {
      ui.setStatus('mn-deploy-status', t('deployFailed').replace('{error}', String(err?.message || err)), true);
    } finally {
      btn.disabled = false;
    }
  });

  click('btn-mn-audit', () => { ui.el('audit-modal').classList.add('show'); void renderAuditModal(); });
  click('btn-mn-hall', () => { openHall(); });

  click('btn-mn-champion', () => {
    ui.el('champion-result').innerHTML = '';
    ui.el('champion-modal').classList.add('show');
  });

  // Dynamically imported: pulls in @midnight-ntwrk/compact-runtime + the compiled contract's
  // WASM dependency (see docs/adr/0006) only when this feature is actually used, not at app
  // startup, and keeps a bundling problem in that dependency contained to this one button.
  click('btn-champion-prove', async () => {
    const btn = ui.el('btn-champion-prove');
    const box = ui.el('champion-result');
    btn.disabled = true;
    box.innerHTML = `<div class="item-row"><div class="info"><span class="name">…</span></div></div>`;
    try {
      const { proveThresholdReal } = await import('./midnight/circuit.js');
      const qualifies = await proveThresholdReal(profile.level, profile.wins || 0, RANKED_LEVEL_THRESHOLD, false);
      const icon = qualifies ? '✅' : '🔒';
      const msg = (qualifies ? t('championQualified') : t('championNotQualified')).replace('{threshold}', RANKED_LEVEL_THRESHOLD);
      box.innerHTML = `<div class="item-row"><div class="info"><span class="name">${icon}</span><span class="sub">${msg}</span></div></div>`;
    } catch (err) {
      box.innerHTML = `<div class="item-row"><div class="info"><span class="name">⚠️</span><span class="sub">${t('championError').replace('{error}', String(err?.message || err))}</span></div></div>`;
    } finally {
      btn.disabled = false;
    }
  });
}

function wireEconomyMenus() {
  const click = (id, fn) => { ui.el(id).onclick = () => { audio.resume(); audio.uiClick(); fn(); }; };

  click('btn-daily', () => { renderDailyModal(); ui.el('daily-modal').classList.add('show'); });
  click('btn-cues', () => { renderCuesModal(); ui.el('cues-modal').classList.add('show'); });
  click('btn-cues-quick', () => { renderCuesModal(); ui.el('cues-modal').classList.add('show'); });
  click('btn-pass', () => { renderPassModal(); ui.el('pass-modal').classList.add('show'); });
  click('btn-shop', () => { renderLoyaltyList(); ui.el('shop-modal').classList.add('show'); });
  click('btn-leagues', () => { renderLeaguesModal(); ui.el('leagues-modal').classList.add('show'); });
  click('btn-hall', () => { openHall(); });

  click('daily-claim', () => {
    const result = dailyReward.claim(profile.streak);
    if (!result) return;
    profile.streak = result.streak;
    profile = economy.applyAward(profile, result.reward);
    persistProfile();
    renderDailyModal();
    ui.toast(`+${result.reward.coins} coins` + (result.reward.cash ? ` +${result.reward.cash} cash` : ''));
  });

  click('pass-claim', () => {
    const tiers = passSys.claimableTiers(profile.pass);
    for (const tnum of tiers) {
      for (const r of passSys.rewardForTier(tnum, profile.pass.premium)) profile = economy.applyAward(profile, r);
    }
    profile.pass.claimedTier = passSys.tierForPoints(profile.pass.points);
    persistProfile();
    renderPassModal();
  });

  click('pass-unlock', () => {
    if (profile.pass.premium) return;
    const spent = economy.spend(profile, 'cash', passSys.PREMIUM_UNLOCK_COST_CASH);
    if (!spent) { ui.toast(t('notEnoughCash')); return; }
    profile = spent;
    profile.pass.premium = true;
    persistProfile();
    renderPassModal();
  });

  click('buy-silver', () => buyBox('silver', 10));
  click('buy-gold', () => buyBox('gold', 25));
  click('buy-diamond', () => buyBox('diamond', 60));

  document.querySelectorAll('[data-close]').forEach((b) => {
    b.onclick = () => { audio.uiClick(); document.getElementById(b.dataset.close).classList.remove('show'); };
  });
}

function wireMenu() {
  const click = (id, fn) => { ui.el(id).onclick = () => { audio.resume(); audio.uiClick(); fn(); }; };

  // btn-play and screen-mode are gone (docs/adr/0014): Practice, Play-a-Friend and Quick Match are
  // lobby tiles now, so Play -> mode -> create/join lost a step. btn-quit went with them --
  // window.close() is a no-op in an installed PWA and in any tab the script didn't open.
  click('btn-settings', () => { updateMidnightWalletStatus(); ui.el('settings-modal').classList.add('show'); });
  click('btn-profile', () => { updateMidnightWalletStatus(); ui.el('settings-modal').classList.add('show'); });
  document.querySelectorAll('[data-back]').forEach((b) => { b.onclick = () => { audio.uiClick(); closeNet(); ui.showScreen(b.dataset.back); }; });
  // The currency chips' + buttons are not <button>s (they sit inside a .chip span), so they are
  // wired by data-open rather than by id.
  document.querySelectorAll('[data-open]').forEach((b) => {
    b.onclick = (e) => { e.stopPropagation(); audio.uiClick(); ui.el(b.dataset.open).classList.add('show'); };
  });

  click('btn-solo', () => { closeNet(); game.mode = 'solo'; game.timedMode = false; setupRack(); stopBanners(); ui.enterGame(); syncSpinGrid(); ui.updateTurn('solo'); updatePlayersDisplay(); });
  click('btn-multi', () => ui.showScreen('screen-mp'));
  click('btn-create', () => { ui.showScreen('screen-host'); startHost(); });
  click('btn-share', shareInvite);
  click('btn-join', () => { ui.setStatus('join-status', ''); ui.showScreen('screen-join'); });
  click('btn-connect', startJoin);
  click('btn-quick', async () => {
    if (ui.el('ranked-toggle').checked) {
      const qualifies = await mnHooks.hookProveThreshold(profile, RANKED_LEVEL_THRESHOLD, false);
      if (!qualifies) { ui.toast(t('rankedNotQualified')); return; }
    }
    ui.showScreen('screen-quick');
    startQuickMatch();
  });
  // Back to the lobby, not screen-mp: Quick Match launches from a lobby tile now, so screen-mp is
  // no longer the screen the player came from.
  click('btn-quick-cancel', () => { closeNet(); ui.showScreen('screen-main'); });

  ui.el('btn-mute').onclick = () => { audio.resume(); audio.setMuted(!audio.isMuted()); ui.setMuteIcon(audio.isMuted()); audio.uiClick(); };

  ui.el('btn-restart').onclick = async () => {
    audio.resume();
    audio.uiClick();
    const ok = await ui.confirm(t('confirmRestart'));
    if (!ok) return;
    if (game.mode === 'guest') {
      game.net.send({ type: 'restart' });
      return;
    }
    if (game.mode === 'host') {
      await restartHostRack();
    } else {
      setupRack();
      stopBanners();
    }
    ui.showHint();
  };

  ui.el('btn-menu').onclick = async () => {
    audio.resume();
    audio.uiClick();
    const ok = await ui.confirm(t('confirmExit'));
    if (!ok) return;
    leaveGame();
  };

  document.querySelectorAll('#hud-reactions button').forEach((b) => {
    b.onclick = () => {
      audio.resume();
      const emoji = b.dataset.emoji;
      game.net?.send({ type: 'reaction', emoji });
      ui.toast(emoji);
    };
  });

  ui.el('gameover-rematch').onclick = () => { ui.hideGameOver(); ui.el('btn-restart').click(); };
  ui.el('gameover-menu').onclick = () => { ui.hideGameOver(); ui.el('btn-menu').click(); };

  // Delegated rather than bound per-element at startup (docs/adr/0014): the old querySelectorAll
  // ran once over the static markup, so every row main.js builds later -- cue rack, league list,
  // pass tiers, loyalty shop -- never made a hover sound. pointerover bubbles, pointerenter does not.
  document.addEventListener('pointerover', (e) => {
    if (e.target.closest('.btn, .tile, .seg-btn')) audio.uiHover();
  });
}

main();
