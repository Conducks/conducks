# 0050 — a node row records when it was LAST seen, and a full pulse sweeps the rest
Status: Accepted
- Amended by: 0078
- Enforced by: tests/integration/features/pulse-writes-every-table.test.ts (a two-pulse vault carries exactly one distinct `pulseId` in `nodes`, and its induced `lib::` nodes survive the second pulse)
- Date: 2026-07-30

## Context

A vault accumulated every row any pulse had ever written. Before this repository's vault was rebuilt
it held 6,589 nodes against 3,576 written by the latest pulse — 3,013 stale, including 2,843 induced
for expression fragments by a build that predated the literal-receiver guard. `purgeUnits` clears by
unit, and a virtual node has no unit, so nothing removed them.

The obvious fix is "delete rows whose `pulseId` is not the newest", and it was wrong. Measured on a
freshly built vault, two pulses in: 3,624 nodes carried the current pulse and 1,653 carried the one
that first created them. Those 1,653 were the induced external symbols — `path.resolve`,
`global::process`, `@jest/globals::jest.fn`. Induction skips a target the reloaded graph already
holds, so it never re-wrote them, so their row kept its original stamp. Sweeping on that column would
have deleted every still-valid external symbol in the graph.

So `pulseId` meant "first seen" for one subset of rows and "last seen" for all the others, and
nothing said so.

## Decision

**`nodes.pulseId` means LAST SEEN, for every row without exception, and a FULL pulse deletes what it
did not touch.**

Making it true costs one change: induction re-stamps the virtual nodes it would otherwise skip. Every
other row was already re-written each pulse by the wave flush, and `edges.pulseId` already behaved
this way — the whole inconsistency was that one skip.

The virtual nodes are collected **by property** (`filePath` starting `external://`), not by walking
edges. A `lib::<namespace>` node is never an edge TARGET, because containment lives on `parentId`
rather than on a persisted MEMBER_OF edge, so a traversal-based re-stamp cannot reach it. The first
implementation did exactly that and the sweep deleted both library nodes on the second pulse.

**The sweep runs only after a full pulse, and the method name says so.** An incremental pulse — the
watcher, a micro-pulse — writes a handful of files; sweeping there would delete the rest of the
graph. `sweepRowsNotInPulse(pulseId)` cannot check which kind of pulse called it, so the name
carries the warning that the signature cannot.

**Not chosen: a separate `lastSeenPulseId` column.** It preserves "first seen", needs a migration and
a backfill nobody can compute for existing rows, and leaves two columns that can disagree. "First
seen" was never reliable anyway — it was an artefact of which rows induction happened to skip, not a
recorded fact — so nothing real is lost by not preserving it. Symbol age, if it is ever wanted,
belongs in `node_history`, which already snapshots per pulse.

**Not chosen: sweeping edges by endpoint reachability.** Deleting edges whose endpoints vanished is
the same job done more expensively, and `edges.pulseId` is already accurate. Edges are swept first so
that no edge briefly outlives its endpoints.

**Not chosen: leaving stale rows and filtering at read time.** Every consumer would have to know the
rule, and the ones that forgot would be wrong in a way no test would catch — which is the failure
mode this session has spent its time removing.

## Consequences

A full `analyze` now deletes rows. That is a destructive operation inside the pulse transaction, so a
failed pulse rolls it back, but a SUCCESSFUL pulse that was wrong about what it saw would delete real
data. The protection is that the sweep keys on the same stamp the write path sets, so a row can only
be swept by a pulse that did not write it.

Anyone who was reading `nodes.pulseId` as "when this symbol first appeared" is now wrong. Nothing
in-tree does, and the field was not reliable for that purpose before, but the meaning has genuinely
changed and a reader of an old query will not notice.

The first sweep on an existing vault will delete a lot at once — 3,013 rows on this repository — and
that is a one-time correction rather than a leak.

`Open:` whether the watcher should ever sweep. It pulses far more often than `analyze` and its
incremental writes are exactly the case this record forbids sweeping on, so today it never cleans up
after a deleted file. `purgeUnits` covers a file that was edited; a file that was DELETED between two
watcher sessions has no unit to purge and no full pulse to catch it until the next `analyze`. Whether
that gap matters has not been measured. Carried by todo25#P7.
