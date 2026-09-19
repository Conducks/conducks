# domain/kinetic — movement through the graph

**Layer:** domain. Imports core + contracts.

**Responsibility:** everything about MOVEMENT through the graph rather than its shape: what a change
reaches (`impact`), what reaches a symbol (`trace`), the scored neighbourhood around one (`context`),
and the flow of data between symbols (`flows`). `KineticService` (`kinetic/index.ts`) is the feature's
only door (ADR 0150).

**Boundaries:** a LEAF — it imports nothing else in `domain`. `TraceAnalyzer` and `ContextAnalyzer`
deliberately do not cross the door: the only place naming them directly outside this folder is this
feature's own test, which the door rule allows. `tests/architecture/feature-doors.test.ts` fails the
build if anything else reaches past `index.ts`.

**Uses:** [core/graph](../core/graph.md)'s adjacency list (`getNode`, `getNeighbors`) for every
traversal — this module computes no structure, it only walks what the graph already holds — and
`contracts` for the `ConducksComponent` id/type `BlastRadiusAnalyzer` registers under. Reached from the
CLI (`impact`, `trace`, `context`, `flows` commands) and MCP (`tools/kinetic.ts`, `tools/synapse.ts`)
only through `registry.kinetic.*` — never `KineticService`'s internals directly.

**Deferred / not built:** no severity or confidence beyond `impactScore`'s own risk band; a caller that
wants the CLI's separate composite 0–10 risk score gets it from `domain/analysis`'s `explain`, not from
here (see Traps).

## Features

- **Impact / blast radius analysis** (`conducks impact <symbol> [upstream|downstream]`) —
  `BlastRadiusAnalyzer.analyzeImpact` answers "what breaks if I touch this" with affected symbols
  ordered by structural distance. Depth is a cumulative edge-weight budget, not a hop count: a chain of
  cheap inheritance edges reaches further than a chain of imports.
- **Path tracing** (MCP `conducks_trace` with `mode: "path"`) — `TraceAnalyzer.findPath`, the shortest
  weighted bridge between two named symbols.
- **Reachability trace** (`conducks trace <symbol>`) — `TraceAnalyzer.trace`, every symbol reachable
  downstream, nearest-first by risk-weighted graph distance. A REACHABILITY order, not an execution
  order — a static graph has no "runs before" between two direct calls at the same distance.
- **Symbol neighbourhood** (`conducks context <symbol>`, MCP `conducks_context`) —
  `ContextAnalyzer.neighbourhood`, the scored area around a symbol. One implementation behind both
  surfaces since 2026-08-13 (todo57) — before that date the CLI and MCP ran two different
  implementations under the same name and agreed on only 44 of 2,407 nodes on the same symbol.
- **Execution and data flow** (`conducks trace <symbol> --flow`, `conducks flows`) — `ConducksFlowEngine`
  groups symbols into named execution units and follows where a value comes from and where it goes.

## Glossary

- **edge distance** — how far apart two symbols are per edge type, from the single `EDGE_DISTANCE`
  table (<span class="anchor">src/lib/domain/kinetic/trace.ts:81</span>). LOWER means a TIGHTER
  relationship, so Dijkstra reaches tightly-coupled symbols first. One table for the whole feature:
  `impact` and `trace` ask the same question and a second copy drifts (ADR 0196).
- **Weighted Dijkstra** — every traversal in this module (`BaseAnalyzer.dijkstra`) is Dijkstra over
  edge-type weights, never plain BFS/DFS: a hop's cost depends on what KIND of edge it is, not just that
  an edge exists.
- **Depth-bound hit** (`depthBoundHit` / `lastTraceWasDepthBounded()`) — whether the last traversal
  discarded a path for exceeding its weight budget; the only place that can say an answer is a partial
  one.
- **Distance** vs **depth** — `dijkstra` returns a cumulative weighted `weight`; `bfs` (used by `trace`)
  rounds that into an integer `depth` for display, which is a presentation choice, not a second metric.

## Traps

**The computed impact risk band never reaches a user.** `analyzeImpact` returns
`risk: 'LOW'|'MEDIUM'|'HIGH'|'CRITICAL'` (`domain/kinetic/impact.ts:47`, thresholds on `impactScore` in
`getRiskLevel`), and `KineticResult` declares the field — but no surface prints it. The MCP handler
returns only `{symbol, direction, impact, indexStaleness}`; the CLI prints `affectedCount`, the shortest
path and `impactScore`, plus a *different* `explain.calculateCompositeRisk` score computed elsewhere.
Don't quote "impact risk = HIGH" — nobody has ever seen it rendered, and its bands are score-based, not
comparable to the composite 0–10 risk.

(`getRiskLevel` is defined at `domain/kinetic/impact.ts:58-63`, cited here with its full path because a
bare `impact.ts` now resolves ambiguously against `interfaces/cli/commands/impact.ts` — see Traps
below.)

**Containment is one-way.** A `MEMBER_OF` edge runs child → container. Followed forward it is a real
claim (change the function, the file changed); followed backward from `upstream` traversal it claims
every OTHER symbol in that file was affected too, which is co-location, not dependency. `dijkstra`
explicitly skips `MEMBER_OF` when walking `upstream` for exactly this reason. `trace`'s downstream walk
still lets containment CARRY a path (an import is unit-scoped, so a dependency is reached through its
container) but never lets a `MEMBER_OF` edge be the last hop of a kept result — and re-admits a
dropped node to a fixpoint if something already kept reaches it by a non-`MEMBER_OF` edge, because
Dijkstra keeps only the cheapest of possibly several real routes to the same node.

**An edge type missing from the weight table does not fail — it becomes a standard hop.**
`BaseAnalyzer.dijkstra` reads `weights[edge.type] || 1.0`
(<span class="anchor">src/lib/domain/kinetic/trace.ts:158</span>), so an unweighted type silently
costs the same as a call. That is correct for a type nobody has weighted yet and was a live defect
for one that should have been weighted: `findPath` carried its own table with no `ALIASES` entry, so
a barrel re-export cost as much as a direct call, against the rule that a re-export is a pass-through
and must rank with the direct consumers. Two tables existed for the same concept and differed by up
to 5x; there is now one, `EDGE_DISTANCE`, and a test asserts every type the traversal can meet is in
it (ADR 0196).
