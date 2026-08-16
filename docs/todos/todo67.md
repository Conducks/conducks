# todo67 — a live pulse adds and never removes, so the watcher cannot be allowed to write
Status: blocked
- Acceptance: on a two-file project under `conducks watch --pulse`, deleting the only call to a
  symbol leaves `impact <symbol> upstream` reporting ZERO callers from a separate process —
  measured, not asserted — and a following `analyze` agrees.
- Blocked by: the VAULT half. `save` inserts and updates but never deletes, so a row for an edge the
  edit removed survives even once memory is correct; and purging the unit first loses cross-file
  edges that neither the intra-linker nor a later incremental `analyze` restores.
- CORRECTION, 2026-08-16: the first version of this file said the adjacency list "exposes no node
  deletion at all". That was wrong and came from grepping one name — `clearFile` exists and is
  tested. It is still the wrong tool here, for a different reason, recorded in Phase 1 below.

## Context

Found while fixing the watcher's reflection path (the `allPaths` defect, fixed separately). With
that fixed the watcher re-parses correctly, so the obvious next step was to let `--pulse` persist:
`watch.ts` opened the registry read-only unconditionally, and the watcher's save is guarded by
`!persistence.readOnly`, so both branches of that guard were dead and `--pulse` was a flag that read
as obeyed and did nothing.

MEASURED with the write enabled, on a two-file project (`main.ts` calls `onlyHere`, then the call is
deleted):

| step | `impact onlyHere upstream` | truth |
| --- | --- | --- |
| clean `analyze`, call present | 1 caller | 1 |
| edit removes the call, watcher persists | **1 caller** | 0 |
| `analyze` afterwards | **1 caller**, `0 dirty units` | 0 |

Two things go wrong, and the second is why this is worse than doing nothing:

1. The re-pulse ADDS the file's new nodes and edges beside the old ones. The `CALLS` edge from `run`
   to `onlyHere` describes a line that no longer exists, and nothing removes it.
2. Step 6 of the pulse records the file's hash. The next `analyze` therefore finds the file
   unchanged, skips it, and never repairs the graph.

So enabling the write converts staleness that `analyze` fixes into staleness that nothing fixes.
The flag is refused out loud in the meantime rather than silently obeyed.

## Phase 1 — replace, rather than add — DONE, in memory

- [x] `clearFile` was measured and rejected: on a two-node fixture it removes the INCOMING `CALLS`
      that another file owns, so re-pulsing `a.ts` deletes `main.ts`'s reference to it. A re-parse
      restates the file's OWN outgoing edges and says nothing about anyone else's
- [x] `ConducksAdjacencyList.replaceFile(filePath, keepIds)` drops the file's outgoing edges and any
      node the new spectrum no longer declares, and leaves every incoming edge alone. Five cases in
      `repulse-replaces-a-file`, including the index check — a removal that forgets an index leaves
      an id pointing at nothing and the resolver binds an edge to it
- [x] `spectrumNodeId` is now ONE exported rule, because the ingest computes the id to write it and
      the replace step needs it before ingesting. Writing it twice is how the grammar queries drifted
- [x] the live pulse runs the INTRA-LINKER, which `analyze` runs and this path did not. Invisible
      while the pulse only added — the previously resolved edge masked the dangling new one

## Phase 1b — what the vault does, measured

Enabling `--pulse` on top of Phase 1 was tried and reverted. Both readings on the same fixture:

| | `impact onlyHere` (truth 0) | `impact shared` (truth 1) |
| --- | --- | --- |
| save without purge | 1 — stale row survives | 1 |
| purge unit, then save | 0 | **0**, and still 0 after a full `analyze` |

`purgeUnits` deletes the edges a unit owns, `save` writes the in-memory graph back, and the
cross-file edges do not come back — then both files' hashes read as clean, so `analyze` repairs
nothing. One wrong answer traded for a worse one.

- [ ] Find why the purged cross-file edges are not written back by `save` — the likely answer is
      that `save` writes what it considers dirty rather than the whole graph, which is exactly the
      asymmetry `purgeUnits` breaks. MEASURE it before changing anything
- [ ] Whatever the fix, the acceptance table above is the check: both columns must read 0 and 1

## Phase 2 — let the watcher write again

- [ ] `watch --pulse` opens the vault writable and the refusal notice is deleted, not disabled
- [ ] Cross-process check: watcher persists, a SEPARATE `impact` sees the change
- [ ] `status` no longer needs to answer a staleness question the vault has already settled
