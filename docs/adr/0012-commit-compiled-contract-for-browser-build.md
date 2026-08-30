# ADR-0012: Commit the compiled contract's `contract/` output for the browser build

Status: Accepted

## Context

The Vercel deploy had been failing for hours across four consecutive attempts (confirmed via
`vercel inspect --logs` once CLI auth was available — the pasted stack trace alone, an
`aggregateBindingErrorsIntoJsError` tail from Rolldown, never showed the actual top-line error).
The real cause: `[UNRESOLVED_IMPORT] Could not resolve
'../../contracts/managed/midnight-pool/contract/index.js' in src/midnight/circuit.js`.

`contracts/.gitignore` ignored all of `managed/` (the Compact compiler's output — generated
TypeScript, ZKIR, and ~28MB of ZK proving/verifying keys), a reasonable default for a Node-only
workflow (`npm run compile` regenerates it locally before `contracts/test/`,
`contracts/cross-chain-join.ts`, etc. run). But `src/midnight/circuit.js` (added this session, for
the browser-side Champion Badge panel, `docs/adr/0006`) imports directly from
`contracts/managed/midnight-pool/contract/index.js` for the Vite/browser bundle. Vercel builds from
a fresh `git clone` with no compile step — so on Vercel, that file simply never existed, and Vite's
build failed resolving the import every time, since this feature was added. The earlier `"engines"`
pin (this session's first, incorrect fix attempt) was chasing the wrong hypothesis: the failure
looked like a native-binding/Node-version issue because of how Rolldown wraps a plugin-level
`UNRESOLVED_IMPORT` error, but was never actually about Node version or platform bindings.

## Decision

Un-ignore and commit only `managed/*/contract/` (the compiled circuit JS/`.d.ts`/sourcemap, ~160K
per contract) — confirmed by grep to have zero reference to any `zkir`/`keys` file path, since
`compact-runtime`'s simulator (what `circuit.js` and `contracts/test/simulator.test.ts` both use)
only executes circuit logic in-memory and never touches proving/verifying keys. `compiler/`,
`keys/` (~28MB), and `zkir/` stay gitignored and regenerated via `npm run compile` — nothing that
imports from `managed/` at the JS level needs them.

## Consequences

- The Vercel build actually has the file it needs from a fresh clone; verified with a real fresh
  `git clone` + `npm install` + `npm run build` reproduction (not just "should work now").
- `managed/*/contract/` is now a **committed, generated file** — whoever next runs
  `contracts/npm run compile` after changing a `.compact` source file must re-commit the
  regenerated `contract/` output too, or the browser bundle silently goes stale against the
  circuit it's actually running. Worth a one-line reminder in `contracts/README.md` if this
  workflow gets used again.
- The previous `"engines": {"node": ">=20.19.0"}` pin stays (harmless, arguably still good
  practice pinning a real minimum), but is no longer believed to be what fixes deployment —
  this ADR corrects that earlier, unverified assumption.
