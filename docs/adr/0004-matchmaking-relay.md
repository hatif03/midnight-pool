# ADR-0004: Self-hosted WebSocket relay for random-opponent matchmaking

Status: Accepted

## Context

Multiplayer today (`src/net.js`) only supports direct code-to-code connections over the public
PeerJS cloud broker — one player creates a code, shares it out-of-band, the other types it in.
There's no way to be paired with a random waiting stranger. The user chose a self-hosted relay
over a third-party matchmaking BaaS (see [PROJECT_LOG.md](../../PROJECT_LOG.md) for that decision).

## Decision

A small standalone Node process (`server/`, using the `ws` package) whose only job is pairing two
waiting clients and handing them a shared code + host/guest role. It carries **no game traffic** —
once paired, both clients fall through to the exact same `host()`/`join()` PeerJS flow that manual
codes already use. Reimplementing PeerJS's own signaling (SDP offer/answer, STUN/TURN) inside the
relay was considered and rejected: the public PeerJS broker already solves NAT traversal for free,
so duplicating it would be pure cost with no benefit.

**Protocol** (JSON over one WebSocket per client):

Client → relay: `{type:'queue', name}`, `{type:'ready', code}` (host only, once its own `host()`
call's `ready` fires — see below), `{type:'hostFailed'}` (host only, if `host()` errors),
`{type:'cancel'}`.

Relay → client: `{type:'role', role:'host'}` (host only, immediately on pairing), `{type:'role',
role:'guest', code}` (guest only, and only once the host confirms ready — see handshake below),
`{type:'requeue'}` (told to re-queue, either because its previously-paired host failed or its
partner disconnected before finishing), `{type:'timeout'}` (no pairing within 20s).

**Handshake is 3-step, not simultaneous** — a "both sides matched, go" broadcast is a real race
(validated in design review before writing any code): the relay tells the assigned **host** first;
the host calls the existing `host()` (which generates its own PeerJS code exactly as manual hosting
does — the relay doesn't invent the code, it just relays whichever one the host already picked);
only once that peer is confirmed live (`host()`'s own `ready` callback firing) does the client ack
the relay with `{type:'ready', code}`; only then does the relay tell the guest to `join()`. Without
this ordering, the guest's `join()` can race ahead of the host's peer actually existing on the
broker, and PeerJS has no retry — it just errors.

**Failure handling**: if `host()` errors before `ready` (e.g. a stale/colliding PeerJS ID), the
client retries once automatically (fresh `queue`) and tells the relay via `hostFailed` so the
waiting guest gets `requeue`d rather than waiting forever for a code that will never come. A
disconnect while paired-but-not-yet-ready does the same for whichever side is still waiting.
Once handoff to PeerJS actually happens, a stalled connection is the client's own problem — it
needs its own "waiting for opponent… cancel" timeout independent of the relay's queue timeout.

**Hosting — deployed to Google Cloud Run** (the user's choice; Render/Fly/Railway were the
original defaults considered, but the code doesn't care which host runs it). Deployed via
`gcloud run deploy midnight-pool-relay --source server --region us-central1
--allow-unauthenticated --max-instances=1 --timeout=3600`, to the user's existing
`project-f0b6b4ce-541f-43ff-9f7` project (chosen over creating a new dedicated project, to avoid
the extra billing-account-linking step). Live at
`wss://midnight-pool-relay-147606977567.us-central1.run.app`. Cloud Run also serves an alias
(`https://midnight-pool-relay-2wv6ilt7fa-uc.a.run.app`); both answer. The committed env var and
the baked fallback in `src/net.js` keep the project-number URL. Verified with real `ws` clients
against the deployed URL (queue → pair → code exchange all worked). A sibling service,
`midnight-pool-prover`, hosts the Midnight proof server — see [ADR-0019](0019-cloud-run-proof-server.md).

Two Cloud-Run-specific correctness details that aren't optional:
- **`--max-instances=1` is required, not a cost optimization.** The `Matchmaker`'s waiting queue
  and pairs map are in-memory, single-process state (see `server/matchmaker.js`). If Cloud Run
  scaled this to multiple instances, two waiting clients could land on different instances and
  never see each other. `--min-instances` is left at Cloud Run's default (0) rather than pinned to
  1 — since max is capped at 1, correctness holds either way, and staying at the default avoids
  paying for a continuously-warm instance. The tradeoff is the same one Render's free tier would
  have given for free: **the first quick-match after an idle period may hang on a cold start** —
  same known tradeoff as originally written here for Render, just via a different mechanism.
- **`--timeout=3600`** (Cloud Run's max): the default 300s request timeout would otherwise
  forcibly cut a WebSocket connection — and therefore a match — off mid-game after 5 minutes,
  since each open WS connection counts as one long-lived request from Cloud Run's perspective.

The frontend points at the relay via a build-time env var, `VITE_MATCH_RELAY_URL`. Rather than a
Vercel dashboard setting (which this environment has no way to configure — see ADR-0005's Vercel
access gap), it's committed directly in **`.env.production`** at the repo root — the relay's URL
isn't a secret, so there's nothing to protect by keeping it out of the repo, and this way every
production build picks it up automatically. Local dev still falls back to `ws://localhost:8787`
against `server/` running locally when `.env.production` isn't in play (`vite dev` doesn't load it).

## Consequences

- A second deployable unit exists now (`server/`, its own `package.json`), separate from the static
  Vite frontend and now living in a **different cloud provider** (GCP) than the frontend (Vercel) —
  two providers to know about, not one.
- The relay holds no game state and no player data beyond a transient name string while queued —
  low operational/privacy burden, consistent with the project's local-only-identity approach.
- The relay now lives in a GCP project (`project-f0b6b4ce-541f-43ff-9f7`) that's also used for
  unrelated apps ("flocus", Gemini API usage) — it wasn't given a dedicated project, so keep that
  in mind when reading Cloud Run logs/billing for that project; it's not exclusively this game's.
- Redeploying after a `server/` code change means re-running the `gcloud run deploy` command above
  (not yet wired to auto-deploy on push, unlike the Vercel frontend).
