# Midnight Pool — Compact contracts

Two contracts:

- `midnight-pool.compact` — the privacy layer described in
  [ADR-0006](../docs/adr/0006-midnight-contract-architecture.md) (stat commitment, threshold
  credentials, soulbound cue claims, fair break order), plus its TypeScript witnesses
  (`witnesses.ts`).
- `stakes.compact` — the match-stakes audit record described in
  [ADR-0008](../docs/adr/0008-match-stakes-trust-model.md). No witnesses: every value it touches is
  already public (match id, role, amount, claimed winner), so there is nothing to keep private.

Toolchain: Compact CLI 0.5.2, compiler 0.34.0, language version 0.26.0,
`@midnight-ntwrk/compact-runtime` 0.19.0.

```bash
npm install
npm run compile      # full build incl. ZK proving keys (writes managed/)
npm run compile:fast # --skip-zk, for iterating
npm run typecheck
npm test             # executes every circuit, incl. failure paths
```

> On Windows there is no native Compact CLI — only Linux/macOS builds exist, and
> `compact` on the Windows PATH is the unrelated NTFS compression tool. Run the
> compile steps inside WSL. `npm test` and `npm run typecheck` run natively.

## Circuits — midnight-pool.compact

| Circuit | Signature | Discloses |
|---|---|---|
| `commitStats` | `(): []` | player public key; the commitment hides level and wins |
| `proveThreshold` | `(threshold: Uint<64>, checkWins: Boolean): Boolean` | the boolean answer only — never the underlying number |
| `claimCue` | `(): []` | one opaque nullifier; the tier and the player stay private |
| `commitBreakChoice` | `(matchId: Bytes<32>, role: Uint<8>, revealDeadline: Uint<64>): []` | matchId, role, deadline (public protocol data) |
| `revealBreakChoice` | `(matchId: Bytes<32>, role: Uint<8>): []` | matchId, role, and the revealed nonce |
| `resolveBreak` | `(matchId: Bytes<32>): Uint<8>` | matchId and the winning role (1 or 2) |

## Circuits — stakes.compact

Everything here is public by design (see ADR-0008) — there is no private value to hide, so no
`disclose()` calls appear beyond the parameter list itself.

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
