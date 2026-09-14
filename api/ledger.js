// CORS proxy for the Preview indexer. Browsers often cannot POST to
// indexer.preview.midnight.network from midnight-pool-one.vercel.app.
// Cache ~15s so The Hall does not hammer the indexer.
// Web Request/Response API — same Edge runtime as api/invite.js. Node serverless
// passes IncomingMessage (relative url, no .text()), which 500s.
export const config = { runtime: 'edge' };

const INDEXER = 'https://indexer.preview.midnight.network/api/v4/graphql';
const MAX_BODY = 8_192;

let cache = { key: '', at: 0, status: 200, body: '' };

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors() });
  }
  if (request.method !== 'POST') {
    return json({ error: 'POST only' }, 405);
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ error: 'too large' }, 413);

  const now = Date.now();
  if (cache.key === raw && now - cache.at < 15_000) {
    return new Response(cache.body, {
      status: cache.status,
      headers: { ...cors(), 'content-type': 'application/json; charset=utf-8', 'x-hall-cache': 'hit' },
    });
  }

  const up = await fetch(INDEXER, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw,
  });
  const text = await up.text();
  cache = { key: raw, at: now, status: up.status, body: text };
  return new Response(text, {
    status: up.status,
    headers: { ...cors(), 'content-type': up.headers.get('content-type') || 'application/json; charset=utf-8' },
  });
}

function cors() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
  };
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors(), 'content-type': 'application/json; charset=utf-8' },
  });
}
