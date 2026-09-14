# ADR-0019: Host the Midnight proof server on Cloud Run (CORS-open), not on Vercel

Status: Accepted

## Context

Players submit `commitStats`, `proveThreshold` and `claimCue` from the browser through the DApp
Connector (ADR-0018). `proveTx` still needs an HTTP proof server. Three places that server could
live were measured:

1. **Midnight's public Preview prover** (`https://lace-proof-pub.preview.midnight.network`). Official
   docs still list it. From this project it returned an AWS ELB **404 with no CORS headers**. The
   official [midnight-leaderboard](https://github.com/midnightntwrk/midnight-leaderboard) tutorial
   states the same fact: browsers cannot hit Midnight's public proof server (CORS), so they host
   their own on Railway.
2. **Vercel.** The frontend is a static Vite PWA plus two short Node functions (`api/og.js`,
   `api/invite.js`). Vercel cannot run `midnightntwrk/proof-server` as a long-lived Docker process
   (4 GiB RAM, minutes-long proves, a listening HTTP server). Even the newer Functions WebSocket
   path does not change that: this is not a request/response handler, it is a native prover.
3. **A local Docker proof server.** Works for us. Other players will not install Docker to shoot
   pool.

The same `midnightntwrk/proof-server:8.0.3` image, run locally, already reflects
`Access-Control-Allow-Origin` for `https://midnight-pool-one.vercel.app` on `OPTIONS /prove`. Hosting
that image anywhere with a public HTTPS URL therefore unblocks browser proving from the production
PWA.

This project already has a GCP project and a Cloud Run relay (ADR-0004). Adding a second Cloud Run
service is cheaper and operationally closer than standing up Railway just for the prover.

## Decision

**Deploy `midnightntwrk/proof-server:8.0.3` as Cloud Run service `midnight-pool-prover` in
`us-central1`, unauthenticated, and point the production app at it.**

The image's CMD is `midnight-proof-server --port $PORT`, so Cloud Run's injected `PORT` works
without a custom Dockerfile. Chosen limits:

| Flag | Value | Why |
|---|---|---|
| `--memory` | `4Gi` | One concurrent prove peaked ~1.3 GiB locally; 4 GiB leaves headroom |
| `--cpu` | `2` | Proving is CPU-bound; Cloud Run requires 2 vCPU at 4 GiB |
| `--concurrency` | `1` | Do not share a 4 GiB instance across two proves |
| `--timeout` | `3600` | First-circuit prove can take minutes; default 300s would kill it |
| `--max-instances` | `3` | Burst of a few players, not a public faucet |
| `--min-instances` | `0` | No always-on bill; first prove after idle pays a cold start |
| `--cpu-boost` | on | Faster cold start of the Nix image |
| `--allow-unauthenticated` | on | The browser has to POST `/prove` with no GCP token |

The app resolves the prover in this order (see `src/midnight/chain.js`):

1. `localStorage['mn-prover-uri']` (a developer running Docker)
2. `localhost` / `127.0.0.1` → `http://localhost:6300`
3. `VITE_MN_PROVER_URI` / baked Cloud Run URL
4. Lace `proverServerUri`, **except** `lace-proof-pub.*`, which is known-broken

Lace's URI is no longer preferred. Preferring it would send every production player back to the
404.

Wallet-delegated `getProvingProvider` stays unwired: `proveTx` takes ledger WASM objects that cannot
cross the worker boundary (ADR-0018).

## Consequences

- **Vercel production players can prove** without Docker, as long as they have desktop Chrome/Brave
  + Lace on Preview + tNIGHT + generated DUST. That is a wallet/platform limit, not a hosting one.
- **Proof inputs are visible to this GCP project** at prove-time. Same trust move the official
  leaderboard tutorial makes with Railway. The chain still stores only commitments, nullifiers and
  booleans. A future wallet-side prover would close this; it is not available on this stack.
- **Cold start.** `--min-instances=0` means the first prove after idle may wait on container boot
  plus key load. Raise to 1 if a demo cannot afford that wait.
- **Cost.** 4 GiB / 2 vCPU while serving, billed per request. Concurrency 1 keeps memory honest.
- A second Cloud Run service now exists next to `midnight-pool-relay`. Redeploying the relay does
  not touch the prover, and vice versa.
- Vercel still cannot, and should not, grow into the prover or the matchmaking WebSocket. Those stay
  on Cloud Run. Documented in [DEPLOYMENT.md](../DEPLOYMENT.md).
