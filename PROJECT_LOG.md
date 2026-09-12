# Project Log

Living record of where this project stands. Read this first when starting a session; update it
before ending one that changed project state or direction. See
[CLAUDE.md](CLAUDE.md#working-agreements) for the policy this follows, and `docs/adr/` for the
reasoning behind any decision marked with an ADR link.

## Current state (2026-09-13, visual overhaul complete, Buildathon wave 1)

All ten phases of [ADR-0014](docs/adr/0014-visual-overhaul.md) are done, plus
[ADR-0017](docs/adr/0017-aim-guide-and-two-stage-input.md) for the two gameplay changes.
`legacy.css` reached zero lines and was deleted, which was the agreed signal that no surface was
missed. The stylesheet is now five files under `src/styles/` (`tokens`, `components`, `lobby`,
`game`, `modals`) behind one `<link>`.

**Phases 5-10, on top of the 0-4 already logged below:**

- **HUD** rebuilt as `[me] [pot] [opponent]`. Whose turn it is is now the lit gold ring around a
  player's avatar rather than a text pill, and the turn timer became a conic-gradient ring masked to
  an annulus — one custom-property write per tick. The shots/potted counters and the solids-stripes
  pill were **deleted rather than reskinned**: the rack of ball dots already carries both.
  `ui.renderDots` was not touched at all.
- **Ghost-ball aim.** `predictShot()` in `physics.js` does a ray/circle test against every ball and
  reports the real first contact. The old guide predicted three rail bounces but passed straight
  *through* balls, so it actively lied about the most common shot in pool. 17 new asserts.
  `aimBonus` now extends the projected lines, which gives the cue stat real meaning.
- **Two-stage input** — drag the table to aim, drag the rail to set power. The riskiest change in
  the overhaul and the one that can be reverted on its own. The net protocol is untouched: a guest
  still sends `{dx, dy, power, spin}`; only the local gesture producing them changed.
- **Cue stick**, baked once and drawn below the ball layer so it passes behind the balls.
- **VS intro** before each multiplayer match, as a promise-returning overlay rather than a screen,
  so match-start ordering is untouched. Handles the host's race — it shows before `hello` arrives
  and patches the opponent's name in mid-animation rather than waiting on a message that might
  never come.
- **Juice**: pot bursts from a recycled sprite pool, balls sinking instead of vanishing, screen
  shake on the break, coin-fly and confetti in DOM. No animation dependency.
- **Victory screen** with earned stars (win / whitewash / foul-free), the real coin delta including
  stake, and an XP bar that animates from the pre-match fraction.
- **Polish**: `theme-color`, the PWA manifest and the share-preview image had drifted to two
  different near-blacks, neither of which was the app's palette; all three now agree on `#0b2137`.

**Verified offline end to end**, which is the claim the self-hosted-font decision rested on: after
one online visit, with the network fully cut, a cold reload still renders the lobby and
`document.fonts.check('16px "Lilita One"')` is true. A Google Fonts CDN URL would have failed this,
because `workbox.globPatterns` precaches the build output and a CDN URL never appears there.

**Three more rendering bugs found only by looking at the page** (adding to the three logged below):

- every tile icon rendered solid black — a `<button>` does not inherit `body`'s `color`, it takes
  the UA's `buttontext`, and the sprite's shapes are `fill="currentColor"`;
- the MENU button refused to be grey — the `.modal .box button` alias (0,3,1) outranks `.btn--grey`
  (0,1,0), so **every** colour variant inside a modal was being silently repainted green. Ramp and
  ink defaults now live in `:where()`, which carries zero specificity. This is the second bug from
  that one alias (the first was `.seg-btn`), so it is now flagged in the comment beside it;
- `waitForSelector('#vs-intro:not(.show)')` is not a valid "it went away" assertion — that waits for
  *visibility*, and a dismissed overlay is hidden by definition. Use `waitForFunction` on the class.

**Next:** the Hustle Protocol document and the one-stack collapse, then real in-browser submission.
Note for that work: `compact` on this machine's PATH is Windows' NTFS compression tool and
`~/.compact` is absent, but **WSL Ubuntu is available**, which is where the contract toolchain has
to run.

## Earlier state (2026-09-13, visual overhaul phases 0-4)

**Context change: the target is now the Midnight Buildathon on AKINDO**, a three-wave program
(wave 1 build closes 2026-09-16, wave 2 Sep 27–Oct 17, wave 3 Oct 27–Nov 16) that explicitly rewards
visible iteration over one-time polish. Cross-chain is deferred to a later wave by decision; this
wave is game feel, visual identity, and the Midnight narrative.

Three gaps drove this session, and the full plan for closing them is agreed:

1. the app did not look like a game — 310 lines of dark glassmorphism inlined in `index.html`, no
   font or image assets, a lobby that was a title plus one button plus seven emoji links;
2. the Midnight layer is still mock-by-default in the browser (unchanged this session);
3. there was no named protocol or narrative, which is the one axis where the Among-Midnight
   benchmark is genuinely ahead.

**Shipped this session — [ADR-0014](docs/adr/0014-visual-overhaul.md), phases 0-4 of 10:**

- **Phase 0, CSS out of `index.html`.** The inline `<style>` block became `src/styles/legacy.css`,
  extracted with `sed` and verified by comparing whitespace-stripped checksums, so the first step
  was a provable no-op rather than a 310-line retype. `legacy.css` shrinks each phase and must reach
  zero lines before the overhaul is done.
- **Phase 1, the design system.** `tokens.css` (bright sunburst/felt/gold palette, six candy ramps,
  dvh-aware type scale) and `components.css` (`.btn`, `.tile`, `.chip`, `.bar`, `.ribbon`,
  `.avatar` with a conic-gradient turn-timer ring). One self-hosted OFL display face
  (`@fontsource/lilita-one`) — verified that the bare-specifier `@import` resolves under Rolldown,
  that the woff2 lands in the service worker's precache manifest so an offline launch keeps the
  face, and that the `latin` subset covers the Spanish locale. An inline SVG `<symbol>` sprite
  replaces the emoji currency/menu glyphs.
- **Phase 2, modals and shared chrome.** `.glass` → `.btn`; all 12 modals restyled at once via
  `.box`; every `backdrop-filter` deleted except a 3px modal scrim.
- **Phase 3, the lobby.** Rebuilt as topbar / four mode tiles / strip. No live-ops logic was written
  — every existing system is consumed as-is and the tiles keep the ids their handlers already bind.
  `screen-mode` deleted (one less tap), `ranked-toggle` moved to settings, `btn-quit` deleted
  (`window.close()` is a no-op in an installed PWA). One piece of new state, `profile.winStreak`,
  three lines in `economy.applyAward` with three asserts.
- **Phase 4, the table.** Blue felt, red-brown rails, and the change that does the real work:
  cushion faces as six trapezoids with a lit nose edge and a contact shadow, so rails read as
  three-dimensional and pockets have visible jaws. Diamond sights, gold rims, and the head string
  drawn so the kitchen rule is visible during ball-in-hand.

**Verification approach.** Screenshots in real Chrome via an ad-hoc Playwright install kept in the
scratchpad, not in the repo — same precedent as earlier sessions. Playwright's own Chromium download
fails in this environment; driving the installed Chrome via `channel: 'chrome'` works. Note
`waitUntil: 'networkidle'` never settles against Vite because the HMR websocket stays open — wait on
an element instead. Checks run at 800×340 and 740×360 (the landscape-phone floor): no page overflow,
nothing clipped, back-navigation correct, and all four tile icons survive a language switch.

**Three bugs found by looking at the rendered page rather than trusting the diff** — worth recording
because none would have been caught by a build or a test:

- the language segmented control rendered as two full candy buttons, because the
  `.modal .box button` alias (0,2,1) outranks `.seg-btn` (0,1,0);
- every tile icon rendered solid black, because a `<button>` does not inherit `body`'s color — it
  takes the UA's `buttontext`, and the sprite's shapes are `fill="currentColor"`;
- the Pixi power label was the hardcoded literal `'POTENCIA'`, so it read Spanish in the English UI;
  Pixi `Text` is not covered by `applyStatic()`.

**Also corrected: a dead citation.** ADR-0011, ADR-0013, this log, `README.md` and `hackathon.md` all
cited the WalletFacade sync leak as `midnightntwrk/midnight-sdk#370`. **That issue does not exist** —
the GitHub API cannot resolve it. The real report is
[midnightntwrk/midnight-wallet#704](https://github.com/midnightntwrk/midnight-wallet/issues/704),
still open. All eight references fixed, and ADRs 0009-0013 backfilled into the ADR index, which had
stopped at 0008.

**Upstream status on #704, checked directly.** A maintainer has commented "this should be already
fixed" and asked for a version confirmation. As of 2026-09-12 npm still serves
`wallet-sdk-facade@4.0.1` / `wallet-sdk-shielded@3.0.1` / `wallet-sdk-dust-wallet@4.1.0` as `latest`
— i.e. unchanged from the report — so any fix must be in the unreleased `5.0.0` line
(`5.0.0-beta.3`, a whole-stack major on `ledger-v9@1.0.0-rc.4`). A second reporter's measurement
(~96MB dust state vs ~82kB shielded) corroborates our trace, where `dust.appliedIndex` climbs
alongside `shielded`. Plan: re-run the instrumented repro against the beta in an isolated scratch
directory, then reply with the measured result rather than a question. Not posted yet.

**Next:** phases 5-10 (HUD, ghost-ball aim, two-stage input, VS intro, juice, celebration), then the
Hustle Protocol document and the one Compact/SDK stack collapse.

## Earlier state (2026-08-30, submission prep: README, hackathon copy, demo video)

- **README rewritten from scratch as a complete, ground-up project description** — no longer
  framed as "extending" a prior game; covers the full current feature set (gameplay, progression,
  the whole Midnight privacy layer, cross-chain), an accurate project structure, and pointers to
  `docs/adr/`, this log, and `hackathon.md`.
- **`hackathon.md` (Devpost submission copy) revised for accuracy**, checked against a real prior-art
  submission's structure ([Midnight Among Us](https://devpost.com/software/midnight-among-us)):
  added the real local-devnet deploy + cross-chain join, rewrote the Preprod story from "we stopped"
  to "we root-caused it and filed [midnightntwrk/midnight-wallet#704](https://github.com/midnightntwrk/midnight-wallet/issues/704)",
  added the Vercel misdiagnosis as an honest challenges story, and added the PWA install prompt.
- **PWA install prompt shipped** (`src/pwaInstall.js`): a real install button via
  `beforeinstallprompt` on Android/Chrome; a "tap Share → Add to Home Screen" instruction on iOS
  (which has no install API at all); skipped on desktop and once already installed; dismissible,
  persists via localStorage. Verified with Playwright across desktop/iOS/Android UAs, including the
  dismiss flow surviving a reload.
- **Demo video prep** (`demo-script.md`, `docs/adr/0013`'s new Update section): wrote a timed
  ~2-minute voiceover script (hook → real gameplay → live Champion Badge proof in the deployed
  browser app → multiplayer + audit trail → the real local cross-chain join in a terminal → close),
  confirmed naming the hackathon is included per the submission rule. Answered "can this be verified
  on a block explorer?" honestly: no, neither side is a public network yet (local Midnight devnet,
  local `anvil` chain 31337) — but a direct `cast code`/indexer GraphQL query against each side's
  own node, independent of the deploy script's own output, is a real, verified alternative and is
  now the documented honest ceiling for "verifiable" here.
- Re-confirmed the whole real cross-chain path one more time end-to-end right before recording:
  fresh `anvil` restart, fresh deploy, `DEPLOYED`/`commitStats`/`proveThreshold` all genuine, EVM
  mint at tier 1, consistent join — then independently re-verified both the EVM contract's bytecode
  and the Midnight contract's indexed existence via direct queries (not the script's own claim).

## Current state (2026-08-30, real Vercel fix + resumed testnet work)

- **The Vercel deploy failure is actually fixed now** (`docs/adr/0012`) — the earlier `"engines"`
  pin was the wrong diagnosis. Once `vercel login` gave real CLI access, `vercel inspect --logs`
  showed the true error: `src/midnight/circuit.js` imports
  `contracts/managed/midnight-pool/contract/index.js`, which `contracts/.gitignore` excluded
  entirely — Vercel builds from a fresh clone with no compile step, so that import always failed.
  Fixed by un-ignoring just `managed/*/contract/` (160K, confirmed no `zkir`/`keys` dependency);
  `compiler/`/`keys/`/`zkir/` stay gitignored. Verified for real: a genuine fresh `git clone` built
  successfully in a Linux container, then a real `vercel --prod` deploy came back `READY` and the
  production alias (`https://midnight-pool-one.vercel.app`) serves 200.
- Resumed the real-testnet-submission work (previously stopped at ADR-0011's time-box) now that
  the user has no deadline pressure. Root-caused the `WalletFacade` OOM precisely (`docs/adr/0011`
  Updates 1-2): a real `wallet-sdk-facade`/`wallet-sdk-shielded` sync-state memory leak, proportional
  to processed ledger entries, confirmed independent of transaction-history storage (a no-op
  replacement crashes identically) and independent of the reconnect-log noise (a local-devnet
  control run logs the same line, then syncs fine). Quantified against Preprod's real chain height
  (2,330,285 blocks): would need on the order of hundreds of GB of RAM to complete — not viable.
  Filed upstream: [midnightntwrk/midnight-wallet#704](https://github.com/midnightntwrk/midnight-wallet/issues/704).
  User chose to stop pursuing public-testnet submission at that point.
- **Real contract deploy + circuit calls on the local devnet — genuinely working** (`docs/adr/0013`),
  prompted by the user asking whether the local devnet could demo cross-chain features once public
  testnet proved non-viable. It can: the same wallet SDK construction syncs cleanly against a
  near-empty local chain (confirmed via the plugin's own smoke test, ~188s), and the genesis seed
  comes pre-funded. Built `contracts/devnet-deploy/` (an isolated npm package — `midnight-js-contracts`
  needs `compact-runtime@0.16.0`, `contracts/` itself uses `0.19.0` for the browser bundle, and
  Node resolves a compiled contract module's imports based on the *file's* location, not the
  importing script's, so the compiled output has to live *inside* the isolated package to actually
  resolve to the isolated dependency). Fixed a real, unnecessary `pragma language_version >= 0.26`
  (the contract's actual syntax only ever needed `>= 0.23`, verified by compiling with the pragma
  lowered before touching the real file) and two WASM class-identity conflicts (`ledger-v8`,
  `onchain-runtime-v3` each had two differently-versioned nested copies) via npm `overrides`.
  **Verified with real, confirmed on-chain results**: a real deploy (`contractAddress`, `txId`,
  `blockHeight` all genuine), a real `commitStats` call, and a real `proveThreshold` call correctly
  returning `true` for a committed level of 7 against a threshold of 5.
- **Wired the real deploy into a real cross-chain join** (`contracts/devnet-deploy/cross-chain-join-real.ts`):
  the Midnight side now does a genuine deploy + circuit call (reading the on-chain committed public
  key back via the indexer) instead of the simulator, joined with the same real `anvil`/Foundry EVM
  side already used by `contracts/cross-chain-join.ts` (kept as-is, as the faster no-devnet-needed
  sibling). Verified both directions for real: level 10 (≥ threshold 5) → Midnight discloses `true`
  → EVM mints tier 1; level 2 → discloses `false` → EVM tier stays 0. Both chains' state agrees in
  both cases.

## Current state (2026-08-30, production-hardening pass)

Triggered by a Vercel deploy failure plus a user-requested "make this more like a real gaming app"
roadmap, with the hackathon deadline (11:45am EDT) only ~5 hours out by the time execution started
(not the ~12 originally estimated) — every item below was scoped and time-boxed against that clock.

- **Vercel deploy fix**: added `"engines": {"node": ">=20.19.0"}` to `package.json` — both `vite@8`
  and `rolldown` require it, and the repo had no engines field or `.nvmrc` to pin Vercel's build
  Node version. Verified via a clean local build; could not pull the actual Vercel build log (no
  authenticated `vercel` CLI session in this environment) to confirm the exact prior root cause,
  so this is the best-evidenced fix, not a confirmed-from-the-log one.
- **Real backend: server-recorded match attestation + signed stat receipts** (`docs/adr/0009`).
  Extended the existing Cloud Run relay (`server/`) with `node:sqlite` persistence and an
  HMAC-signed stat receipt — a match is "confirmed" once ≥2 distinct sides attest and agree, and
  either side can then fetch a server-signed `(pk, level, wins)` receipt to disclose alongside the
  existing `commitStats` commitment. Verified for real: unit tests (`server/db.test.js`), a live
  curl smoke test, and a real-Chromium Playwright run against the actual running relay, zero
  console errors.
- **Guest-side physics verification via deterministic replay** (`docs/adr/0010`). The guest
  previously had no way to check a shot's outcome (only the host ever runs `step()`/`shoot()`); now
  the host broadcasts the pre-shot snapshot + inputs (`shotInput`), and the guest replays the same
  deterministic loop locally (`src/midnight/physicsVerify.js`) and diffs the result with a small
  epsilon (absorbing `Math.hypot`'s non-guaranteed cross-browser rounding, not real divergence).
  Verified with a real two-browser-context Playwright test (host + guest, real pointer events, a
  real break shot) confirming a `guestPhysicsVerification: ok:true, mismatchCount:0` audit entry.
- **Real testnet submission — attempted, stopped after a reproducible crash, not a timing issue**
  (`docs/adr/0011`). Time-boxed to 60-75 minutes per the user's explicit call (accepting the risk
  after being shown the local-devnet saga's evidence). Got genuinely far: a local proof server
  running, Preprod's live indexer/node/faucet endpoints confirmed with real calls (not docs alone),
  the full wallet-sdk/midnight-js package set installed clean. Then `WalletFacade` sync against the
  real node crashed with a JS heap-out-of-memory error from a `subscribeRuntimeVersion()`
  reconnect-loop memory leak — a real, reproducible bug in that SDK/network combination, confirmed
  by direct execution. Stopped there (well inside the time-box) rather than keep debugging an
  unresolved crash with the deadline closing in; the demo's Midnight story stays the already-working
  local-devnet/mock-mode path. `contracts/testnet-wallet.ts` kept in the repo, clearly commented,
  as a real starting point for whoever continues this.
- **Clubs/leaderboards**: stays dropped (recommended-dropped twice already this project) — needs
  backend infra beyond what a few remaining hours can responsibly add on top of everything above.
- Full verification re-run at the end of this pass: root `npm test` + `npm run build`, `server`'s
  `npm test`, and `contracts`' `npm test` all pass.

## Current state (2026-08-30, continued further)

- **8-Ball-Pool-style reputation system, with the Midnight tie-in genuine, not padding.**
  Two Explore agents + a Plan agent first mapped exactly what already existed (dual currency,
  level/XP, `wins`, cue rarity data — all pre-existing) vs completely absent (losses, win-rate,
  lifetime-winnings, leagues, clubs, any leaderboard). Recommendation adopted as-is on the two
  design calls that mattered most: leagues reuse the existing `proveThreshold` circuit rather than
  adding a win-rate circuit (a ratio threshold would need `losses` added to the compiled
  `PlayerStats`/`commitStats` signature, breaking an already-verified contract for no real demo
  value this pass); league badges are an **ephemeral** re-checked proof, not a soulbound claim,
  specifically because league standing must be able to regress on a losing streak — soulbound
  claims are deliberately non-revocable, so reusing that pattern here would be a category error.
  - `src/profile.js`/`src/economy.js`: added `losses`, `lifetimeWinnings` fields; `winRate(profile)`
    pure function; `awardForMatch`'s loss branch now actually sets a `losses` key (previously had
    neither a wins nor losses key on loss — the real gap); `applyStake` now also tracks
    `lifetimeWinnings` (can go negative, unlike coins — an honest losing-streak record).
  - `src/leagues.js`: Brass/Bronze/Silver/Gold/Diamond, level-or-wins gated
    (thresholds 1/5/10/50/150). New `#leagues-modal` (🏆 in the menu-extras row) —
    `renderLeaguesModal()` calls the real `hookProveThreshold` per tier and resolves each row
    independently (⏳ → ✅/🔒), never showing the underlying stat.
  - `src/cues.js`'s existing `rarity` field now gets a real UI treatment: a rarity-colored left
    border on every cue row (`.rarity-common/uncommon/rare/epic`), plus a "Midnight-verified" badge
    for tiers unlocked through the existing soulbound `claimCue` flow — added a small
    `hooks.isCueClaimed(tierId)` export rather than reaching into `hooks.js`'s private localStorage
    format from `main.js`.
  - New `#wallet-record` chip (`W60-L20 · 75%`) next to the existing coins/cash/level chips.
  - **Clubs/guilds: dropped**, per the Plan agent's clear recommendation — no backend/database
    exists anywhere in this project, and a real club needs shared cross-player membership/
    leaderboard aggregation, genuine new server infrastructure. A cosmetic-only field would be
    decoration with no gameplay or privacy tie-in.
  - All verified with real Playwright screenshots: the wallet-record chip renders correctly, all
    five league tiers resolve and render pass/fail (tested with level 12 / wins 60 / losses 20 —
    Brass through Gold qualify, Diamond does not), rarity colors show correctly (green=uncommon,
    blue=rare confirmed visually), zero console errors throughout.

## Current state (2026-08-30, continued)

- **Disk-space crisis resolved.** C: drive hit 2.5 GB free mid-session (user-reported, verified).
  Root cause, found by measuring candidates directly rather than guessing: `npm-cache` at 38.1 GB
  and a leftover *native-Windows* `.bun` install at 3.76 GB (from the first, wrong-environment
  `bun install` attempt for Effectstream, before discovering the Midnight binaries needed WSL —
  see ADR-0007's Outcome section). WSL itself was not the cause (950 GB free internally, its one
  6.39 GB vhdx mostly legitimate). Cleared `npm-cache` (`npm cache clean --force`, 38.1→3.2 GB),
  deleted the native `.bun` dir outright, cleared Windows Temp — C: now has 43.6 GB free.
- **Cross-chain join wired into the UI, with real client-side circuit execution — new capability,
  not just a UI shell.** `src/midnight/circuit.js` runs `commitStats`/`proveThreshold` through
  `@midnight-ntwrk/compact-runtime`'s simulator (the same engine `contracts/test/simulator.test.ts`
  and `contracts/cross-chain-join.ts` use) directly in the browser — genuinely stronger than
  `hooks.js`'s hand-rolled mock, which never touches the compiled contract. Needed
  `vite-plugin-wasm` (Vite's built-in WASM handling doesn't cover the raw ESM `.wasm` import
  wasm-bindgen emits) and `@midnight-ntwrk/compact-runtime` added as a root dependency; dynamically
  imported so its ~1.4 MB WASM payload never loads on the menu/game's critical path. **Verified by
  actually running it in a real Chromium browser via Playwright** (not just a successful build) —
  both the qualifying (level 10 ≥ threshold 5 → ✅) and non-qualifying (level 1 → 🔒) cases,
  zero console errors either way. New "Cross-Chain Champion Badge" panel in Settings → Midnight
  (`#champion-modal`) surfaces this, with an honest note pointing at
  `npx tsx contracts/cross-chain-join.ts` for the fully-verified two-chain version (a real EVM
  contract too) rather than pretending the browser reproduces that side — it structurally can't
  (no spawning `forge`/`anvil` from a page).
  - **Deliberately not touched**: `hooks.js`'s existing mock implementations (ranked-gate,
    cue-claim modal, stats-commit-on-match-end) — these stay the fast, synchronous hand-rolled
    mocks, specifically so this honesty upgrade doesn't introduce a WASM cold-start delay into
    live gameplay call sites. `circuit.js` is additive, not a replacement, for now.

## Current state (2026-08-30)

- **Cross-chain workstream 3 — Effectstream dropped, lighter fallback built and verified.** The
  full `evm-midnight-v2` stack (ADR-0007) was actually attempted end-to-end, not just estimated —
  it got genuinely close: EVM contracts compiled and deployed to a real local Hardhat chain, and a
  real local Midnight devnet (node producing/finalizing real blocks, indexer, proof server all
  running) came up too. Getting there required finding and fixing six distinct, real environment
  bugs in sequence (each confirmed by direct inspection — symlink targets, `ldd`, ELF headers —
  not guessed): stale workspace symlinks after a Bun linker-mode switch; missing per-workspace
  dependency symlinks under Bun's hoisted linking (`forge`/`hardhat` binaries, OpenZeppelin
  imports); a proof-server binary built via Nix with a hardcoded `/nix/store/...` interpreter path
  absent on this non-Nix system; a `graphql@17` package.json whose `"bun"` export condition broke a
  synchronous `require()`; a compiled-circuit-vs-installed-runtime version mismatch contradicting
  the template's own `CLAUDE.md`; and finally a WASM module-identity duplication bug
  (`ContractMaintenanceAuthority` from two different nested `compact-runtime` copies) at the very
  last step — deploying the Midnight contract to the live devnet. At that point the user called it:
  drop Effectstream. Full story, including the specific fix for each bug, in ADR-0007's Outcome
  section.
  - **Built the documented fallback instead**: `cross-chain/` (a minimal Foundry project, no
    OpenZeppelin/Hardhat — just `ChampionBadge.sol`, a deliberately-not-full-ERC-721 registry) plus
    `contracts/cross-chain-join.ts`, a plain Node script joining two genuinely real,
    independently-executed pieces — `midnight-pool.compact`'s already-verified `proveThreshold`
    circuit (run for real through `@midnight-ntwrk/compact-runtime`'s simulator, the same engine
    the contract's own test suite uses, not mocked) and a real `anvil` chain (deployed + minted via
    `forge`/`cast`). Verified both directions live: `npx tsx cross-chain-join.ts 10` (level ≥
    threshold) actually mints, tier reads back as 1; `npx tsx cross-chain-join.ts 2` (below
    threshold) mints nothing, tier reads back as 0; the script itself asserts the two sides agree
    before exiting 0.
  - **What's genuinely NOT done**: this is a one-shot script run on demand, not a persistent
    syncing service — no frontend renders the joined view today. That's the natural next increment
    if this track gets more time, not something to assume is already wired up.
  - The abandoned `effectstream/` working tree (the vendored template plus every fix above) was
    deleted after extracting the lessons into ADR-0007 — it was never committed, so this isn't a
    revert, just disk cleanup of a large (~1600-package) untracked experiment.

- **UI/UX pass — fullscreen, new logo, non-scrolling responsive menu, HUD no longer overlaps the
  table.** Triggered by the user's screenshots comparing this app to 8 Ball Pool and a `logo/`
  folder of new pixel-art icon assets. Verified with real Playwright screenshots this time (Chromium
  installed fresh into a scratchpad dir, isolated from the project) — the first actual visual
  verification this session, after several UI passes done blind with no browser tool available.
  - **Fullscreen**: `document.documentElement.requestFullscreen()` added to the existing first-tap
    `kick()` handler in `main.js` (already did audio unlock + orientation lock); manifest `display`
    changed to `fullscreen` with a `display_override: ['fullscreen','standalone']` fallback chain.
  - **New logo**: `logo/5.png` (highest-res of the 5 provided) copied to `public/logo-source.png` as
    the new icon-generation source; `scripts/gen-icons.mjs` switched from reading `favicon.svg` to
    this PNG via sharp; regenerated all PWA icons plus a new `favicon-64.png`; `index.html`'s
    `<link rel="icon">` and the in-menu `<img>` updated to match.
  - **The real structural bug behind "HUD covers the table"**: `#hud` was `position:fixed` at the
    same time `#app`'s canvas-centering padding didn't reserve any space for it, so the canvas's top
    edge rendered underneath the HUD bar. Fixed with a `ResizeObserver` in `ui.js` that keeps a
    `--hud-h` CSS variable in sync with the HUD's actual rendered height (not a hardcoded guess —
    reflows correctly if HUD content wraps differently), consumed by `#app`'s `padding-top`.
    Confirmed via Playwright: HUD measured 44px, canvas top starts at exactly y=44, zero overlap.
  - **The menu overflow bug**: `.brand` (logo+title) was a sibling of every `.screen`, rendering on
    every menu screen; `screen-main` alone stacked brand + wallet-bar + Play + a 4-icon row +
    full-width Settings + full-width Quit — taller than a real landscape phone's height (as low as
    ~340-380px), with no scroll anywhere to reveal the cut-off rows. Fixed by: moving `.brand` inside
    `#screen-main` only; folding Settings/Quit into the existing icon-button row (now 6 icons, same
    pattern as Daily/Cues/Pass/Shop) instead of two more full-width rows; converting the inline
    `#settings` panel into a real `.modal` (matching the cues/pass/shop modal pattern) so it stops
    competing with the main menu for vertical space entirely; and switching every size-affecting CSS
    property (logo, title, button padding/font, gaps) to `clamp(min, Ndvh, max)` values instead of
    fixed px, so the whole menu shrinks together on a short screen rather than any one row
    overflowing. Verified via Playwright at 700×380 and 800×360: `document.documentElement.scrollHeight
    === clientHeight` (zero overflow) at both, with all six menu screens screenshotted.
  - **Ball-in-hand "one tap" complaint — found the actual cause**: free-drag repositioning was
    *already implemented* (`previewCuePlacement` on every `pointermove`, commit on `pointerup`), but
    the hint text literally said "Tap the table to place the cue ball anywhere you want" — actively
    telling the player to tap instead of drag. Fixed the copy (both `es`/`en`) to describe dragging;
    no logic change needed.
  - In-game HUD buttons/pills/chips shrunk further per "make the buttons smallest" (padding, font
    sizes, avatar size all reduced); `#toast`'s position switched from a hardcoded `66px` offset to
    `calc(var(--hud-h) + 8px)`, so it stays correctly placed regardless of the HUD's real height.

