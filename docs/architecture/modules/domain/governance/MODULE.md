# domain/governance — sentinel rules, the audit, and the advisor

**Layer:** domain. Imports core + contracts.

**Responsibility:** judgement. It turns structural facts into findings — ARCH-1 hub overload, ARCH-3
circular dependency, ARCH-4 self-import, layer-boundary violations — and owns the thresholds and the
rule file that define them.

**Boundaries:** it computes nothing about the code itself. Every input comes from the graph; if a
finding is wrong, the fix is either the filter here or the data in core, never a special case in the
reporting path.

**Deferred / not built:** symbol-level mutual-call tangles. ADR 0017 removed them from ARCH-3
deliberately — they are real properties of the code but not circular *dependencies* — and the
separate "call cycle" finding that should carry them is not built. They are currently reported
nowhere. Deferred, not dropped.

## The one lesson this module keeps relearning

Every false-positive hunt here had the same root cause: **the finding counted a relationship that is
not the relationship it claims to measure.**

- ADR 0010 — containment edges (a class owning its methods) counted as dependency. 49 cycles → 3.
- ADR 0016 — type-only imports counted as runtime coupling. The compiler erases them.
- ADR 0017 — a `CALLS` edge onto a *parameter's* method, resolved onto the owning class only because
  the parameter is type-annotated, counted as a module dependency.

Worse, the consumers disagreed with each other: `advisor` had always restricted cycles to
import-level, `governance/index` filtered containment only, and `conducks-core.audit` had no filter
at all — three definitions of "cycle", which is why the same false positive kept reappearing under a
different command. They now share `IMPORT_CYCLE_IGNORED_EDGE_TYPES`. Keep them aligned.

**Before adding a rule, write down which edge types it traverses and whether each survives
compilation.** Put it in the ADR. That single step would have prevented all three.

## What a clean audit means now

`conducks audit` on conducks reports zero findings, and that is validated rather than assumed: on
compiled JS, conducks and `madge` both report zero cycles. `madge` on TS *source* still reports
three — its type-erasure blind spot. Conducks being the more accurate of the two on the same repo is
the claim this module exists to defend, so any change that loosens a filter needs the same
cross-check.

## Thresholds are data

Rules live in `sentinel-rules.ts` with `ALLOWED_DEPENDENCIES` encoding the layer contract (ADR 0005).
Raising a limit to silence a finding is allowed only with a recorded reason — the registry's apparent
hub overload turned out to be 74 raw fan-in but 14 runtime, and the right fix was counting correctly,
not raising the limit.
