// Pure pairing logic, no WebSocket dependency — see docs/adr/0004-matchmaking-relay.md for the
// protocol and the 3-step handshake rationale. `send(id, msg)` is injected so this is testable
// without real sockets (see index.test.js) and reusable regardless of transport.
export class Matchmaker {
  constructor({ send, timeoutMs = 20000 }) {
    this.send = send;
    this.timeoutMs = timeoutMs;
    this.waiting = []; // { id, name, timer }
    this.pairs = new Map(); // id -> partnerId, only while the host hasn't sent 'ready' yet
  }

  _removeFromWaiting(id) {
    const i = this.waiting.findIndex((w) => w.id === id);
    if (i === -1) return;
    clearTimeout(this.waiting[i].timer);
    this.waiting.splice(i, 1);
  }

  _tryPair() {
    while (this.waiting.length >= 2) {
      const a = this.waiting.shift();
      const b = this.waiting.shift();
      clearTimeout(a.timer);
      clearTimeout(b.timer);
      this.pairs.set(a.id, b.id);
      this.pairs.set(b.id, a.id);
      // Host told first; the guest hears nothing until the host's PeerJS peer confirms `ready`.
      this.send(a.id, { type: 'role', role: 'host' });
    }
  }

  queue(id, name) {
    this._removeFromWaiting(id); // guard a double 'queue' send
    const entry = {
      id,
      name: String(name || '').slice(0, 16),
      timer: setTimeout(() => {
        this._removeFromWaiting(id);
        this.send(id, { type: 'timeout' });
      }, this.timeoutMs),
    };
    this.waiting.push(entry);
    this._tryPair();
  }

  ready(id, code) {
    const guestId = this.pairs.get(id);
    if (guestId === undefined) return;
    this.pairs.delete(id);
    this.pairs.delete(guestId);
    this.send(guestId, { type: 'role', role: 'guest', code });
  }

  hostFailed(id) {
    const guestId = this.pairs.get(id);
    if (guestId === undefined) return;
    this.pairs.delete(id);
    this.pairs.delete(guestId);
    this.send(guestId, { type: 'requeue' });
  }

  cancel(id) {
    this._removeFromWaiting(id);
  }

  disconnect(id) {
    this._removeFromWaiting(id);
    const partnerId = this.pairs.get(id);
    if (partnerId !== undefined) {
      this.pairs.delete(id);
      this.pairs.delete(partnerId);
      this.send(partnerId, { type: 'requeue' });
    }
  }
}
