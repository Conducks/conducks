# Wave 9 — Agent 02: DF1 Per-Symbol Kinetic Columns

**Task:** DF1 — Promote kinetic data from JSON blob to first-class DuckDB columns  
**Status:** Complete  
**tsc --noEmit:** 0 errors

---

## Part 1: Schema migration (`persistence.ts`)

Added four `ALTER TABLE nodes ADD COLUMN IF NOT EXISTS` statements after the table creation block in `initializeSchema()`:
- `blame_age_days INTEGER`
- `churn_count_90d INTEGER`
- `entropy_score DOUBLE`
- `last_author TEXT`

Added `updateKineticColumns(nodeId, data)` method that builds a parameterized `UPDATE nodes SET ... WHERE id = ?` from only the provided fields. Guards against read-only mode and empty data objects.

## Part 2: Kinetic computation wiring (`orchestrator.ts`)

Kinetic data is produced in `reflector.ts` (lines 473–528) per symbol via git blame, stored in `n.metadata.kinetic` with fields: `tenureDays`, `resonance` (file-level commit count), `entropy`, `primaryAuthor`.

After each wave's `flushAndClear`, the orchestrator now iterates `inductionResults` and calls `persistence.updateKineticColumns(nodeId, {...})` mapping:
- `kinetic.tenureDays` → `blame_age_days`
- `kinetic.resonance` → `churn_count_90d`
- `kinetic.entropy` → `entropy_score`
- `kinetic.primaryAuthor` → `last_author`

Failures are caught and swallowed (non-fatal — pulse must not be blocked by kinetic column updates).

## Part 3: Query template (`query-service.ts`)

Added `kinetic_hotspots` template to `QueryService.QUERIES`:
- Params: `["limit"]`
- SELECT: `id, name, blame_age_days, churn_count_90d, entropy_score, last_author`
- WHERE: `churn_count_90d IS NOT NULL`
- ORDER BY: `churn_count_90d DESC`
- No pulseId filter — kinetic columns are per-row globals, not pulse-scoped

## Files changed

- `src/lib/core/persistence/persistence.ts` — ALTER TABLE statements + `updateKineticColumns`
- `src/lib/domain/analysis/orchestrator.ts` — kinetic column backfill after each wave flush
- `src/lib/domain/analysis/query-service.ts` — `kinetic_hotspots` template
