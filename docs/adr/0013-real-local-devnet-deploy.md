# ADR-0013: Real contract deploy + circuit calls against the local devnet

Status: Accepted

## Context

ADR-0011 concluded real on-chain submission wasn't viable against the public Preprod testnet — a
genuine `wallet-sdk-facade` sync bug (filed as
[midnightntwrk/midnight-sdk#370](https://github.com/midnightntwrk/midnight-sdk/issues/370)) leaks
memory linearly with the number of processed ledger entries, and Preprod's real 2.33M-block history
is far beyond what any reasonable amount of RAM could get through. The user then asked whether the
**local devnet** could demonstrate real cross-chain/Midnight functionality instead. It can, for a
concrete, verifiable reason: the same wallet SDK construction, run against the plugin's own
`sdk-regression-check` smoke test on a local devnet, already synced cleanly in ~188s — the bug only
manifests at real-chain scale, and a local devnet's chain is small by construction. The local devnet
also ships a pre-funded genesis seed (`0x000…001`), so there's no faucet or DUST-delegation wait
either.

## Decision

Built `contracts/devnet-deploy/` (a **separate npm package**, not a script inside `contracts/`
directly) that deploys the real `midnight-pool.compact` contract to the local devnet and calls real
circuits (`commitStats`, `proveThreshold`) — genuine ZK proof generation via the local proof server,
genuine transaction submission and block confirmation, not the simulator.

**Why a separate package, not just a new script**: `midnight-js-contracts@4.1.1` depends (via
`@midnight-ntwrk/midnight-js-protocol`) on `@midnight-ntwrk/compact-runtime@0.16.0` — per the
official compatibility matrix (`compact.compile 0.31.1` / `compact-runtime 0.16.0` /
`midnight.js 4.1.1`), fetched directly from `midnightntwrk/midnight-docs`, not assumed. `contracts/`
itself already depends on `compact-runtime@0.19.0` for the browser bundle and simulator tests
(`docs/adr/0012`). Node resolves a generated contract module's `@midnight-ntwrk/compact-runtime`
import based on **the module file's own location in the directory tree**, not the importing
script's location — so a `managed-devnet/` compiled for 0.16.0 but living directly under
`contracts/` still resolves the parent's 0.19.0 and fails a runtime version check
(`compiled code expects 0.16.0, runtime is 0.19.0`). Moving the compiled output *inside*
`devnet-deploy/` (`devnet-deploy/managed-devnet/`) makes Node's upward resolution find
`devnet-deploy/node_modules`'s isolated 0.16.0 first.

**The contract source needed one real fix, not a workaround**: `midnight-pool.compact` declared
`pragma language_version >= 0.26`, but the matrix's compiler (`0.31.1`) only targets language
version `0.23.0`. Tested by compiling a copy with the pragma lowered to `>= 0.23` — it compiled
clean with full ZK keys, proving the contract's actual syntax never needed 0.26+ in the first
place. Lowered the real pragma (in both `.compact` files) to `>= 0.23` — a genuine correctness fix,
verified by re-running the existing `+0.34.0` compile and the full `npm test` suite (46 checks)
afterward to confirm nothing regressed for the browser-bundle path.

**Two more WASM class-identity mismatches, same root cause as ADR-0007's Effectstream bug, fixed
the standard way**: even inside the isolated `devnet-deploy/` package, `midnight-js-protocol`
nests its *own* copies of `@midnight-ntwrk/ledger-v8` (`8.1.0` vs the top-level `8.1.1`) and
`@midnight-ntwrk/onchain-runtime-v3` (`3.0.0` vs top-level `3.1.0`) — two different WASM builds of
"the same" version register distinct classes, so an object built from one instance fails
`wasm-bindgen`'s `_assertClass` check when passed into code compiled against the other. Routing
specific imports to specific instances by hand didn't work here (unlike a client script, the
conflicting calls both happen *inside* `wallet-sdk-dust-wallet`'s own compiled code, which uses
different instances for wallet startup vs. fee balancing). Fixed properly with npm `overrides`,
forcing a single resolved copy of each package tree-wide — the standard fix for this class of
problem, not a hack.

**A few smaller, genuinely undocumented required options** (not covered in any installed plugin
skill's example, discovered only by running it): `levelPrivateStateProvider` requires
`privateStoragePasswordProvider` (≥16 chars, ≥3 of 4 character classes) and `accountId` (scoped to
the wallet's own coin public key) — omitted from the `midnight-wallet`/`compact-cli-dev` skills'
reference examples, likely added in a version newer than what those skills were verified against.

## Consequences

- **Real deploy, real circuit execution, real confirmation — verified, not asserted**:
  `contractAddress`, `txId`, and `blockHeight` are genuine values returned by the local devnet for
  the deploy, `commitStats`, and `proveThreshold` calls; `proveThreshold(5n, false)` against a
  committed `level: 7n` correctly returned `true`.
- **Wired into a real cross-chain join, both directions verified**:
  `contracts/devnet-deploy/cross-chain-join-real.ts` reuses `deployAndProveThreshold` for the
  Midnight side (now returning the on-chain committed public key, read back via
  `publicDataProvider.queryContractState` + the compiled contract's own `ledger()` decoder, and the
  circuit's disclosed boolean) and the same real anvil/Foundry `ChampionBadge.sol` flow from
  `contracts/cross-chain-join.ts` for the EVM side. Two hand-off bugs fixed getting there: a naming
  collision (the compiled contract's own `ledger` export shadowing the `ledger-v8` namespace import
  — renamed to `contractLedger`), and reusing the *same two* WASM-identity dedup fixes from above
  (this script re-exercises the identical dependency graph). Run twice, both outcomes confirmed
  real and consistent: level `10` (≥ threshold `5`) → Midnight discloses `true` → EVM mints tier
  `1`; level `2` → Midnight discloses `false` → EVM tier stays `0`. This upgrades the
  Integrate-Midnight/Cross-Chain story genuinely — still not a public testnet, but real proofs, real
  transactions, real block confirmations on both chains, not an in-memory simulator on one side.
- The original `contracts/cross-chain-join.ts` (simulator-only Midnight side) is kept as-is,
  unmodified — it's faster to run (no wallet sync, no local devnet needed) and still genuinely
  demonstrates the same join logic; `cross-chain-join-real.ts` is the stronger, slower sibling for
  when the extra honesty is worth the ~2-3 minutes of wallet sync + real block confirmations.
- `devnet-deploy/`'s `package.json`/`package-lock.json` are committed (small, no secrets); its
  `node_modules/`, `managed-devnet/` (regenerable via `npm run compile:devnet`), and
  `midnight-pool-devnet-deploy/` (the LevelDB private-state directory, real seed-derived but
  local-devnet-only) all stay gitignored.
- The genesis seed (`0x000…001`) is a widely-known, intentionally-public local-devnet convention —
  explicitly commented in the script as never appropriate for anything but a local, throwaway
  network.
