# ADR-0016: Pin one fully-released Midnight stack, and build the toolchain in Docker

Status: Accepted

## Context

Two problems blocked any real Midnight work on this machine, and both were previously worked around
rather than solved.

**The Compact compiler could not run here.** `compact` on this machine's PATH resolves to
`C:\Windows\System32\compact.exe` — Windows' NTFS compression tool, nothing to do with Midnight.
`~/.compact` does not exist. `hackathon.md` recorded "the Compact CLI doesn't exist for Windows;
compile lives in WSL", but WSL is also unavailable: `wsl.exe -d Ubuntu` fails with
`Wsl/Service/E_UNEXPECTED` ("Catastrophic failure"). The consequence was that every Compact claim in
this repo rested on compilation that happened somewhere else, at some earlier time.

**The SDK version story was assumed rather than measured.** ADR-0013 split `contracts/` and
`contracts/devnet-deploy/` into separate npm packages because `midnight-js-contracts@4.1.1` wants
`compact-runtime@0.16.0` while `contracts/` used `0.19.0`, and compiled `managed/` output was built
by compiler `+0.34.0` in one place and `+0.31.1` in the other. Which compiler belongs with which SDK
was inferred from package metadata, never confirmed against the compiler itself.

## Decision

**Run the Compact toolchain in Docker.** A `node:22-bookworm-slim` image with the official installer
from the `midnight-tooling:compact-cli` skill. `unzip` is a required dependency and is easy to miss:
without it `compact update` fails with `Failed to spawn artifact extraction command`, which does not
name the missing tool. The image is the Linux environment this Windows machine otherwise lacks, and
it makes compilation reproducible rather than a thing that happened on someone's laptop once.

**Pin compiler 0.31.1**, confirmed by asking the compiler directly rather than inferring:

| Compiler | Language | Runtime | Ledger |
|---|---|---|---|
| **0.31.1** | 0.23.0 | **0.16.0** | ledger-8.0.2 |
| 0.34.0 | 0.26.0 | 0.19.0 | ledger-9.1.0.0-rc.3 |

`midnight-js-protocol@4.1.1` pins `compact-runtime@0.16.0` and `ledger-v8@8.1.0`. So **0.31.1 is the
only compiler whose output the released SDK can deploy.** 0.34.0 targets a ledger that is still a
release candidate, and the midnight-js line that consumes it (`5.0.0-beta.8`) is a beta.

**Do not use the 5.x beta line**, despite it being the likeliest home of the fix for
[midnight-wallet#704](https://github.com/midnightntwrk/midnight-wallet/issues/704). It is
pre-release the whole way down — `midnight-js@5.0.0-beta.8`, `wallet-sdk-facade@5.0.0-beta.3`,
`ledger-v9@1.0.0-rc.4`, `onchain-runtime-v4@4.0.0-rc.3`, `compact-js@2.5.5-rc.8` — and, decisively,
**`wallet-sdk-hd` has no released version that exports `WalletSeeds`**, which the 5.x facade's
`start()` requires; only `3.1.0-canary.*` builds have it. A stack that needs a canary is not a
foundation for something whose whole point is that a third party can verify it.

Two real breaking changes were found while evaluating the beta, recorded here because they are not
obvious from the error messages:

- `createKeystore` takes an `UnshieldedSecretKey` object (`{ kind, secret }`) in 4.0.0-beta.3, not a
  raw `Uint8Array`. Passing the old shape fails inside the keystore with `Buffer.from(undefined)`.
- `ShieldedWallet(config)` returns a *class* whose start methods are `startWithSeed` /
  `startWithKeys({ v8, v9 })`. `startWithSecretKeys` is gone, because the wallet now spans two
  ledger epochs and each needs its own key material.

**`contracts/preprod/` is a separate npm package** with `overrides` pinning `ledger-v8`,
`onchain-runtime-v3` and `compact-runtime` to single versions. Verified: exactly one copy of each on
disk. Duplicate copies of a wasm-bindgen module produce the class-identity failure that cost ADR-0007
and ADR-0013 an afternoon each; the override is cheap insurance and the check is one `find`.

## Consequences

**Both contracts now demonstrably compile.** `midnight-pool.compact` and `stakes.compact` both build
clean under 0.31.1 in the container. That was previously an assumption.

**The target network is Preview.**

*Correction.* This ADR originally said "Preprod, because it is the only public Midnight network
currently answering". That was wrong, and wrong in an avoidable way: the probe behind it tested
`testnet`, `testnet-02` and `preprod` and never tested `preview`, then generalised from a negative
result to a universal claim. `preview` answers on all three services:

| Network | Purpose | Height (2026-09-13) |
|---|---|---|
| **`preview`** | public testnet for integration testing — the default | ~847,000 |
| `preprod` | pre-production chain | ~2,531,000 |

`rpc.preview.midnight.network` identifies as `Midnight Preview`, and the faucet at
`faucet.preview.midnight.network` is live. `testnet` and `testnet-02` genuinely do not resolve.

Preview is the right target for a testnet submission, and its size matters beyond labelling: it is
roughly a third of preprod, which is directly relevant to the sync bug in ADR-0018 — that bug is a
function of how much history a wallet must replay. The network is now a parameter
(`localStorage['mn-network']`, `NETWORK=` for the probe) rather than a constant, so this is a setting
rather than another thing to get wrong.

**A ledger-v9 migration is coming and this pin does not avoid it**, only defers it to when the 5.x
line is released. The upside of deferring is that the deployed artifact stays verifiable by anyone
using released packages.

**Funding requires a human.** The Preprod faucet at `faucet.preprod.midnight.network` is gated by
Cloudflare Turnstile, so no script can obtain test tokens. Any deployment flow has to treat "fund
this address" as a manual step, which shapes what can be automated end to end.
