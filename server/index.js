import { WebSocketServer } from 'ws';
import { Matchmaker } from './matchmaker.js';

const PORT = process.env.PORT || 8787;
const sockets = new Map(); // id -> ws
let nextId = 1;

const mm = new Matchmaker({
  send: (id, msg) => {
    const ws = sockets.get(id);
    if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  },
});

const wss = new WebSocketServer({ port: PORT });

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

console.log(`Matchmaking relay listening on :${PORT}`);
