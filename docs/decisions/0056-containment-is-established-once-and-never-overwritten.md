# 0056 — containment is established once, and a later pass never overwrites it
Status: Accepted
- Enforced by: tests/integration/features/pulse-writes-every-table.test.ts (no node is its own parent, and every MEMBER_OF edge agrees with the parentId column)
- Date: 2026-07-31

## Context

A connectivity audit of the vault found **334 nodes whose `parentId` was their own `id`** — a
self-loop in the containment tree, one per file. Every one was a UNIT.

`graph-engine.ingestSpectrum` computed a node's parent as:

```ts
const parentId = m.parentId ? m.parentId.toLowerCase() : (unitId || null);
```

For a symbol inside a file that is right: no explicit parent means the enclosing unit. For the FILE
node itself `unitId` IS that node's own id, so every unit came out of the reflector parented to
itself — overwriting the directory link the skeleton pass had already established correctly.

The symptom was visible for a while and easy to misread. Every parent-walk on those nodes ran to its
20-hop limit and fell back, so the mirror put 405 of 691 nodes in the `ecosystem::global` bucket. That
looks like a clustering shortcoming. It was broken containment.

The same defect showed up a second way: **334 `MEMBER_OF` edges disagreed with the `parentId` column**
for the same nodes. Containment is stored twice — as an edge and as a column — and where they
disagreed, the edge was right.

## Decision

**The skeleton pass establishes containment, and no later pass may erase it.** Two changes, and
neither alone is sufficient.

1. **A node is never its own parent.** `ingestSpectrum` nulls the computed parent when it equals the
   node's own id, rather than writing the self-loop.
2. **`parentId` is COALESCED on update, not assigned.** The skeleton runs once and flushes before
   any wave; a wave then re-writes the same rows with no opinion about the parent, and the graph is
   CLEARED between waves (ADR 0041), so at that moment the row being updated is the only place the
   value still exists. `COALESCE(v.parentId, nodes.parentId)` keeps it.

The coalesce is narrowed to this one column deliberately. "An update should never erase what it does
not know" is a tempting general rule and a wrong one — it would make a genuine clear impossible.
Containment is the specific case where the writer is known to be uninformed.

**Not chosen: recovering the parent from the in-memory node.** This was tried first and made things
worse in a way worth recording: `addNode` has the previous node in hand, so falling back to
`previous.properties.parentId` looks free. It fails because the graph is cleared between waves, so
`previous` is absent for every file after wave one — and it converted 334 self-loops into 384
orphans while appearing to fix the original symptom. Both a self-loop and a null are wrong; the
second is merely quieter.

**Not chosen: deriving the directory id inside `ingestSpectrum`.** It could rebuild
`directory::<canonical dir>` from the file path, and it would be a second implementation of a rule
the skeleton already owns — including the root-file case, where the parent is `repository::<name>`
rather than a directory. Two implementations of a naming rule drift.

**Not chosen: dropping the `parentId` column and keeping only MEMBER_OF edges.** They already
disagreed, so one of them is redundant. But the column is what `layer_path`, the taxonomy ranks and
the mirror's cluster walk all read, and the edge is what traversal uses. Collapsing them is a real
simplification and a much larger change than repairing the write path.

## Consequences

Measured on this repository, before and after:

| | before | after |
|---|---|---|
| nodes that are their own parent | 334 | 0 |
| MEMBER_OF edges disagreeing with `parentId` | 334 | 0 |
| nodes with no parent at all | 385 | 51 |
| wave-eligible nodes parented to a DIRECTORY | 257 | 588 |
| mirror nodes in the `ecosystem::global` fallback | 405 | 56 |

The 51 remaining parentless nodes are the 32 ECOSYSTEM roots and 19 `lib::` namespace roots. Those
are the tops of their trees and correctly have no parent.

Anything that walked parents and gave up silently was returning a fallback for a third of the graph.
Cluster assignments, `layer_path` values and any rank derived from depth are all different now, and
not comparable across this date.

`Open:` four nodes still carry a `parentId` pointing at an id that is not in `nodes`. They are
symbols whose parent unit was swept — the count is small and stable, and it was left rather than
guessed at because the right answer depends on whether the sweep or the write is at fault, which
needs a reproduction nobody has built. Carried by todo25#P10.
