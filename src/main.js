import { Application, Container, Graphics, Text } from 'pixi.js';
import QRCode from 'qrcode';
import { CANVAS_W, CANVAS_H, MAX_DRAG, MIN_DRAG, POWER_CURVE } from './config.js';
import { rack, step, allStopped, shoot, placeCue } from './physics.js';
import { groupOf, resolveShot } from './rules.js';
import { drawTable, buildBallVisual, drawAim, drawPower, initBallTextures } from './scene.js';
import { host, join, findMatch } from './net.js';
import * as ui from './ui.js';
import * as audio from './audio.js';
import * as identity from './identity.js';
import { t, setLang, getLang, applyStatic } from './i18n.js';

const other = (p) => (p === 1 ? 2 : 1);

const game = {
  mode: 'solo', myPlayer: 1, turn: 1, started: false,
  balls: null, cue: null, sprites: null, byNumber: null,
  shots: 0, shooting: false, shotPotted: [], cueFoul: false,
  groups: { 1: null, 2: null }, openTable: true, gameOver: false, winner: null,
  firstContactBall: null, anyContact: false, anyRailAfterContact: false,
  net: null, settled: true, cuePotted: false, ballInHand: false,
  opponentName: null,
  sfxBall: 0, sfxRail: 0, sfxPocket: 0,
};

function updatePlayersDisplay() {
  ui.updatePlayers(game.mode, identity.getNickname(), game.opponentName || t('rival'));
  ui.showReactions(game.mode);
}

function vibrateTurn() {
  if (identity.getVibrateOnTurn() && navigator.vibrate) navigator.vibrate(200);
}

let app, ballLayer, aimLine, powerBar, powerLabel, frame = 0;
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
  await app.init({ width: CANVAS_W, height: CANVAS_H, backgroundColor: 0x081109, antialias: true });
  app.ticker.maxFPS = 60;
  document.getElementById('app').appendChild(app.canvas);

  app.stage.addChild(drawTable());
  ballLayer = new Container();
  app.stage.addChild(ballLayer);
  aimLine = new Graphics();
  powerBar = new Graphics();
  powerLabel = new Text({ text: 'POTENCIA', style: { fontFamily: 'system-ui, sans-serif', fontSize: 12, fontWeight: 'bold', fill: 0xffffff } });
  powerLabel.position.set(24, CANVAS_H - 40);
  powerLabel.visible = false;
  app.stage.addChild(aimLine, powerBar, powerLabel);

  initBallTextures(app.renderer);
  applyStatic();

  const markLang = () => document.querySelectorAll('#lang-seg .seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.lang === getLang()));
  document.querySelectorAll('#lang-seg .seg-btn').forEach((b) => {
    b.onclick = () => { audio.resume(); audio.uiClick(); setLang(b.dataset.lang); markLang(); refreshHud(); ui.updateTurn(game.mode, game.turn === game.myPlayer); };
  });
  markLang();

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

  lastPhysics = performance.now();
  setInterval(physicsLoop, 1000 / 60);
  app.ticker.add(renderFrame);

  wireMenu();
  applyJoinLinkIfAny();

  const kick = () => { audio.resume(); audio.startMusic(); window.removeEventListener('pointerdown', kick); };
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
  if (game.mode === 'solo') {
    const p = game.balls.filter((b) => b.number !== 0 && b.potted).length;
    ui.updateHud(game.shots, p, 15);
  } else {
    const mg = game.groups[game.myPlayer];
    const p = mg ? game.balls.filter((b) => groupOf(b.number) === mg && b.potted).length : 0;
    ui.updateHud(game.shots, p, 7);
  }
  ui.updateGroup(game.mode, game.groups[game.myPlayer]);
  ui.updateBallsLeft(game.mode, game.balls, game.groups, game.myPlayer);
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

function applyCuePlacement(x, y) {
  placeCue(game.cue, game.balls, x, y);
  game.cue.tx = game.cue.x;
  game.cue.ty = game.cue.y;
  game.ballInHand = false;
  ui.el('hint').textContent = t('aimHint');
  ui.showHint();
}

function placeCueAt(x, y) {
  if (game.mode === 'guest') {
    game.net.send({ type: 'place', x, y });
    return;
  }
  applyCuePlacement(x, y);
  if (game.mode === 'host') sendState();
}

function doShoot(dx, dy, power) {
  shoot(game.cue, dx, dy, power);
  audio.cueStrike();
  game.shots++;
  game.shooting = true;
  game.shotPotted = [];
  game.cueFoul = false;
  game.firstContactBall = null;
  game.anyContact = false;
  game.anyRailAfterContact = false;
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
  });

  game.openTable = result.openTable;
  game.groups = result.groups;

  if (result.gameOver) {
    endGame(result.winner);
    return;
  }

  if (!result.keepShooting) game.turn = other(shooter);
  game.ballInHand = result.foul;
  game.shotPotted = [];
  game.cueFoul = false;
  refreshHud();
  announceTurn();
  sendState();
}

function endGame(winner) {
  game.gameOver = true;
  game.winner = winner;
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
    ballInHand: game.ballInHand, openTable: game.openTable,
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

  if (game.gameOver && !prevOver) showEndBanner();
}

