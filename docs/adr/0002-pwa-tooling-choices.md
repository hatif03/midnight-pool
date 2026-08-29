# ADR-0002: PWA tooling — vite-plugin-pwa over a hand-rolled manifest/service worker

Status: Accepted

## Context

The Mobile track needs a real installable PWA: a web app manifest, a service worker, and icons.
`npm run build` (Vite) emits content-hashed JS filenames, so a hand-maintained service-worker
precache list would go stale on every build and silently miss new chunks.

## Decision

- Use `vite-plugin-pwa` (`registerType: 'autoUpdate'`, `devOptions.enabled: true` so the SW also
  registers under `npm run dev`) instead of a hand-written `sw.js`. It regenerates the precache
  manifest from the actual build output every time.
- Generate icons (192, 512, 512 maskable, apple-touch-icon) from the existing pixel-art
  `public/favicon.svg` with a small `sharp` script (`scripts/gen-icons.mjs`, run via
  `npm run gen-icons`) rather than a heavier asset-generator dependency or a manual export.

## Consequences

- Two new devDependencies: `vite-plugin-pwa` and `sharp`.
- Icons must be regenerated (`npm run gen-icons`) whenever `favicon.svg`'s artwork changes — this
  doesn't happen automatically.
- `dev-dist/` (dev-mode SW output) and `dist/` are build artifacts and stay gitignored.
