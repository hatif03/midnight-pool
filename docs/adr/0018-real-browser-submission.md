# ADR-0018: Real on-chain submission from the browser, via the DApp Connector in a Web Worker

Status: Accepted — supersedes ADR-0011's deferral of real submission

## Context

ADR-0006 deferred real on-chain submission. ADR-0011 attempted it from Node, hit a reproducible
out-of-memory crash syncing `WalletFacade` against public Preprod, and stopped — filing
[midnightntwrk/midnight-wallet#704](https://github.com/midnightntwrk/midnight-wallet/issues/704).
Its closing note named the browser/Lace DApp Connector as the next avenue, on the reasoning that a
wallet extension manages its own sync state and the page never constructs a `WalletFacade` at all.

Two things were re-measured before building on that reasoning.

**The leak is still present in the released stack, and is worse than reported.** Re-ran the
instrumented probe (`contracts/preprod/sync-probe.ts`) against real Preprod on 2026-09-13 with the
current released versions and a 6 GB heap:

```
{"t":36, "shielded":"15352/0","dust":"1339/0","heapMB":1347,"rssMB":1534}
{"t":66, "shielded":"19107/0","dust":"3181/0","heapMB":2458,"rssMB":2675}
{"t":102,"shielded":"23075/0","dust":"4971/0","heapMB":3337,"rssMB":3585}
```

Between t=36 and t=102 the heap grows 1,990 MB while `appliedIndex` advances 7,723 entries — about
**264 KB per processed entry**, against the ~140 KB/entry the original report measured. Preprod has
grown from block 2,330,285 when #704 was filed to 2,530,822 now. `highestIndex` is reported as `0`
throughout, the same secondary bug the original report noted, so the wallet cannot even say how far
it has to go.

**The 5.x beta line is not a usable escape.** It is the likeliest home of a fix, but it is
pre-release the whole way down, and decisively `wallet-sdk-hd` has no released version exporting
`WalletSeeds`, which the 5.x facade's `start()` requires — only `3.1.0-canary.*` builds have it.
See ADR-0016.

So Node-side deployment to a public network is blocked by an upstream bug, and the browser is not a
preference but the only route.

## Decision

**Submit through the DApp Connector, from a Web Worker.**

`src/midnight/chain.worker.js` owns midnight-js, `compact-js` and the ledger WASM. `src/midnight/chain.js`
owns the wallet and runs on the main thread. They talk over `postMessage`.

**The worker is not an optimisation, it is a correctness requirement.** Physics runs at a fixed 60Hz
on the main thread via `setInterval`, with rendering on the Pixi ticker. Any synchronous main-thread
block over ~8ms is a visible stutter mid-shot, and `ledger-v8`'s wasm-bindgen (de)serialisation is
synchronous and not cheap. An un-awaited promise still resolves on the main thread — "don't await it"
relocates jank rather than removing it. Dynamic `import()` fixes *bundle size*; a worker fixes *frame
time*. Both are needed and they are different problems.

**The split is only possible because of a property of the connector.** A `ConnectedAPI` is a live
object of functions injected by the extension; it cannot be structured-cloned into a worker, which
would normally make this design impossible. But the connector's entire transacting surface speaks
serialized hex strings — `balanceUnsealedTransaction(hex) -> hex`, `submitTransaction(hex) -> void` —
and strings clone perfectly. The worker therefore owns the SDK and calls back to the main thread for
exactly three operations: fetching shielded addresses, balancing, and submitting.

**A serial transaction queue.** One tx at a time: concurrent transactions contend for the same UTXOs
and the wallet rejects the loser. This is what lets gameplay fire circuit calls freely without any
call site reasoning about ordering.

**Real mode never costs the player a feature.** Any failure — no wallet, a rejected prompt, no
contract address, an unreachable indexer, a proof server timeout — records an audit row and falls
through to the local mock relation. `proveThreshold` in particular falls through rather than
returning `false`, because a chain problem must never render as "you do not qualify".

**ZK artifacts are served from `public/midnight/`.** `FetchZkConfigProvider` resolves
`{base}/keys/{circuit}.prover` and `{base}/zkir/{circuit}.bzkir` — verified by reading the published
package, not assumed. Measured per-circuit prover keys are **2.7–5.0 MB**, which settles an open
question: in-browser proving is viable on a phone at that size, where 10 MB would not have been.
They are deliberately excluded from the service worker precache, so an install does not pay 28 MB for
circuits the player may never call.

## Consequences

**A public deployment now has exactly one manual step, and it is not ours to automate.** The Preprod
faucet is gated by Cloudflare Turnstile, so no script can obtain test tokens. The flow is: connect
Lace → fund the unshielded address from the faucet → delegate NIGHT so DUST accrues → press Deploy.
Everything either side of the faucet is automated; the faucet is a human step by design, and
documenting it as such is more honest than pretending otherwise.

**Two bundling hazards were hit and are now guarded.** Two physical copies of `onchain-runtime-v3`
(`midnight-js-protocol` pins 3.0.0, `compact-runtime` pulls 3.1.1) — two copies of a wasm-bindgen
module means two JS classes for one Rust type and `_assertClass` throws on any value crossing
between them, the failure ADR-0007 and ADR-0013 each lost an afternoon to. Fixed with an `overrides`
entry plus `npm dedupe`, verified as one copy on disk. And Vite builds workers through a **separate**
plugin pipeline, so `vite-plugin-wasm` had to be registered under `worker.plugins` as well or the
worker build fails with `UNLOADABLE_DEPENDENCY` while the main build succeeds.

**The gameplay bundle is unchanged.** The worker is an 801 KB chunk that is only fetched when a
player connects a wallet. Verified in a real browser: during ordinary play no Midnight worker or WASM
resource is requested at all.

**`contracts/preprod/` keeps the Node path.** It cannot deploy to Preprod while #704 stands, but it
is the reproduction harness for that bug and the place a fix gets re-tested. Its wallet seed is
gitignored — a committed seed is a published private key.

**What is still not real.** Only `commitStats`, `proveThreshold` and `claimCue` are on the browser
chain path. The break-order flip runs peer-to-peer (the contract exists and is tested); the stakes
contract is not yet wired to the browser. `docs/HUSTLE_PROTOCOL.md` states this split and its trust
consequences plainly rather than implying everything is on-chain.
