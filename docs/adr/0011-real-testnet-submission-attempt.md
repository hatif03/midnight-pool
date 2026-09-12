# ADR-0011: Real testnet submission — attempted, time-boxed, stopped after a reproducible crash

Status: Accepted (documents a stopped attempt, not a shipped feature) — **superseded in part by the
"Update" section below**: once the deadline pressure was gone, the user asked to resume this
investigation, which narrowed the root cause considerably. See that section before assuming the
original "not further diagnosed" note still holds.

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
  the remaining pre-deadline time, and the project moved to final verification and demo/submission
  prep with real time still available for it.

## Update: root cause narrowed considerably, wallet-sdk-facade path ruled out

Once the deadline was no longer a factor, the user asked to resume this investigation. Two
controlled experiments (a local-devnet control run, then a targeted config change against real
Preprod) isolated the bug precisely:

- **A local-devnet control run of the identical code ruled out "any reconnect = bug"**: the
  plugin's own `sdk-regression-check` smoke test, run against a freshly-started local devnet, logs
  the *exact same* `subscribeRuntimeVersion()... Normal Closure` line — twice — then proceeds to
  sync cleanly and report a real balance. So that log line is normal, benign reconnect chatter, not
  inherently the bug. The real difference is what happens *after*: against the local devnet's
  near-empty chain, sync finishes in ~3 minutes; against Preprod's populated real chain, it never
  stabilizes.
- **Instrumented `wallet.state()` subscription showed the real signature**: `heapUsedMB` climbs
  linearly and continuously with `shielded.progress.appliedIndex` (the wallet's own count of
  processed ledger entries) — 1038 MB at ~4,100 applied, 3,189 MB at ~18,900 applied, essentially no
  reclaim across GC cycles — a textbook unbounded-memory-retention signature tied to entry count,
  not a transient buffering spike that would plateau or a slow leak that would take much longer to
  matter.
- **Control experiment ruled out the one configurable suspect**: `InMemoryTransactionHistoryStorage`
  (the SDK's documented, ready-made transaction-history store, retains every `upsert()`ed entry
  forever by design) was the obvious candidate. Swapped in a discard-everything
  `TransactionHistoryStorage` implementation and re-ran against real Preprod: **the crash pattern
  was statistically indistinguishable** (heap hit ~3.2 GB at a comparable applied-index count and
  elapsed time either way). This rules out transaction-history storage as the cause — the leak is
  inside the wallet SDK's own internal shielded/dust sync-state tracking, not anything this script
  configures.

**Conclusion**: this is a real, reproducible bug in `wallet-sdk-facade@4.0.1` /
`wallet-sdk-shielded@3.0.1` (matching versions confirmed via `sdk-regression-check`'s drift-check —
no drift from the plugin's own June 2026 verified lock, so this isn't a stale-version problem
either) when syncing the Node-side `WalletFacade` against a chain with substantial real transaction
history. It is specific to *this* construction path — nothing here implicates the indexer, node, or
proof server, all independently confirmed healthy and responsive throughout every run.

**Next avenue, not yet attempted**: the browser/Lace DApp Connector path
(`midnight-dapp-dev:dapp-connector`) is architecturally distinct — a real wallet extension manages
its own sync state, not this Node script's `WalletFacade` construction — so it may not share this
bug at all. This is the next thing to try, not a re-run of the same broken path with different
parameters.

## Update 2: quantified — "wait longer" or "allocate more RAM" is not a viable workaround

Queried the real chain directly rather than guessing at scale: Preprod is at **block 2,330,285**
(`chain_getHeader` / the indexer's `block { height }`, both confirmed live). The instrumented run
above reached `shielded.progress.appliedIndex` ≈ 19,000 before exhausting a 3 GB heap — two to three
orders of magnitude short of the chain's actual size. If the leak's measured rate (~140 KB per
processed entry, from the observed ~20 MB/s at ~140 entries/s) holds anywhere near linearly across
the full chain, completing a sync would need on the order of **hundreds of gigabytes of RAM** — not
a number "give it more time" or "run it on a bigger machine" meaningfully closes. This rules out
patience or resource limits as the fix; the bug itself has to be resolved (or a different sync
strategy used) before this path is viable.

**Attempted the Lace browser path, blocked before it started**: Lace (`input-output-hk/lace` on
GitHub) is open source but ships no pre-built extension artifacts on its release page — only source
tags. Building it requires "your own API credentials (Blockfrost, Maestro, PostHog, Sentry, etc.)"
per the project's own README, none of which exist in this environment, and creating third-party
API accounts on the user's behalf without asking first is out of scope for this pass. Whether
Lace's own sync implementation avoids this bug (plausible — real users run it against this exact
chain daily, so it must use a materially different, more efficient sync strategy than this SDK
path) remains an open question, not a confirmed escape route, until someone actually builds and
runs it.

## Decision: stop here, report upstream, keep the mock-mode demo

Given three options (get third-party API credentials to build Lace; reverse-engineer manual
UTXO/transaction construction to bypass `WalletFacade` entirely; stop and report), the user chose
to stop. Filed as
[midnightntwrk/midnight-wallet#704](https://github.com/midnightntwrk/midnight-wallet/issues/704) — a
full writeup with exact versions, the instrumented reproduction, and both control experiments, so
the finding isn't lost. Real on-chain testnet submission stays deferred, unchanged from
`docs/adr/0006`'s original scoping; the local-devnet/mock-mode Midnight story remains this
project's demo path.
