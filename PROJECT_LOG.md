# Project Log

Living record of where this project stands. Read this first when starting a session; update it
before ending one that changed project state or direction. See
[CLAUDE.md](CLAUDE.md#working-agreements) for the policy this follows, and `docs/adr/` for the
reasoning behind any decision marked with an ADR link.

## Current state (2026-08-29)

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
    **Gap**: relay is not deployed anywhere yet (`VITE_MATCH_RELAY_URL` still defaults to
    `ws://localhost:8787`) — Quick Match only works today if `server/` is also running locally.
  - **Workstream 5 (dynamic share previews) — code complete, unverifiable from this environment.**
    [ADR-0005](docs/adr/0005-dynamic-share-previews.md) written first. `api/og.js` (`@vercel/og`
    Edge Function, deliberately built with plain object literals instead of JSX to avoid any
    JSX-transpilation uncertainty) and `api/invite.js` (Edge Function serving `/i/:code` via a
    `vercel.json` rewrite, returning OG meta tags + a redirect script). `startHost()`'s share link
    now points at `/i/:code?n=<nickname>`. **Real gap, not just "not yet tested on a phone" like
    earlier workstreams**: there's no Vercel CLI or linked project in this environment, and
    `@vercel/og`'s edge runtime doesn't run under plain Node, so this could only be verified as far
    as: syntax-checked, the `invite.js` HTML-generation logic executed directly in Node (Node has
    native `Request`/`Response`/`URL`) and confirmed to interpolate the name/code/image URL
    correctly, and the `og.js` object-tree shape sanity-checked. The actual `ImageResponse` render,
    the `vercel.json` rewrite, and real link-preview rendering are **unverified** until deployed —
    see ADR-0005's verification section for the exact post-deploy checks.
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

## Next steps

- **Manually test workstreams 1-4 in a browser** before continuing — `npm run dev` plus
  `cd server && npm start` for the relay, play a full 2-player game start to finish: open-table
  group assignment, a deliberate foul, an 8-ball win/loss, avatar/name/reactions/rematch, a manual
  invite-link/QR join, and a Quick Match pairing. Automated tests cover the rules logic and the
  relay's pairing logic in isolation; neither covers the DOM or the real PeerJS/WebRTC path.
- **Deploy and verify workstream 5 for real** — this is the one piece so far that genuinely
  couldn't be tested from this environment (no Vercel CLI/project link, `@vercel/og`'s edge runtime
  doesn't run under plain Node). After deploying: fetch `/i/CODE?n=Name` and confirm the `og:title`/
  `og:image` meta tags are right, fetch `/api/og?n=Name` directly and confirm it returns a real
  image, and paste an invite link into WhatsApp/iMessage to see the actual preview card render.
- Deploy `server/` somewhere (Render.com free tier per ADR-0004, or swap it) and set
  `VITE_MATCH_RELAY_URL` in Vercel's project env vars — Quick Match is local-only until then.
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