- **Midnight integration underway — contract done, frontend wiring (workstream 2) done, Effectstream
  cross-chain and match stakes (workstreams 3-4) not started.** Plan file at
  `C:\Users\mdhat\.claude\plans\now-we-start-the-harmonic-russell.md`. Triggered by the user's ask
  to build out all three hackathon tracks (Mobile, Integrate Midnight, Cross-Chain); the plan was
  revised mid-review after the user pointed at a real reference project
  (SoumyaEXE/Among-Midnight's "Shadow Protocol") whose integration shape (thin fire-and-forget
  bridge, mock mode, audit dashboard) is adopted directly, with client-side proving as a deliberate
  correction to that project's server-side-proving gap. ADRs
  [0006](docs/adr/0006-midnight-contract-architecture.md),
  [0007](docs/adr/0007-effectstream-cross-chain.md),
  [0008](docs/adr/0008-match-stakes-trust-model.md) written before any code, per the working
  agreement.
  - **Workstream 1 (contract) — done.** `contracts/midnight-pool.compact` + `witnesses.ts`,
    written by a `compact-core:compact-dev` agent, compiled with full ZK keys and every circuit
    actually executed (34 checks in `contracts/test/simulator.test.ts`), not just compiled. Six
    circuits: `commitStats`, `proveThreshold`, `claimCue`, `commitBreakChoice`/`revealBreakChoice`/
    `resolveBreak`. Real deviations from the plan, found only by compiling against the actual
    toolchain (per the standing "don't trust recalled Compact syntax" rule): there is no block-height
    primitive at all, only block-*time* (Unix seconds, verified against the runtime source after the
    verification tooling itself incorrectly reported milliseconds); Compact has no XOR/modulo, so the
    break flip uses `persistentHash(...)[0] < 128` instead; exported-circuit parameters are treated
    as private by the disclosure analysis, so even `matchId`/`role` need explicit `disclose()`. A real
    soundness bug (nonce minted inside a witness, not a pure read — unopenable commitments on a proof
    retry) was caught by `witness-verifier` and fixed before being called done. No Compact CLI exists
    for Windows — compile steps run in WSL, `npm test`/`typecheck` run natively.
  - **Workstream 2 (frontend integration) — done, not live-tested (no browser automation tool
    available this session; verified by build + curl + code review, not an actual click-through).**
    Added a `wins` counter to `profile.js`/`economy.js` (nothing tracked it before; needed for the
    contract's `PlayerStats.wins`). New `src/midnight/` module: `breakOrder.js` (pure P2P commit-reveal
    replica, self-tested), `audit.js` (localStorage activity log), `wallet.js` (DApp Connector
    detection/connect via plain `window.midnight`, no new dependency), `hooks.js` (fire-and-forget
    `commitStats`/`proveThreshold`/`claimCue`/`resolveBreak`, mock-mode-by-default, real-mode
    explicitly logs "not wired" rather than faking a result — see the note below). Wired into
    `main.js`: the host-always-breaks-first bug is fixed for real — `newMatchGroups()`'s rack start
    now runs a 3-message commit-reveal handshake with the guest over the existing PeerJS channel
    before broadcasting `'start'`, falling back to "host breaks" only on a 4s timeout (see the
    implementation note added to ADR-0006); cue unlock and match-end now fire `hookClaimCue`/
    `hookCommitStats`; a new "Ranked" toggle on the multiplayer menu gates Quick Match behind
    `hookProveThreshold(profile, 5, false)`; a wallet-connect button and a Midnight Activity audit
    modal were added to the settings panel. `npm test` (now includes `breakOrder.js`'s self-test) and
    `npm run build` both pass.
  - **Workstream 4 (match stakes) — done, independently compiled+executed, not live-tested (same
    browser-automation caveat as workstream 2).** `contracts/stakes.compact` (`openStake`/
    `attestResult`/`resolveStake`), no witnesses needed — every value is already public. **Real
    design correction found while implementing, not just planning**: ADR-0008's original
    "timestamped on-chain, resolve in favor of whichever attestation arrived first" mechanism
    assumed block time could be *read* and stored per attestation for comparison — compiling
    against the real toolchain confirmed (again, same as workstream 1's discovery) that it can't be;
    only comparisons against a caller-supplied value exist. Replaced with a write-once ledger cell
    per match: whichever attestation lands on-chain first is permanently canonical, full stop, no
    deadline or stored time needed at all — a simplification, not a scope cut, and it closes the
    exact same "host goes silent when losing" exploit (proven by a dedicated test: a late,
    self-favoring host claim cannot displace the guest's earlier honest one). 12 execution checks in
    `contracts/test/stakes.test.ts`, run via `npm test` in `contracts/`. Wired into `main.js`: a
    stake-amount input on the host-create screen only (`game.stakeEligible`, set true only by
    `startHost()` — deliberately excluded from Quick Match to avoid a stale input value leaking into
    an unrelated game), the agreed amount rides along in the existing `'start'` broadcast, the
    Coins transfer applies client-side in `awardMatchResult` via a new `economy.applyStake` (winner
    +N, loser −N, clamped at 0, self-tested), with `hookOpenStake`/`hookAttestResult` recording the
    fire-and-forget audit trail. Same known limitation as the other contract: `role` isn't
    signature-bound, so a third party could grief one match's audit record — doesn't affect real
    custody or gameplay, documented in ADR-0008 and the contracts README.
  - **Deliberately not built this pass: real on-chain circuit submission.** Wiring `deployContract`/
    `callTx` against an actual deployed contract needs the pinned `@midnight-ntwrk/midnight-js-*`
    packages (not added as dependencies) plus a live indexer/proof-server, neither installable/
    verifiable from this environment. `hooks.js` is structured so this is a contained follow-up
    (swap what happens when `wallet.getMode() === 'real'`), not a rewrite — this was a deliberate
    scope decision to avoid shipping half-wired SDK code that couldn't be tested, not an oversight.

- **Purple theme, 8-Ball-Pool-style HUD, Quick Match timer, continuous spin, throw effect, rules
  completeness, free-drag ball-in-hand — done, tested, E2E-verified.** (Plan file at
  `C:\Users\mdhat\.claude\plans\now-we-start-the-harmonic-russell.md`, superseding the earlier
  9-workstream plan there.) User feedback after live-testing: recolor to purple/white, restructure
  the HUD to match the 8 Ball Pool reference's spatial layout, add a 60s Quick-Match-only turn
  timer, and several physics/rules requests.
  - **Color theme**: recolored app chrome (menu gradient, `--accent`, buttons, HUD pills) from
    green to purple, with a white glow at the top fading into deep purple — table felt/rails/balls
    deliberately left unchanged (that's the simulated table's own realistic colors, independent of
    app theme, matching how the reference app itself keeps a blue felt table under navy chrome).
    Verified with a screenshot — readable, cohesive, no contrast regressions found.
  - **HUD restructure**: menu icon relocated to the far left (icon button, was a text button in
    the actions row), level badges added to both player chips (opponent's level now synced
    alongside name via the existing `hello`/`start` messages — same pattern, no new protocol),
    ball-tracker dots moved from a separate floating `#balls-left` panel into two inline
    containers flanking each player chip, turn state now also dims/highlights the whole chip (on
    top of the existing `hud-turn` pill, not replacing it), a cue quick-select icon added to the
    in-game HUD. Verified end-to-end with Playwright — real screenshot confirms the layout.
  - **Quick Match turn timer (60s)**: host-only, ticks via the existing `physicsFrame()` fixed
    timestep (no new `setInterval`), broadcasts via the existing `sendState()`. On expiry: sets
    `cueFoul = true` and calls `resolveTurn()` directly — reuses the exact foul/turn-pass path a
    real scratch takes, no bespoke timeout branch. **Live-verified with two real browser contexts**:
    Quick Match shows the timer and it counts down (58→56 over ~2s); manual host/join multiplayer
    shows no timer at all, confirming the "Quick Match only" scoping actually holds. Cue `timeBonus`
    stat (seconds added) synced alongside name/level.
  - **Continuous touch-point spin control** replaces the earlier 3x3 preset grid — a cue-ball-face
    widget you drag on directly (offset from center = spin direction/strength, clamped to the
    equipped cue's `spinCap`), matching the user's own description of "adjusting the cue ball touch
    point." Same function names (`syncSpinGrid`/`wireSpinGrid`) kept so no call site needed to
    change, only the implementation.
  - **Throw effect**: side-spin now tangentially deflects the STRUCK ball, not just the cue ball
    (`physics.js`). A real sign bug (direction flipping based on incidental array order) was caught
    in design review before writing any code and fixed with an explicit `on = cueBall === a ? 1 :
    -1` correction — self-tested with both array orders to confirm the fix holds.
  - **Rules completeness, researched not assumed**: confirmed against the WPA ruleset and
    Miniclip's own support docs (not memory) that a legal break needs a pot or 4+ rails, and a
    break *scratch* specifically restricts ball-in-hand to behind the head string ("the kitchen") —
    both were real gaps, now closed in `rules.js`/`physics.js`/`main.js`. Explicitly simplified: an
    illegal break without a scratch is a plain foul (not the official 3-way choice), and a
    kitchen-placed cue ball can still directly target a ball inside the kitchen (the further
    official sub-rule on that is skipped as fiddly and rarely relevant).
  - **Ball-in-hand is now a free, repeatable drag**, not tap-to-place — `previewCuePlacement()`
    runs live on every `pointermove`, `commitCuePlacement()` only on release. **Visually verified**:
    a screenshot mid-drag shows the ball at one position, a second mid-drag screenshot (same
    continuous gesture, no release in between) shows it at a completely different position,
    confirming live tracking rather than a single jump.
  - All of the above verified together in one Playwright pass with zero console/page errors across
    every browser context used.
- **Workstreams 6-8 (economy, cues+spin, live-ops loop) — done, tested, and E2E-verified.**
  Completes the approved plan's core scope; workstream 9 (leagues/tournaments) is deliberately
  deferred — see below.
  - **New pure modules, all self-tested** (`npm test` now runs 8 self-tests): `profile.js`
    (versioned localStorage progression state — kept separate from `identity.js`'s nickname/avatar
    rather than merging, since that already worked and there was no reason to risk it),
    `economy.js` (XP curve, per-match awards, currency mutators that never go negative), `cues.js`
    (cue collections with **original names**, not "Predator" — a real registered trademark, see
    ADR-0001 — stat deltas asserted to stay within the agreed modest range),
    `dailyReward.js`/`pass.js`/`lootbox.js`/`loyalty.js` (streak calendar, Pool Pass tiers,
    Silver/Gold/Diamond box reward tables with weights asserted to sum to 1, loyalty catalog).
  - **New physics capability: simplified spin/English**, since cue stats affecting gameplay (the
    user's choice over cosmetic-only) only mean anything once spin exists — it didn't before. A
    3x3 preset grid (not a full drag widget — simpler, no coordinate-math edge cases, delivers the
    same feature) picks a spin direction, clamped by the equipped cue's `spinCap` (0 for the
    starting House Cue, which the E2E test confirmed correctly disables every non-center button).
    `physics.js` gained a lateral curve force while moving and a follow/draw kick on cue-ball
    contact — marked with a `ponytail:` comment naming the real ceiling (no actual angular-momentum
    model) and the upgrade path. Self-tested: a spin-applied shot's path diverges from a no-spin
    control, and topspin measurably keeps the cue ball moving forward more after contact.
  - **Fairness design**: cue stat deltas (power/aim/spin) are scaled at the *sending* side using
    each player's own local profile before a shot is executed or transmitted — necessary because
    profiles are local-only, so a host has no way to look up a guest's equipped cue, and vice versa.
  - **Real E2E verification** (Playwright, not just unit tests): daily-reward claim actually moves
    coins and then correctly disables itself for the day; the cues list renders all 5 tiers with
    correct equip/unlock affordances; buying a box with insufficient Cash shows the right toast,
    and buying one with enough Cash opens it and shows a real reward (coins, occasionally a cue
    piece); the spin grid appears and is correctly locked to center-only for the un-upgraded
    starting cue. **Found and fixed one more layering bug this way**: opening a box from inside the
    shop modal left the shop modal visible (double-dimmed) behind the reveal modal — same
    "two `.modal`s stacked" pattern as the earlier toast/gameover-modal bug. Fixed by hiding the
    shop modal before showing the reveal.
  - **Workstream 9 (leagues/tournaments) deliberately deferred, as the plan always scoped it** — it
    needs the matchmaking relay to become a *stateful* service (tracking weekly standings across
    players), a materially different risk/ops profile than today's disposable pairing queue, and
    was explicitly marked in the plan as needing its own ADR "when actually started." Building it
    now would mean guessing at a design with no real multi-player-base to validate it against yet.
- **Live at https://midnight-pool-one.vercel.app/** — user-confirmed working in solo play after
  the Vercel/GCP deploy fixes above. First piece of real user feedback from the live deploy: the
  table scaled down uncomfortably small in portrait on a phone. Fixed with a landscape-only lock —
  see below.
- **Landscape-only enforced.** Screen Orientation Lock isn't supported on iOS Safari at all (even
  installed as a PWA), so a JS-only lock can't be relied on cross-platform. The actual fix is a
  CSS-only `@media (orientation: portrait)` full-screen overlay (`#rotate-overlay` in `index.html`)
  that blocks the entire app until the device is rotated back — works identically on every
  platform since it needs no permission or API support. `vite.config.js`'s manifest
  `orientation: 'any'` → `'landscape'` (helps installed-PWA behavior on Android) and a best-effort
  `screen.orientation.lock('landscape')` call on first interaction (main.js) are added alongside it
  as free wins on platforms that do support them, but the CSS overlay is what actually guarantees
  the behavior everywhere. Verified with Playwright at both a portrait (390×844) and landscape
  (844×390) viewport — confirmed the overlay fully covers the screen and blocks interaction in
  portrait, and is absent in landscape.
- **Real browser E2E verification done** for workstreams 1-4 (Playwright, headless Chromium,
  installed in an isolated scratch location — not a project dependency). This is meaningfully
  stronger than the build/unit-test checks noted below: it drove actual browser instances through
  real PeerJS/WebRTC connections and the real matchmaking relay, not just isolated logic.
  - Solo mode: loads, takes a real drag-shot, physics resolves, shots counter increments, zero
    console/page errors.
  - Manual host/join multiplayer, two real browser contexts: PeerJS connection established for
    real, the "table's open" banner renders correctly on **both** sides confirming the rules-engine
    fix is wired end-to-end (not just unit-tested), nickname exchange verified correct in **both**
    directions (host saw "Alice"/"Bob" and guest saw "Bob"/"Alice" correctly cross-referenced), and
    turn-passing after a non-potting break shot was correct on both sides.
  - Quick Match against the live local relay: two browser contexts queued, paired, connected, and
    entered a game with zero errors.
  - **Found and fixed a real bug this way that no unit test or build check would have caught**: the
    new player-chip avatars in the HUD were completely hidden behind the pre-existing `#toast`
    notification for its ~2.6s duration, since both were positioned at the same top-left corner.
    Fixed by moving `#toast` below the HUD row (`index.html`).
  - Still not covered even by this: a full match to an actual win/loss (hard to script reliably via
    drag-shot physics), the Vercel Edge Function pieces (workstream 5, genuinely can't run locally —
    see below), and real mobile/touch input or an actual phone.
- Renamed from **Pool** to **Midnight Pool** (`package.json`, `index.html`, README, in-game menu).
- Mobile-first PWA rebuild done: `vite-plugin-pwa` manifest + service worker, icons generated from
  `favicon.svg`, responsive canvas scaling (CSS-only, no JS resize), safe-area insets on HUD/toast/
  hint, touch-action/overscroll fixes, viewport meta tuned for install/no-accidental-zoom. See
  [ADR-0002](docs/adr/0002-pwa-tooling-choices.md). Verified via `npm run build` + `vite preview`
  (manifest, service worker, and icons all serve correctly) — **not yet verified on a real phone**.
- `midnight-expert` Claude Code plugin marketplace (13 plugins) installed and enabled at **project**
  scope only. See [ADR-0003](docs/adr/0003-midnight-expert-plugin-scope.md).
- `.cursor/rules/midnight-pool.mdc` mirrors the Claude-side context for Cursor, since there's no
  Midnight plugin ecosystem for Cursor.
- No Midnight/Compact code exists yet — no contract, no wallet connection, no on-chain anything.
- **Game polish + multiplayer expansion plan approved** (see
  `C:\Users\mdhat\.claude\plans\now-we-start-the-harmonic-russell.md`, 9 workstreams). Workstreams
  1-2 implemented and verified this session; 3-9 not started:
  - **Workstream 1 (8-ball rule engine) — done, tested.** New `src/rules.js` (pure, self-tested via
    `node src/rules.js`, wired into `npm test`): open-table group assignment (was a coin flip
    before, now correctly decided by the first legal pot), first-contact/wrong-ball/no-rail fouls
    (didn't exist before at all), all fed by richer `{a, b}`/`{ball}` identities now recorded in
    `physics.js`'s hit array. `main.js`'s `resolveTurn` calls `rules.resolveShot()` instead of
    hand-rolled logic. Deliberate scope cuts (unchanged from before): 8-ball-on-the-break still
    auto-loses for the breaker (no re-rack), no called-pocket, no kitchen restriction on ball-in-hand.
  - **Workstream 2 (identity + UI polish) — done, builds clean, not yet manually tested in a
    browser.** New `src/identity.js` (nickname + procedural initials-avatar + vibrate-on-turn pref,
    all `localStorage`). HUD now shows both players' avatar+name (name exchanged over the existing
    PeerJS data channel via a `hello` message from guest and a `hostName` field on `start`). Added:
    emoji reactions (reuses the existing `toast()`, no new UI component), a prominent Rematch/Menu
    modal on game-over (reuses the existing `.modal` component and the existing restart/menu button
    logic — found and fixed two z-index/DOM-order bugs where the confirm dialogs those trigger would
    have rendered *behind* the still-visible gameover modal), nickname + vibrate-on-turn settings.
  - **Workstream 3 (shareable invite links + QR) — done, builds clean.** `?join=CODE` deep-link
    handling on load, a Share button (`navigator.share` with clipboard-copy fallback), and a
    client-side QR code (`qrcode` package) next to the host code. No new infrastructure.
  - **Workstream 4 (matchmaking relay) — done, tested at two levels, not yet tested through a
    real browser/PeerJS.** [ADR-0004](docs/adr/0004-matchmaking-relay.md) written first, per the
    working agreement. New `server/` package (`ws`, own `package.json`): a pure `Matchmaker` class
    (`server/matchmaker.js`) with 6 self-tested scenarios (`node server/index.test.js`) covering the
    3-step handshake, requeue-on-host-failure, requeue-on-disconnect, timeout, and cancel — plus a
    live end-to-end smoke test with two real WebSocket clients against the running server, which
    correctly paired and exchanged the host-chosen code. `src/net.js` gained `findMatch()`, which
    only ever hands off to the existing `host()`/`join()` — the relay carries no game traffic.
    `main.js` refactored `startHost`/`startJoin`'s inline logic into `hostJoinedHandler()`/
    `guestConnectedHandler()` so quick-match reuses the exact same match-start logic rather than
    duplicating it. New "Quick Match" screen with searching/cancel/timeout states.
    **Deployed for real** to Google Cloud Run (the user's choice — `gcloud` was already
    authenticated in this environment, unlike Vercel/Render): live at
    `wss://midnight-pool-relay-147606977567.us-central1.run.app`, in the user's existing
    `project-f0b6b4ce-541f-43ff-9f7` project. Verified against the *live* deployed URL with real
    `ws` clients, not just localhost — queue → pair → code exchange all worked. `--max-instances=1`
    is pinned (a correctness requirement, not a cost choice — see ADR-0004) and `--timeout=3600`
    (Cloud Run's default 300s would otherwise cut a match off mid-game). The relay URL is committed
    in **`.env.production`** (not a Vercel dashboard env var, since there's no Vercel access here) —
    confirmed via `npm run build` that the real URL is now baked into the production bundle, so
    Quick Match will work automatically once Vercel deploys this.
  - **Workstream 5 (dynamic share previews) — code complete, one real bug found via an actual
    deploy attempt and fixed.** [ADR-0005](docs/adr/0005-dynamic-share-previews.md) written first.
    `api/og.js` (`@vercel/og`) and `api/invite.js` (serving `/i/:code` via a `vercel.json` rewrite,
    returning OG meta tags + a redirect script). `startHost()`'s share link now points at
    `/i/:code?n=<nickname>`. The user's first real Vercel deploy failed exactly as ADR-0005's risk
    note predicted: `api/og.js`'s Edge Function config broke with "referencing unsupported
    modules" — `@vercel/og`'s WASM/font loading only works inside Next.js's build pipeline. Fixed
    by switching `api/og.js` to the Node.js serverless runtime (Vercel's own docs confirm
    `ImageResponse` supports it) — a one-line removal, no other changes. `api/invite.js` was
    unaffected (no `@vercel/og` dependency). Still genuinely unverified from this environment (no
    Vercel access here at all): whether the redeploy actually succeeds, whether `ImageResponse`
    renders a real image on the Node runtime, and real link-preview rendering — see ADR-0005's
    verification section for the exact post-deploy checks.
    (Workstreams 6-8 status has since moved on — see the entry at the top of this section; this
    entry is left as the historical record of workstream 5's own deploy/fix cycle.)

## Decisions made

See `docs/adr/` for the full record:

- [0001](docs/adr/0001-mobile-first-pwa-and-midnight-direction.md) — one project across Mobile /
  Integrate Midnight / Cross-Chain tracks, existing game kept as-is for the "before" state.
- [0002](docs/adr/0002-pwa-tooling-choices.md) — `vite-plugin-pwa` over hand-rolled manifest/SW.
- [0003](docs/adr/0003-midnight-expert-plugin-scope.md) — plugin marketplace at project scope, not
  user scope.
- [0004](docs/adr/0004-matchmaking-relay.md) — self-hosted relay for random matchmaking, not a
  third-party BaaS queue.
- [0005](docs/adr/0005-dynamic-share-previews.md) — dynamic per-invite share previews via Vercel
  Edge, the project's first server-side code.
- [0006](docs/adr/0006-midnight-contract-architecture.md) — one Compact contract for stat
  commitment, threshold credentials, soulbound cue claims, and fair break order; client-side
  proving as the deliberate departure from Shadow Protocol's server-side-proving gap.
- [0007](docs/adr/0007-effectstream-cross-chain.md) — cross-chain via the full Effectstream
  `evm-midnight-v2` stack, with a documented fallback to a lighter custom join. **Outcome: the
  fallback was invoked for real** — six real environment bugs fixed in sequence got the full stack
  to the very last step before a WASM version-duplication bug ended it; `cross-chain/` +
  `contracts/cross-chain-join.ts` built and verified instead. See the ADR's Outcome section.
- [0008](docs/adr/0008-match-stakes-trust-model.md) — match stakes scoped to non-purchasable Coins,
  honest about what the corrected escrow design does and doesn't fix.

## Known quirks / gotchas

- This repo has been worked on by **both Claude Code and a Cursor background agent concurrently**
  in the same working directory — a Cursor session committed and pushed a chunk of Claude's
  in-progress work under its own commits (`a6764b4`, `28d5576`, co-authored by Cursor). No content
  was lost, but check `git status`/`git log` at the start of a session before assuming the working
  tree matches what you last saw — it may have moved.
- `claude plugin enable <name>@marketplace` without `--scope project` silently falls back to
  **user** scope (enables it for every project on the machine). Always pass `--scope project`
  explicitly here — see ADR-0003.
- `enabledPlugins` in `.claude/settings.json` must be an **object** (`{"plugin@marketplace": true}`),
  not an array — an array parses as valid JSON but Claude Code's settings schema rejects it
  ("Expected record, but received array").
- The matchmaking relay's GCP project (`project-f0b6b4ce-541f-43ff-9f7`, "My First Project") is
  **shared with unrelated apps** ("flocus", Gemini API usage) — it wasn't given a dedicated
  project. Don't be surprised by other services showing up in that project's Cloud Run/billing
  console; they're not this game's.
- `.env.production` at the repo root is committed (not gitignored) on purpose — it only holds the
  public matchmaking relay WebSocket URL, which isn't a secret. Don't put anything sensitive there.

## Next steps

- **Clubs/leaderboards** — deliberately dropped three times now (twice during the reputation-
  features pass, once again during the production-hardening pass) for the same reason each time:
  they need real shared server infrastructure (persistent membership, cross-player leaderboard
  aggregation), and only a thin match-attestation backend exists so far (`docs/adr/0009`). Natural
  next increment once that backend has grown a bit further — a `clubs` table + a leaderboard query
  endpoint on the existing relay (`server/`) is the smallest version, not a new service.
- **A human should still play a real match** — every Playwright pass so far covers connection
  wiring, rules-engine correctness signals, UI layout, the economy/shop/spin UI, the new HUD, the
  timer, and the ball-in-hand drag, all scripted. None of it covers an actual win/loss (hard to
  script reliably), real touch input, or how it actually *feels* to play — including whether the
  continuous spin widget and cue-stat differences feel good rather than just "work," and whether
  60s actually feels right for a Quick Match turn. Also worth: a deliberate-foul pass (hit the
  wrong group on purpose) once groups are assigned, and a real break that scratches (to see the
  kitchen restriction in the actual UI, not just asserted in a test) — neither reached by scripted
  tests yet.
- **The purple/HUD/timer/spin/rules plan is now functionally complete.** Whatever comes next (cue
  art assets once the user provides them — PNG/transparent, ~128×512px, given as guidance; more
  live-ops depth; leagues; or the Midnight integration) needs a fresh planning pass.
- Cue asset integration is waiting on the user to actually provide files — no code to write until
  then.
- Confirm the Vercel redeploy succeeded and verify workstream 5 for real: fetch `/i/CODE?n=Name`
  and confirm the `og:title`/`og:image` meta tags are right, fetch `/api/og?n=Name` directly and
  confirm it returns a real image, and paste an invite link into WhatsApp/iMessage.
- Test PWA install on an actual phone (same-Wi-Fi `npm run dev -- --host` or `npm run preview
  -- --host`) — still not done from any session.
- **Midnight workstream 3 (cross-chain) — done, via the documented fallback, not Effectstream.** See
  the Current State entry above and ADR-0007's Outcome section for the full story: the full
  Effectstream stack got genuinely close (real EVM deploy, real Midnight devnet with block
  production, six real environment bugs found and fixed in turn) before a WASM module-identity
  duplication bug at the final step led to dropping it per the user's call. `cross-chain/` +
  `contracts/cross-chain-join.ts` built and verified instead — real circuit execution, real anvil
  deploy, both directions (qualifying/non-qualifying) checked.
- **A live frontend for the cross-chain join is still open** — today it's a script run on demand
  (`npx tsx contracts/cross-chain-join.ts`), not wired into the main app's UI or run automatically.
  Natural next increment if this track gets more attention, not something to assume is done.
- **Midnight workstream 4 (match stakes) — contract + client wiring done** (see the entry above);
  still needs the Playwright scenarios described in the plan (happy path, disagreement — no longer
  meaningfully distinct from the exploit test now that resolution is write-once rather than
  timestamp-compared, so this may collapse to two scenarios: agreement, and the "first attestation
  wins" exploit-closing test — and the explicit accepted-gap test for a host fabricating from the
  start). No browser-automation tool was available this session to write/run them.
- **Real on-chain circuit submission** — deliberately deferred in workstream 2 (see above); needs
  the pinned `@midnight-ntwrk/midnight-js-*` packages added and a live indexer/proof-server to
  verify against.
- **A human should actually click through the new Midnight UI in a browser** — no browser
  automation tool was available this session, so workstream 2 was verified by `npm test`/
  `npm run build`/curl and code review only, never an actual click-through. In particular: the
  wallet-connect button (expected to show "no wallet found" without a Lace-equivalent extension
  installed), the ranked-toggle gate, and — most importantly — the break-order handshake between
  two real browser tabs (host + guest), which no automated check here exercises end-to-end.
- Decide who commits the currently-uncommitted local changes given the concurrent-session
  situation noted above (this session's diff now spans the PWA fixes plus all of workstreams 1-8
  plus the Midnight work above).
