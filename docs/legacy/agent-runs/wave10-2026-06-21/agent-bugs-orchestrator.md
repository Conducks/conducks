# Wave 10 — Orchestrator Bug Fixes

**Date:** 2026-06-21
**File:** `src/lib/domain/analysis/orchestrator.ts`

## Bugs Fixed

### B2 — Null deref on undefined linkage (line ~330)
- **Problem:** `this.reflector.imports.link()` returns `{targetId, type} | undefined`. Guard was `if (linkage)` — did not check `linkage.targetId` before accessing it.
- **Fix:** Changed guard to `if (linkage && linkage.targetId)` before the `addEdge` call.

### B3 — Flush errors silently corrupt pulse record (line ~287-293 and ~349-355)
- **Problem:** Catch blocks logged and continued. If a DuckDB write failed, `totalNodes`/`totalEdges` were stale but the pulse record was written with those wrong values anyway.
- **Fix:** Introduced `pulseIncomplete` flag (initialized `false`). Set to `true` in both flush catch blocks (discovery pass and wave loop). Propagated to pulse record metadata as `{ incomplete: true }` so callers can detect stale counts.

### B8 — No backoff on repeated flush failures (line ~347-355)
- **Problem:** The wave loop catch block logged and continued every iteration with no circuit breaker.
- **Fix:** Added `consecutiveFlushFailures` counter (reset to 0 on success). After `MAX_CONSECUTIVE_FLUSH_FAILURES = 3` consecutive failures, `break` out of the wave loop with a warning log.

## TypeScript Check
`npx tsc --noEmit` — zero errors.
