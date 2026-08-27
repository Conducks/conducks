# 0174 — a depth bound that hides itself
Status: Accepted
- Date: 2026-08-27
- Builds: 0091, 0160
- Enforced by: tools/benchmark/oracle-trace.mjs

## Context

todo77 Phase 2 opens on `trace`, and the first measurement found the defect ADR 0091 had already
named — in a second place nobody had held to it.

`trace` walks a risk-weighted graph distance capped at **10**, in `TraceAnalyzer.trace(symbolId,
depth = 10)`. Measured on the scraper subject against an independent BFS over the vault's own `edges`
table:

| | |
|---|---|
| reachable from `JobRunner` by an unbounded walk | **2,397** |
| returned by `trace` | **2,057** |
| reported as `truncated` | **false** |

The depth cap was **not settable** — no `--depth` flag existed — and **not disclosed** on either
surface. ADR 0091 had already fixed exactly this for the PRINT limit, in this same file, with the
words *"A bound is fine. A bound that hides itself is not."* The walk's bound had never been held to
the rule its own neighbour was written for.

## Decision

**Both bounds are settable and both are reported, and they are reported separately because they mean
different things.**

- `truncated` — the PRINT stopped early; the rest is one `--limit` away.
- `depthBounded` — the WALK stopped; there are reachable nodes in neither list, and `--depth` is what
  asks the bigger question.

`dijkstra` records the bound where it applies it, which is the only place that can know: the single
`currentWeight > maxWeight` discard. `lastTraceWasDepthBounded()` carries it out through the kinetic
facade and the registry.

### And a second defect, found by the same measurement

The MEMBER_OF exclusion — *"a step entered through MEMBER_OF is location, not dependency"* — was
applied to each node's **shortest** path. Dijkstra keeps one route per node, so a symbol whose
cheapest route happened to arrive through containment was dropped even when something in the kept set
genuinely CALLS it. `paths.py::resolve_project_path` is called outright and was absent.

Re-admission is on evidence, not by relaxing the rule: a dropped node returns only if a KEPT node
reaches it by an edge that is not MEMBER_OF, iterated to a fixpoint because a node re-admitted on one
lap can be what makes another referenced. Containment still never carries the answer; it just no
longer hides a reference that exists.

## Consequences

- `--depth <n>` exists, registered the way every flag here is — by appearing in `usage`, which the
  dispatcher parses. On scraper: depth 10 returns 2,057 with `depthBounded: true`; depth 99 returns
  2,339 with `false`.
- The residual against an unbounded walk is **58 nodes, every one reachable only through
  containment** — the documented exclusion, and 0 that trace claims and the walk cannot reach.
- **`oracle-trace.mjs` gives `trace` its own oracle**, scoring five entry points per run. It reads
  the vault's edges and walks them itself: independent despite sharing the graph, because `trace` IS
  a traversal and the traversal is what is under test. A tool that BUILDS the graph could not be
  scored this way, which is why prune's oracles stay outside it.
- Baseline recorded: 5 starts, `EXTRA 0`, `MISSED 20`. **The 20 are a genuine difference of rule, not
  a bug**, and the oracle says so: it admits a node referenced from anywhere in its own walk, while
  `trace` requires the referrer to have been kept — so a method whose only callers are themselves
  containment-only stays out. Every one of the 20 is a class member. trace's rule is the defensible
  one; the looser one is easier to state, so the gap is ratcheted rather than argued away.
- Full gate green: seven oracles, 319 suites / 2,469 tests.
