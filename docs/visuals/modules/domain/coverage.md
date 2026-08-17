# domain/analysis/coverage — test coverage as a graph overlay

**Part of:** [domain/coverage](coverage.md). `coverage-bind` and `coverage-baseline`.

**Responsibility:** binding an external coverage report (`coverage-final.json`) onto graph nodes, and
comparing a run against a saved baseline to detect drift.

**Boundaries:** conducks does not measure coverage — it consumes someone else's report. No test
runner is invoked and none is assumed beyond the report format.

**Deferred / not built:** no default report discovery. `conducks coverage` requires an explicit path
rather than guessing at a `coverage-final.json` location.

## Coverage is a range-join, not a lookup (ADR 0004)

A coverage report speaks in line ranges; the graph speaks in symbols with line spans. Binding is a
range-join of report ranges onto node spans, surfaced as a **fill percentage** per symbol rather than
a covered/uncovered flag. That is what makes "which functions are under-tested, ranked by blast
radius" answerable — the question coverage tools cannot answer on their own, because they have no
dependency graph.

The join lands on **BEHAVIOR** nodes — functions and methods — because a span is what makes a fill
percentage meaningful (`coverage-bind.ts:50`, `cli/commands/coverage.ts:11`). Any node emitted without
a real `[lineStart, lineEnd]` scores 0% and looks dark whether it is tested or not; UNIT nodes were
given a line-1-to-EOF range for exactly this reason. A new kind that wants coverage needs a span
first.

## The matcher used to over-match on basename — fixed, keep it fixed

`matchFile` once fell back to a bare-basename `endsWith`, so one covered `index.ts` bound its lines to
**every** `index.ts` in the graph: 64 rows all reported FULL from a single covered file. That is
repaired (todo08 done). `suffixMatch` now requires the suffix to land on a path-segment boundary
**and** to span at least `dir/basename` (`coverage-bind.ts:56-58`), which took 64 phantom rows to 2
real ones with honest, differing fill.

This is a matching problem, not a vault problem: the earlier read of it as "incremental analyze
duplicates nodes" was verified false and retracted. If a coverage row ever looks suspiciously round
again, suspect this matcher and loosening in it — never node duplication.

## Baselines are for drift, not for gating

`--save-baseline` / `--vs-baseline` exist to answer "did this change make something worse" — verified
to fire on a real regression (`addNode: was 86% → now 0% (BROKE)`) with no false positives on
identical input. There is deliberately no threshold-gate mode; that belongs in CI config, not here.
