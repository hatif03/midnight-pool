# Project Log

Living record of where this project stands. Read this first when starting a session; update it
before ending one that changed project state or direction. See
[CLAUDE.md](CLAUDE.md#working-agreements) for the policy this follows, and `docs/adr/` for the
reasoning behind any decision marked with an ADR link.

## Current state (2026-08-29)

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
  - **Workstreams 6-9 not started**: the player economy foundation (Coins/Cash/XP), cue collection
    + new spin/English physics, the live-ops loop (daily reward/pass/boxes/spin-and-win/loyalty
    shop), and leagues/tournaments (stretch). See the plan file for full detail on each.

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

- **A human should still play a real match** — the Playwright pass above covers connection
  wiring, rules-engine correctness signals (open table, turn-passing), and UI layout, scripted via
  drag gestures. It doesn't cover an actual win/loss (hard to script reliably), real touch input,
  or how it actually *feels* to play. Also worth a deliberate-foul pass (hit the wrong group on
  purpose) once groups are assigned, which the scripted test didn't reach.
- **Confirm the Vercel redeploy actually succeeds** after the `api/og.js` Node-runtime fix, then
  verify workstream 5 for real: fetch `/i/CODE?n=Name` and confirm the `og:title`/`og:image` meta
  tags are right, fetch `/api/og?n=Name` directly and confirm it returns a real image, and paste an
  invite link into WhatsApp/iMessage to see the actual preview card render.
- Continue the approved plan at workstream 6 (player economy foundation: Coins, Cash, XP/levels) —
  the largest remaining chunk (workstreams 6-9 together).
- Test PWA install on an actual phone (same-Wi-Fi `npm run dev -- --host` or `npm run preview
  -- --host`) — still not done from any session.
- Decide the actual Midnight integration (private stakes? provable-fair shot outcomes? private
  ranking?) — still open, needs its own ADR once decided. Match-stakes wagering (workstream 3's
  deferred item) is the natural bridge to this.
- Cross-chain: evaluate Effectstream's `evm-midnight-v2` template once the Midnight-side contract
  exists.
- Decide who commits the currently-uncommitted local changes given the concurrent-session
  situation above (this session's diff now spans the PWA fixes plus all of workstreams 1-2).
