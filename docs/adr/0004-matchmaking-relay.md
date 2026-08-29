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

**Hosting**: a small always-on Node WebSocket service (Render.com's free Web Service tier is a
reasonable default — zero-config git deploy, supports long-lived WebSocket connections; swap for
Fly.io/Railway/a VPS if preferred, the code doesn't care). Free tiers commonly spin down when idle,
so the **first quick-match after a quiet period may hang 30-50s on cold start** — a known tradeoff
to flag in the UI copy, not a bug to chase.

The frontend points at the relay via a build-time env var, `VITE_MATCH_RELAY_URL` (defaults to
`ws://localhost:8787` for local dev against `server/` running locally); production needs this set
as a Vercel environment variable once the relay is actually deployed.

## Consequences

- A second deployable unit exists now (`server/`, its own `package.json`), separate from the static
  Vite frontend — this repo is no longer "just a static site plus one Vercel project."
- The relay holds no game state and no player data beyond a transient name string while queued —
  low operational/privacy burden, consistent with the project's local-only-identity approach.
- `PROJECT_LOG.md`/`CLAUDE.md` need the deployed relay URL recorded once it's actually hosted
  somewhere, and `VITE_MATCH_RELAY_URL` set in the Vercel project's environment variables.
