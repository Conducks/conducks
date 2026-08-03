# 0123 — an absence is not a clean verdict

Status: Accepted
- Date: 2026-08-03
- Builds: 0111, 0115, 0122
- Enforced by: tests/integration/features/fallback-command.test.ts (fallback tells "never measured" from "none suspicious"; audit --fallback does not crash) — run against the unfixed build first, all 3 failed

## Context

The last unscored command in Phase 2. `conducks fallback` printed:

```
✅ No suspicious fallback patterns found with current filters.
```

on every project, for every filter — including `--min-confidence 0 --min-tenure 0`, the most
permissive input the command accepts. ADR 0111's rule is that a command which can return empty needs
an input that must NOT, and this one had none.

The cause is that the `suspicious_fallbacks` template filters on
`json_extract(n.dna, '$.fallbackAnalysis.isFallback') = true`, and **nothing writes that field**.
Measured on conducks:

```
nodes 5472 | with dna 5472 | with fallbackAnalysis 0 | isFallback=true 0
```

`analyze` does not run the fallback detector. The detector exists and is invoked on demand by
`audit --fallback` — which **crashed**, on a documented flag, with *"The structural graph is not
materialised"*: the ADR 0038 guard doing its job on a path that never called
`ensureGraphLoaded()`. So the only command that could produce the analysis had never run, and the
command that consumed it reported clean.

## Decision

**The two cases are told apart by asking whether the field exists**, not by inferring it from an
empty result. When no node carries a fallback analysis, `fallback` says so, names the reason, points
at `audit --fallback`, and exits non-zero. When nodes DO carry one and none matched, it says how many
were analysed. Same rule ADR 0115 applied to `entropy` and `cohesion`.

**`audit --fallback` materialises the graph before walking it.**

**A green tick carries its denominator.** `"No suspicious fallback patterns found"` reads identically
whether a thousand functions were examined or none were. It now reads
`"No suspicious fallback patterns among 1089 function(s) examined"`, and says plainly when the
examined set is empty.

## Consequences

- This is the fourth time this project has been caught by a tick over an empty set — ADR 0044, ADR
  0073, the sentinel rule matching 0 nodes, and now this. The pattern is worth a standing check:
  **every "none found" message states what it looked at.**
- `fallback` now exits non-zero on a project where the analysis was never produced, which is every
  project today. That is correct and deliberate: the command cannot answer, and saying so is its job.
- **Not fixed, recorded:** `analyze` could persist `dna.fallbackAnalysis` so the query works without a
  separate scan. That is a feature decision about pulse cost, not a defect, and it belongs with
  whoever owns the analyze budget.
- No regression: **1,431 tests green**.
