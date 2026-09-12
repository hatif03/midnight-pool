# ADR-0014: Rebuild the visual layer as a bright arcade theme, with CSS out of index.html

Status: Accepted

## Context

The game plays well and the Midnight layer underneath it is real, but it does not read as a game. Two
concrete, measurable reasons:

- **All 310 lines of CSS lived inline in `index.html`** (`<style>` at lines 14-325), with seven custom
  properties, no stylesheet file anywhere in the repo, and no font or image assets at all. Every
  visual is `system-ui` text on dark-purple glassmorphism.
- **The lobby is a title, one button, and a row of seven emoji text links.** Nine live-ops systems
  (`dailyReward`, `pass`, `cues`, `leagues`, `lootbox`, `loyalty`, `economy`, `profile`, `identity`)
  are fully built and self-tested but surface as 🎁 🎱 📈 🏆 🛒 ⚙️ 🚪. Emoji render differently on
  every platform and are the single loudest "hobby project" signal on the screen.

The reference the project is being measured against — Miniclip's 8 Ball Pool — is warm, bright, dense
and glossy: a sunburst lobby, glossy candy buttons, a blue felt table with red rails and gold pocket
rims, a VS intro before each match, and chunky display typography.

This is a submission to the Midnight Buildathon on AKINDO, a three-wave program that rewards visible
iteration. The visual gap is the most legible thing a judge sees in the first five seconds, and
closing it carries no technical risk to the parts of the project that already work.

Two properties of the existing code make this much cheaper than it looks, and both are worth stating
because they shaped the decision:

- `src/scene.js` is 171 lines and is the **only** file that draws. The table, all 16 balls, shadows and
  specular highlights are drawn procedurally and baked to textures once via `renderer.generateTexture()`.
  Restyling the table is one function.
- `src/main.js` is the only coupling point. The other 19 `src/` modules are leaves; 11 are pure and
  self-tested. A reskin does not have to touch them.

## Decision

Rebuild the visual layer as a bright arcade theme matching the reference, and move all CSS out of
`index.html` into `src/styles/`.

**Structure.** Six files under `src/styles/` — `index.css` (entry, `@import`s the rest), `tokens.css`,
`components.css`, `lobby.css`, `game.css`, `modals.css` — loaded by one `<link>` in `index.html`.

A `<link>` rather than `import './styles/index.css'` from `main.js`: in dev the `<link>` is a
stylesheet at first paint, whereas a JS import injects CSS only after the module graph parses, which
on a full-bleed lobby is a white flash on every reload. In production Vite extracts both to a `<link>`,
so this costs nothing.

Six files rather than one because the overhaul lands ~1,400 lines of CSS and the phased sequencing
edits exactly one file per phase — that is what makes it reviewable. No preprocessor, no PostCSS, no
CSS modules; Vite inlines local `@import` out of the box and custom properties do everything nesting
would.

**Migration.** The original inline block moves to `src/styles/legacy.css` **verbatim** — extracted with
`sed`, not retyped, and verified by comparing whitespace-stripped checksums of source and destination.
It shrinks as each surface is restyled and is deleted at the end of the overhaul. This makes the first
step a provable no-op instead of a 310-line rewrite with a silent typo in it.

**One font: `@fontsource/lilita-one` (latin-400), self-hosted.** Display and numerals only; body stays
`system-ui`. Self-hosted rather than the Google Fonts CDN because `vite.config.js`'s
`workbox.globPatterns` precaches by glob over the *build output* — a CDN URL is never in the build
output, so an offline-launched PWA would fall back to `system-ui` and undo the overhaul. Fontsource
emits `woff2` into `dist/assets/`, so adding `woff2` to `globPatterns` precaches it exactly like the
`.ogg` files already are. This also removes a third-party DNS+TLS round trip on cold start, which
matters for a landscape game people open and play in five seconds.

Rejected: Luckiest Guy (no true lowercase — would mangle the Spanish locale), Bungee (signage face),
Titan One (too wide at a 340px viewport height), Fredoka/Baloo (30-45KB to beat `system-ui` at 11px).

**Icons: an inline SVG `<symbol>` sprite**, referenced with `<use href="#i-coin">`. ~40 lines of
markup, zero asset files, zero network requests, recolourable with `currentColor`.

**Delete every `--glass-*` token and every `backdrop-filter`.** The target look is opaque painted
panels, and `backdrop-filter: blur(18px)` currently sits on 12 modals plus every HUD pill — one of the
most expensive operations available to a mid-range phone GPU. Removing it is a free frame-rate win.
A `blur(3px)` scrim on `.modal` only is kept.

**No animation dependency.** GSAP is ~25KB gzipped to run six tweens; `canvas-confetti` is 6KB for
twenty lines of CSS. The juice layer is ~170 lines of hand-rolled CSS keyframes and Pixi sprites
running inside the existing `renderFrame` ticker — no second `requestAnimationFrame` loop.

## Consequences

**Easier.** A reskin now touches one directory instead of a 605-line HTML file. Deleting
`backdrop-filter` measurably improves frame time on the exact devices this PWA targets. The token set
makes further art changes a value edit rather than a search-and-replace. Removing the emoji row
removes a cross-platform rendering inconsistency entirely.

**Harder / riskier.** Three things in the existing code actively fight this and are documented here so
they are not rediscovered painfully:

1. `applyStatic()` in `i18n.js` sets `textContent` on every `[data-i18n]` element, destroying child
   nodes. Any new button with both an icon and a label must carry `data-i18n` on an inner `<span>`,
   never on the button itself. This fails only on language switch, and looks like a rendering bug.
2. `main.js` binds hover sounds by querying `.glass` once at startup — a class this ADR removes. It is
   replaced with one delegated `pointerover` listener on `.btn`, which also fixes dynamically-built
   modal rows that never got hover sounds.
3. `body { touch-action: none }` means every new interactive element needs an explicit `touch-action`.

**Follow-up.** `vite.config.js` gains `woff2` in `globPatterns`. The PWA manifest's `#04080a` and the
`theme-color` meta's `#0a0714` currently disagree with each other and with the new palette; both are
retargeted during the token phase. `legacy.css` must reach zero lines before the overhaul is called
done — a non-empty `legacy.css` at the end means a surface was missed.

**Not covered here.** The aim-guide rework and the two-stage shot input are gameplay changes, not
visual ones, and get their own ADR — they change how the game plays, not how it looks.
