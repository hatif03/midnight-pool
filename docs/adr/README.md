# Architectural Decision Records

One file per structural decision: what forced it, what we chose, what it costs. Copy
`0000-template.md`, number it sequentially, don't renumber or delete old ones — mark a
superseded one's Status line instead (`Superseded by ADR-000X`).

Write one **before** a major architectural change (new dependency, a rework of how a subsystem
talks to another, a reversal of an earlier decision) — not for routine feature work or bug fixes.

| ADR | Title |
| --- | --- |
| [0001](0001-mobile-first-pwa-and-midnight-direction.md) | Rebuild Pool as a mobile-first PWA integrating Midnight Network |
| [0002](0002-pwa-tooling-choices.md) | PWA tooling: vite-plugin-pwa over a hand-rolled manifest/service worker |
| [0003](0003-midnight-expert-plugin-scope.md) | Scope the midnight-expert plugin marketplace to project, not user |
| [0004](0004-matchmaking-relay.md) | Self-hosted WebSocket relay for random-opponent matchmaking |
| [0005](0005-dynamic-share-previews.md) | Dynamic per-invite share previews via Vercel Edge |
