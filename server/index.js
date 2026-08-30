import http from 'node:http';
import { WebSocketServer } from 'ws';
import { Matchmaker } from './matchmaker.js';
import { recordAttestation, latestConfirmedStats } from './db.js';
import { signStats } from './attest.js';

const PORT = process.env.PORT || 8787;
const sockets = new Map(); // id -> ws
let nextId = 1;

const mm = new Matchmaker({
  send: (id, msg) => {
    const ws = sockets.get(id);
    if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  },
});

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e5) req.destroy(new Error('body too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// Minimal HTTP API alongside the WebSocket matchmaking relay (docs/adr/0009):
// both peers POST their own view of the match result here at game end; once
// two distinct sides agree, the match is "confirmed" and either side can fetch
// a server-signed (pk, level, wins) receipt to disclose alongside their
// on-chain stat commitment. Carries no game traffic, same as the relay itself.
async function handleRequest(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  try {
    if (req.method === 'POST' && req.url === '/attest') {
      const { matchId, pk, role, winner, level, wins } = JSON.parse(await readBody(req));
      const valid = typeof matchId === 'string' && matchId && typeof pk === 'string' && pk
        && Number.isInteger(role) && Number.isInteger(winner)
        && Number.isInteger(level) && Number.isInteger(wins);
      if (!valid) return sendJson(res, 400, { error: 'invalid attestation' });
      const { confirmed } = recordAttestation({ matchId, pk, role, winner, level, wins });
      return sendJson(res, 200, { recorded: true, confirmed });
    }
    if (req.method === 'GET' && req.url.startsWith('/stats-signature')) {
      const pk = new URL(req.url, 'http://relay').searchParams.get('pk');
      const stats = pk && latestConfirmedStats(pk);
      if (!stats) return sendJson(res, 404, { error: 'no confirmed match found for this pk' });
      return sendJson(res, 200, signStats(pk, stats.level, stats.wins));
    }
    res.writeHead(404);
    res.end();
  } catch (err) {
    sendJson(res, 500, { error: String(err?.message || err) });
  }
}

const server = http.createServer((req, res) => { handleRequest(req, res); });
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  const id = nextId++;
  sockets.set(id, ws);

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (m.type === 'queue') mm.queue(id, m.name);
    else if (m.type === 'ready') mm.ready(id, m.code);
    else if (m.type === 'hostFailed') mm.hostFailed(id);
    else if (m.type === 'cancel') mm.cancel(id);
  });

  ws.on('close', () => {
    mm.disconnect(id);
    sockets.delete(id);
  });
});

server.listen(PORT, () => {
  console.log(`Matchmaking relay + attestation API listening on :${PORT}`);
});
