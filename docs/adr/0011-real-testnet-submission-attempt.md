# ADR-0011: Real testnet submission — attempted, time-boxed, stopped after a reproducible crash

Status: Accepted (documents a stopped attempt, not a shipped feature)

## Context

The production-hardening roadmap's riskiest item was replacing the deferred/stubbed real on-chain
submission (`docs/adr/0006`: "real mode... needs the pinned `@midnight-ntwrk/midnight-js-*`
packages plus a live indexer/proof-server, neither of which this environment can install and
verify against") with an actual submission to a public Midnight testnet. Getting the *local*
devnet running earlier in this project's history took six sequential real bugs across ~2 hours
(`docs/adr/0007`'s Outcome section) — direct evidence that a public network, with even less
environmental control, was a real risk, not hypothetical caution. Given the hackathon deadline was
only ~5 hours out (not the ~12 originally estimated when the fuller roadmap was approved), the
user chose a tight, explicit time-box: attempt it, but stop firmly at 60-75 minutes and fall back
to the already-working mock-mode/local-devnet story rather than let it consume the remaining time.

## Decision

Attempted, real progress made, then stopped at the time-box after a genuine blocking bug — not
because time ran out, but because continuing past a confirmed, unresolved crash was not a good use
of the remaining ~30-45 minutes of budget.

**What was verified real and working** (not simulated, not assumed):
- A local proof server (`midnightntwrk/proof-server:8.0.3`, via Docker) started and ran on `:6300`.
- Midnight's public **Preprod** testnet infrastructure, confirmed live by direct calls, not docs
  alone: the indexer's GraphQL endpoint (`https://indexer.preprod.midnight.network/api/v4/graphql`,
  a real `{ __typename }` query returned data), the node's JSON-RPC over both HTTPS and WSS
  (`system_chain` returned `"Midnight Preprod"`, `system_health` showed 13 real peers and
  `isSyncing: false`), and the faucet page existing at
  `https://midnight-tmnight-preprod.nethermind.dev/` (though its SPA rendered blank under
  Playwright — not investigated further given the time-box).
- The full `@midnight-ntwrk/wallet-sdk-*` + `midnight-js-*` package set installed cleanly into
  `contracts/` with zero vulnerabilities (`contracts/testnet-wallet.ts`'s dependencies).

**What broke, and where the attempt stopped**: `contracts/testnet-wallet.ts` (HD wallet → seed →
`WalletFacade.init` against the real Preprod indexer/node/local-proof-server, following the wallet
SDK's own documented construction pattern) crashed with a JavaScript heap-out-of-memory error after
repeatedly logging `RPC-CORE: subscribeRuntimeVersion(): RuntimeVersion:: disconnected from
wss://rpc.preprod.midnight.network/: 1000:: Normal Closure` — a reconnect loop that leaked memory
on every cycle until the process's heap was exhausted. This is a real, reproducible bug in this
specific `wallet-sdk-facade`/`ledger-v8` version combination against the live Preprod node's RPC
subscription protocol, confirmed by direct execution, not a guess — and exactly the class of
"real, uncontrollable variable" flagged as the risk when this item was first scoped. Root cause was
not further diagnosed (would require bisecting SDK versions or instrumenting the reconnect loop,
both outside the remaining time-box).

**Two more unknowns were never reached**: the WalletFacade-to-`WalletProvider`/`MidnightProvider`
adapter needed to actually call `deployContract`/`callTx` isn't documented in any of the installed
plugin skills (a real gap, not just something skipped), and the real-world wait time for tDUST to
become usable after a faucet grant (NIGHT must be delegated and DUST accrues over time, per the
DApp Connector skill's own setup notes) was never tested.

## Consequences

- Real on-chain testnet submission stays **deferred**, same as `docs/adr/0006` originally said —
  this attempt neither closes nor worsens that gap, it just replaces "not attempted" with "attempted
  and hit a specific, documented, reproducible blocker."
- The demo's Midnight story remains the already-verified local-devnet/mock-mode path (real compiled
  circuits, real simulator execution client-side per `docs/adr/0006`'s Champion Badge panel, real
  P2P commit-reveal for break order) — nothing about tonight's attempt changes or weakens that; it
  was already working and already demoable before this ADR.
- `contracts/testnet-wallet.ts` and the new `wallet-sdk-*`/`midnight-js-*` dependencies in
  `contracts/package.json` are kept in the repo, clearly commented with what worked and what
  crashed, as a genuine starting point for whoever picks this up next — not deleted to hide an
  incomplete attempt, and not left uncommented to look like a working path it isn't.
- The 60-75 minute time-box did its job: it caught a real, unresolved crash before it could consume
  the remaining pre-deadline time, and the project moves to final verification and demo/submission
  prep with real time still available for it.
