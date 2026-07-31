# 0066 — a mode named "execution" cannot honestly be static

Status: Accepted
- Enforced by: tests/unit/domain/kinetic/trace-shape.test.ts
- Date: 2026-07-31

## Context

`conducks_trace --mode execution` on `AnalysisService.analyze` returned 10 "steps" including
`global::promise`, `global::process` and `fs.stat`, with `synapsepersistence.beginpulse` — a direct
call, the first thing that runs — LAST of the 10 (todo28#P3). The result is `TraceAnalyzer.trace()`
at `src/lib/domain/kinetic/trace.ts:133` (pre-fix): `bfs()` runs a Dijkstra traversal, gets back a
`Map<NodeId, { depth, path }>` in the order nodes were finalized, and `trace()` returns
`Array.from(results.keys())` as-is. Both `depth` (a `Math.round`ed risk-weighted distance, not a hop
count) and the actual edge path from the start node are computed and then discarded — only the bare
id survives.

conducks-docs §6.13 is explicit about what a static structural graph can and cannot answer: `conducks
trace` "verifies wiring, never logic — it answers 'does A call B', not 'does A run before B'." A
mode named `execution`, on a tool whose own description promised "granular execution ... from a
starting symbol", claims exactly the thing the graph cannot compute. This is the same shape of bug as
ADR 0044 (`STABLE` from a comparison that never ran) and ADR 0063 (`manifest` falling through to
`health`): a declared capability the code does not actually have, failing toward a plausible-looking
answer instead of an honest one.

Two things were measured while investigating a fix:

1. `dijkstra`'s priority queue is a correct min-heap over non-negative edge weights, so its pop
   order — and therefore `results.set()`'s insertion order — is already non-decreasing in weight by
   construction. Reverting an explicit sort added during this investigation and re-running two test
   graphs (ten weight-1 siblings inserted in reverse order; a four-node graph with a direct edge to a
   node also reachable through two hops) produced byte-identical output with and without the sort.
   The "unordered neighbour set" the todo measured is real, but it is not a heap bug: it is that
   several direct calls from one function all sit at the same graph distance (weight 1.0), and among
   ties the graph carries no signal that corresponds to which one a reader would call "first" — the
   edge insertion order reflects the ANALYZER's processing order (definitions pass, then calls pass,
   then cross-file resolution), not the source's left-to-right call order.
2. The tool returned bare node ids (todo28#P4 measured these at 127 characters average, 0/19 carrying
   a line) — a caller cannot jump to a returned step without a second lookup.

## Decision

**`conducks_trace`'s `mode` is renamed from `execution` to `reachability`, and `execution` is kept as
a deprecated alias with identical behaviour.** `reachability` is what the tool actually computes:
downstream nodes ordered nearest-first by risk-weighted graph distance from the start symbol. The
description no longer says "execution" without qualification; it now states plainly that this is
wiring, not execution order, and that a static graph cannot know which of two same-distance calls
runs first. Renaming the enum value is a breaking change to the MCP surface, and the todo asked to
weigh it explicitly against reordering; `execution` stays a valid, working input so an existing caller
that already passes `mode: "execution"` does not break — only the default value and the promised
meaning change.

**Not chosen: keep `execution` as the only/default name and just fix the ordering.** Rejected because
no ordering fix changes what the graph knows. Item 1 above shows the pop order was already
non-decreasing by distance; the actual complaint (`beginpulse` last despite running first) is that
graph distance and runtime order are uncorrelated at the same tier, which sorting cannot repair — the
information "which call happens first" was never captured by the graph in the first place. Renaming
is the only honest fix; reordering by distance is a genuine, useful, additional property, not a
substitute for the one the old name promised.

**The explicit sort added during this investigation was kept, but is not counted as a behavioural
fix.** It makes "ascending risk-weighted distance, nearest first" an explicit, tested invariant in
`BaseAnalyzer.bfs` (`src/lib/domain/kinetic/trace.ts`) rather than an implicit property of a correct
heap implementation — protection against a future change to `PriorityQueue` or `dijkstra` silently
breaking it. `tests/unit/domain/kinetic/trace-shape.test.ts` pins the invariant directly but does not
claim it as red-before-green, per this run's own standing rule that a test which could not have failed
proves nothing; its own comment says so.

**Every returned step is enriched from a bare id to `{ id, name, kind, file, line }`**, in
`src/interfaces/tools/tools/kinetic.ts` only, using `graph.getNode(id).properties.range.start.line` —
the same field `persistence.ts` already populates from `lineStart`. This applies to both `reachability`
and `path` mode's steps, since both returned bare ids from the same tool. `conducks_context`'s
equivalent noise/line problem (todo28#P4) is a different file owned by another agent on this run and
is untouched here.

## Consequences

A caller reading the OLD description and building around `mode: "execution"` returning execution
order was already wrong to rely on that — the description now says so, and the value keeps working
identically, so nothing breaks mechanically. A caller parsing `steps` as `string[]` (bare ids) breaks:
`steps` is now `{ id, name, kind, file, line }[]`. No in-tree caller was found to depend on this shape
— `tests/unit/domain/kinetic/impact-and-trace.test.ts` calls `KineticService.trace()` directly (the
domain method, unchanged: still `NodeId[]`), and the CLI commands `interfaces/cli/commands/trace.ts`
and `interfaces/cli/commands/context.ts` also call `registry.kinetic.trace()` directly rather than
through the MCP tool, so neither is affected by the tool-layer enrichment.

`Open:` whether `conducks_impact`'s steps (already objects, unaffected here) and `conducks_trace`'s
`path` mode should also expose the risk-weighted distance the domain layer already computes per step,
not just id/name/kind/file/line. No todo carries this yet — it was out of scope for todo28#P3, which
asked only for an honest mode name and a defensible order, both delivered here.
