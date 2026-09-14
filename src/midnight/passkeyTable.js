// Passkey-unlocked table (ADR-0020). Face ID / fingerprint derives a KEK via WebAuthn PRF.
// The Lace wallet is only the stamp. Ciphertext blobs go to /api/table; plaintext never does.
import * as cryptoBits from './tableCrypto.js';
import { bytesToHex, getSecretKeyHex, setSecretKeyHex, tableUnlocked } from './secret.js';

const CRED_ID_KEY = 'mn-passkey-id';
const SESSION_KEK = 'mn-table-kek';
const SESSION_TABLE_ID = 'mn-table-id';
const PRF_SALT_STR = 'midnight-pool:sk';

let pushTimer = 0;
let lastPayload = null;

export { tableUnlocked };

export function hasSessionKek() {
  try { return Boolean(sessionStorage.getItem(SESSION_KEK)); } catch { return false; }
}

export function storedCredentialId() {
  try { return localStorage.getItem(CRED_ID_KEY); } catch { return null; }
}

function prfSalt() {
  return new TextEncoder().encode(PRF_SALT_STR);
}

function rpId() {
  const host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return undefined;
  return host;
}

function b64urlFromBytes(bytes) {
  const b64 = cryptoBits.bytesToB64(bytes);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function bytesFromB64url(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return cryptoBits.b64ToBytes(b64);
}

function readPrf(cred) {
  const ext = cred.getClientExtensionResults?.() || {};
  const first = ext.prf?.results?.first;
  if (!first) return null;
  return first instanceof ArrayBuffer ? new Uint8Array(first) : new Uint8Array(first);
}

async function deriveFromPrf(prfBytes) {
  const kek = await cryptoBits.hkdfBits(prfBytes, 'midnight-pool:kek');
  const tableId = bytesToHex(await cryptoBits.hkdfBits(prfBytes, 'midnight-pool:id'));
  const sk = bytesToHex(await cryptoBits.hkdfBits(prfBytes, 'midnight-pool:sk'));
  return { kek, tableId, sk };
}

function persistSession(kek, tableId) {
  sessionStorage.setItem(SESSION_KEK, cryptoBits.bytesToB64(kek));
  sessionStorage.setItem(SESSION_TABLE_ID, tableId);
  localStorage.setItem('mn-table-id', tableId);
}

function sessionKek() {
  const b64 = sessionStorage.getItem(SESSION_KEK);
  return b64 ? cryptoBits.b64ToBytes(b64) : null;
}

function sessionTableId() {
  return sessionStorage.getItem(SESSION_TABLE_ID) || localStorage.getItem('mn-table-id');
}

export function prfSupportedHeuristic() {
  return typeof PublicKeyCredential !== 'undefined'
    && typeof navigator.credentials?.create === 'function';
}

/**
 * Continue — create or get a platform passkey and unlock the table.
 * Returns { ok, prf, migrated, pulled }.
 */
export async function continueTable() {
  if (!prfSupportedHeuristic()) {
    if (!getSecretKeyHex()) setSecretKeyHex(bytesToHex(crypto.getRandomValues(new Uint8Array(32))));
    return { ok: true, prf: false, migrated: false, pulled: false };
  }

  const salt = prfSalt();
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const existingId = storedCredentialId();
  const rid = rpId();

  const getBase = {
    challenge,
    userVerification: 'required',
    extensions: { prf: { eval: { first: salt } } },
  };
  if (rid) getBase.rpId = rid;

  let cred = null;
  try {
    cred = await navigator.credentials.get({ publicKey: getBase });
  } catch {
    cred = null;
  }
  if (!cred && existingId) {
    try {
      cred = await navigator.credentials.get({
        publicKey: {
          ...getBase,
          allowCredentials: [{ type: 'public-key', id: bytesFromB64url(existingId) }],
        },
      });
    } catch {
      cred = null;
    }
  }

  if (!cred) {
    const rp = { name: 'Midnight Pool' };
    if (rid) rp.id = rid;
    cred = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp,
        user: {
          id: crypto.getRandomValues(new Uint8Array(16)),
          name: 'midnight-pool-table',
          displayName: 'Midnight Pool table',
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          residentKey: 'required',
          userVerification: 'required',
        },
        timeout: 120_000,
        extensions: { prf: { eval: { first: salt } } },
      },
    });
  }

  if (!cred) throw new Error('passkey-cancelled');
  localStorage.setItem(CRED_ID_KEY, b64urlFromBytes(new Uint8Array(cred.rawId)));

  const prf = readPrf(cred);
  if (!prf) {
    if (!getSecretKeyHex()) setSecretKeyHex(bytesToHex(crypto.getRandomValues(new Uint8Array(32))));
    return { ok: true, prf: false, migrated: false, pulled: false };
  }

  const { kek, tableId, sk } = await deriveFromPrf(prf);
  persistSession(kek, tableId);

  const existing = getSecretKeyHex();
  let migrated = false;
  if (existing) migrated = true;
  else setSecretKeyHex(sk);

  const pulled = await pullBlob();
  if (!pulled && !existing) setSecretKeyHex(sk);

  return { ok: true, prf: true, migrated, pulled };
}

