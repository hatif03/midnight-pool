// Scorecard secret (Compact localSecretKey). Separate from the Lace/1AM fee wallet.
// Passkeys (passkeyTable.js) own when this is minted; hooks.js and chain.js only read it.
const SECRET_KEY_STORAGE = 'mn-secret-key';

export function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex) {
  const h = String(hex || '').replace(/^0x/, '');
  if (h.length % 2) throw new Error('odd hex');
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}

export function getSecretKeyHex() {
  try { return localStorage.getItem(SECRET_KEY_STORAGE); } catch { return null; }
}

export function setSecretKeyHex(hex) {
  localStorage.setItem(SECRET_KEY_STORAGE, hex);
}

export function getOrCreateSecretKeyHex() {
  let hex = getSecretKeyHex();
  if (!hex) {
    hex = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
    setSecretKeyHex(hex);
  }
  return hex;
}

export function tableUnlocked() {
  return Boolean(getSecretKeyHex());
}
