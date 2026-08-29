# ADR-0001: Rebuild Pool as a mobile-first PWA integrating Midnight Network

Status: Accepted

## Context

The repo started as **Pool**, a desktop-drag-first 2D browser pool game (PixiJS, custom physics,
PeerJS p2p 1v1, Vite). It's being entered in the
[Midnight Hackathon](https://midnight-hackathon-august-2026.devpost.com/) (MLH, Aug 2026) across
three tracks at once: Mobile, Integrate Midnight, and Cross-Chain. One project has to satisfy all
three rather than building three separate demos.

## Decision

- Treat the existing p2p pool game as the "before" state for the **Integrate Midnight** track — its
  gameplay, physics, and net code are retained as-is, not rewritten.
- Rebuild the UI mobile-first (touch input, installable PWA) for the **Mobile** track.
- Use [Effectstream](https://github.com/effectstream/effectstream) for eventual multi-chain sync
  for the **Cross-Chain** track, rather than a hand-rolled bridge/relayer.
- Route all Midnight/Compact-specific code through the `midnight-expert` plugin toolchain (see
  ADR-0003) instead of relying on model memory, since Compact is barely represented in training
  data.

Full rationale and track requirements live in [CLAUDE.md](../../CLAUDE.md).

## Consequences

- The desktop-drag-first UI needs revisiting for touch (tracked as ongoing work, not one ADR).
- The actual Midnight integration design (what privacy feature ships — stakes, provable-fair
  outcomes, private ranking) is still open and will get its own ADR once decided.
- Game logic (`src/physics.js`, `src/net.js`, `src/i18n.js`) is out of scope for the Midnight work
  and shouldn't be refactored as a side effect of it.
