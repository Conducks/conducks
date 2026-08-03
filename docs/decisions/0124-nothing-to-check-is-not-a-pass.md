# 0124 — nothing to check is not a pass

Status: Accepted
- Date: 2026-08-03
- Builds: 0044, 0073, 0123
- Enforced by: tests/integration/features/docs-commands.test.ts (docs-lint and docs-status refuse to call an empty tree clean; a bootstrapped tree still passes; every governed file bootstrap creates is counted) — run against the unfixed build first, 3 of 4 failed and the control passed

## Context

Phase 3 of the sweep: `docs-lint`, `docs-status`, `bootstrap-docs`. Measured on a repository with no
`docs/` directory at all:

```
conducks docs-lint     ✓ docs-lint clean — 0 governed docs conform to the grammar.   exit 0
conducks docs-status   grammar: clean ✓                                              exit 0
```

A project that has never written a line of documentation reported the same health as one whose docs
are complete and correct. This is the fifth occurrence of a shape this repository has already named
three times — ADR 0044, ADR 0073, the sentinel rule matching zero nodes, ADR 0123 — and it matters
most here, because **these two commands ARE the enforcement**. A gate that passes when it has nothing
to check is not a gate.

Separately, the count itself was wrong. `governed` was computed as
`todos + decisions + other.filter(o => o.entries)`, so a governed doc **with no entries yet** was not
counted. A freshly bootstrapped tree of three governed files reported two, and **on conducks the
number was 142 where it should have been 170** — 28 governed docs missing from the figure a reader
uses to judge how much was checked.

## Decision

**An empty tree is reported as empty, and exits non-zero.** `docs-lint` says no governed docs were
found, names the directory it looked in, and points at `bootstrap-docs`. `docs-status` says
`"grammar: nothing to check — this tree holds no governed docs"`.

**A clean result carries its denominator.** `docs-status` now prints `grammar: clean ✓ (170 governed
docs)` rather than a bare tick.

**Every governed doc counts, entries or not.** Having no content yet is a fact about the doc, not a
reason to leave it out of the total.

## Consequences

- `bootstrap-docs` was measured and found **correct**: it is idempotent, it writes a tree that passes
  its own linter, and re-running it reports "already up to standard". It is the first command in this
  entire sweep with no defect — worth recording precisely because the sweep's running score had made
  a clean result feel unlikely.
- The reported coverage on conducks moved **142 → 170**. Those 28 docs were being linted all along;
  only the number understated what had been checked. A count that is lower than reality is the safer
  direction to be wrong in, and still wrong.
- **Five occurrences is a pattern, not a coincidence.** Every "clean", "none found" or "no violations"
  message in this codebase should state what it examined. The ones fixed so far are `audit`'s
  sentinel line, `fallback`, `docs-lint` and `docs-status`.
- No regression: **1,435 tests green**.
