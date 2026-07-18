# 0010 — cycle detection ignores structural edges (Node/TS false-positive fix)
Status: Accepted
- Date: 2026-07-18

## Context
Running `conducks audit` on a real Next.js/TS monorepo (mycvpath/TargetedCV, 22k nodes) reported
49 circular dependencies — but ~46 were false. Two defects:
1. The graph models a TS interface owning its fields (`HAS_PROPERTY`), a class owning its methods
   (`HAS_METHOD`), a member belonging to its file (`MEMBER_OF`), and a file containing a symbol
   (`CONTAINS`). These form trivial structural loops (interface → property → file → interface) that
   are containment, NOT dependency — yet cycle detection traversed them, so every interface and
   singleton read as a cycle.
2. The audit's post-filter walked the SCC array as if it were an ordered cycle path
   (`c[i] -> c[i+1]`), but a Tarjan SCC is an unordered node set — so its `MEMBER_OF` check
   inspected non-edges and missed the noise it was meant to drop.

## Decision
Cycle detection for architectural auditing traverses only real dependency edges. Added
`STRUCTURAL_EDGE_TYPES = [MEMBER_OF, CONTAINS, HAS_METHOD, HAS_PROPERTY]` and pass it as
`ignoreTypes` to every `detectCycles` call used for reporting (audit, guard, advisor). What remains
— IMPORTS/CALLS/EXTENDS/IMPLEMENTS/CONSTRUCTS/TYPE_REFERENCE/ACCESSES/DEPENDS_ON — is genuine
coupling. Also require a cycle to span ≥2 files (`filePaths.size > 1`): a single-file loop
(recursion, a singleton's class→getInstance→file) is an implementation detail, not a module smell.
Deleted the broken SCC-as-ordered-path post-filter — with structural edges gone, every SCC found is
already a real dependency cycle. The advisor keeps its IMPORTS-focus by also ignoring runtime edges.

## Consequences
On TargetedCV: audit 49 → 3 circular dependencies, and all 3 are genuine cross-file import cycles
(16-file auth cluster, 63-file dashboard cluster, 5-file product barrel) — false-flag rate ~94% → 0%,
under the <1% target. Locked with two regression tests (interface-member structural loop → 0;
single-file CALLS loop → 0; genuine cross-file cycle → 1 still fires). Any consumer of `detectCycles`
that wants dependency-only cycles should pass `ignoreTypes: STRUCTURAL_EDGE_TYPES`.

## Addendum — ARCH-4 self-import + a validated coverage gap
Cross-checked the 3 against `madge` (independent JS/TS detector): 60/66 of madge's cycle-files sit
inside conducks' 3 SCC clusters — same tangles, conducks just groups them. The 6 madge flagged that
conducks didn't were `export * from './self'` self-re-export stubs, a *different* class. Added an
**ARCH-4 self-import** violation: a self-referential import surfaces as a same-file IMPORTS edge; the
orchestrator emits a durable `unit → unit` self-edge when a specifier resolves back to its own file.
Two regression tests cover it. KNOWN GAP: those 6 specific files are 1-line, declaration-less
re-export stubs — conducks does not materialize a unit node for a file with no declarations, so they
never enter the graph and ARCH-4 can't see them. Closing that needs the parser to index re-export-only
barrel files (broad blast radius) — deferred, tracked separately. ARCH-4 catches self-imports in any
file that IS indexed.
