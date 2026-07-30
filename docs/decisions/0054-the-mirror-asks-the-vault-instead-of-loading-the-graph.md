# 0054 — the mirror asks the vault instead of loading the graph
Status: Accepted
- Enforced by: tests/unit/domain/visual/wave-from-sql.test.ts (the wave is produced without a materialised graph, and reports truncation instead of silently capping)
- Builds: 0042
- Date: 2026-07-31

## Context

`conducks mirror` served **0 nodes and 0 links** against a vault holding 5,358 nodes. Verified by
starting the server and calling its own endpoint.

Three faults stacked, and each hid the next.

`GatewayService.getWave` delegated to `MirrorEngine.getVisualWave`, which walks the IN-MEMORY graph.
`mirror` is in `STALENESS_BYPASS`, so `main` never loads it, and no other path on that command does
either — every other graph-walking command calls `ensureGraphLoaded()` and this one never had. So the
engine walked an empty graph and returned an empty wave, correctly.

The branch that was supposed to avoid the graph entirely called
`(this.persistence as any).getCompactWave(...)`. **No such method existed.** The cast made a missing
method compile, the call threw at runtime, and the surrounding catch returned `{nodes: [], edges: []}`
— so the "fast path" was a silent empty result that looked like a graph with nothing in it.

And the front-end never set `compact`, so that branch was unreachable regardless.

The obvious fix — call `ensureGraphLoaded()` in the mirror command — was written and then discarded.
It works, and it means a dashboard that draws a few hundred boxes must first materialise every node
and edge in the project. That is the inversion ADR 0042 argues against, applied to the one surface
where it is least defensible: a dashboard shows a summary by construction.

## Decision

**The visual wave is answered from SQL.** `SynapsePersistence.getVisualWave(layers, spread, limit)`
selects the containment tiers, orders by gravity so a capped wave is the heaviest slice rather than
an arbitrary one, fetches only the edges whose BOTH endpoints survived the slice, and returns the
`{nodes, links, clusters}` shape the front-end already consumes. `mirror` does not load the graph.

**Truncation is reported.** The wave carries `truncated` and `totalNodes`, and the server logs
"showing N of M — the heaviest slice, not the whole graph" when it caps. A dashboard that silently
draws the top 1,500 of 40,000 nodes is a dashboard that lies about the size of the system.

**Clustering keeps ADR 0028's rule, and only moves where it runs.** `detectCluster()` walks
`parentId` up to the nearest DIRECTORY, REPOSITORY or NAMESPACE, bounded at 20 hops. The first
version of this change grouped by the IMMEDIATE parent instead, which is a different rule with a
different answer — 404 clusters against 128 for the same graph, and the 128 are the containers a
reader recognises. The rule is ported, not replaced. It needs the parent chain, which is three
columns of every row rather than the graph itself; that projection is exactly the distinction ADR
0042 draws.

**Not chosen: loading the graph in the mirror command.** One line, works today, and reintroduces the
memory cost this project spent ADRs 0038 and 0042 removing. A summary view is the worst place to pay
full price for detail.

**Not chosen: deleting `MirrorEngine`.** It is unused on the live path now, and it was removed —
until the ADR-invariant suite failed. ADR 0028 requires `mirror.engine.ts` to exist as the
replacement for the deleted DAAC module, and the test enforcing that did its job. It is restored.
Whether ADR 0028 should be revisited is a separate decision that belongs to whoever makes it, not to
a cleanup pass.

## Consequences

`MirrorEngine.detectCluster` and the SQL cluster walk now implement the same rule in two places, and
two implementations of one rule drift. That is a real cost of not deleting the engine, and it is
accepted here rather than hidden: the alternative was superseding ADR 0028 as a side effect of a
performance change.

The wave is a different shape of correct than before. `MirrorEngine` promoted transitive links and
decayed their weight; the SQL wave draws only edges that exist between visible nodes. Fewer lines,
none of them synthesised. Anyone comparing screenshots across this date is comparing two different
renderings, not a regression.

`getVisualWave` was also removed from the `registry.mirror` facade, where it exposed the engine's
version and nothing called it. One question, one answer.

`Open:` the wave's default cap is 1,500 nodes and this repository produces 682, so the truncation
path has never actually run here. The number is a guess, and the first project large enough to hit it
is the measurement that corrects it — which is only possible because the wave now reports when it
caps. Carried by todo25#P5.
