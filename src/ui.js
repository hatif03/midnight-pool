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
  el(`${prefix}-avatar`).textContent = initial;
  el(`${prefix}-avatar`).style.background = color;
  el(`${prefix}-name`).textContent = name;
  el(`${prefix}-level`).textContent = level;
}

export function updatePlayers(mode, myName, myLevel, oppName, oppLevel) {
  setChip('hud-me', myName, myLevel);
  el('hud-opp').classList.toggle('hidden', mode === 'solo');
  if (mode !== 'solo') setChip('hud-opp', oppName, oppLevel);
}

export function updateTimer(seconds, show) {
  const e = el('hud-timer');
  e.classList.toggle('show', show);
  if (!show) return;
  e.textContent = Math.ceil(seconds);
  e.classList.toggle('low', seconds <= 10);
}

export function showReactions(mode) {
  el('hud-reactions').classList.toggle('show', mode !== 'solo');
}

export function showGameOver(text) {
  el('gameover-text').textContent = text;
  el('gameover-modal').classList.add('show');
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

export function updateHud(shots, potted, total) {
  el('hud-shots').textContent = shots;
  el('hud-potted').textContent = `${potted}/${total}`;
}

export function updateTurn(mode, mine) {
  const e = el('hud-turn');
  if (mode === 'solo') {
    e.style.display = 'none';
    el('hud-me').classList.remove('active', 'inactive');
    return;
  }
  e.style.display = '';
  e.textContent = mine ? t('you') : t('rival');
  e.style.background = mine ? 'rgba(70,220,140,.28)' : 'rgba(220,90,90,.28)';
  // Adapted from the reference's dimmed/bold name pattern — additive to this existing pill.
  el('hud-me').classList.toggle('active', mine);
  el('hud-me').classList.toggle('inactive', !mine);
  el('hud-opp').classList.toggle('active', !mine);
  el('hud-opp').classList.toggle('inactive', mine);
}

export function updateGroup(mode, group) {
  const g = el('hud-group');
  if (mode === 'solo' || !group) {
    g.style.display = 'none';
    return;
  }
  g.style.display = '';
  g.textContent = group === 'stripes' ? t('stripes') : t('solids');
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