export async function pullBlob() {
  const kek = sessionKek();
  const id = sessionTableId();
  if (!kek || !id) return false;
  try {
    const r = await fetch(`/api/table?id=${id}`);
    if (r.status === 404) return false;
    if (!r.ok) return false;
    const j = await r.json();
    if (!j?.blob) return false;
    const data = await cryptoBits.decryptJson(kek, j.blob);
    applyBlob(data);
    return true;
  } catch {
    return false;
  }
}

function profileScore(p) {
  if (!p) return 0;
  return (p.wins || 0) * 1000 + (p.xp || 0) + (p.level || 0) * 10 + (p.losses || 0);
}

function applyBlob(data) {
  if (!data || typeof data !== 'object') return;
  if (data.secretKeyHex) setSecretKeyHex(data.secretKeyHex);
  if (data.nickname) localStorage.setItem('pool-nickname', data.nickname);
  let localProfile = null;
  try { localProfile = JSON.parse(localStorage.getItem('pool-profile') || 'null'); } catch { /* ignore */ }
  if (data.profile && profileScore(data.profile) >= profileScore(localProfile)) {
    localStorage.setItem('pool-profile', JSON.stringify(data.profile));
  }
  if (data.privateState) {
    localStorage.setItem('mn-private-state',
      typeof data.privateState === 'string' ? data.privateState : JSON.stringify(data.privateState));
  }
  if (data.claimedCues) localStorage.setItem('mn-mock-claimed-cues', data.claimedCues);
  if (data.mockStats) localStorage.setItem('mn-mock-stats', data.mockStats);
}

export function gatherBlobPayload({ profile, nickname } = {}) {
  let profileObj = profile;
  if (!profileObj) {
    try { profileObj = JSON.parse(localStorage.getItem('pool-profile') || 'null'); } catch { profileObj = null; }
  }
  return {
    v: 1,
    updatedAt: Date.now(),
    nickname: nickname || localStorage.getItem('pool-nickname') || 'Player',
    profile: profileObj,
    secretKeyHex: getSecretKeyHex(),
    privateState: localStorage.getItem('mn-private-state'),
    claimedCues: localStorage.getItem('mn-mock-claimed-cues'),
    mockStats: localStorage.getItem('mn-mock-stats'),
  };
}

export async function pushBlob(payload) {
  const kek = sessionKek();
  const id = sessionTableId();
  if (!kek || !id || !payload?.secretKeyHex) return false;
  const blob = await cryptoBits.encryptJson(kek, payload);
  const r = await fetch('/api/table', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, blob, updatedAt: payload.updatedAt }),
  });
  return r.ok;
}

export function schedulePush(payload) {
  lastPayload = payload || gatherBlobPayload();
  if (!hasSessionKek()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushBlob(lastPayload).catch(() => {});
  }, 800);
}

/** PIN-wrapped recovery document (QR / paste). Ciphertext only. */
export async function exportRecovery(pin, extra = {}) {
  const payload = gatherBlobPayload(extra);
  return cryptoBits.encryptWithPin(pin, payload);
}

export async function importRecovery(pin, packed) {
  const data = await cryptoBits.decryptWithPin(pin, packed);
  applyBlob(data);
  return data;
}

export function recoveryCodeString(packed) {
  return JSON.stringify(packed);
}

export function parseRecoveryCode(text) {
  const trimmed = String(text || '').trim();
  const parsed = JSON.parse(trimmed);
  if (!parsed?.blob || !parsed?.salt) throw new Error('not a recovery code');
  return parsed;
}
