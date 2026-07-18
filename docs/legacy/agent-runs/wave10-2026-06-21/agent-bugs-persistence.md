# Wave10 — persistence.ts Bug Fixes

Date: 2026-06-21
File: `conducks/src/lib/core/persistence/persistence.ts`

## B1 — updateEdgeTargets missing lowercase normalization

**Location:** `updateEdgeTargets`, line 336  
**Fix:** Changed `stmt.run(entry.newTargetId, ...)` to `stmt.run(entry.newTargetId.toLowerCase(), ...)`  
**Status:** Fixed

## B4 — SQL injection / invalid SQL in purgeUnits

**Location:** `purgeUnits`  
**Finding:** Both sub-bugs were already absent in the existing code:
- Empty guard: `if (!unitIds.length) return;` already present at line 256
- Placeholders: already parameterized with `?` and bound via `lowered` array
**Status:** No change needed — already correct

## B9 — DB close() has no timeout

**Location:** `close()`, lines 396-405  
**Fix:** Replaced bare Promise with `Promise.race([closePromise, timeout])` where timeout rejects after 5s. Also fixed: original callback ignored the error argument; now properly rejects on error.  
**Status:** Fixed

## TypeScript check

`npx tsc --noEmit` — zero errors
