import { t } from './i18n.js';
import { BALL_COLORS } from './config.js';
import { avatarFor } from './identity.js';

export const el = (id) => document.getElementById(id);

// Keeps the table's reserved top space exactly matched to the HUD's real rendered
// height (index.html's #app padding-top reads --hud-h) — so the canvas never sizes
// itself underneath the HUD bar, whatever its height turns out to be on a given
// screen/font/wrap. A hardcoded padding constant would drift the moment the HUD's
// content wraps differently (narrow screens, a longer opponent name, etc).
const hudEl = el('hud');
const syncHudHeight = () => {
  document.documentElement.style.setProperty('--hud-h', `${hudEl.offsetHeight}px`);
};
new ResizeObserver(syncHudHeight).observe(hudEl);
window.addEventListener('resize', syncHudHeight);
window.addEventListener('orientationchange', syncHudHeight);
syncHudHeight();

function setChip(prefix, name, level) {
  const { initial, color } = avatarFor(name);
  const av = el(`${prefix}-avatar`);
  // The level badge is a child of the avatar now, so write the initial into a text node rather
  // than textContent, which would delete the badge.
  av.firstChild?.nodeType === Node.TEXT_NODE
    ? (av.firstChild.nodeValue = initial)
    : av.prepend(document.createTextNode(initial));
  av.style.setProperty('--av-color', color);
  el(`${prefix}-name`).textContent = name;
  el(`${prefix}-level`).textContent = level;
}

export function updatePlayers(mode, myName, myLevel, oppName, oppLevel) {
  setChip('hud-me', myName, myLevel);
  el('hud-opp').classList.toggle('hidden', mode === 'solo');
  if (mode !== 'solo') setChip('hud-opp', oppName, oppLevel);
}

// The turn timer is the ring around the active player's avatar: one custom-property write per
// tick, no extra element and no layout. --t runs 1 -> 0 as the turn burns down.
export function updateTimer(seconds, show, base = 60) {
  const me = el('hud-me-avatar'), opp = el('hud-opp-avatar');
  for (const a of [me, opp]) {
    a.classList.toggle('timed', show);
    if (!show) { a.classList.remove('low'); a.style.removeProperty('--t'); }
  }
  if (!show) return;
  const active = el('hud-me').classList.contains('active') ? me : opp;
  const idle = active === me ? opp : me;
  active.style.setProperty('--t', Math.max(0, Math.min(1, seconds / base)));
  active.classList.toggle('low', seconds <= 10);
  idle.style.setProperty('--t', 1);
  idle.classList.remove('low');
}

export function showReactions(mode) {
  el('hud-reactions').classList.toggle('show', mode !== 'solo');
}

// `stars`, `coins` and the xp figures are all derived from real match data by the caller -- nothing
// on this screen is a decorative number. A loss shows zero stars and a grey ribbon.
export function showGameOver({ won, text, stars = 0, coins = 0, xpFrom = 0, xpTo = 0, xpNeed = 1, levelFrom = 1, levelTo = 1 }) {
  const ribbon = el('gameover-text');
  ribbon.textContent = text;
  ribbon.classList.toggle('ribbon--grey', !won);

  const box = el('gameover-stars');
  box.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const s = document.createElement('i');
    s.className = i < stars ? 'on' : '';
    s.textContent = '★';
    box.appendChild(s);
  }

  el('gameover-coins').textContent = `${coins >= 0 ? '+' : ''}${coins}`;
  el('gameover-lvl').textContent = `Lv ${levelTo}`;

  // Animate from the pre-match fraction to the post-match one. The bar already has a width
  // transition, so this is two writes a frame apart rather than a tween.
  const fill = el('gameover-xp');
  const bar = fill.parentElement;
  const levelled = levelTo > levelFrom;
  bar.style.setProperty('--p', xpFrom / (xpNeed || 1));
  el('gameover-modal').classList.add('show');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    bar.style.setProperty('--p', levelled ? 1 : xpTo / (xpNeed || 1));
    if (levelled) {
      el('gameover-lvl').classList.add('pop');
      setTimeout(() => {
        bar.style.setProperty('--p', 0);
        requestAnimationFrame(() => bar.style.setProperty('--p', xpTo / (xpNeed || 1)));
      }, 650);
    }
  }));
}

export function hideGameOver() {
  el('gameover-modal').classList.remove('show');
}

export function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  el(id).classList.add('active');
}

export function toast(msg) {
  const node = el('toast');
  node.textContent = msg;
  node.classList.add('show');
  clearTimeout(node._timer);
  node._timer = setTimeout(() => node.classList.remove('show'), 2600);
}

export function banner(text) {
  const b = el('banner');
  b.querySelector('.txt').textContent = text;
  b.classList.remove('show');
  void b.offsetWidth;
  b.classList.add('show');
}

export function clearBanner() {
  el('banner').classList.remove('show');
}

export function enterGame() {
  el('menu').classList.add('hidden');
  el('hud').classList.add('show');
  el('hint').classList.remove('gone');
}

