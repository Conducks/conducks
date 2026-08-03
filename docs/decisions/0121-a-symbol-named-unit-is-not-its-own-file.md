# 0121 — a symbol named `unit` is not its own file

Status: Accepted
- Date: 2026-08-03
- Builds: 0048, 0120
- Enforced by: tests/integration/features/unit-id-collision.test.ts (a file containing `const unit` stays a UNIT) and tests/unit/domain/governance/layer-contract.test.ts (a GOVERNS doc edge is not a rank inversion) — all three run against the unfixed build first, all three failed

## Context

ADR 0120 closed one half of a pattern: `layer_boundaries` walked every edge type while its own comment
said imports. The obvious next question was whether the sentinel's other rules had the same defect.
`has_cycles` did not — it already passes `IMPORT_CYCLE_IGNORED_EDGE_TYPES`. `rank_violation` did.

`conducks guard` reported `rank_violations=9` (then 21) as *"pre-existing, tracked"*. Split by the
edge type that produced them:

| edge type | count | verdict |
|---|---|---|
| `GOVERNS` | 12 | a `MODULE.md` documenting the directory it sits in |
| `IMPORTS` | 9 | a test file **classified as `ATOM`** importing the modules it tests |

Both were false, and the second was a symptom of something worse.

**A file node's id is `<path>::unit`. A symbol node's id is `<path>::<name>`.** So a variable
literally named `unit` produces the id of the file that contains it, and `INSERT OR REPLACE` hands
the file's row to the variable:

```
canonicalKind   UNIT -> ATOM
semantic_kind   file -> variable
canonicalRank   5    -> 9
```

Measured: **4 of 666 file nodes destroyed**, and every one of the four files declares `const unit`.
The row is overwritten but every EDGE survives — so the graph claimed a *variable* contained twenty
functions and was imported by four modules. `explain` on those files reported a variable's risk.

It had been visible for months, as nine findings in a counter labelled acceptable.

## Decision

**A symbol that would take the file's id is renamed, not dropped.** `ingestSpectrum` appends
`::symbol` when a non-UNIT node's computed id equals the file's unit id. The symbol is real code and
deleting it would trade a wrong node for a missing one; the FILE keeps the id every edge in the vault
already points at.

**A rank inversion is a dependency**, so `rank_violation` reads `IMPORTS`, `EXTENDS`, `IMPLEMENTS`
and `DEPENDS_ON` — the same set ADR 0120 gave `layer_boundaries`. The canonical ranks are a
CONTAINMENT ladder and this rule reads them as a DEPENDENCY ladder; the ECOSYSTEM carve-out already
above it had removed 458 findings of exactly that shape.

## Consequences

- `guard` now prints no "other structural findings" line at all: **21 → 0**, with the layer contract
  clean and exit 0.
- **The first fixture did not reproduce it.** `const unit` inside a named function gets a scoped id
  and is harmless; the collision needs an arrow callback passed to a call, which is what all four
  affected files (jest tests) look like. The test passed against the unfixed build until the fixture
  matched the real shape — a reproduction that does not reproduce is worth nothing (ADR 0112).
- **The fix looked like it had failed.** After rebuilding, the four bad rows were still in the vault:
  an INCREMENTAL pulse does not re-parse unchanged files, so the rows survived until
  `analyze --force`. Worth remembering when a parser fix appears to do nothing — it is the same
  trap as ADR 0108's workspace fix producing byte-identical numbers.
- **A counter carried as "pre-existing, tracked" is where defects go to be ignored.** 458 findings
  were triaged out of this rule once already; the remaining 21 were never re-examined until a
  different investigation walked past them.
- No regression: **1,418 tests green**, edge precision **99.98%**.
