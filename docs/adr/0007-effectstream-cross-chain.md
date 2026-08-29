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