export function backToMenu() {
  el('menu').classList.remove('hidden');
  el('hud').classList.remove('show');
  showScreen('screen-main');
}

export function hideHint() {
  el('hint').classList.add('gone');
}

export function showHint() {
  el('hint').classList.remove('gone');
}

// updateHud (shots/potted counters) and updateGroup (a solids/stripes pill) are gone: the rack of
// ball dots already shows both -- which group is yours is which balls are in your rack, and how
// many you have left is how many are unlit. Two pills of redundant text removed, not reskinned.

export function updateTurn(mode, mine) {
  if (mode === 'solo') {
    el('hud-me').classList.remove('active', 'inactive');
    el('hud-opp').classList.remove('active', 'inactive');
    return;
  }
  el('hud-me').classList.toggle('active', mine);
  el('hud-me').classList.toggle('inactive', !mine);
  el('hud-opp').classList.toggle('active', !mine);
  el('hud-opp').classList.toggle('inactive', mine);
}

// Shown only when there is a real stake; otherwise the chip stays hidden rather than showing a 0.
export function setPot(amount) {
  const chip = el('hud-pot');
  chip.hidden = !amount;
  if (amount) el('hud-pot-value').textContent = amount;
}

// Star rating derived from level, not invented: five stars across levels 1..25.
const starsFor = (level) => Math.max(1, Math.min(5, Math.ceil(level / 5)));

function setVsSide(prefix, name, level) {
  const { initial, color } = avatarFor(name);
  const av = el(`${prefix}-avatar`);
  av.firstChild?.nodeType === Node.TEXT_NODE
    ? (av.firstChild.nodeValue = initial)
    : av.prepend(document.createTextNode(initial));
  av.style.setProperty('--av-color', color);
  el(`${prefix}-name`).textContent = name;
  el(`${prefix}-level`).textContent = level;
  const box = el(`${prefix}-stars`);
  const n = starsFor(level);
  box.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const s = document.createElement('i');
    s.className = i < n ? 'on' : '';
    s.textContent = '★';
    box.appendChild(s);
  }
}

// Resolves when the intro is done, so callers can chain the turn announcement behind it. Never
// blocks on network state: the opponent's name can arrive mid-animation via vsUpdateOpponent.
export function vsIntro({ meName, meLevel, oppName, oppLevel, pot }) {
  const node = el('vs-intro');
  setVsSide('vs-me', meName, meLevel);
  setVsSide('vs-opp', oppName, oppLevel);
  el('vs-pot').textContent = pot;
  el('vs-pot-wrap').hidden = !pot;
  node.classList.add('show');
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      node.removeEventListener('pointerdown', finish);
      node.classList.remove('show');
      resolve();
    };
    const timer = setTimeout(finish, 2300);
    node.addEventListener('pointerdown', finish);
  });
}

// The host does not know who joined until the guest's `hello` arrives, which may be after the intro
// is already on screen. Rather than delaying match start on a message that might never come, the
// name is patched in mid-animation.
export function vsUpdateOpponent(name, level) {
  if (!el('vs-intro').classList.contains('show')) return;
  setVsSide('vs-opp', name, level);
}

export function setStatus(id, text, error = false) {
  const s = el(id);
  s.textContent = text;
  s.classList.toggle('error', error);
}

export function setMuteIcon(muted) {
  el('btn-mute').textContent = muted ? '🔇' : '🔊';
}

function renderDots(containerId, group, balls) {
  const box = el(containerId);
  box.innerHTML = '';
  if (!group) {
    box.classList.remove('show');
    return;
  }
  box.classList.add('show');
  const nums = group === 'solids' ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15];
  for (const n of nums) {
    const b = balls.find((x) => x.number === n);
    const dot = document.createElement('span');
    dot.className = 'dot' + (!b || b.potted ? ' gone' : '');
    dot.style.background = '#' + BALL_COLORS[n].toString(16).padStart(6, '0');
    box.appendChild(dot);
  }
}

export function updateBallsLeft(mode, balls, groups, myPlayer) {
  if (mode === 'solo' || !balls) {
    el('dots-me').classList.remove('show');
    el('dots-opp').classList.remove('show');
    return;
  }
  renderDots('dots-me', groups[myPlayer], balls);
  renderDots('dots-opp', groups[myPlayer === 1 ? 2 : 1], balls);
}

function modal(modalId, acceptId, rejectId) {
  return new Promise((resolve) => {
    const m = el(modalId), a = el(acceptId), r = el(rejectId);
    m.classList.add('show');
    const done = (v) => {
      m.classList.remove('show');
      a.onclick = null;
      r.onclick = null;
      resolve(v);
    };
    a.onclick = () => done(true);
    r.onclick = () => done(false);
  });
}

export function confirm(text) {
  el('confirm-text').textContent = text;
  return modal('confirm-modal', 'confirm-accept', 'confirm-reject');
}
