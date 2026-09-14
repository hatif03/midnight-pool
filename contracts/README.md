# Midnight Pool — Compact contracts

Two contracts:

- `midnight-pool.compact` — the privacy layer described in
  [ADR-0006](../docs/adr/0006-midnight-contract-architecture.md) (stat commitment, threshold
  credentials, soulbound cue claims, fair break order), plus its TypeScript witnesses
  (`witnesses.ts`). **This is the contract deployed to Preview.**
- `stakes.compact` — the match-stakes audit record described in
  [ADR-0008](../docs/adr/0008-match-stakes-trust-model.md). No witnesses: every value it touches is
  already public (match id, role, amount, claimed winner), so there is nothing to keep private.
  Implemented and tested; **not deployed** to Preview and **not** on the browser path.

Toolchain (pinned, measured — [ADR-0016](../docs/adr/0016-one-released-midnight-stack.md)): Compact
compiler **0.31.1**, language 0.23.0, `@midnight-ntwrk/compact-runtime` **0.16.0**, ledger-8.0.2,
`midnight-js` **4.1.1**. Do not "upgrade" to compiler 0.34 / runtime 0.19 — that output cannot be
deployed by the released SDK, and `npm test` will fail a runtime version check. Compile in Docker
(`bash scripts/compact-docker/compile.sh`); `compact` on Windows PATH is the NTFS compression tool.

Live Preview contract (anyone can query — [DEPLOYMENT.md](../docs/DEPLOYMENT.md)):

`749fd2e5a6a44161d56a7be1fb00a556bed169cbe18f1834d01d546a7615aaf3`

Record: `preprod/deployed.json`. Players connect Lace; they do not each deploy.

```bash
npm install
npm run compile      # full build incl. ZK proving keys (writes managed/)
npm run compile:fast # --skip-zk, for iterating
npm run typecheck
npm test             # executes every circuit, incl. failure paths
```

> On Windows there is no native Compact CLI — only Linux/macOS builds exist, and
> `compact` on the Windows PATH is the unrelated NTFS compression tool. Run the
> compile steps inside Docker (or WSL). `npm test` and `npm run typecheck` run natively.

> `managed/*/contract/` (the compiled circuit JS) is committed on purpose —
> `src/midnight/circuit.js` imports it for the browser bundle, and Vercel builds
> from a fresh clone with no compile step (see [ADR-0012](../docs/adr/0012-commit-compiled-contract-for-browser-build.md)).
> **After recompiling, re-commit `managed/*/contract/`** or the browser bundle
> goes stale against whatever circuit it's actually running. Everything else
> under `managed/` (`compiler/`, `keys/`, `zkir/`) stays gitignored.

## Circuits — midnight-pool.compact

On the live browser path: `commitStats`, `proveThreshold`, `claimCue` submit when a wallet is
connected. Break-order is still **decided** peer-to-peer so the rack starts immediately; the same
three Compact circuits are queued fire-and-forget after that flip and stay incomplete if the
opponent has no wallet.

| Circuit | Signature | Discloses | Live browser path |
|---|---|---|---|
| `commitStats` | `(): []` | player public key; the commitment hides level and wins | yes |
| `proveThreshold` | `(threshold: Uint<64>, checkWins: Boolean): Boolean` | the boolean answer only — never the underlying number | yes |
| `claimCue` | `(): []` | one opaque nullifier; the tier and the player stay private | yes |
| `commitBreakChoice` | `(matchId: Bytes<32>, role: Uint<8>, revealDeadline: Uint<64>): []` | matchId, role, deadline (public protocol data) | best-effort after P2P |
| `revealBreakChoice` | `(matchId: Bytes<32>, role: Uint<8>): []` | matchId, role, and the revealed nonce | best-effort after P2P |
| `resolveBreak` | `(matchId: Bytes<32>): Uint<8>` | matchId and the winning role (1 or 2) | best-effort after P2P |

