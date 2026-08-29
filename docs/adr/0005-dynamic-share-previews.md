# ADR-0005: Dynamic per-invite share previews via Vercel Edge

Status: Accepted

## Context

The user chose the full dynamic per-invite share image over static personalized text (see
[PROJECT_LOG.md](../../PROJECT_LOG.md)). Today the app is a **pure static site** on Vercel — no
`/api`, no edge functions, no middleware. A static SPA can't vary its `<meta>` tags per invite
code, and link-unfurling bots (WhatsApp/iMessage/Slack/Twitter) don't execute JavaScript — they
only read whatever HTML the server returns for that exact URL. Making the preview card itself say
"Hatif invited you to play Midnight Pool" requires the *server* to answer differently per URL,
which means introducing server-side code to an otherwise static project for the first time.

## Decision

- **`api/og.js`** — a Vercel Edge Function (`export const config = { runtime: 'edge' }`) using
  `@vercel/og`'s `ImageResponse` to render a share-preview image from query params (inviter name +
  code): "`<name>` invited you to a game of Midnight Pool."
- **`vercel.json` rewrite + `api/invite.js`**: a `rewrites` entry sends `/i/:code` to
  `/api/invite?code=:code` (a plain, framework-agnostic Vercel platform feature), which returns a
  minimal HTML document with the correct `og:title`/`og:image`/`twitter:*` meta tags (image
  pointing at `/api/og?...`), then a tiny inline script `location.replace('/?join=' + code)` so an
  actual human clicking the link still lands in the real game with the code pre-filled. A crawler
  never executes that script — it only reads the meta tags in the initial response, which is the
  point. (Root-level `middleware.js` auto-discovery was considered but is a Next.js App Router
  convention — not confirmed to apply to a plain static/Vite deployment, so the `/api/*` + rewrite
  path was chosen as the more defensible, verifiably-documented mechanism.)
- `startHost()`'s share link (workstream 3) now points at `/i/:code?n=<nickname>` instead of
  `/?join=` directly — the existing `?join=` deep-link handling in `main.js` is the redirect target,
  unchanged.

## Consequences

- **This is the project's first server-side code in an otherwise static site.** Deploying now
  depends on Vercel's Edge Runtime specifically — `middleware.js` and `api/*` with
  `runtime: 'edge'` are Vercel-specific conventions, not portable to a different static host without
  rework. That coupling is a deliberate tradeoff for the polish, not an accident.
- **This cannot be verified without a real Vercel deployment.** There's no Vercel CLI or linked
  project in this environment, and `@vercel/og`'s edge runtime doesn't run under plain `node`. The
  code is written to the standard, stable `@vercel/og` + Edge Middleware conventions, but unlike
  every other workstream so far, it has **not** been executed or tested — only built as static
  assets and read for correctness. Verify for real after deploying: fetch `/i/CODE?n=Name` and
  confirm the returned HTML's `og:title`/`og:image` are correct, fetch `/api/og?...` directly and
  confirm it returns a valid image, and check an actual link-preview render (e.g. paste the link
  into WhatsApp/iMessage).
- `@vercel/og` is a new dependency on the frontend's `package.json` (separate from `server/`'s
  dependencies — this lives in the Vite project since it deploys alongside it on Vercel, not
  alongside the standalone matchmaking relay).
