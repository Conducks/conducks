# todo67 — a live pulse adds and never removes, so the watcher cannot be allowed to write
Status: blocked
- Acceptance: on a two-file project under `conducks watch --pulse`, deleting the only call to a
  symbol leaves `impact <symbol> upstream` reporting ZERO callers from a separate process —
  measured, not asserted — and a following `analyze` agrees.
- Blocked by: the in-memory graph has no removal. `ingestSpectrum` only adds, and
  `ConducksAdjacencyList` exposes no node deletion at all — the comment at `adjacency-list.ts:254`
  naming `removeNodes` as one of three index-maintenance points describes a method that does not
  exist. Replace-on-repulse has to exist before any live write is safe.

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

## Phase 1 — replace, rather than add

- [ ] Give `ConducksAdjacencyList` a removal that maintains every index it already maintains in
      `addNode` and `clear` — the third case the existing comment claims. Pinned by a test that
      adds, removes, and asserts each index is empty, not only that `getNode` returns undefined
- [ ] `ingestSpectrum` (or its caller) drops the file's previous nodes and their edges before
      ingesting the new spectrum, so a re-pulse REPLACES a unit
- [ ] Verify against the acceptance measurement above, and against the counter-case: a file whose
      symbols are unchanged must keep its incoming edges from other files

## Phase 2 — let the watcher write again

- [ ] `watch --pulse` opens the vault writable and the refusal notice is deleted, not disabled
- [ ] Cross-process check: watcher persists, a SEPARATE `impact` sees the change
- [ ] `status` no longer needs to answer a staleness question the vault has already settled
