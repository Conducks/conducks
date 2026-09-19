# domain/governance/sentinel — the rule engine

**Layer:** domain (part of `domain/governance`).

**Part of:** [domain/governance](../governance.md). `sentinel.ts` (the static policy evaluator),
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
"call cycle" finding has nowhere to live yet (it is now reported separately as ARCH-6, a DISCOVERY,
not folded into this engine — see [governance](../governance.md)). Per-project layer config WAS
this list's other entry and is built (ADR 0197): `LAYER_FRAGMENTS` / `ALLOWED_DEPENDENCIES` are now
the fallback, used when a project declares no `layers:` of its own.

**Uses:** [core/graph](../../core/graph.md) for every edge `layer_boundaries` and the other graph rules
walk. Loaded by `conducks guard` (CI-facing) and `conducks audit`; the parent [governance](../governance.md)
note carries the contract's prose, this note carries how it is evaluated and where it broke.

## Features

- **Layer contract** (`layer_boundaries` sentinel rule, `conducks guard`) — hard-blocks any upward
  cross-layer edge. Import-shaped edges only (`IMPORTS`, `EXTENDS`, `IMPLEMENTS`, `DEPENDS_ON`),
  type-only included. See below for what is actually encoded versus what ADR 0005's prose said.
- **Per-project layers** (`layers:` in `.conducks/sentinel.yml`, `loadLayerContract`) — any project
  declares its own layer names, path fragments and allowed dependencies, so the gate judges its
  code rather than reporting that nothing matched. See the declaration shape below.
- **Graph rules** (`has_cycles`, `rank_violation`, `dead_code`, `high_churn`, `deep_nesting`) — the
  other declarative conditions `conducks guard` evaluates alongside the layer rule.
- **Static policy rules** (`sentinel.ts`, `config/sentinel.json`) — `require_heritage`,
  `require_export`, `max_fans`, `require_file`, loaded by `AuditCommand` for `conducks audit`.
- **Regression guard** (`guard.ts`) — the drift-threshold gate, a separate check sharing the same CI
  entry point as the two rule engines above.

## Glossary

- **Sentinel rule** (`sentinel-rules.ts`) — a graph-wide structural condition, YAML-loadable, keyed by
  `condition`. Unrelated to the next term despite the shared file-name root.
- **Policy rule** (`sentinel.ts`) — a per-node JSON rule keyed by `type`, evaluated separately by
  `conducks audit`.
- **Layer fragment** — a path substring (`LAYER_FRAGMENTS`) used to classify a file into one of the
  seven layers; order-sensitive, most specific first.

## The layer contract lives and is enforced here

`ALLOWED_DEPENDENCIES` (`sentinel-rules.ts`) encodes ADR 0005's downward-only stack, and the
`layer_boundaries` condition (`governance/index.ts:349`) reports one violation per illegal
layer-pair. Layers are matched by path fragment and **order matters** — `/lib/core` precedes
`/registry` so `lib/core/registry/` classifies as core, not composition.

**Enforced as a default since 2026-07-25.** For its first year the rule existed but never loaded:
`loadSentinelRules` read `.conducks/sentinel.yml` (absent), fell back to defaults that lacked
`layer_boundaries`, and `guard` filtered for a rule that never ran — printing "Layer contract clean"
vacuously while the repo carried 74 illegal cross-layer edges. Those edges were routed through
composition (registry facades; a lazy `import()` in `pulse-worker` for the core → domain edge, which
cannot be constructor-injected because the worker is a standalone process) and the rule was added to
`getDefaultRules()`. Non-vacuousness was proven both directions: a raw cross-layer edge dump returns
zero, and a deliberately re-injected `cli → core` import blocks the gate.

Traps that survive: the rule does **not** skip `isTypeOnly` — a type-only import is still a layer
violation here even though cycle detection ignores it (ADR 0016). It walks import-shaped edges only
(`DEPENDENCY_EDGES` in `governance/index.ts`): a `CALLS` edge from the CLI to a domain function is a
call routed through the registry, which is what composition exists to make legal (ADR 0120).

**Still load-bearing, and it proved so on 2026-08-09.** `boundaries.test.ts` blocked three separate
attempts in one session — `cli -> domain` twice and `mcp -> domain` once, each an attempt to reach a
newly-shared function directly — and then `composition -> mcp` when the fix over-corrected and put a
vault ref-count in the MCP layer. Every refusal was right, and each one named where the shared code
actually belonged: the registry. A gate that only ever passes teaches nothing; this one redirected the
design four times (todo52, todo53).

Three encoded edges are wider than ADR 0005's prose: `cli → web` (the `mirror` launcher),
`cli → mcp` (the `conducks mcp` launcher — added 2026-07-25, same shape), and `web → domain`/`core`.
The ADR says interfaces import composition; the table is what runs.

## A project declares its own layers

`.conducks/sentinel.yml` carries the contract for any project that is not this one (ADR 0197):

```yaml
layers:
  - name: contracts
    path: /src/contracts
  - name: domain
    path: /src/domain
    allow: core, contracts
```

`allow` is comma-separated because the minimal parser reads flat mappings, not nested lists. Order is
match order — the more specific fragment first, the same reason `/lib/core` precedes `/registry`
here. No `layers:` key leaves the builtin conducks contract in place, and a project that declares
nothing gets the `NOT CHECKED` warning naming this file as the fix.

**Measured on a real project, not only on fixtures.** Sofie declares eight layers (`kernel`,
`registry`, `engine`, `services`, `systems`, `orchestrator`, `plugins`, `cli`) and `guard` reported
nine illegal pairs with exit 1 — `engine → plugins/services/systems/orchestrator`,
`services → orchestrator/plugins/systems`, `systems → plugins/orchestrator` — each matching a count
taken independently by grepping its import statements. Widening every `allow` turned the same repo
clean at exit 0, and a one-letter typo in an `allow` produced the NOT CHECKED error instead. The
config was removed afterwards: a subject that blocks would turn the CLI smoke run red for a reason
that is not a defect.

**A declared contract that does not hold together checks nothing.** A duplicate name, a missing
`path`, or an `allow` naming an undeclared layer each report `NOT CHECKED` as an error rather than
falling back to conducks' own fragments — a verdict computed from another repository's directory
names is worse than no verdict.

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
(ADR 0016) — or it measures the wrong thing. It did, for a long time: `src/registry/index.ts` reported
74 and 77 upstream connections against a limit of 50, and the honest numbers were **14 and 37** when
that was measured. The filter is still in place (`sentinel.ts:216` drops `NON_RUNTIME_EDGE_TYPES` and
`isTypeOnly`), and the same node measured **73** on 2026-09-19 — a real runtime fan-in that grew, not
the old measurement bug returning. Re-measure before quoting any of these three numbers. The
recommendation that followed from the bad numbers ("split the composition root by domain") was
wrong and has been withdrawn.

**Before raising a limit to silence a rule, check the rule is counting the right edges.** Raising the
threshold there would have hidden a measurement bug behind a config change.

## Adding a rule

Traverse edges through the shared constants — `STRUCTURAL_EDGE_TYPES`, `NON_RUNTIME_EDGE_TYPES`,
`IMPORT_CYCLE_IGNORED_EDGE_TYPES` — never a hand-rolled filter; the reason is the parent's
[one lesson](../governance.md). Prefer a rule that under-reports: a governance tool that cries wolf gets
muted, and then it protects nothing. And a new rule needs a home in the loaded rule set, not just a
`condition` case — see above.
