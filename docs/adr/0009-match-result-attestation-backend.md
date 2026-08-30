# ADR-0009: Server-recorded match attestation + signed stat receipts

Status: Accepted

## Context

Multiplayer has always been fully peer-to-peer with no server-authoritative state
(`docs/adr/0004`): `awardMatchResult()` (`src/main.js`) runs independently on host and guest, each
awarding its own local `profile.js` from its own view of `game.winner` — there is no cross-check
that both sides agree, and no attesting authority behind `commitStats`'s on-chain commitment
(`docs/adr/0006`'s "garbage in, provably out" limitation). A single dishonest client can simply
lie about the outcome to itself; nothing today would catch it.

No backend/database exists anywhere in this project — confirmed by inspection before designing
this, not assumed. `server/` (the Cloud Run matchmaking relay) is pure in-memory pairing;
`api/og.js`/`api/invite.js` are stateless Vercel functions.

## Decision

Extend the existing relay (`server/`, already deployed, already accepting the `--max-instances=1`
in-memory-state constraint from ADR-0004) rather than stand up a new service — it's already a
long-running Node process with a stable URL the client already talks to.

- **`server/db.js`**: `node:sqlite` (built into Node, zero new dependency) persists one row per
  `(matchId, pk)` attestation. A match is **confirmed** once ≥2 distinct sides have attested and
  all agree on the winner — this is the actual new guarantee: a lone dishonest peer can no longer
  unilaterally certify its own claimed result server-side, though two *colluding* peers still can
  (the same limit any 2-of-2 scheme has without a third party).
- **`server/attest.js`**: HMAC-SHA256 (`node:crypto`, `ATTEST_HMAC_SECRET` env var) over
  `(pk, level, wins)` for any pk with a confirmed match. This is the scoped-down version of
  "server-signed stat commitments" — a genuine in-circuit signature-verification circuit was
  considered and rejected for this pass as comparable in scope to the original contract build
  (new Compact circuit + compile + `midnight-verify`), not achievable alongside everything else
  in the remaining time. The server instead signs off-circuit; the client discloses the signature
  **alongside** the existing `commitStats` commitment as public, independently-checkable data. Full
  in-circuit verification stays a stretch goal, not a committed deliverable.
- **`POST /attest`** and **`GET /stats-signature?pk=`**, added to the relay's existing single HTTP
  port (`server/index.js` now uses `http.createServer` + `WebSocketServer({ server })` instead of
  `{ port }`, so both the WS matchmaking protocol and this REST API share Cloud Run's one ingress
  port unchanged).
- **Client** (`src/midnight/attest.js`, `src/main.js`'s `reportMatchResultToRelay`): both peers
  POST their own view of the result at match end (fire-and-forget, same non-blocking contract as
  `hooks.js` — a slow/unreachable relay just means no receipt this match), then fetch the
  signature and log it to the existing audit dashboard (`audit.js`) as a `serverSignedStats` entry.
  Reuses `game.currentMatchId` (already assigned per-match by the break-order handshake,
  `docs/adr/0006`'s implementation note) and a new `hooks.getPublicKey()` (the same pseudonymous id
  `hookCommitStats` already derives) — no new identity system.

**Known, deliberate limitation**: the sqlite file lives on Cloud Run's writable-but-ephemeral
filesystem — persists across requests to the one running instance, wiped on redeploy/cold start.
Acceptable for a demo under the same constraint ADR-0004 already accepted for in-memory state; a
real deployment needs a managed database. The dev-default HMAC secret is explicitly insecure and
must be overridden via `ATTEST_HMAC_SECRET` for any real deployment.

## Consequences

- A single dishonest peer can no longer unilaterally certify a fabricated result server-side; two
  colluding peers still can, and a host that fabricates the *entire match from the start* (not
  just the final result) still gets an honest-looking matching attestation from an unwitting guest
  — that gap is `docs/adr/0008`'s already-documented one, and is exactly what item 4 of this pass's
  roadmap (guest-side physics verification) separately addresses, not this ADR.
- Verified end-to-end against a real running relay (not just unit-tested): `server/db.test.js`
  covers the confirm/non-confirm/overwrite logic and signature determinism; a live two-request curl
  smoke test and a real-Chromium Playwright run (via the browser-side `attest.js` module, hitting
  the actual `/attest` and `/stats-signature` endpoints) both confirmed no console errors and the
  expected confirmed/signed response shape.
- `server/package.json` gained an `engines.node >=22.5.0` pin (the version `node:sqlite` needs)
  alongside `package.json`'s own new `engines` pin from the same pass's Vercel deploy fix.