## Circuits — stakes.compact

Everything here is public by design (see ADR-0008) — there is no private value to hide, so no
`disclose()` calls appear beyond the parameter list itself. **Not on Preview, not in the browser.**

| Circuit | Signature | Notes |
|---|---|---|
| `openStake` | `(matchId: Bytes<32>, role: Uint<8>, amount: Uint<64>): []` | the second role to open must match the first's `amount`, or it's rejected |
| `attestResult` | `(matchId: Bytes<32>, role: Uint<8>, winner: Uint<8>): []` | write-once per `matchId` — whichever attestation lands on-chain first is final, agreeing or not |
| `resolveStake` | `(matchId: Bytes<32>): Uint<8>` | fails until `attestResult` has been called at least once for that match |

## Call sequence

```ts
let s = createPrivateState();          // or createPrivateState(existingSecretKey)

// Stats
s = withStats(s, level, wins);         // then commitStats(), then proveThreshold(n, false)

// Cue claim
s = withPendingCueTier(s, tier);       // then claimCue()

// Break order — call withActiveMatch before BOTH commit and reveal,
// with the same role you pass to the circuit.
s = withActiveMatch(s, matchId, 1n);   // then commitBreakChoice(matchId, 1n, deadline)
s = withActiveMatch(s, matchId, 1n);   // then revealBreakChoice(matchId, 1n)
// once both revealed (or the deadline passed): resolveBreak(matchId)
s = forgetMatch(s, matchId);
```

`revealDeadline` is **Unix epoch seconds** — the runtime sets block time from
`Math.floor(Date.now() / 1000)` and the ledger stores it as `secondsSinceEpoch`.

## Things to know

- **Witnesses must stay pure reads of private state.** Randomness for the break
  flip is minted in `withActiveMatch`, not inside a witness, because a proof
  server or a submit retry can re-invoke witnesses from the pre-call state. A
  witness that minted a fresh nonce each time would seal a commitment it could
  never open. There is a regression test for this.
- **Private state must be persisted.** Losing it orphans the player's
  `statsCommitment` entry permanently: a new secret key means a new public key,
  and the old entry can never be reopened.
- **Garbage in, provably out.** These circuits prove a *relation* about a
  committed value, not that the value is true. The game's stats are
  client-editable with no attesting issuer, so a player can commit fabricated
  stats and then honestly "prove" a threshold over them. `claimCue` likewise
  applies no entitlement check — any key can claim any tier once. Closing either
  needs a signing authority, which ADR-0006 puts out of scope. Do not present
  this as anti-cheat.
- **`stakes.compact`'s `role` is not signature-bound either.** A third party who reads a match's
  public `matchId` could call `openStake`/`attestResult` claiming a role it isn't part of. Neither
  circuit gates real custody (the Coins transfer happens client-side) or real gameplay, so the
  consequence is a polluted audit record for one match, not a stolen stake — see ADR-0008.

## Cross-chain join scripts

Two versions, same join logic (`docs/adr/0007`, `docs/adr/0013`):

- `cross-chain-join.ts` — fast, no local devnet needed. Midnight side runs through the
  `compact-runtime` simulator; EVM side is a real `anvil` transaction.
- `devnet-deploy/cross-chain-join-real.ts` — slower (~2-3 min), both sides fully real: a genuine
  `deployContract`/`callTx` against a running local devnet (real ZK proof, real transaction, real
  block confirmation), joined with the same real `anvil` EVM side. Needs the local devnet running
  (`/midnight-tooling:devnet start`) and `anvil` listening on `127.0.0.1:8545`. Lives in its own npm
  package (`devnet-deploy/`) because the original dual-runtime split put `midnight-js-contracts` on
  `compact-runtime@0.16.0`; that package is still the place the fully-real join runs. The rest of
  this repo is now one stack (compiler 0.31.1 / runtime 0.16.0) — see ADR-0016.
