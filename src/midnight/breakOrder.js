// Local, P2P-only replica of the on-chain provably-fair break-order coin flip
// (contracts/midnight-pool.compact: commitBreakChoice/revealBreakChoice/resolveBreak).
//
// Gameplay cannot wait on an indexer round trip, so the two peers negotiate the
// same commit-reveal handshake directly over the existing PeerJS channel and
// each computes the winner locally, in parallel with (not gated by) the
// fire-and-forget submission of the SAME nonces to the real contract for the
// tamper-evident on-chain record (see hooks.js). The two computations are NOT
// required to match bit-for-bit -- this is a separate SHA-256 over a plain byte
// concatenation, not a replica of Compact's persistentHash struct encoding --
// only an equally unbiased function of both nonces.
//
// Protocol (host initiates, 3 messages):
//   1. host  -> guest : breakCommit { matchId, role: 1, commit }
//   2. guest -> host  : breakCommit { matchId, role: 2, commit }, then immediately
//                       breakReveal { matchId, role: 2, nonce } -- safe because
//                       guest already holds host's FIXED commitment by this point,
//                       so guest's own nonce choice cannot be influenced by it
//   3. host  -> guest : breakReveal { matchId, role: 1, nonce } -- safe because
//                       host generated and committed to this nonce before it
//                       knew the guest existed at all
// Both sides then compute flipWinner(nonce1, nonce2) independently.
//
// A malicious, modified host client could still ignore this protocol entirely
// and just pick turn=1 -- nothing client-side can stop that. That's the same
// client-authoritative limitation documented in docs/adr/0006 and 0008; what
// this closes is the *default, unmodified* client always favoring the host.

const DOMAIN = new TextEncoder().encode('midnightpool-p2p:flip:');

export function newMatchId() {
  return crypto.getRandomValues(new Uint8Array(32));
}

export function newNonce() {
  return crypto.getRandomValues(new Uint8Array(32));
}

export function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

export async function commitHex(nonce) {
  return toHex(await sha256(nonce));
}

export async function flipWinner(nonce1, nonce2) {
  const combined = new Uint8Array(DOMAIN.length + nonce1.length + nonce2.length);
  combined.set(DOMAIN, 0);
  combined.set(nonce1, DOMAIN.length);
  combined.set(nonce2, DOMAIN.length + nonce1.length);
  const hash = await sha256(combined);
  return hash[0] < 128 ? 1 : 2;
}

/**
 * Drives one side of the 3-message handshake above. `send(msg)` puts a message
 * on the existing PeerJS channel; forward every incoming 'breakCommit' /
 * 'breakReveal' message for this matchId to the returned `handleMessage`.
 *
 * Returns { promise, handleMessage }. `promise` resolves with
 * { winner, myNonce, peerNonce } (winner is 1 or 2), or rejects after
 * `timeoutMs` with no resolution -- the caller should fall back to a default
 * winner rather than let a dropped peer block the rack from starting.
 */
export function negotiate({ role, matchId, send, timeoutMs = 4000 }) {
  const myNonce = newNonce();
  let myRevealSent = false;
  let peerNonce = null;
  let settled = false;
  let resolveFn;
  let rejectFn;

  const promise = new Promise((resolve, reject) => { resolveFn = resolve; rejectFn = reject; });

  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    rejectFn(new Error('break-order negotiation timed out'));
  }, timeoutMs);

  const finish = async () => {
    if (settled || !myRevealSent || peerNonce === null) return;
    settled = true;
    clearTimeout(timer);
    const [n1, n2] = role === 1 ? [myNonce, peerNonce] : [peerNonce, myNonce];
    resolveFn({ winner: await flipWinner(n1, n2), myNonce, peerNonce });
  };

  const sendMyReveal = () => {
    if (myRevealSent) return;
    myRevealSent = true;
    send({ type: 'breakReveal', matchId, role, nonce: toHex(myNonce) });
    finish();
  };

  (async () => {
    send({ type: 'breakCommit', matchId, role, commit: await commitHex(myNonce) });
    if (role === 2) sendMyReveal(); // guest already holds host's commitment -- safe to reveal now
  })();

  const handleMessage = (m) => {
    if (settled || m.matchId !== matchId) return;
    if (m.type === 'breakCommit' && m.role !== role) {
      if (role === 1) sendMyReveal(); // host: guest just committed, host may now reveal
    } else if (m.type === 'breakReveal' && m.role !== role) {
      peerNonce = fromHex(m.nonce);
      finish();
    }
  };

  return { promise, handleMessage };
}

if (typeof process !== 'undefined' && process.argv[1] && import.meta.url.endsWith('breakOrder.js') && process.argv[1].endsWith('breakOrder.js')) {
  const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } };

  (async () => {
    for (let i = 0; i < 20; i++) {
      const matchId = toHex(newMatchId());
      let hostHandler;
      let guestHandler;
      const host = negotiate({ role: 1, matchId, send: (m) => guestHandler(m) });
      const guest = negotiate({ role: 2, matchId, send: (m) => hostHandler(m) });
      hostHandler = host.handleMessage;
      guestHandler = guest.handleMessage;
      const [h, g] = await Promise.all([host.promise, guest.promise]);
      assert(h.winner === g.winner, 'both sides of a negotiation agree on the winner');
      assert(h.winner === 1 || h.winner === 2, 'winner is a valid role');
    }

    let ones = 0;
    const trials = 60;
    for (let i = 0; i < trials; i++) {
      if ((await flipWinner(newNonce(), newNonce())) === 1) ones++;
    }
    assert(ones > trials * 0.25 && ones < trials * 0.75, 'flip is roughly balanced, not rigged toward either role');

    const lonelyMatchId = toHex(newMatchId());
    const lonely = negotiate({ role: 1, matchId: lonelyMatchId, send: () => {}, timeoutMs: 50 });
    let timedOut = false;
    try { await lonely.promise; } catch { timedOut = true; }
    assert(timedOut, 'a negotiation with no peer response times out instead of hanging');

    console.log('OK — break-order self-test passed');
  })();
}
