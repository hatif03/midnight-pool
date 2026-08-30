# ADR-0010: Guest-side physics verification via deterministic replay

Status: Accepted

## Context

Multiplayer is host-authoritative: `physicsFrame()` (`src/main.js`) no-ops for the guest, so only
the host ever runs `step()`/`shoot()` (`src/physics.js`). The guest receives only periodic ball
positions (`sendState()`, throttled to `frame % 2 === 0`) and lerps toward them visually — it has
no independent way to check that a shot's outcome is real. `docs/adr/0008` already named this gap
explicitly: a host that fabricates a match result from the very start gets an unwitting, honestly
computed but garbage-input agreement from the guest, and neither `docs/adr/0009`'s server
attestation nor the client's own `awardMatchResult()` would catch it — both trust each peer's
self-reported result.

Two facts made a fix tractable in the remaining time rather than a multi-day rewrite:
`src/physics.js`'s hot path has no trigonometry and no randomness — only `Math.hypot`/`Math.sqrt`,
of which `Math.sqrt` is IEEE-754 correctly-rounded (safe across browsers) and `Math.hypot` is not
spec-guaranteed correctly-rounded (real but bounded cross-browser float drift over hundreds of
sub-steps). This makes "replay the same deterministic loop and diff with a small epsilon" a sound
approach — a full fixed-point rewrite is not warranted by what's actually in the file.

## Decision

The host broadcasts the exact shot it's about to run — the pre-shot resting snapshot plus the
`shoot()` inputs (`dx, dy, power, spin`) — as a new `shotInput` message, right before mutating
anything in `doShoot()`. This covers every shot regardless of who took it: the guest's own shots
are still physically resolved only on the host (unchanged), so this is the only way the guest ever
learns what actually happened to its own shot, too.

`src/midnight/physicsVerify.js` (new, pure, no game-loop coupling): `replayShot(preShotBalls,
inputs)` runs the identical `shoot()` + `step()` loop locally to settling; `diffFinalState(replayed,
hostFinal)` compares final positions/potted-status per ball against an epsilon (3 table units,
`BALL_R` is 12) chosen to absorb `Math.hypot` drift without masking real divergence.

Client wiring (`src/main.js`): the guest stores the replay result on `game.pendingReplay` when
`shotInput` arrives; the next `state` message with `settled: true` is the host's authoritative
final state for that shot, so `applyState()` diffs against it there and logs a
`guestPhysicsVerification` entry to the existing audit dashboard (`audit.js`) — `ok: true`/`false`
plus the mismatch list. Same fire-and-forget, non-blocking contract as every other Midnight-adjacent
hook in this codebase: a mismatch is a visible flag for whoever's watching the audit log, never
something that alters gameplay or the client's own already-independent `awardMatchResult()`.

## Consequences

- Closes the specific gap ADR-0008 named: a host fabricating a shot's physics now produces a
  detectable mismatch on the guest's side, for every shot, not just the final result.
- **Still not full anti-cheat**: this verifies the host's *math* against the inputs it claims it
  used, not that those inputs reflect what the human player actually intended (a host could still
  lie about, say, its own claimed drag distance before physics ever runs) — no different in kind
  from the "garbage in, provably out" limitation already documented for the Midnight credential
  circuits (`docs/adr/0006`).
- Verified for real, not just unit-tested: `src/midnight/physicsVerify.js` has its own
  determinism/tamper-detection/epsilon self-test (`npm test`), and a real two-browser-context
  Playwright run (two independent Chromium contexts, host and guest, playing an actual break shot
  through the real UI's pointer events) confirmed a `guestPhysicsVerification: ok:true, mismatchCount: 0`
  entry in the guest's real audit log with zero console errors on either side.
- One new P2P message type (`shotInput`) added to the existing ad hoc protocol (`src/net.js`'s
  message shapes) — no relay/server involvement, purely between the two peers already connected.
