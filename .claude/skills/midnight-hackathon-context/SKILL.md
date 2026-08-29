---
name: midnight-hackathon-context
description: Project context for Midnight Pool - a pool game being turned into a mobile-first PWA with Midnight Network privacy features for the Aug 2026 Midnight Hackathon. Use whenever working on Midnight integration, mobile/PWA work, cross-chain work, or anything hackathon-submission related in this repo.
---

# Midnight Pool — hackathon project context

This repo (`midnight-pool`) is a browser 2D pool game (PixiJS + PeerJS p2p multiplayer, Vite)
being rebuilt into a **mobile-first PWA** with **Midnight Network** privacy features, for the
[Midnight Hackathon](https://midnight-hackathon-august-2026.devpost.com/) (MLH, 2026-08-28 to
2026-08-30, submit by 11:45am EDT 08-30).

Full project direction lives in [CLAUDE.md](../../../CLAUDE.md) at the repo root — read that first.

## Targeted tracks (one project, three tracks)

- **Mobile Track**: real mobile-first PWA, "sensitive info never leaves the device unproven."
- **Integrate Midnight Track**: before = existing p2p pool game, after = same game + Midnight
  privacy features. Needs an explicit before/after in the demo.
- **Cross-Chain Track**: use [Effectstream](https://github.com/effectstream/effectstream)
  (Midnight's own recommended multi-chain engine) rather than a custom bridge.

## Source of truth, in order

1. https://docs.midnight.network/ — Midnight docs. Compact/Midnight APIs are barely represented in
   model training data, so treat anything you "recall" about Compact syntax or SDK calls as
   unverified until checked here or against an installed plugin/example.
2. The `midnight-expert` Claude Code plugins (marketplace `https://midnightntwrk.expert`, declared
   in `.claude/settings.json`): `compact-core`/`compact-examples` for contracts,
   `midnight-dapp-dev` for frontend/wallet scaffolding, `midnight-wallet` for wallet SDK,
   `midnight-tooling` for devnet/CLI, `midnight-verify`/`midnight-cq` to check generated code,
   `midnight-status-codes` for error lookups. If unavailable, tell the user to run
   `claude plugin install <name>@midnight-expert` (see CLAUDE.md for the full list/why it's not
   auto-installed).
3. https://github.com/kuiralabs — Android/Kotlin Midnight mobile reference (embedded wallet,
   passkey/Sigil identity, `midnight-rs`). Pattern reference only — this project's mobile layer is
   a web PWA, not native Android, so port the *architecture* (client-side proving/keys, wallet
   embedding), not the code.
4. https://github.com/effectstream/effectstream — cross-chain engine with Midnight support
   (`@effectstream/midnight-contracts`, `@effectstream/midnight-node`, `evm-midnight-v2` template).

## Mobile-first PWA checklist

- Touch-first UI as the primary layout; no manifest/service worker exist yet — add both
  (prefer an existing Vite PWA plugin over hand-rolled boilerplate).
- Keep private data (keys, proof inputs) client-side wherever the Midnight SDK allows it —
  this is both correct-by-design and literally what the Mobile Track judges for.

## Submission constraints to keep in mind while building

Public repo, ≤2min demo video naming the hackathon, built during the hackathon weekend (except the
pre-existing "before" state for the Integrate Midnight track), ≤5 team members, one submission.
Judged on technology, originality, execution, completion, documentation, business value — keep
scope small enough to finish and polish rather than maximizing feature count.
