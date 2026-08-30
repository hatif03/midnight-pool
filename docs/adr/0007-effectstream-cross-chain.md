# ADR-0007: Cross-chain via the full Effectstream evm-midnight-v2 stack

Status: Accepted

## Context

Targeting the hackathon's Cross-Chain Track: "dApps and games that span ecosystems... with
Midnight as the shared privacy engine." Verified directly against the live
`effectstream/effectstream` repo (not assumed): it does **not** bridge chains — a sync node
independently reads both an EVM chain and Midnight, and joins their state off-chain on a shared
key. This is a deliberate design choice, not a limitation: cross-chain bridging's dominant real
story is failure (Ronin's $625M exploit, among ~$2.6B in bridge exploits industry-wide in 2022) —
no bridge means no bridge-custody exploit surface.

Its `evm-midnight-v2` template is real and actively maintained (commits the same day as this
research), but a heavy local stack: Hardhat, a full Midnight devnet (node/indexer/proof-server),
Postgres, a sync node, a batcher — realistically 1-2 days of setup even for a team comfortable with
the tools, with visible version-churn risk in its own commit history (dependency/SDK migrations,
WASM linking issues). A lighter custom join (a small script reading both chains directly, same
conceptual pattern, no local stack) was the available alternative.

## Decision

Run the full Effectstream `evm-midnight-v2` stack rather than the lighter custom join, per the
user's explicit choice knowing the setup cost above.

- EVM side: a small ERC-721 "Champion Badge" contract (Hardhat local, or a public testnet if time
  allows), minted when a player's Midnight-side credential proof (ADR-0006) crosses a "Champion"
  rank threshold.
- Midnight side: the same credential contract discloses the specific proven property (rank tier
  reached) that justified the mint — matching Effectstream's own template pattern exactly (its
  `counter.compact` example discloses a chosen property for the sync node to join, not a whole
  computation).
- Effectstream's sync node joins EVM ownership + the Midnight-disclosed property into one queryable
  row, the same way the template does it, for the frontend to render a genuinely
  both-chains-backed "cross-chain champion badge."

**Documented fallback, written down now rather than as a silent scope cut later**: if the full
local stack proves too unstable to get running in the available time — a real risk given the
visible version-churn in Effectstream's own history, not hypothetical — fall back to the lighter
custom join (the alternative the user didn't pick) rather than letting cross-chain scope block the
whole submission.

## Consequences

- A second/third deployable stack beyond the existing frontend (Vercel) and matchmaking relay
  (Cloud Run) — Hardhat + a local Midnight devnet + Postgres + Effectstream's sync/batcher
  services, none of which are today part of this project's infrastructure.
- Real schedule risk given the verified 1-2 day setup cost and version-churn history — the
  fallback above exists specifically because this was a known, accepted tradeoff, not an
  oversight.
- Bun and Foundry (`forge`) become new toolchain dependencies alongside the existing Node/npm and
  Compact CLI tooling.

## Outcome: the fallback was invoked, not a hypothetical

The full stack was actually attempted, not just estimated. Real, substantial progress was made —
this genuinely came close to working, not a quick abandonment:

- Docker turned out **not** to be required at all (a correction to this ADR's original
  assumption) — the "full local Midnight devnet" is native npm-packaged binaries launched by Bun's
  own orchestrator, plus PGLite (embedded Postgres), confirmed by reading the template's real
  source rather than assuming.
- The whole stack had to run inside WSL specifically, since the Midnight node/indexer/proof-server
  binaries only ship for `linux-amd64`/`macos-arm64` — no Windows build, discovered by inspecting
  the packages' own `supportedPlatforms` list.
- Getting the stack to actually boot required finding and fixing **six distinct, real environment
  bugs in sequence**, each confirmed by direct inspection (symlink targets, `ldd`, `file`, ELF
  headers) rather than guessed: stale per-workspace `node_modules` symlinks left behind after
  switching Bun's linker mode; several packages' declared dependencies never actually getting
  per-workspace symlinks under Bun's hoisted linker (`forge`/`hardhat`/`.bin` shims, OpenZeppelin
  imports); a proof-server binary built via Nix with a hardcoded `/nix/store/...` dynamic-linker
  path absent on this non-Nix system (fixed by recreating that exact path as a symlink to the real
  system linker — verified compatible via `ldd` first); a `graphql@17` package.json whose `"bun"`
  export condition pointed a synchronous `require()` at an ESM-only file Bun cannot load that way;
  a compiled-circuit-vs-installed-runtime version mismatch (`compact-runtime` pinned to
  `0.18.0-rc.1` in the template's own `package.json` despite its own `CLAUDE.md` stating `0.16.0`
  is correct for its pinned `0.31.0` compiler); and finally a WASM module-identity duplication bug
  (`ContractMaintenanceAuthority` instantiated from two different nested copies of
  `compact-runtime` — one at the workspace root, one privately nested inside
  `@effectstream/midnight-contracts` — colliding at the exact final step, deploying the Midnight
  contract to the live local devnet).
- At that point — full EVM compile+deploy working, the full Midnight devnet (node producing and
  finalizing real blocks, indexer, proof server all genuinely running) working, only the very last
  integration step still broken — the user made the call: drop Effectstream. This is exactly the
  contingency this ADR wrote down in advance, now actually exercised rather than theoretical.

**Decision, corrected**: built the documented fallback instead — `cross-chain/` (a minimal Foundry
project, no OpenZeppelin, no Hardhat) and `contracts/cross-chain-join.ts`, joining two genuinely
real, independently-verified pieces with a plain Node script: `midnight-pool.compact`'s already-
verified `proveThreshold` circuit (executed for real through
`@midnight-ntwrk/compact-runtime`'s simulator — the same engine `contracts/test/simulator.test.ts`
uses, not mocked) and a real `anvil` chain (deployed and minted via `forge`/`cast`, not mocked
either). The join key is the Midnight-derived public key, truncated to 20 bytes and used as the
EVM address — a demo convenience stated as such, not a real address-derivation standard. Verified
both directions: a qualifying level actually mints (tier reads back as 1), a non-qualifying level
mints nothing (tier reads back as 0), and the script asserts the two sides agree before exiting 0.

**What this fallback demonstrates, and what it doesn't**: it's a genuine two-chain join with real
execution on both sides — not a toy or a hardcoded example — but it is a one-shot script run on
demand, not a persistent syncing service the way Effectstream's sync node is. No frontend renders
it live today; that would be the natural next increment if this track gets more time.
Bun and Foundry remain installed (Foundry is what the fallback actually uses); the Bun/WSL/Nix/
graphql/version-pin fixes above live only in the now-deleted `effectstream/` working tree, not in
this repo — recorded here as the evidence for *why* the fallback was the right call, not as
something to reproduce.
