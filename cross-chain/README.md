# Cross-chain Champion Badge — the lighter join

Per [ADR-0007](../docs/adr/0007-effectstream-cross-chain.md): the full Effectstream
`evm-midnight-v2` stack proved too version-fragile to stabilize (six distinct real environment
bugs found and fixed in sequence, documented in the ADR's Outcome section, before the final one —
a WASM module-identity duplication bug — led to dropping it). This is the documented fallback:
the same conceptual pattern (independently read two chains, join them in a script, no bridge)
built with tools already proven stable in this repo.

- `src/ChampionBadge.sol` — a minimal on-chain registry (deliberately not a full ERC-721 — this
  demo is about the cross-chain join, not NFT marketplace compliance), compiled with Foundry.
- `../contracts/cross-chain-join.ts` — the join script. Runs the *real* `proveThreshold` circuit
  from `contracts/midnight-pool.compact` (through `@midnight-ntwrk/compact-runtime`'s simulator,
  same engine `contracts/test/simulator.test.ts` uses — not mocked), deploys `ChampionBadge` to a
  real local `anvil` chain, mints only if the Midnight side actually qualified, reads the tier back
  independently, and asserts the two sides agree.

## Run it

```bash
cd cross-chain && forge build   # once, or after editing ChampionBadge.sol
anvil --port 8545 &             # separate terminal/background

cd ../contracts
npx tsx cross-chain-join.ts 10  # level 10 >= threshold 5 -> mints, tier reads back as 1
npx tsx cross-chain-join.ts 2   # level 2 < threshold 5 -> does not mint, tier reads back as 0
```

## What this does and doesn't demonstrate

Real execution on both sides, not a hardcoded example — verified both directions (qualifying and
non-qualifying levels actually produce different on-chain EVM state). What it is **not**: a
persistent syncing service. It's a one-shot script run on demand, not a live-updating join the way
Effectstream's sync node is, and no frontend renders it today — a natural next increment if this
track gets more time, not something already built.

The join key (`evmAddress` in the script) is the Midnight-derived public key truncated to 20
bytes, used as a stand-in EVM address — a demo convenience, not a real address-derivation
standard.
