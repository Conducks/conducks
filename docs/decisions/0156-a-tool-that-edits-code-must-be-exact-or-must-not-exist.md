# 0156 — a tool that edits code must be exact or must not exist
Status: Accepted
- Date: 2026-08-23
- Enforced by: tests/unit/adr-invariants.test.ts ("has no rename or gvr module anywhere under src/", and "registers no MCP tool that declares itself destructive" — both run against the pre-removal build first and both failed)
- Supersedes: 0106
- Amends: 0107

## Context

`conducks rename` is the only command that writes to a user's source. It has now been measured wrong
three separate ways, in two benchmark rounds, each time under a green checkmark.

| found | shape | outcome |
|---|---|---|
| round 4, 2026-08-18 | renamed `safeSend`'s declaration, left **48 call sites** dangling, printed `Successfully renamed at 6 site(s)`. The dry run promised the same wrong 6 first | fixed by `4030283` — it drove rewrites from graph EDGES, and ADR 0110 deduplicates edges per scope, so one edge stood for forty occurrences |
| round 5, 2026-08-23 | TypeScript: a consumer importing through a re-export **barrel** got its call site renamed and its import specifier left alone | not fixed |
| round 5, 2026-08-23 | Python: a **parenthesised** `from x import (…)` kept the old name on its continuation line while the class body was rewritten | not fixed |

Both round-5 cases were reproduced on four-file and three-file fixtures against a COLD vault, so
ADR 0107's incremental-resolution cause does not explain them. The second leaves the file importing a
member that no longer exists AND calling an identifier no import binds — on the orchestrator subject,
eight live Next.js API routes, every broken call being that route's authorization guard.

Each fix was correct and each was local. What none of them changed is the shape of the problem:
`rename` enumerates its edit sites from relationships the graph already holds, rather than asking each
consuming file which local name binds the symbol. Every round finds another binding form the
enumeration does not reach, and the site count agrees with itself the whole way — dry run and apply
reported 22 of 22 while producing a tree that does not run.

**This was already decided on 2026-08-18 and the decision was never written down.** The call then was
that `rename` stops writing files and becomes a site-lister. It was not carried out: the following
morning the per-edge defect was fixed instead, and the deeper safeguard identified in the same
session — re-parse each file after writing and prove no binding to the old name survives — was noted
as "bigger than this fix" and deferred. Nothing in `docs/` recorded either half, so round 5 spent a
session rediscovering the same command.

## Decision

**`conducks rename` is removed**: the CLI command, the `conducks_rename` MCP tool, `GVREngine`,
`RefactorResult` and `EvolutionDomain.rename()`. Conducks writes to its own vault and to nothing else.

The rule this establishes, and the reason it is stated as a rule rather than a fix: **a tool that
edits code must be exact or must not exist.** A rename is not a spectrum. At 100% it saves a few
minutes; at 90% it produces a broken tree under a success message, and the cost is not the broken
tree — it is that every rename the tool ever made is now suspect. Approximation is fine for
informing and fatal for writing.

**Rejected: keep the find, drop the write** — emit the site list and let a human apply it. This was
the 2026-08-18 recommendation and it is the option that looks most reasonable. It goes because the
listing has no advantage over `grep`. `grep -rn "\bSYMBOL\b"` answers the same question, faster, with
no vault, no analyze step and no staleness, and a reader already trusts it. A structural site list
would beat grep only where it is exact enough to act on unread — which is the capability this record
concludes conducks does not have. Keeping a surface that is strictly worse than a tool everyone
already has installed is how a project accumulates commands nobody runs.

**Rejected: fix the two binding forms and add post-write verification.** The verification half is
genuinely good — re-parse, prove zero old bindings survive, roll back atomically otherwise, which the
code already supports. But it converts a wrong answer into a refusal, not into a rename, so the
capability it defends is one that refuses on every form nobody has enumerated yet. And the
enumeration cannot be completed with tree-sitter: correct renaming needs types — overloads, aliases,
re-exports, structural typing, `this` binding. Matching `tsserver` means shipping a type checker per
language, at which point conducks is a thin LSP wrapper with no reason to exist. Three fixes in two
rounds is the measurement that this is a class, not a bug.

**Rejected: leave it and document the limitation.** A `--confirm` flag behind a warning is still a
green checkmark over a broken build for anyone who passes it.

**Not affected:** `drift`'s renamed/moved detection (`drift-engine.ts`, ADR 0020's `Renamed/Moved`
line) is a different capability — it OBSERVES that a symbol moved between two pulses and writes
nothing. It stays.

## Consequences

- Conducks no longer edits code anybody else wrote. It still WRITES files — `.conducksignore`, git
  hooks, the MCP config, a coverage render, the docs scaffold — because a user asked for each of
  them. The first draft of this record claimed "writes to nothing outside `.conducks/`", and the
  invariant test written to enforce it failed against 26 legitimate call sites. The narrower promise
  is the true one, and it is what the test pins.
- ADR 0107 is amended, not superseded: its decision stands, but it was proved through `rename` and
  now reads the `IMPORTS` edge directly out of `impact --json`. Asserting on IMPORTS specifically is
  what keeps that test able to fail — the defect 0107 fixed left the CALLS edge present.
- ADR 0106 is superseded. Its `- Enforced by:` named `rename-safety.test.ts`, which goes with the
  command; the removal is pinned in `tests/unit/adr-invariants.test.ts` instead, following the shape
  ADR 0028 and ADR 0151 already use.
- The four rename test files are deleted, not skipped. ADR 0151's precedent: a removed capability is
  proven gone by the absence of its code, not by a disabled suite.
- Anyone who wants the old behaviour has a better one: their editor's rename, which is `tsserver` or
  the language's own LSP, and which is exact because it type-checks.
- **The generalisation is Said's and is broader than this record: a capability `grep` already
  provides is not worth shipping.** It is promoted to `conventions.md` on close of the todo that
  carries this work. Applying it to the rest of the surface is a separate pass — `query`'s fuzzy name
  search is the obvious next candidate, and `supply-chain` was already rated below `npm audit` on
  2026-08-18.

Open: the same 2026-08-18 session rated `supply-chain` low value on the grounds that `npm audit` and
`pip-audit` do it better and are trusted. Round 5 measured two defects in it — a first-party package
reported as a third-party dependency, and a monorepo's per-workspace versions collapsed to one with a
security advisory attached to the wrong side. Whether that command is fixed or removed under the same
rule is not decided here, and no todo carries it yet.
