# 0186 — a tsconfig is not an inventory of the source
Status: Accepted
- Date: 2026-08-27
- Builds: 0185
- Enforced by: tools/benchmark/ts-program.mjs

## Context

ADR 0185 built the TypeScript twins and reported `analyze` complete for both benchmarked languages.
JavaScript was riding on that claim without having its own, and the three subjects each left it out a
different way:

| subject | js / mjs / cjs | why the oracles could not see them |
|---|---|---|
| scraper | **33** | no tsconfig at all — every TS oracle refused to run |
| orchestrator | 45 | no ROOT tsconfig; the workspaces have their own, nothing covers the rest |
| sofie | 17 | `include: ["src/**/*"]`, so anything outside `src/` is outside the program |

A tsconfig is the project's **build story**, not an inventory of its source. Driving an oracle off it
means the oracle sees what the project chooses to compile, which is not the same as what conducks
chooses to analyze — and the difference was ~95 files across three subjects.

## Decision

**`ts-program.mjs` unions the tsconfig file set with a walk for JS-family files, and builds with
`allowJs`.** Shared by all three TypeScript oracles rather than copied into each: the same question
asked three ways drifts, and this one already had three different wrong answers.

A project with neither a tsconfig nor any JavaScript returns `null` and the oracle says so, rather
than scoring an empty program as a pass.

## Consequences

- **scraper is now covered by all three**, where it had none: 14 declarations, 0 missing, 100% line
  accuracy, 98.06% edge recall over 977 calls.
- Proved by catching a real gap: removing the JavaScript `function_declaration` capture takes scraper
  from 0 to **11** missing declarations. Before this, that defect was invisible on that subject —
  which is the same shape as ADR 0178, where filling the JS matrix cell immediately found one.
- The other targets grew: sofie 1,452 → 1,493 declarations, orchestrator 569 → 633, conducks 471 →
  565. conducks' recall reads **94.75%** rather than 96.21%, because 91 JavaScript files now count.
  That is a wider measurement, not a regression — the number went down because the thing being
  measured got bigger.
- A stale graph briefly read as 5 missing declarations on conducks. They were in
  `tools/benchmark/ts-program.mjs` and `oracle-incremental.mjs` — **files written minutes earlier**,
  before conducks had re-analyzed itself. Worth recording because the failure looks identical to a
  real completeness defect, and the fix is `analyze --force`, not a code change.

**Coverage now, per language, for `analyze`:** Python and TypeScript on every claim, and JavaScript on
every claim wherever a JS-family file exists in the subject.
