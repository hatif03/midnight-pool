# Project Log

Living record of where this project stands. Read this first when starting a session; update it
before ending one that changed project state or direction. See
[CLAUDE.md](CLAUDE.md#working-agreements) for the policy this follows, and `docs/adr/` for the
reasoning behind any decision marked with an ADR link.

## Current state (2026-08-29)

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
- Decide the actual Midnight integration (private stakes? provable-fair shot outcomes? private
  ranking?) — still open, needs its own ADR once decided. Match-stakes wagering (workstream 3's
  deferred item) is the natural bridge to this, and now has a real currency system underneath it
  to make private, rather than a hypothetical one.
- Cross-chain: evaluate Effectstream's `evm-midnight-v2` template once the Midnight-side contract
  exists.
- Decide who commits the currently-uncommitted local changes given the concurrent-session
  situation noted above (this session's diff now spans the PWA fixes plus all of workstreams 1-8).
