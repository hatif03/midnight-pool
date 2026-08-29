# ADR-0006: Midnight contract architecture — profile commitment, credentials, fair break order

Status: Accepted

## Context

This is the "Integrate Midnight" and Mobile track work: the game (rules, multiplayer, economy,
PWA) is done and live with zero blockchain integration — `src/profile.js`'s level/XP/cue-ownership
is plain client-editable `localStorage`, and the host always breaks first every rack
(`newMatchGroups()`, `src/main.js`), a real, previously-unnoticed fairness bug (breaking is a
statistical advantage in pool).

Research grounded this in verified Midnight primitives (the `core-concepts:privacy-patterns` and
`compact-core:compact-patterns` plugin skills, not memory) and one real prior-art project fetched
directly: SoumyaEXE/Among-Midnight's "Shadow Protocol," a similar Midnight-hackathon add-on for an
Among-Us-style game.

## Decision

One Compact contract with circuits for:

- **Stat commitment** (`persistentCommit`): a tamper-evident on-chain attestation of a player's
  level/win-count/cue-collection state. Does not replace `profile.js` — adds an attestation on top.
- **Threshold credential proof** (selective disclosure — `disclose()` a boolean, never the value):
  "prove level ≥ X" / "prove wins ≥ N" without revealing the exact number, gating a ranked
  Quick-Match tier.
- **Soulbound cue-ownership claim** (nullifier + `Set`, not a transferable NFT — full NFT cosmetics
  are widely criticized as friction without benefit; soulbound is the sound pattern here):
  addresses today's "cue ownership is a plain localStorage field anyone can edit" weakness.
- **Provably-fair break order**: a 2-party commit-reveal coin flip. **Correction made during design
  review before writing any code**: a naive commit→reveal→combine has the classic "last-revealer"
  bias (whoever reveals second can abort after seeing the first value, forcing a re-roll). Fixed
  with a reveal deadline — a party who reveals within the window while the other doesn't wins the
  flip by default, since withholding a hash preimage has no strategic value once stalling just
  costs you the flip.

**Known, explicitly stated limitation** (shared by the threshold credential and the soulbound
claim): both prove a *relation* about a committed value, not that the value is *true*.
`profile.js`'s stats are client-editable with no issuer, so a player can commit a fabricated high
level and "prove" it truthfully. Closing this needs an attesting authority (server-signed stats, or
a state root only a trusted match-history contract can update) — explicitly out of scope. This
workstream demonstrates the ZK selective-disclosure and non-double-claim mechanisms correctly; it
is not a cheat-proof progression system and shouldn't be presented as one.

**Integration shape, adopted from Shadow Protocol with one deliberate correction**: their bridge is
a thin module hooked into a handful of existing-game moments, fire-and-forget so a slow/unavailable
chain never stalls the game — a good shape, adopted directly (see `src/midnight/hooks.js`,
ADR-adjacent work in this same pass). Their bridge generates proofs *server-side*, though — their
own trust-model table admits "server reading secrets: still possible" as a known v1 gap, with
browser+Lace-wallet proving on their roadmap but not yet built. Since this game is already fully
browser-based (theirs is a Python/pygame LAN game relaying through a Node bridge), proof generation
happens *in the browser* here from the start — genuinely satisfying the Mobile Track's "never
leaves the device unproven" framing rather than reproducing their gap. Same integration shape,
stronger trust model, because the underlying app was already a browser dApp.

Scaffolded via the `compact-core:compact-init-project` skill template rather than hand-rolled;
written with the `compact-core:compact-dev` agent and compiled-and-executed-verified with
`midnight-verify` before being considered done, per the standing project rule that no Compact
syntax should be trusted from memory and compilation alone doesn't prove correctness.

## Consequences

- First real blockchain/wallet code in this project — a new class of dependency (Midnight JS SDK,
  a wallet connector) and a new failure mode (proof-server/network availability) that didn't exist
  before.
- The "garbage in, provably out" limitation must be stated plainly in the demo — oversold as
  anti-cheat, this would be a misrepresentation, not just an incomplete feature.
- The break-order fix changes actual game behavior (who breaks is no longer always the host) —
  a real gameplay fairness improvement independent of the Midnight framing.

**Implementation note added once workstream 2 was built**: gameplay cannot wait on an indexer
round trip to learn who breaks, so `src/midnight/breakOrder.js` replays the same commit-reveal
*shape* (both peers commit a nonce, then reveal, then combine) directly over the existing PeerJS
channel — an independent SHA-256 computation, not a byte-for-byte replica of the contract's
`persistentHash` struct encoding, since only an unbiased combination of both nonces is required for
gameplay. The real `commitBreakChoice`/`revealBreakChoice`/`resolveBreak` circuits are still called
(`hookRecordBreakOrder` in `src/midnight/hooks.js`) with the same nonces, fire-and-forget, purely
for the tamper-evident on-chain record — this call never gates `game.turn`. This keeps the
"never blocks the game" property for the low-latency P2P path while the chain submission inherits
whatever latency/availability the indexer has that day.
