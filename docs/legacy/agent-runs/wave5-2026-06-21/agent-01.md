# A8 — adjacency-list O(N²) set mutation during iteration

**Wave:** 5  
**Date:** 2026-06-21  
**File:** `src/lib/core/graph/adjacency-list.ts`

## Problem

In `clearFile()`, two inner loops were mutating a Set while iterating over it:

1. `outSet.delete(e)` called inside `for (const e of outSet)` — line ~252
2. `inSet.delete(e)` called inside `for (const e of inSet)` — line ~262

Mutating a Set during iteration is undefined behaviour in JS/TS: the spec allows skipping or double-processing elements. On large graphs this causes silent corruption.

Additionally, the `for (const e of set) if (e.id === edge.id)` pattern is an O(N) linear scan per edge — O(N²) total — where a direct `outSet.delete(edge)` (using reference equality) would be O(1). However, since the edges stored in the Set are the same object references passed in via `addEdge`, the O(1) fix (direct delete by reference) is valid. The chosen fix collects deletions first to be safe without restructuring the data model.

## Fix Applied

Both inner loops now collect mutations in a local `toDelete: ConducksEdge[]` array, then apply deletions after the read-pass is complete:

```typescript
const toDelete: ConducksEdge[] = [];
for (const e of outSet) if (e.id === edge.id) toDelete.push(e);
for (const e of toDelete) outSet.delete(e);
```

Same pattern applied to the `inSet` loop.

## Verification

`npx tsc --noEmit` — clean, no errors.

## Status

DONE
