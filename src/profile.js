// Player progression state (Coins, Cash, XP/level, and the workstream 8 live-ops state) —
// separate from identity.js (nickname/avatar/prefs), which already works and is wired into the
// HUD/settings; no reason to fold it in here just for naming purity. localStorage only, no
// accounts — matches this project's privacy-first framing.
const KEY = 'pool-profile';
const VERSION = 1;

function defaultProfile() {
  return {
    version: VERSION,
    coins: 500,
    cash: 0,
    xp: 0,
    level: 1,
    wins: 0,
    loyaltyPoints: 0,
    streak: { day: 0, lastClaim: null },
    pass: { points: 0, premium: false, claimedTier: 0 },
    cues: { owned: ['house'], equipped: 'house', pieces: 0 },
    boxes: [],
  };
}

function migrate(saved) {
  // No prior versions exist yet — this is a placeholder for when VERSION bumps.
  return { ...defaultProfile(), ...saved, version: VERSION };
}

export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultProfile();
    const parsed = JSON.parse(raw);
    return parsed.version === VERSION ? { ...defaultProfile(), ...parsed } : migrate(parsed);
  } catch {
    return defaultProfile();
  }
}

export function saveProfile(profile) {
  localStorage.setItem(KEY, JSON.stringify(profile));
}
