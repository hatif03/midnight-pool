# ADR-0008: Match stakes trust model — honest scope, not trustless escrow

Status: Accepted

## Context

The user chose to build match stakes (betting the existing, non-purchasable Coins currency on a
1v1 match) despite a real regulatory flag research surfaced: Gods Unchained (Immutable X) was
rated Adults-Only 18+ specifically because on-chain wagering counts as gambling. Scoping to Coins
(never real money, consistent with `docs/adr/0001`'s "no real-money purchases" framing) keeps this
project out of that category while still building the feature.

Multiplayer today is host-authoritative: only the host runs physics
(`physicsFrame()` returns early for `game.mode === 'guest'`, `src/main.js`), the guest mirrors
state via `sendState()`/`applyState()` with no independent way to verify a shot. A fully trustless
escrow needs both peers to independently compute and agree on results — deterministic fixed-point
physics, lockstep simulation — a much bigger change, explicitly out of scope here.

**A design flaw caught in review before any code was written**: the original design ("2-of-2
attestation, both sign the final state, escrow releases when they agree, timeout favors whoever's
connected") does not do what it sounds like. If the host is dishonest, "both must agree" only
prevents release — it doesn't resolve anything in the guest's favor and is indistinguishable
on-chain from an honest network-blip disagreement. Worse, "timeout favors whoever's connected" is
actively exploitable: a host about to lose can go silent at exactly that moment and later claim
forfeit in their own favor, indistinguishable on-chain from the guest disconnecting instead.

## Decision

Escrow (#9) + timestamped 2-of-2 attestation, corrected: on a timeout (attestation missing or
disagreeing), resolve in favor of **whichever attestation arrived first** (timestamped on-chain),
not whichever party is currently connected. This closes the "go silent right when losing" exploit
specifically — the guest already received the true final state from the host via the existing
sync mechanism before a last-moment host could suppress anything, so the guest's honest,
already-submitted attestation wins by default once the deadline passes, even if the host never
attests at all.

**What this still does not fix, stated plainly rather than overclaimed**: a host that fabricates
the match result from the very start (not just goes silent at the end) can get the guest to
unknowingly co-sign the same lie, since the guest has no independent physics verification — the
same "garbage in, provably out" limitation as ADR-0006, surfacing here as "garbage state in,
provably-agreed garbage state out." Closing it needs guest-side physics verification
(deterministic replay, lockstep simulation) — the documented upgrade path, not attempted now.

**Why build it despite the caveat**: scoped to non-real-money practice currency (low actual harm
from the residual exploit), it closes the cheapest/most obviously rational attack (silently
forfeiting when losing) rather than shipping a feature that's trivially and constantly broken, and
it genuinely demonstrates the Escrow + timestamped-attestation pattern. The honest limitation is
worth documenting clearly here rather than overselling "provably fair wagering," which this is not.

## Consequences

- Stakes are demonstrably not fully trustless — any public framing of this feature must say so,
  not just this ADR. "Provably fair wagering" is not an accurate description of what's built.
- A "first attestation wins on timeout" rule requires the contract to record attestation order,
  not just the two final values — a small but real addition to the escrow circuit beyond a naive
  "check both match."
- The genuine upgrade path (guest-side physics verification) is a substantial future project, not
  a quick follow-up — noted here so it isn't mistaken for an oversight to "just fix later."
