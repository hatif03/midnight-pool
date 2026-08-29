const KEY = 'pool-nickname';
const VIBRATE_KEY = 'pool-vibrate';
const AVATAR_COLORS = ['#4ee892', '#5aa6ff', '#ff8a5a', '#ffd15a', '#c78bff', '#5affea', '#ff5a91'];

export function getNickname() {
  return localStorage.getItem(KEY) || 'Player';
}

export function setNickname(name) {
  const trimmed = (name || '').trim().slice(0, 16);
  localStorage.setItem(KEY, trimmed || 'Player');
}

export function avatarFor(name) {
  const s = name || 'Player';
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return { initial: s.trim().charAt(0).toUpperCase() || 'P', color: AVATAR_COLORS[hash % AVATAR_COLORS.length] };
}

export function getVibrateOnTurn() {
  return localStorage.getItem(VIBRATE_KEY) !== '0';
}

export function setVibrateOnTurn(on) {
  localStorage.setItem(VIBRATE_KEY, on ? '1' : '0');
}
