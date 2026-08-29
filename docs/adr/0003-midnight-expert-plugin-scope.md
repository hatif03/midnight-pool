# ADR-0003: Scope the midnight-expert plugin marketplace to project, not user

Status: Accepted

## Context

Midnight and its contract language (Compact) are barely represented in model training data — this
is called out by Midnight's own docs. The `midnight-expert` marketplace
(https://midnightntwrk.expert) ships 13 Claude Code plugins that check generated Compact/SDK code
against the real compiler and toolchain instead of relying on model memory. Plugins execute
arbitrary code with the user's privileges, and enabling them at user scope applies to *every*
project on the machine, not just this one — a real side effect, not a config detail.

## Decision

Declare `extraKnownMarketplaces` and `enabledPlugins` in `.claude/settings.json` at **project**
scope, committed to the repo. Anyone who clones the repo gets the marketplace auto-registered once
they trust the folder, but must still run `claude plugin install <name>@midnight-expert` themselves
— installing/enabling a third-party plugin isn't something to do on someone's behalf without their
explicit action.

## Consequences

- Contributors get consistent, verified Midnight tooling without a global side effect on their
  other projects.
- A one-time manual install/enable step remains per contributor (documented in CLAUDE.md).
- Watch for `claude plugin enable <name>@marketplace` run without `--scope project` — it
  auto-detects and silently falls back to **user** scope, which is exactly the global side effect
  this ADR avoids. Always pass `--scope project` explicitly for this repo's plugins.
