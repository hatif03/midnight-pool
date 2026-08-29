// Append-only local record of every Midnight-related action this browser has
// attempted (mock or real), shown on an in-app dashboard so a demo viewer has
// something concrete to inspect rather than the app's word that it happened.
const KEY = 'mn-audit-log';
const MAX_ENTRIES = 200;

export function record(entry) {
  const log = readAll();
  log.unshift({ at: Date.now(), ...entry });
  localStorage.setItem(KEY, JSON.stringify(log.slice(0, MAX_ENTRIES)));
}

export function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

export function clear() {
  localStorage.removeItem(KEY);
}
