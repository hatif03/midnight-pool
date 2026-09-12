import { Application, Container, Graphics, Text } from 'pixi.js';
import QRCode from 'qrcode';
import { CANVAS_W, CANVAS_H, MAX_DRAG, MIN_DRAG, POWER_CURVE, HEAD_STRING_X } from './config.js';
import { rack, step, allStopped, shoot, placeCue } from './physics.js';
import { groupOf, resolveShot } from './rules.js';
import { drawTable, buildBallVisual, drawAim, initBallTextures, makeCueSprite, placeCueStick } from './scene.js';
import { host, join, findMatch } from './net.js';
import * as ui from './ui.js';
import * as audio from './audio.js';
import * as identity from './identity.js';
import { t, setLang, getLang, applyStatic } from './i18n.js';
import { loadProfile, saveProfile } from './profile.js';
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
import { wireInstallPrompt } from './pwaInstall.js';
import { replayShot, diffFinalState } from './midnight/physicsVerify.js';
import { LEAGUES } from './leagues.js';

const other = (p) => (p === 1 ? 2 : 1);
const RANKED_LEVEL_THRESHOLD = 5;

let profile = loadProfile();
let currentSpin = { x: 0, y: 0 };

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
  timedMode: false, turnTimeLeft: 0,
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
  applyStatic();

  const markLang = () => document.querySelectorAll('#lang-seg .seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.lang === getLang()));
  // Icon-only buttons (no data-i18n text) still get a localized tooltip.
  const refreshIconTitles = () => {
    ui.el('btn-settings').title = t('settings');
    ui.el('btn-leagues').title = t('leaguesTitle');
    ui.el('btn-cues').title = t('cuesTitle');
    ui.el('btn-shop').title = t('shopTitle');
  };
  document.querySelectorAll('#lang-seg .seg-btn').forEach((b) => {
    b.onclick = () => { audio.resume(); audio.uiClick(); setLang(b.dataset.lang); markLang(); refreshIconTitles(); refreshHud(); ui.updateTurn(game.mode, game.turn === game.myPlayer); };
  });
  markLang();
  refreshIconTitles();

  const nickInput = document.getElementById('nickname-input');
  nickInput.value = identity.getNickname();
  nickInput.addEventListener('change', () => {
    identity.setNickname(nickInput.value);
    nickInput.value = identity.getNickname();
    updatePlayersDisplay();
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
  }

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
  for (const [ball, spr] of game.sprites) {
    spr.visible = !ball.potted;
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
  ui.hideGameOver();
  refreshHud();
}

function refreshHud() {
  // The shots/potted counters and the solids-stripes pill are gone (docs/adr/0014) -- the rack of
  // ball dots already carries both, so this is now just the rack plus the stake chip.
  ui.updateBallsLeft(game.mode, game.balls, game.groups, game.myPlayer);
  ui.setPot(game.stakeAmount > 0 ? game.stakeAmount * 2 : 0);
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
  if (game.mode === 'solo') return;
  const won = winner === game.myPlayer;
  const award = economy.awardForMatch({ mode: game.mode, won });
  profile = economy.applyAward(profile, award);
  profile.pass.points += award.xp || 0;
  if (game.stakeAmount > 0 && game.currentMatchId) {
    profile = economy.applyStake(profile, won, game.stakeAmount);
    mnHooks.hookAttestResult({ matchId: game.currentMatchId, role: game.myPlayer, winner });
  }
  persistProfile();
  mnHooks.hookCommitStats(profile);
  reportMatchResultToRelay(winner);
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
  awardMatchResult(winner);
  refreshHud();
  showEndBanner();
  sendState();
}

function showEndBanner() {
  const won = game.winner === game.myPlayer;
  const text = won ? t('won') : t('lost');
  ui.banner(text);
  ui.showGameOver(text);
  won ? audio.win() : audio.lose();
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
    awardMatchResult(game.winner);
    showEndBanner();
  }
}

function setupInput() {
  let dragStart = null;
  let placingCue = false;

  const pos = (e) => {
    const r = app.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (app.canvas.width / r.width), y: (e.clientY - r.top) * (app.canvas.height / r.height) };
  };

  app.canvas.addEventListener('pointerdown', (e) => {
    if (!document.hasFocus()) return;
    const p = pos(e);
    if (canPlaceCue()) {
      placingCue = true;
      previewCuePlacement(p.x, p.y);
      return;
    }
    if (!canShoot()) return;
    dragStart = p;
  });

  window.addEventListener('pointermove', (e) => {
    if (placingCue) {
      const p = pos(e);
      previewCuePlacement(p.x, p.y);
      return;
    }
    if (!dragStart) return;
    const p = pos(e);
    const frac = Math.min(Math.hypot(game.cue.x - p.x, game.cue.y - p.y), MAX_DRAG) / MAX_DRAG;
    const power = Math.pow(frac, POWER_CURVE);
    const dx = game.cue.x - p.x, dy = game.cue.y - p.y;
    drawAim(aimLine, game.balls, game.cue, dx, dy, equippedCue().aimBonus);
    placeCueStick(cueStick, game.cue, dx, dy, power);
    setPower(power);
  });

  window.addEventListener('pointerup', (e) => {
    if (placingCue) {
      // Free drag-and-reposition, not tap-to-place: the final position is already set by the last
      // previewCuePlacement() call above, live throughout the drag. Releasing just commits it —
      // canPlaceCue() stays true until an actual shot is taken, so a new pointerdown on the ball
      // starts another placement attempt, naturally allowing as many repositions as wanted.
      placingCue = false;
      placeCueAt(game.cue.x, game.cue.y);
      return;
    }
    if (!dragStart) return;
    const p = pos(e);
    const dragged = Math.hypot(p.x - dragStart.x, p.y - dragStart.y);
    if (canShoot() && dragged > MIN_DRAG) {
      const dx = game.cue.x - p.x, dy = game.cue.y - p.y;
      const dist = Math.hypot(dx, dy);
      // Scaled here, at the sending side, with the shooter's OWN local cue stats — each player's
      // profile is local-only, so the host can't look up the guest's equipped cue. This way the
      // message already carries the effective, fairness-capped values regardless of who shoots.
      const cue = equippedCue();
      const power = Math.pow(Math.min(dist, MAX_DRAG) / MAX_DRAG, POWER_CURVE) * cue.powerMult;
      const spin = { x: currentSpin.x * cue.spinCap, y: currentSpin.y * cue.spinCap };
      strike = { t: 0, power, dx, dy };
      if (game.mode === 'guest') game.net.send({ type: 'shoot', dx, dy, power, spin });
      else doShoot(dx, dy, power, spin);
    }
    dragStart = null;
    aimLine.clear();
    setPower(0, false);
    if (!strike) cueStick.visible = false;
  });
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
    maybeAskNotifications().then(announceGroupAndTurn);
  } else if (m.type === 'state' && game.mode === 'guest') {
    applyState(m);
  } else if (m.type === 'shotInput' && game.mode === 'guest') {
    game.pendingReplay = replayShot(m.pre, { dx: m.dx, dy: m.dy, power: m.power, spin: m.spin });
  } else if (m.type === 'hello') {
    game.opponentName = m.name;
    game.opponentLevel = m.level || 1;
    game.opponentTimeBonus = m.timeBonus || 0;
    updatePlayersDisplay();
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
// The result is also fire-and-forget submitted to the Midnight contract for a
// tamper-evident record (hookRecordBreakOrder) -- that submission never gates
// this, and a peer that doesn't respond within the timeout just forfeits the
// flip back to the pre-existing "host breaks" default rather than stalling.
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
  maybeAskNotifications().then(announceGroupAndTurn);
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

function renderAuditModal() {
  const list = ui.el('audit-list');
  list.innerHTML = '';
  const entries = mnAudit.readAll();
  if (entries.length === 0) {
    const row = document.createElement('div');
    row.className = 'item-row';
    row.innerHTML = `<div class="info"><span class="name">${t('auditEmpty')}</span></div>`;
    list.appendChild(row);
    return;
  }
  for (const e of entries) {
    const row = document.createElement('div');
    row.className = 'item-row';
    const when = new Date(e.at).toLocaleTimeString();
    const status = e.ok ? '✅' : '⚠️';
    const detail = e.note || e.error || JSON.stringify(e.disclosed || {});
    row.innerHTML = `<div class="info"><span class="name">${status} ${e.circuit} · ${e.mode}</span><span class="sub">${when} — ${detail}</span></div>`;
    list.appendChild(row);
  }
}

function updateMidnightWalletStatus() {
  const w = mnWallet.current();
  ui.el('mn-wallet-status').textContent = w ? t('walletConnected').replace('{name}', w.name) : t('walletMockMode');
}

// Only connects to the first detected wallet rather than offering a picker --
// one wallet (Lace) is the realistic case for this demo; add a picker if/when
// that stops being true.
function wireMidnightMenu() {
  const click = (id, fn) => { ui.el(id).onclick = () => { audio.resume(); audio.uiClick(); fn(); }; };

  updateMidnightWalletStatus();

  click('btn-mn-connect', async () => {
    const wallets = mnWallet.detectWallets();
    if (wallets.length === 0) { ui.toast(t('walletNotFound')); return; }
    try {
      await mnWallet.connect(wallets[0].id);
      updateMidnightWalletStatus();
    } catch (err) {
      ui.toast(String(err?.reason || err?.message || err));
    }
  });

  click('btn-mn-audit', () => { renderAuditModal(); ui.el('audit-modal').classList.add('show'); });

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
  click('btn-settings', () => ui.el('settings-modal').classList.add('show'));
  click('btn-profile', () => ui.el('settings-modal').classList.add('show'));
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
