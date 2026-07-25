# domain/governance — judgement

**Layer:** domain. Imports core + contracts.

**Responsibility:** turning structural facts into findings — ARCH-1 hub overload, ARCH-3 circular
dependency, ARCH-4 self-import, layer-boundary violations — and owning the thresholds that define
them.

**Boundaries:** it computes nothing about the code itself. Every input comes from the graph, so a
wrong finding is fixed either by the filter here or the data in core — never by a special case in the
reporting path.

**Deferred / not built:** symbol-level mutual-call tangles. ADR 0017 removed them from ARCH-3
deliberately — they are real properties of the code but not circular *dependencies* — and the separate
"call cycle" finding that should carry them is not built. They are reported nowhere today. Deferred,
not dropped.

## Parts

- **[sentinel/](sentinel/MODULE.md)** — the declarative rule engine, the layer contract (encoded but
  **not currently loaded at runtime** — read this before trusting a green `guard`), `conducks guard`.

`advisor` produces prioritized recommendations; `index` hosts the audit that assembles findings for
`conducks audit`.

## The one lesson this module keeps relearning

Every false-positive hunt here had the same root cause: **the finding counted a relationship that is
not the relationship it claims to measure.**

- ADR 0010 — containment edges (a class owning its methods) counted as dependency. 49 cycles → 3.
- ADR 0016 — type-only imports counted as runtime coupling. The compiler erases them.
- ADR 0017 — a `CALLS` edge onto a *parameter's* method, resolved onto the owning class only because
  the parameter is type-annotated, counted as a module dependency.

Worse, consumers disagreed with each other: `advisor` had always restricted cycles to import-level,
`governance/index` filtered containment only, and `conducks-core.audit` had no filter at all — three
definitions of "cycle", which is why the same false positive kept reappearing under a different
command. They now share `IMPORT_CYCLE_IGNORED_EDGE_TYPES`. Keep them aligned.

**Before adding a rule, write down which edge types it traverses and whether each survives
compilation, in the ADR.** That single step would have prevented all three.

## What a clean audit means

**"Orphan" means two different things and they are both right.** Here, an orphan is a *dangling edge*
— an edge whose target node was never induced (`governance/index.ts:106-158`, reported as ECOSYSTEM-1
or DISCOVERY-1). In [evolution](../evolution/MODULE.md), an ORPHAN is a *node with no incoming edge*.
So `conducks audit` reporting zero orphans while `conducks prune` lists 25 is not a contradiction and
neither number is stale. Never quote one as the other.

`conducks audit` on conducks reports zero findings, and that is validated rather than assumed: on
compiled JS, conducks and `madge` both report zero cycles. `madge` on TS *source* still reports three
— its type-erasure blind spot. Conducks being the more accurate of the two on the same repo is the
claim this module exists to defend, so any change that loosens a filter needs the same cross-check.
