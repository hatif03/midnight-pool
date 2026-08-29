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
