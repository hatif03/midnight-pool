// HMAC signing over a confirmed match's stats -- see docs/adr/0009. This is the
// scoped-down "server-signed stat commitment": rather than a new in-circuit
// signature-verification circuit (a multi-day undertaking on its own), the
// server signs (pk, level, wins) off-circuit and the client discloses that
// signature alongside the existing on-chain commitStats commitment. Anyone can
// verify the signature against the server's public identity; full in-circuit
// verification is a stretch goal, not attempted here.
import { createHmac } from 'node:crypto';

// ponytail: a dev-default secret so this runs with zero setup; a real deploy
// must set ATTEST_HMAC_SECRET (gcloud run deploy --set-env-vars=...).
const SECRET = process.env.ATTEST_HMAC_SECRET || 'dev-only-insecure-secret-change-in-prod';

export function signStats(pk, level, wins) {
  const signature = createHmac('sha256', SECRET).update(`${pk}|${level}|${wins}`).digest('hex');
  return { pk, level, wins, signature };
}
