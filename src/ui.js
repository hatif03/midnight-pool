import { t } from './i18n.js';
import { BALL_COLORS } from './config.js';

export const el = (id) => document.getElementById(id);

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
    return;
  }
  e.style.display = '';
  e.textContent = mine ? t('you') : t('rival');
  e.style.background = mine ? 'rgba(70,220,140,.28)' : 'rgba(220,90,90,.28)';
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

export function updateBallsLeft(mode, balls, groups, myPlayer) {
  const box = el('balls-left');
  if (mode === 'solo' || !balls) {
    box.classList.remove('show');
    return;
  }
  box.classList.add('show');
  box.innerHTML = '';

  for (const p of [myPlayer, myPlayer === 1 ? 2 : 1]) {
    const group = groups[p];
    if (!group) continue;

    const nums = group === 'solids' ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15];
    const row = document.createElement('div');
    row.className = 'row';

    const lbl = document.createElement('span');
    lbl.className = 'lbl';
    lbl.textContent = p === myPlayer ? t('you') : t('rival');
    row.appendChild(lbl);

    for (const n of nums) {
      const b = balls.find((x) => x.number === n);
      const dot = document.createElement('span');
      dot.className = 'dot' + (!b || b.potted ? ' gone' : '');
      dot.style.background = '#' + BALL_COLORS[n].toString(16).padStart(6, '0');
      row.appendChild(dot);
    }
    box.appendChild(row);
  }
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