function setupInput() {
  let dragStart = null;

  const pos = (e) => {
    const r = app.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (app.canvas.width / r.width), y: (e.clientY - r.top) * (app.canvas.height / r.height) };
  };

  app.canvas.addEventListener('pointerdown', (e) => {
    if (!document.hasFocus()) return;
    const p = pos(e);
    if (canPlaceCue()) {
      placeCueAt(p.x, p.y);
      return;
    }
    if (!canShoot()) return;
    dragStart = p;
  });

  window.addEventListener('pointermove', (e) => {
    if (!dragStart) return;
    const p = pos(e);
    const frac = Math.min(Math.hypot(game.cue.x - p.x, game.cue.y - p.y), MAX_DRAG) / MAX_DRAG;
    const power = Math.pow(frac, POWER_CURVE);
    drawAim(aimLine, game.cue, p.x, p.y, power);
    drawPower(powerBar, powerLabel, power);
  });

  window.addEventListener('pointerup', (e) => {
    if (!dragStart) return;
    const p = pos(e);
    const dragged = Math.hypot(p.x - dragStart.x, p.y - dragStart.y);
    if (canShoot() && dragged > MIN_DRAG) {
      const dx = game.cue.x - p.x, dy = game.cue.y - p.y;
      const dist = Math.hypot(dx, dy);
      const power = Math.pow(Math.min(dist, MAX_DRAG) / MAX_DRAG, POWER_CURVE);
      if (game.mode === 'guest') game.net.send({ type: 'shoot', dx, dy, power });
      else doShoot(dx, dy, power);
    }
    dragStart = null;
    aimLine.clear();
    powerBar.clear();
    powerLabel.visible = false;
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
    updatePlayersDisplay();
    ui.enterGame();
    maybeAskNotifications().then(announceGroupAndTurn);
  } else if (m.type === 'state' && game.mode === 'guest') {
    applyState(m);
  } else if (m.type === 'hello') {
    game.opponentName = m.name;
    updatePlayersDisplay();
  } else if (m.type === 'reaction') {
    ui.toast(m.emoji);
  } else if (m.type === 'shoot' && game.mode === 'host' && game.turn === 2 && !game.gameOver) {
    doShoot(m.dx, m.dy, m.power);
  } else if (m.type === 'place' && game.mode === 'host' && game.turn === 2 && game.ballInHand) {
    applyCuePlacement(m.x, m.y);
    sendState();
  } else if (m.type === 'restart' && game.mode === 'host') {
    setupRack();
    stopBanners();
    newMatchGroups();
    game.net.send({ type: 'start', groups: game.groups, openTable: game.openTable, turn: game.turn, hostName: identity.getNickname() });
    sendState();
    announceGroupAndTurn();
  }
}

function newMatchGroups() {
  game.groups = { 1: null, 2: null };
  game.openTable = true;
  game.turn = 1;
}

function hostJoinedHandler() {
  setupRack();
  newMatchGroups();
  game.started = true;
  game.opponentName = null;
  updatePlayersDisplay();
  audio.notify();
  ui.toast(t('rivalJoined'));
  ui.enterGame();
  game.net.send({ type: 'start', groups: game.groups, openTable: game.openTable, turn: game.turn, hostName: identity.getNickname() });
  sendState();
  maybeAskNotifications().then(announceGroupAndTurn);
}

function guestConnectedHandler() {
  game.net.send({ type: 'hello', name: identity.getNickname() });
}

function startHost() {
  closeNet();
  game.mode = 'host';
  game.myPlayer = 1;
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

function wireMenu() {
  const click = (id, fn) => { ui.el(id).onclick = () => { audio.resume(); audio.uiClick(); fn(); }; };

  click('btn-play', () => ui.showScreen('screen-mode'));
  click('btn-settings', () => { const s = ui.el('settings'); s.style.display = s.style.display === 'none' ? 'flex' : 'none'; });
  click('btn-quit', () => window.close());
  document.querySelectorAll('[data-back]').forEach((b) => { b.onclick = () => { audio.uiClick(); closeNet(); ui.showScreen(b.dataset.back); }; });

  click('btn-solo', () => { closeNet(); game.mode = 'solo'; setupRack(); stopBanners(); ui.enterGame(); ui.updateTurn('solo'); ui.updateGroup('solo'); updatePlayersDisplay(); });
  click('btn-multi', () => ui.showScreen('screen-mp'));
  click('btn-create', () => { ui.showScreen('screen-host'); startHost(); });
  click('btn-share', shareInvite);
  click('btn-join', () => { ui.setStatus('join-status', ''); ui.showScreen('screen-join'); });
  click('btn-connect', startJoin);
  click('btn-quick', () => { ui.showScreen('screen-quick'); startQuickMatch(); });
  click('btn-quick-cancel', () => { closeNet(); ui.showScreen('screen-mp'); });

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
    setupRack();
    stopBanners();
    if (game.mode === 'host') {
      newMatchGroups();
      game.net.send({ type: 'start', groups: game.groups, openTable: game.openTable, turn: game.turn, hostName: identity.getNickname() });
      sendState();
      announceGroupAndTurn();
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

  document.querySelectorAll('.glass').forEach((b) => b.addEventListener('pointerenter', () => audio.uiHover()));
}

main();
