// Opaque table blob store (ADR-0020). Body is ciphertext; this process never decrypts.
// Prefer Vercel KV / Upstash REST when env is set; otherwise an in-memory Map (dev / warm instance).

const MAX_BLOB = 32 * 1024;
const ID_RE = /^[0-9a-f]{64}$/;

const mem = globalThis.__mnTableBlobs || (globalThis.__mnTableBlobs = new Map());

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors() });
  }

  const url = new URL(request.url);

  if (request.method === 'GET') {
    const id = (url.searchParams.get('id') || '').toLowerCase();
    if (!ID_RE.test(id)) return json({ error: 'bad id' }, 400);
    const row = await storeGet(id);
    if (!row) return json({ error: 'not found' }, 404);
    return json({ id, blob: row.blob, updatedAt: row.updatedAt });
  }

  if (request.method === 'PUT' || request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'invalid json' }, 400); }
    const id = String(body?.id || '').toLowerCase();
    const blob = String(body?.blob || '');
    if (!ID_RE.test(id)) return json({ error: 'bad id' }, 400);
    if (!blob || blob.length > MAX_BLOB) return json({ error: 'blob too large' }, 413);
    const updatedAt = Number(body.updatedAt) || Date.now();
    await storePut(id, { blob, updatedAt });
    return json({ ok: true, updatedAt });
  }

  return json({ error: 'method' }, 405);
}

async function storeGet(id) {
  const remote = await kvFetch('GET', id);
  if (remote) return remote;
  return mem.get(id) || null;
}

async function storePut(id, row) {
  mem.set(id, row);
  await kvFetch('SET', id, row);
}

async function kvFetch(op, id, row) {
  const base = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!base || !token) return null;
  const key = `mn-table:${id}`;
  try {
    if (op === 'GET') {
      const r = await fetch(`${base}/get/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return null;
      const j = await r.json();
      const result = j?.result;
      if (!result) return null;
      return typeof result === 'string' ? JSON.parse(result) : result;
    }
    await fetch(`${base}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(row),
    });
  } catch {
    return null;
  }
  return null;
}

function cors() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, PUT, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors(), 'content-type': 'application/json; charset=utf-8' },
  });
}
