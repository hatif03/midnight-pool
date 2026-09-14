# Midnight Pool

## What this project is becoming

This repo started as **Pool**: a 2D browser pool game (PixiJS rendering, custom physics, PeerJS
peer-to-peer 1v1 multiplayer, Vite build — see [README.md](README.md) for the current file layout).

It is being rebuilt/extended into **Midnight Pool**: a **mobile-first PWA** that keeps the existing
pool gameplay and adds **Midnight Network** privacy features.

**Current ship:** [Midnight Buildathon on AKINDO](https://app.akindo.io/wave-hacks/jaMZjqPOBsLXvjdG),
Wave 1 due **2026-09-16 15:00 UTC**. Product doc: [README.md](README.md). Wave plan:
[docs/WAVES.md](docs/WAVES.md). The earlier [MLH Midnight Hackathon (Aug 28–30 2026)](https://midnight-hackathon-august-2026.devpost.com/)
is how the repo was first oriented — same three tracks, one product.

Whatever state the code is in when you read this, treat the mobile-first PWA direction and the
Midnight integration as the target — not the current pool-game-only state.

## Hackathon targets

**AKINDO Wave 1** is due **2026-09-16 15:00 UTC**. Public repo + a short demo that names the
Buildathon. Wave plan: [docs/WAVES.md](docs/WAVES.md).

The original three MLH tracks still describe what the product is:

1. **Mobile Track** — "apps where sensitive information never leaves the device unproven." This is
   why the app must be a real mobile-first PWA (installable, responsive/touch UI, offline-capable),
   not a desktop page that happens to render on a phone.
2. **Integrate Midnight Track** — add privacy features to an *existing* app and show a before/after.
   We qualify: Pool already exists pre-hackathon; the "before" is the p2p game, the "after" is
   Midnight (Scorecard, Blind Rank, Cue Case, private identity).
3. **Cross-Chain Track** — "dApps and games that span ecosystems like EVM chains, Bitcoin, NEAR,
   Cardano, Solana." Use [Effectstream](https://github.com/effectstream/effectstream) for this (see
   below) rather than hand-rolling bridge/sync code.

Judging weighs: technology, originality, execution, completion, documentation, business value —
so keep the demo scope small enough to actually finish and polish.

## Always consult these before writing Midnight-related code

Midnight and its contract language (Compact) are **not well represented in model training data** —
this is called out explicitly by Midnight's own docs. Assume any Compact syntax, SDK call, or
CLI flag you "remember" may be hallucinated. Before writing or editing anything Midnight-related:

- **Docs**: https://docs.midnight.network/ — start at `/what-is-midnight`, `/getting-started`,
  `/concepts`, `/compact` (the Compact language reference), `/tokens`, `/nodes`, `/glossary`, and
  `/category/troubleshoot` for error resolution. Treat this as the source of truth over memory.
- **Claude Code plugins** (already configured in `.claude/settings.json`, source
  https://midnightntwrk.expert, 13 plugins covering the whole toolchain): use `compact-core` and
  `compact-examples` for contract code, `midnight-dapp-dev` for frontend/wallet scaffolding,
  `midnight-wallet` for wallet SDK questions, `midnight-tooling` for devnet/CLI/proof-server setup,
  `midnight-verify`/`midnight-cq` before trusting generated contract or SDK code, and
  `midnight-status-codes` when debugging an error code. Run `/midnight-expert:doctor` if these
  plugins seem unavailable — the user needs to have run `claude plugin install ...` at least once
  (see note below).
- **Mobile reference**: https://github.com/kuiralabs — Android/Kotlin SDKs and starter apps for
  Midnight (`kuira-sdk-android`, `kuira-starter-android`, `midnight-rs`). There is no PWA/web/React
  Native project there, so treat it as a pattern reference (embedded wallet, passkey/Sigil identity,
  Compact contract wiring), not copy-paste source — this project's mobile layer is a **web PWA**,
  and the equivalent web wallet/connector pieces should come from the Midnight docs' dApp connector
  / Lace wallet integration instead.
- **Cross-chain reference**: https://github.com/effectstream/effectstream — TypeScript multi-chain
  engine with first-class Midnight support (`@effectstream/midnight-contracts`,
  `@effectstream/midnight-node`) and an `evm-midnight-v2` template syncing an EVM contract with a
  Midnight ZK contract. This is Midnight's own recommendation for cross-chain work — prefer it over
  a custom bridge/relayer.

### One-time setup the user needs to do (not something Claude can do headlessly)

`.claude/settings.json` registers the `midnight-expert` marketplace and lists its plugins as
enabled, but Claude Code still needs the user to **trust this folder** (first open) and, per the
plugin docs, actually install them once:

```
claude plugin marketplace add https://midnightntwrk.expert   # usually a no-op once settings.json is picked up
claude plugin install midnight-expert@midnight-expert
# repeat for the other plugins in .claude/settings.json, or install --scope project
```

Third-party plugins/marketplaces run arbitrary code with the user's privileges (hooks, MCP
servers, shell commands) — this is a real trust boundary, flagged here rather than auto-run.
The source is https://github.com/devrelaicom/midnight-expert if the user wants to review it first.

## Mobile-first PWA requirements

- Design and build for touch/small-screen first; desktop is the secondary layout, not the other way
  around.
- Manifest + service worker are done via `vite-plugin-pwa` (see `vite.config.js` and
  [ADR-0002](docs/adr/0002-pwa-tooling-choices.md)) — installable, offline-capable, icons generated
  from `public/favicon.svg` via `npm run gen-icons`. Don't hand-write a competing `sw.js`.
- "Sensitive information never leaves the device unproven" (Mobile Track framing) should shape the
  wallet/proving architecture: secret keys and private state stay in the browser; proofs for the
  live PWA are generated by our Cloud Run prover ([ADR-0019](docs/adr/0019-cloud-run-proof-server.md))
  because Midnight's public prover 404s from browsers. Wallet-side proving is still not available
  on this stack (`getProvingProvider` cannot cross the worker boundary — ADR-0018).

## Working agreements

- **Architectural decisions get an ADR first.** Before a new dependency, a rework of how a
  subsystem talks to another, or reversing an earlier decision, write
  `docs/adr/000N-title.md` (copy `docs/adr/0000-template.md`) — context, decision, consequences —
  before making the change, not as an afterthought. Routine feature work and bug fixes don't need
  one. Index: [docs/adr/README.md](docs/adr/README.md).
- **Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)**:
  `type(scope): summary`, body explains *why* not *what*. Types: `feat`, `fix`, `refactor`, `docs`,
  `chore`, `test`. Example: `feat(pwa): add vite-plugin-pwa manifest and service worker`. Note: the
  repo's pre-existing commit history predates this convention (full-sentence style) — don't rewrite
  those, just use Conventional Commits going forward.
- **Update [PROJECT_LOG.md](PROJECT_LOG.md)** after a work session that changed project state or
  direction (not after every trivial edit) — current state, what changed, what's next. It's the
  first thing to read at the start of a session and the last thing to touch at the end of one.

## Skills

See [.claude/skills/midnight-hackathon-context/SKILL.md](.claude/skills/midnight-hackathon-context/SKILL.md)
for a condensed, project-specific version of this context (useful when this file isn't loaded, e.g.
in a subagent). Cursor users get the equivalent via `.cursor/rules/`.
