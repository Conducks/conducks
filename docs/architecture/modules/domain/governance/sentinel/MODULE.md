# domain/governance/sentinel — the rule engine

**Part of:** [domain/governance](../MODULE.md). `sentinel.ts` (evaluator), `sentinel-rules.ts`
(rules + the layer contract), `config-detector.ts`, `guard.ts`.

**Responsibility:** evaluating declarative rules against the graph. Each rule is data — a condition
kind, a target, a limit — so adding a constraint is editing a rule file, not writing an analyzer.
`guard` is the CI-facing entry point.

**Boundaries:** it evaluates; it does not compute structure. Every input is already in the graph.

**Deferred / not built:** no per-rule severity. Everything a rule reports is a violation, which is
why a finding that cannot be trusted must be removed rather than downgraded — and why ADR 0017's
"call cycle" finding has nowhere to live yet.

## The layer contract is enforced here

`ALLOWED_DEPENDENCIES` encodes ADR 0005's downward-only stack —
`contracts ← core ← domain ← composition ← interfaces` — and the `layer_boundaries` rule fails
`conducks guard` on any upward import. This is the one rule that has caught real architectural drift
repeatedly (domain → registry service-locator leaks, 82 → 0).

The one sanctioned exception is the `mirror` CLI command launching the web server: a launcher edge,
not logic coupling.

## `max_fans` counts runtime fan-in only

ARCH-1 hub overload must exclude edges the compiler erases — type references and type-only imports
(ADR 0016) — or it measures the wrong thing. It did, for a long time: `registry/index.ts` reported
74 and 77 upstream connections against a limit of 50, and the honest numbers are **14 and 37**. The
recommendation that followed from the bad numbers ("split the composition root by domain") was
wrong and has been withdrawn.

**Before raising a limit to silence a rule, check the rule is counting the right edges.** Raising the
threshold there would have hidden a measurement bug behind a config change.

## Adding a rule

State in the ADR which edge types the rule traverses and whether each survives compilation, then use
the shared constants — `STRUCTURAL_EDGE_TYPES`, `NON_RUNTIME_EDGE_TYPES`,
`IMPORT_CYCLE_IGNORED_EDGE_TYPES`. Three separate false-positive investigations trace to a rule that
walked whatever edges happened to exist. Prefer a rule that under-reports: a governance tool that
cries wolf gets muted, and then it protects nothing.
