import Peer from 'peerjs';

const PREFIX = 'pool-arelkair-';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

export function host(handlers) {
  const code = randomCode();
  const peer = new Peer(PREFIX + code);
  let conn = null;

  peer.on('open', () => handlers.ready?.(code));
  peer.on('error', (e) => handlers.error?.(e));
  peer.on('connection', (c) => {
    conn = c;
    c.on('open', () => handlers.joined?.());
    c.on('data', (d) => handlers.message?.(d));
    c.on('close', () => handlers.left?.());
  });

  return {
    send: (o) => { if (conn && conn.open) conn.send(o); },
    close: () => { try { conn?.close(); peer.destroy(); } catch {} },
  };
}

export function join(code, handlers) {
  const peer = new Peer();
  let conn = null;

  peer.on('open', () => {
    conn = peer.connect(PREFIX + code.trim().toUpperCase());
    conn.on('open', () => handlers.connected?.());
    conn.on('data', (d) => handlers.message?.(d));
    conn.on('close', () => handlers.left?.());
    conn.on('error', (e) => handlers.error?.(e));
  });
  peer.on('error', (e) => handlers.error?.(e));

  return {
    send: (o) => { if (conn && conn.open) conn.send(o); },
    close: () => { try { conn?.close(); peer.destroy(); } catch {} },
  };
}

export const RELAY_URL = import.meta.env.VITE_MATCH_RELAY_URL || 'ws://localhost:8787';

// Pairs with a random waiting stranger via the matchmaking relay (server/, see
// docs/adr/0004-matchmaking-relay.md), then falls through to the same host()/join() flow above —
// the relay only ever sees a name string and a PeerJS code, never game traffic.
export function findMatch(name, handlers) {
  const ws = new WebSocket(RELAY_URL);
  let net = null;
  let retried = false;
  let closed = false;

  const queue = () => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'queue', name }));
  };
  ws.addEventListener('open', queue);

  ws.addEventListener('message', (ev) => {
    if (closed) return;
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }

    if (m.type === 'role' && m.role === 'host') {
      handlers.assigned?.('host');
      net = host({
        ready: (code) => { ws.send(JSON.stringify({ type: 'ready', code })); handlers.ready?.(code); },
        joined: handlers.joined,
        message: handlers.message,
        left: handlers.left,
        error: (e) => {
          if (!retried) { retried = true; ws.send(JSON.stringify({ type: 'hostFailed' })); queue(); }
          else handlers.error?.(e);
        },
      });
    } else if (m.type === 'role' && m.role === 'guest') {
      handlers.assigned?.('guest');
      net = join(m.code, handlers);
    } else if (m.type === 'requeue') {
      queue();
    } else if (m.type === 'timeout') {
      handlers.timeout?.();
    }
  });

  ws.addEventListener('error', () => handlers.error?.(new Error('relay unreachable')));

  return {
    send: (o) => net?.send(o),
    close: () => {
      closed = true;
      try { ws.close(); } catch {}
      try { net?.close(); } catch {}
    },
  };
}
