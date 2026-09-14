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

**Implementation note added once the cross-chain UI wiring was built**: `src/midnight/hooks.js`'s
mock mode re-implements each circuit's relation by hand in plain JS (e.g. `level >= threshold`
directly, never touching the compiled contract) — deliberately kept as-is for the ranked-gate/
cue-claim/stats-commit call sites, which fire during live gameplay and need to stay fast and
synchronous. A new, separate module, `src/midnight/circuit.js`, adds a genuinely stronger
capability alongside it: it runs the *actual compiled circuit* client-side via
`@midnight-ntwrk/compact-runtime`'s simulator — the same engine `contracts/test/simulator.test.ts`
and `contracts/cross-chain-join.ts` already use — dynamically imported only when used, so its
~1.4 MB WASM dependency (`@midnightntwrk/onchain-runtime-v4`) never loads on the menu/game's
critical path. It's used by one deliberately isolated feature, the "Cross-Chain Champion Badge"
panel (settings → Midnight), specifically so the honesty upgrade (the browser runs the exact
circuit, not a hand-rolled guess at it) doesn't introduce a WASM cold-start delay into any existing
gameplay flow — the ranked gate and cue-claim modal still use the fast hand-rolled mock, unchanged.
Bundling the WASM dependency required `vite-plugin-wasm` (Vite's built-in WASM handling only
covers `?init`/`?url`-suffixed imports, not the raw ESM `.wasm` import wasm-bindgen emits) —
verified by building *and* by running the real circuit in an actual Chromium browser via
Playwright (both the qualifying and non-qualifying cases), not just by a successful `vite build`.
Neither `circuit.js` nor the hand-rolled mocks touch `hookRecordBreakOrder`/`hookOpenStake`/
`hookAttestResult` — those need real shared on-chain state across two independent browser
sessions, which local simulation cannot provide regardless of how the mock is implemented.

## Update: live chain path is three circuits, not the full original dual-path (2026-09-15)

The Preview contract and the browser worker (ADR-0018) submit **`commitStats` / `proveThreshold` /
`claimCue` only** (`ON_CHAIN` in `src/midnight/hooks.js`). `hookRecordBreakOrder` still runs and
writes The Rail, but `resolveBreak` is not in that set, so a connected wallet does **not** land a
break-order transaction. The P2P handshake in `breakOrder.js` is the live fairness mechanism; the
Compact break circuits remain compiled, tested, and ready. `stakes.compact` is likewise not
deployed. See [HUSTLE_PROTOCOL.md](../HUSTLE_PROTOCOL.md) and
[DEPLOYMENT.md](../DEPLOYMENT.md#who-can-do-what).


**Implementation note added once 8-Ball-Pool-style leagues were built**: leagues (`src/leagues.js`,
Brass through Diamond) reuse `proveThreshold` exactly as designed rather than adding a new circuit
— a win-rate-gated tier was considered and rejected specifically because it would need `losses`
added to the compiled `PlayerStats`/`commitStats` signature, breaking an already-verified contract
for no demo value beyond what level/wins gating already shows. League badges are also deliberately
**not** a soulbound claim (unlike cues): a soulbound claim can only be acquired, never revoked, but
league standing must be able to regress on a losing streak — reusing `claimCue`'s pattern here
would be a category error, not the simplification it might look like. Each league check is an
ephemeral `proveThreshold` call re-run on demand, correctly reflecting current standing every time.
