// HKDF / AES-GCM helpers for the passkey table (ADR-0020). No WebAuthn here so
// Node can self-test the bits that actually wrap the Scorecard secret.

const te = new TextEncoder();
const td = new TextDecoder();

export async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

export async function hkdfBits(ikm, info, bits = 256) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const out = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: te.encode(info) },
    key,
    bits,
  );
  return new Uint8Array(out);
}

export function bytesToB64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function b64ToBytes(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function importAesKey(raw) {
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptJson(rawKey, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importAesKey(rawKey);
  const cipher = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    te.encode(JSON.stringify(obj)),
  ));
  const packed = new Uint8Array(iv.length + cipher.length);
  packed.set(iv, 0);
  packed.set(cipher, iv.length);
  return bytesToB64(packed);
}

export async function decryptJson(rawKey, b64) {
  const packed = b64ToBytes(b64);
  const iv = packed.slice(0, 12);
  const cipher = packed.slice(12);
  const key = await importAesKey(rawKey);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return JSON.parse(td.decode(plain));
}

export async function pinKey(pin, saltBytes) {
  const base = await crypto.subtle.importKey('raw', te.encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: 100_000 },
    base,
    256,
  );
  return new Uint8Array(bits);
}

export async function encryptWithPin(pin, obj) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await pinKey(pin, salt);
  const blob = await encryptJson(key, obj);
  return { v: 1, salt: bytesToB64(salt), blob };
}

export async function decryptWithPin(pin, packed) {
  const salt = b64ToBytes(packed.salt);
  const key = await pinKey(pin, salt);
  return decryptJson(key, packed.blob);
}

if (typeof process !== 'undefined' && process.argv[1] && import.meta.url.endsWith('tableCrypto.js') && process.argv[1].endsWith('tableCrypto.js')) {
  const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } };
  (async () => {
    const ikm = new Uint8Array(32).fill(7);
    const a = await hkdfBits(ikm, 'midnight-pool:kek');
    const b = await hkdfBits(ikm, 'midnight-pool:kek');
    const c = await hkdfBits(ikm, 'midnight-pool:id');
    assert(a.length === 32 && a.every((x, i) => x === b[i]), 'HKDF is deterministic');
    assert(a.some((x, i) => x !== c[i]), 'HKDF info separates keys');
    const secret = { hello: 'table', n: 3 };
    const wrapped = await encryptJson(a, secret);
    const round = await decryptJson(a, wrapped);
    assert(round.hello === 'table' && round.n === 3, 'AES-GCM round-trips JSON');
    const pinPack = await encryptWithPin('2468', { sk: 'ab' });
    const pinOut = await decryptWithPin('2468', pinPack);
    assert(pinOut.sk === 'ab', 'PIN wrap round-trips');
    let threw = false;
    try { await decryptWithPin('0000', pinPack); } catch { threw = true; }
    assert(threw, 'wrong PIN fails closed');
    console.log('OK — tableCrypto self-test passed');
  })();
}
