# domain/governance/sentinel — the rule engine

**Part of:** [domain/governance](../MODULE.md). `sentinel.ts` (the static policy evaluator),
`sentinel-rules.ts` (graph rules + the layer contract), `guard.ts` (`RegressionGuard` — the drift
threshold, a separate gate that shares the CI entry point), `config-detector.ts` (project anchors and
entry points).

**Responsibility:** evaluating declarative rules against the graph. Each rule is data — a condition
kind, a target, a limit — so adding a constraint is editing a rule file, not writing an analyzer. The
`conducks guard` CLI command is the CI-facing entry point and runs three independent checks: the layer
rule, the other loaded graph rules, and the regression threshold.

**Boundaries:** it evaluates; it does not compute structure. Every input is already in the graph.
Two rule *sources* meet here and are easy to confuse: graph rules (`sentinel-rules.ts`, YAML, keyed
by `condition`) and static policy rules (`sentinel.ts`, JSON, keyed by `type` — `require_heritage`,
`require_export`, `max_fans`, `require_file`). They share a name and nothing else.

**Deferred / not built:** no per-rule severity. Everything a rule reports is a violation, which is
why a finding that cannot be trusted must be removed rather than downgraded — and why ADR 0017's
"call cycle" finding has nowhere to live yet. Also no per-project layer config: `LAYER_FRAGMENTS` and
`ALLOWED_DEPENDENCIES` are hardcoded because the minimal YAML parser has no nested maps, so the
contract guards conducks itself and nobody else.

## The layer contract lives here — and today nothing evaluates it

`ALLOWED_DEPENDENCIES` (`sentinel-rules.ts:52`) encodes ADR 0005's downward-only stack, and the
`layer_boundaries` condition (`governance/index.ts:266`) reports one violation per illegal
layer-pair. Layers are matched by path fragment and **order matters** — `/lib/core` precedes
`/registry` so `lib/core/registry/` classifies as core, not composition.

**But the rule is not loaded.** `loadSentinelRules` reads `.conducks/sentinel.yml`
(`sentinel-rules.ts:144`); this repo has no such file, so it falls back to `getDefaultRules()`, which
returns exactly two rules — `no_cycles` and `rank_violations`. `layer_boundaries` is absent.
`conducks guard` then filters `violations` for `ruleId === 'layer_boundaries'`
(`cli/commands/guard.ts:32`), finds an empty list, and prints **"✅ Layer contract clean."** That
line is currently vacuous: it means the rule never ran, not that the code is clean. Historic evidence
that it works when enabled (domain → registry service-locator leaks, 82 → 0) predates this gap.

This is not hypothetical. Against the table as written, the repo currently carries: one **core →
domain** edge (`core/parsing/pulse-worker.ts` imports, constructs and calls
`domain/analysis/reflector.ts`), 19 **cli → domain/core** imports across 14 command files, and 2
**mcp → domain/core** imports. `guard` reports the contract clean anyway. Whoever turns the rule on
should expect a non-empty first run and decide, per pair, whether to fix the import or widen the table
deliberately — a green light today proves nothing either way.

`src/resources/sentinel.default.yml` already declares `layer_boundaries` with `enabled: true`, but
nothing copies it into `.conducks/`. Fixing this is either shipping that file at setup or adding the
rule to `getDefaultRules()`. Until one happens, treat the layer contract as **documented intent, not
a gate** — and do not read a green `guard` as proof of layering.

Two encoded edges are wider than ADR 0005's prose: `cli → web` (the sanctioned `mirror` launcher)
and `web → domain`/`core` directly. The ADR says interfaces import composition; the table permits
more. The table is what would run.

## The policy rules are loaded by the CLI, and that seam failed silently once

The four static rules in `config/sentinel.json` are read by `AuditCommand`, not by this module. Until
recently it computed an absolute `rulesPath` and then read a **cwd-relative** `"config/sentinel.json"`,
swallowing ENOENT into `[]` — so `conducks audit` printed "Governance confirmed" while evaluating no
rules at all whenever it ran from outside the project root. It now reads via `rulesPath` and warns
when the file is missing (`cli/commands/audit.ts:82-88`).

Two things to keep: an empty rule set must **say so**, never pass quietly; and the reason this could
break at all is that a CLI command loads policy itself instead of asking a service. If this seam is
ever reworked, move the load behind the registry.

## `max_fans` counts runtime fan-in only

ARCH-1 hub overload must exclude edges the compiler erases — type references and type-only imports
(ADR 0016) — or it measures the wrong thing. It did, for a long time: `registry/index.ts` reported
74 and 77 upstream connections against a limit of 50, and the honest numbers are **14 and 37**. The
recommendation that followed from the bad numbers ("split the composition root by domain") was
wrong and has been withdrawn.

**Before raising a limit to silence a rule, check the rule is counting the right edges.** Raising the
threshold there would have hidden a measurement bug behind a config change.

## Adding a rule

Traverse edges through the shared constants — `STRUCTURAL_EDGE_TYPES`, `NON_RUNTIME_EDGE_TYPES`,
`IMPORT_CYCLE_IGNORED_EDGE_TYPES` — never a hand-rolled filter; the reason is the parent's
[one lesson](../MODULE.md). Prefer a rule that under-reports: a governance tool that cries wolf gets
muted, and then it protects nothing. And a new rule needs a home in the loaded rule set, not just a
`condition` case — see above.
