# 0038 — the graph loads when something walks it, and forgetting is loud
Status: Accepted
- Enforced by: tests/unit/core/lazy-graph.test.ts (a deferral runs once for N callers, takes the current connection, and is cleared by a later eager load); tests/unit/domain/governance/status-from-vault.test.ts (the vault path reports real counts against an empty graph)
- Date: 2026-07-28

## Context

`registry.initialize()` materialised the whole structural graph before answering anything. On this
repo that is 2,402 nodes and 12,697 edges for ~165 MB and 146 ms, and the MCP stdio transport spawns
one server per client SESSION — so three open sessions held 1.3 GB.

Most of it was waste. The MCP tool surface never parses (`registry.analyze.*` appears zero times in
it, CONDUCKS-8), and most questions it answers are counts, filtered scans or file reads. A `lazy`
option already existed for exactly this: declared in the bootstrapper's signature, plumbed through
`initializeRegistry(readOnly, root, lazy = readOnly)` — and destructured and never read. Every
read-only process paid a full load to answer questions that touched no node.

## Decision

The load is deferred behind `ensureGraphLoaded()`. Anything that WALKS the graph asks for it first;
anything that answers from SQL or from files does not.

The deferral is only safe because forgetting is loud, and that is the substance of this record
rather than a detail of it. The `graphEngine` accessor throws while a load is pending, naming the
fix. `ensureAnchor`'s `needsGraph` is **opt-out**: a tool must be proven graph-free before it skips
the load.

**Not chosen: opt-in, where a tool declares that it needs the graph.** It reads better and it is
wrong. A deferred graph is an EMPTY graph, not an error — measured on the first attempt at this,
four of six MCP tools broke and THREE broke silently: `conducks_status` reported `nodeCount: 0`,
`conducks_flows` reported zero flows, impact and trace said SYMBOL_NOT_FOUND, and nothing logged
anything. That is CONDUCKS-13 applied to every structural answer the tool gives. Under opt-in, the
cost of forgetting is a confident wrong answer; under opt-out it is a slower tool.

**Not chosen: relying on the accessor guard alone.** It is necessary and insufficient. The domain
services — `governance`, `search`, `kinetic`, `metrics` — capture `graph.getGraph()` at
construction, so they read the empty graph without ever passing the accessor. `conducks_status`
stayed silently wrong with the guard in place. That is why the default is safe rather than fast.

## Consequences

Measured per session shape on this repo, against 435 MB for every session before: docs only 92 MB,
filter or template query 109 MB, `conducks_status` 104 MB, and a graph-walking tool ~220 MB.

The deferred loader takes the CURRENT persistence rather than capturing one. The read-only path
closes its connection after loading, so a captured handle is dead by the time anyone needs the graph.

Two tools moved off the graph entirely and are the pattern for any that follow. `conducks_query`
derives `needsGraph` from its mode, because only fuzzy resolves names in memory. `conducks_status`
uses `statusFromVault()`, which reads counts with `count(*)` and framework and last-pulsed commit
from the `metadata` table.

That conversion exposed a live bug it now routes around: `load()` restores the metadata COLUMN on
each node and never the metadata TABLE, so `lastAnalyzedCommit` came back undefined in every
read-only process. `status()` computes staleness as `head && lastCommit !== "none" && head !==
lastCommit`, which with the commit missing is ALWAYS false — the tool could never report a stale
index, the single thing it exists to say. Reading the table fixes it by construction, and the
in-memory `status()` remains wrong for any caller that loaded from a vault.

The remaining ~130 MB is NOT reachable from the query layer, which was measured before being
assumed. Attributed step by step (rss/heap): baseline 58/6, vault open 73/6, `SELECT` nodes 105/16,
`SELECT` edges 113/26, **addNode all 173/29**, addEdge all 188/44. The jump is `addNode` — +60 MB
RSS against +3 MB heap — so it is V8 arena growth and adjacency-list Map overhead. Rewriting
traversals as recursive CTEs was dropped for this reason: the neighbourhood at the default depth IS
the graph (1,976 of 2,402 nodes at depth 3), so SQL would read the same rows and add a second set of
native buffers.

`Open:` what replaces object-per-node plus Maps — ANSWERED 2026-07-28, nothing does. Measured after
this record was written: the loaded graph retains 21 MB of heap (53 MB before a forced GC, 21 MB
after, with RSS unmoved at 199 MB), so the ~180 MB gap is V8 arena grown for transient garbage and
never returned, not a data-structure cost. `Set` versus `Array` for both edge indexes is 1.8 MB
against 1.7 MB. A typed-array rewrite would target the 21 MB and could not reach the rest. Recorded
in `memory.md`; `todo21#P5` carries the one remaining lever, streaming rows during load.
