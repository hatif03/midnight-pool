// Client for the relay's match-result attestation + stat-signature endpoints
// (server/db.js, server/attest.js -- see docs/adr/0009). Fire-and-forget, same
// contract as hooks.js: a failed fetch just means no server-signed receipt for
// this match, it never blocks or delays gameplay.
import { RELAY_URL } from '../net.js';

const HTTP_BASE = RELAY_URL.replace(/^ws/, 'http');

export async function attestMatchResult({ matchId, pk, role, winner, level, wins }) {
  try {
    const res = await fetch(`${HTTP_BASE}/attest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matchId, pk, role, winner, level, wins }),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export async function fetchStatsSignature(pk) {
  try {
    const res = await fetch(`${HTTP_BASE}/stats-signature?pk=${encodeURIComponent(pk)}`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
