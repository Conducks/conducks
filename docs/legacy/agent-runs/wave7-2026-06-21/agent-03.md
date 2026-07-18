# Wave 7 — Agent 03: Reduce :any casts in highest-value domain files

**Date:** 2026-06-21
**Task:** Q7 — Reduce `:any` casts in `persistence.ts`, `orchestrator.ts`, `search-engine.ts`
**Result:** tsc clean (0 errors) before and after all changes

---

## File 1: `src/lib/core/persistence/persistence.ts`

**Starting any count:** 14 occurrences
**Ending any count:** 6 (those that cause cascades remain)

### Fixes applied
- `private db: any` → `private db: duckdb.Database | null` — uses proper DuckDB type from its `.d.ts`
- `new SynapseRegistry<any>()` → `new SynapseRegistry<ConducksComponent>()` — added `ConducksComponent` import
- `ensureVaultOpen(): Promise<any>` → `Promise<duckdb.Database>` — added `throw` at end for exhaustiveness
- `initializeSchema` callback `(e: any)` → `(e: duckdb.DuckDbError | null)` — uses duckdb's canonical error type
- `run(sql, params: any[])` → `params: unknown[]` with internal `as any[]` spread (duckdb variadic requires it)
- `query<T = any>(sql, params: any[])` → `params: unknown[]` — default T kept as `any` to avoid cascades in callers
- `updateRanks` / `updateEdgeTargets` exec callbacks `(e: any)` → `(e: duckdb.DuckDbError | null)`
- `getRawConnection(): Promise<any>` → `Promise<duckdb.Database>`
- `close()` `this.db.close` → `this.db!.close` (null-narrowed by if-guard)
- Added `import type { ConducksComponent }` from registry/types

### Reverted (cascade triggers)
- `load(graph: any)` — kept `any`: accessing `graph.nodeCount()`, `graph.edgeCount()` which don't exist on `ConducksAdjacencyList`; also constructs non-conforming `ConducksEdge` (uses `weight`/`metadata` fields not in the type)
- `saveNodes(nodes: any[])` — kept `any`: accesses `n.name`, `n.filePath` at top-level (not via `n.properties`) — pre-existing structural mismatch
- `saveEdges(edges: any[])` — kept `any`: accesses `e.weight`, `e.metadata` which don't exist on `ConducksEdge`
- `save(graph: any)` — kept `any`: same `nodeCount()`/`edgeCount()` issue

---

## File 2: `src/lib/domain/analysis/orchestrator.ts`

**Starting any count:** 13 occurrences
**Ending any count:** 1

### Fixes applied
- `SynapseRegistry<any>` → `SynapseRegistry<ConducksComponent>` — type already imported
- 6x `} as any` on `addNode` properties objects — removed entirely (unnecessary, tsc was already happy without them)
- `(this.graph as any).flushAndClear(...)` → `this.graph.flushAndClear(...)` (×2) — `flushAndClear` is a real public method on `ConducksGraph`
- `(rel.metadata as any)?.isRaw` / `(rel.metadata as any).specifier` → `rel.metadata?.isRaw` / `rel.metadata.specifier` — `metadata` is typed as `Record<string, any> | undefined` in `PrismSpectrum`
- `results: any[]` → `Array<{ success: boolean; path: string; spectrum?: PrismSpectrum; state?: unknown }>` — added `PrismSpectrum` import from `@/types/prism-types.js`
- `context.registerGlobalSymbol(id, sym as any)` → `sym` (function already takes `metadata: any`)

### Kept (legitimate boundary)
- `const resultChunk = await spawnWorker(chunk as any)` — `spawnWorker` is typed as `(chunk: string[])` but receives `Array<{path, source}>`. The function body JSON-serializes the whole object, not just paths. Fixing requires changing `spawnWorker`'s signature — out of scope for this task.

---

## File 3: `src/lib/domain/intelligence/search-engine.ts`

**No `:any` casts found** — already clean. No changes made.

---

## tsc status
- Before: 0 errors (pre-existing errors in scripts/diagnostics and tests were already present)
- After: 0 errors
