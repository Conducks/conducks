# 0016 — Type-only imports are not runtime dependencies (amends 0010)
Status: Accepted
- Date: 2026-07-20
- Amended by: 0017
- Promoted: docs/architecture/modules/core/graph/algorithms/MODULE.md ("They look like a circular dependency and are not"); docs/architecture/modules/domain/governance/sentinel/MODULE.md ("`max_fans` counts runtime fan-in only")

## Context
`conducks audit` on conducks itself reports two violations, both reproducible on a clean vault
(5244 nodes / 11531 edges): one ARCH-3 circular dependency
(`traversal → ranker → cycle-detector → adjacency-list`) and two ARCH-1 hub overloads on
`registry/index.ts` (74 and 77 upstream connections against a limit of 50). Both are false.

Ground truth is the compiled output — TypeScript erases an import whose bindings are only ever used
in type position, even when written as a plain `import { X } from`, with no `import type` syntax.
Measured against `build/`:
- All three cycle members import `ConducksAdjacencyList` solely as a static-method parameter
  annotation (`traversal.ts:12,36`, `ranker.ts:12,73`, `cycle-detector.ts:10`) — no `new`, no
  `instanceof`, no static access. None of the three compiled files imports `adjacency-list.js` at
  all. **The cycle does not exist at runtime.**
- Of 50 source files importing `registry/index.ts`, **41 (82%) are erased by TypeScript** — every
  CLI command imports the registry only to type its handler. Real runtime fan-in is ~9, far under
  the limit of 50. **The hub is not overloaded at runtime.**

This is the same class of defect ADR 0010 fixed for containment edges, one level up: the graph was
counting a relationship that is not a dependency. It also exposes an unsettled question — three
consumers already disagree about whether a type edge is coupling. `advisor.ts:24` ignores
`TYPE_REFERENCE`, `sentinel.ts:103` special-cases it, `dead-code.ts:30` counts it as usage, while
ADR 0010 lists it among the edges that are "genuine coupling."

## Decision
A dependency is what survives compilation. An import whose bindings are used only in type position
is a **type-only** import: it is recorded, tagged, and excluded from runtime-coupling findings.

1. Detect type-only imports two ways. Syntactic fast path for the unambiguous cases (`import type`,
   `import { type X }`). Semantic path for the rest: the reflector already emits per-binding IMPORTS
   relationships, so a binding with no value-position reference in the file (no CALLS, CONSTRUCTS,
   ACCESSES, no bare identifier use) is type-only, and a file-level import edge is type-only only if
   **all** its bindings are. On any uncertainty — an unparsed file, an unresolved binding — classify
   as a value import. Over-reporting coupling is recoverable; hiding a real cycle is not.
2. Record it as `properties.isTypeOnly` on the existing `IMPORTS` edge — **not** as a new edge type.
   `IMPORTS` is special-cased across the pipeline (`graph-engine.ts:238` skips it in Pass 2, the
   orchestrator resolves it in Pass 3, `reflector.ts:603` filters on it); a new type means every one
   of those sites must learn about it, and a missed site silently deletes the edge. A missed
   consumer of a property just leaves today's over-counting, which is visible.
3. Exclude type-only edges from `detectCycles` and from the sentinel's ARCH-1 fan-in count. Keep
   them in the graph and in `impact`/`trace`, where a type dependency is a real answer.
4. This amends ADR 0010: `TYPE_REFERENCE` and type-only `IMPORTS` are no longer counted as
   runtime coupling for cycle and hub findings. The three inconsistent consumers align on this rule.

## Consequences
`conducks audit` on conducks reports 0 circular dependencies and 0 hub overloads — both current
findings are false positives that this removes. Following ADR 0010's bar, the change lands with
regression tests (a type-only cycle → 0; a genuine value-import cycle → still 1) and is
cross-validated against `madge`, which resolves real module dependencies and should agree.

The cost is that the reflector, the largest and most cast-heavy file in the codebase, gains the
per-binding value-position check. The relationship-emission path it touches is typed as part of the
change to keep the seam honest. A residual risk remains: the semantic check is a heuristic, not a
type checker, so an exotic value use read as type-only would hide a real cycle — the
uncertainty-defaults-to-value rule exists to keep that failure direction rare.
