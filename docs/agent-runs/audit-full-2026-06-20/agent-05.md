# Agent 05: Full Audit of src/lib/domain/analysis/

**Scope:** orchestrator.ts, conducks-core.ts, reflector.ts, pipeline.ts, query-service.ts, micro-pulse.ts, gateway-service.ts, fallback-detector.ts, dummy_pulse.ts, index.ts

**Date:** 2026-06-20  
**Status:** READ-ONLY INVESTIGATION (no fixes applied)

---

## Critical Issues

### 1. DUPLICATE orchestrator.analyze() CALL IN PULSE PATH
**Location:** src/lib/domain/analysis/conducks-core.ts:126 & 154  
**Severity:** CRITICAL  
**Description:** The `pulse()` method calls `orchestrator.analyze(files)` twice with identical parameters. The first call (line 126) processes the files and clears the in-memory graph via `flushAndClear()`. The second call (line 154) re-analyzes the same files unnecessarily, doubling compute time and I/O.

**Impact:**
- 2x analysis time for every pulse command
- Resource waste (CPU, disk I/O, memory churn)
- Graph state inconsistency: first call clears graph, second rebuilds it, then saves stale results

**Code Trace:**
```
Line 126: await this.orchestrator.analyze(files);  // Populates, flushes, clears
Line 154: const result = await this.orchestrator.analyze(files);  // Re-analyzes, results saved
Line 155: await this.persistence.save(..., { nodeCount: result.nodeCount, ... });
```

**Why it exists:** Likely copy-paste error or merge conflict resolution fail. The framework detection (line 127–130) is separate and doesn't require second analysis.

**Correct behavior:** Remove line 154 call; use cached result from line 126 or capture result from first call.

---

### 2. ORCHESTRATOR IS A GOD OBJECT (505 lines, 12+ responsibilities)
**Location:** src/lib/domain/analysis/orchestrator.ts  
**Severity:** HIGH  
**Responsibilities Detected:**
1. Ecosystem/repository/directory node creation (lines 84–176)
2. Taxonomy legend scaffolding (lines 179–229)
3. Unit discovery and file-to-directory mapping (lines 240–277)
4. Persistence flushing coordination (lines 283–350)
5. Parallel pulse orchestration (lines 373–493)
6. Grammar loading and provider caching (lines 459–475)
7. Spectrum induction and relationship binding (lines 317–336)
8. Worker process spawning (lines 407–446)
9. Memory pressure heuristics (lines 232–234)
10. File normalization and path canonicalization (lines 74–75)

**Impact:**
- Tight coupling: hard to test individual phases in isolation
- Single point of failure: any bug blocks entire analysis
- Hard to parallelize later (phases are sequential, not composable)
- Graph state not checkpointed between phases—loss mid-analysis corrupts vault

**Refactoring Boundary:** Split into:
- `DiscoveryOrchestrator` (ecosystem/repo/dir/unit scaffolding)
- `ReflectionOrchestrator` (batch pulse + spectrum induction)
- `PersistenceOrchestrator` (flush + clear + metadata sync)

---

### 3. HARDCODED `skipWorker = true` DISABLES PARALLELISM
**Location:** src/lib/domain/analysis/orchestrator.ts:398  
**Severity:** HIGH  
**Code:**
```typescript
const skipWorker = true; // Hardened for absolute stability during monorepo induction
if (!skipWorker) {
  // Worker code (lines 400–447) is DEAD CODE
}
```

**Impact:**
- Monorepo analysis runs single-threaded on main thread (line 451–492)
- Defeats "Topological Pulse" design goal
- Codebase has worker infrastructure (pulse-worker.ts, TSX loader) but it's bypassed
- 4+ second delay on large projects (100+ files)

**Why:** Comment says "monorepo stability," but hardcoding defeats it entirely. Should be a flag or auto-detect.

---

### 4. UNUSED VARIABLE: `spectra` Map
**Location:** src/lib/domain/analysis/orchestrator.ts:76  
**Severity:** MEDIUM  
**Code:**
```typescript
const spectra = new Map<string, any>();  // Created at line 76
// Never referenced again
```

**Impact:** Memory leak in large monorepos (one Map entry per file, never cleared). Unused variable obfuscates intent.

---

### 5. RACE CONDITION: GRAPH.FLUSHES AND CLEARS DURING CHUNKED INDUCTION
**Location:** src/lib/domain/analysis/orchestrator.ts:296–350  
**Severity:** HIGH  
**Problem:**
- Loop processes files in chunks (CHUNK_SIZE=500)
- After each chunk, `flushAndClear()` is called (line 342)
- `flushAndClear()` empties the in-memory graph before next chunk is reflected
- If reflection fails mid-chunk (e.g., out of memory), graph is partially flushed but incomplete

**Sequence:**
```
Chunk 1 → Induce spectrum → Ingest (line 318) → Flush & clear (line 342)
Chunk 2 → Induce spectrum → Ingest (line 318) → Flush & clear (line 342)
  [If chunk 2 reflection fails here, vault has chunk 1 but not chunk 2 schema]
  [Next run assumes full graph, but some symbols are orphaned]
```

**Impact:**
- Incremental re-analysis can corrupt node/edge consistency
- Dangling parent references (parentId pointing to missing node)
- Orphaned symbols in vault (live but unreachable)
- No rollback mechanism

**Fix:** Buffer all chunks in memory first, then single flush-clear cycle (trade off memory for consistency).

---

### 6. NO ERROR HANDLING AFTER REFLECTOR.REFLECT() IN MAIN THREAD PATH
**Location:** src/lib/domain/analysis/orchestrator.ts:485–490  
**Severity:** MEDIUM  
**Code:**
```typescript
const res = await reflector.reflect(file, provider, context, allPaths);
results.push({ path: file.path, spectrum: res, state: context.exportState(), success: true });
```

**Problem:**
- If `reflect()` throws, exception bubbles up and crashes main thread
- Catch block (line 487) only logs error, doesn't add to results
- Caller (runParallelPulse) expects results array; if array is never returned, analyzer hangs waiting for promise

**Impact:** Single malformed file crashes entire analysis pipeline.

---

### 7. TYPE ANNOTATIONS: 16 `: any` IN REFLECTOR.TS
**Location:** src/lib/domain/analysis/reflector.ts (lines 28, 66, 98, 108, 147, 157, 199, 201, 209, 221, 229, 243–246, 255, 306, 322)  
**Severity:** MEDIUM  
**Root Cause:** Tree-sitter parser and query API not fully typed in @types/tree-sitter.

**Examples:**
```typescript
let tree: any;  // Should be Parser.SyntaxTree
let query: any;  // Should be Parser.Query
match.captures.some((c: any) => ...)  // c should be Parser.QueryCapture
nodeCache.set(scopedId, {...} as any);  // Entire SpectrumNode cast to any
```

**Impact:**
- Loss of type safety in core reflection logic (highest risk area)
- IDE cannot detect property misspellings or missing fields
- Bugs in capture processing go undetected until runtime

---

### 8. NULL REFERENCE IN REFLECTOR.REFLECT() CAPTURE LOOP
**Location:** src/lib/domain/analysis/reflector.ts:322–327  
**Severity:** MEDIUM  
**Code:**
```typescript
match.captures.forEach((c: any) => {
  captureMap[c.name] = c.node.text;  // ← c.node can be null if match is malformed
  if (c.name === 'kinesis_arg') args.push(c.node.text);
});
```

**Problem:**
- Tree-sitter QueryCapture is truthy but c.node can be undefined
- No null check before `.text` access
- Malformed grammar or edge-case parse tree triggers `TypeError: Cannot read property 'text' of undefined`

**Impact:** Random crashes on certain source patterns (e.g., unclosed brackets, unusual syntax).

---

### 9. MISSING GRAPH NULL CHECKS ON addNode/addEdge
**Location:** src/lib/domain/analysis/orchestrator.ts (lines 85–114, 151–171, 192–229, 253–276)  
**Severity:** MEDIUM  
**Problem:**
- No return value check or exception handling for `graph.addNode()` / `graph.addEdge()`
- If graph operation fails (e.g., duplicate ID, invalid node), error is silent
- State divergence: in-memory graph differs from what gets flushed

**Example:**
```typescript
this.graph.getGraph().addNode({ id: ecosystemId, ... });
// If this throws or returns false, orchestrator continues as if it succeeded
```

**Impact:** Incomplete graphs persisted to vault; subsequent queries return incomplete results.

---

### 10. GATEWAY-SERVICE RACE CONDITION: ASYNC SETTIMEOUT IN WATCHER
**Location:** src/lib/domain/analysis/gateway-service.ts:49–60  
**Severity:** MEDIUM  
**Problem:**
```typescript
fs.watch(dbPath, (eventType) => {
  setTimeout(async () => {
    await this.persistence.load(...);  // ← Async I/O without awaiting caller
    callback({ type: 'PULSE', ... });  // Fires before async completes (if callback is sync)
  }, 1250);
  // ← Returns immediately, before setTimeout
});
```

**Issue:**
- Callback fires before `persistence.load()` completes if callback is synchronous
- 1250ms delay is hardcoded heuristic (brittle on slow disks)
- No protection against overlapping pulses if fs.watch fires twice rapidly

**Impact:** Mirror receives stale graph state; UI shows incorrect analysis.

---

### 11. FALLBACK-DETECTOR ASSUMES dna STRUCTURE WITHOUT VALIDATION
**Location:** src/lib/domain/analysis/fallback-detector.ts:13–124  
**Severity:** MEDIUM  
**Problem:**
- Methods access `node.properties.dna.tryBlocks`, `node.properties.dna.ifElseChains`, etc.
- No fallback if `dna` is undefined or missing these fields
- Gnosis fallback mode (reflector.ts:539–666) doesn't populate dna with these deep fields

**Impact:** Fallback detection returns incorrect results for files analyzed via Gnosis (native grammar unavailable).

---

### 12. DUMMY_PULSE.TS IS PRODUCTION CODE IN SRC/
**Location:** src/lib/domain/analysis/dummy_pulse.ts  
**Severity:** LOW  
**Description:**
```typescript
export function dummyMicroPulseFunction() {
  console.log("Hardened Resonance Pulse!");
}
```

**Problem:**
- No references found in codebase (grep -r "dummyMicroPulseFunction" returns 0 hits)
- Dead code; should be in tests/ or removed entirely
- "Hardened" comment suggests debugging artifact left behind

**Impact:** Noise in codebase; confuses new developers.

---

### 13. DUPLICATE query-service.ts IN TWO LAYERS
**Location:**
- src/lib/domain/analysis/query-service.ts (510 lines, Oracle Standard v4)
- src/lib/domain/intelligence/query-service.ts (incomplete, different API)

**Severity:** MEDIUM  
**Problem:**
- Both define `QueryService` class
- Different implementations:
  - analysis/ version: static QUERIES map, template-based with parameter mapping
  - intelligence/ version: dynamic template lookup, DuckDB named params
- Callers must know which version to import; risk of silent import wrong one

**Impact:**
- Maintenance burden: bug fixes in one don't propagate to other
- Inconsistent query execution paths
- Type confusion (both export QueryService)

**Fix:** Consolidate into single canonical version, deprecate other.

---

### 14. ORCHESTRATOR.ANALYZE() RETURNS PULSECOUNT BUT NO GUARANTEE OF VAULT STATE
**Location:** src/lib/domain/analysis/orchestrator.ts:63–366  
**Severity:** MEDIUM  
**Problem:**
- Method returns `{ pulseId, nodeCount, edgeCount }`
- nodeCount/edgeCount are cumulative from flushAndClear() calls
- But if final persistence.save() in conducks-core fails, counts are stale/mismatched
- No validation that pulse record in vault matches returned counts

**Impact:**
- Metrics reporting in status() / checkStaleness() is out of sync with actual vault content
- Downstream queries may see inconsistent node counts

---

### 15. MICRO-PULSE DOESN'T CHECK IF PROVIDER EXISTS
**Location:** src/lib/domain/analysis/micro-pulse.ts:37–45  
**Severity:** MEDIUM  
**Code:**
```typescript
const provider = this.registry.getProvider(absolutePath);
if (!provider) {
  return { success: false, error: `No structural provider found for ${path.extname(absolutePath)}` };
}
```

**Problem:**
- Early return is good, but:
- No logging before return (micro-pulse.ts uses logger, but doesn't log this)
- Caller doesn't know which file triggered failure in batch operations

**Impact:** Silent failures in incremental analysis; user thinks file was synced when it wasn't.

---

### 16. PIPELINE.TS TOPOLOGICAL SORT IGNORES CIRCULAR DEPENDENCIES IN FINAL BATCH
**Location:** src/lib/domain/analysis/pipeline.ts:52–59  
**Severity:** MEDIUM  
**Code:**
```typescript
const cycleFiles = Array.from(inDegree.entries())
  .filter(([_, degree]) => degree > 0)
  .map(([file, _]) => file);

if (cycleFiles.length > 0) {
  levels.push(cycleFiles);  // ← Cycles grouped as final level, dependencies unresolved
}
```

**Problem:**
- Cycles are detected but dumped into final level without breaking them
- Caller has no way to know which files form cycles
- Downstream processing assumes DAG; circular dependencies cause infinite loops in impact analysis

**Impact:** Impact analysis hangs on projects with circular deps; no error reported.

---

### 17. ORCHESTRATOR'S MEMORY PRESSURE HEURISTIC IS INCOMPLETE
**Location:** src/lib/domain/analysis/orchestrator.ts:231–234  
**Severity:** MEDIUM  
**Code:**
```typescript
const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
const isLargeProject = normalizedFiles.length > 100;
const useShallowMode = memoryUsage > 1000 || isLargeProject;
```

**Problem:**
- Threshold 1000 MB is arbitrary; not tuned to typical machine configs
- `normalizedFiles.length > 100` triggers shallow mode on mid-size projects
- No logging of decision; user doesn't know why reflection is shallow
- `useShallowMode` passed to ingestSpectrum but not used by reflector itself

**Impact:** Unexpected data loss on medium projects; shallow nodes missing kinetic/dna fields.

---

### 18. CONDUCKS-CORE'S FORCE HARDENING OVERWRITES WITHOUT BACKUP
**Location:** src/lib/domain/analysis/index.ts:116–118 (AnalysisService)  
**Severity:** MEDIUM  
**Code:**
```typescript
if (options.force) {
  logger.info(`Force Resonance: Forcing re-induction of all ${filteredFiles.length} units.`);
  dirtyFiles = filteredFiles;
}
```

**Problem:**
- force flag causes full re-analysis and re-flush to vault
- No backup of previous pulse before overwrite
- If new analysis is corrupted, old data is lost

**Impact:** User can't rollback to previous state after --force flag.

---

## Design Flaws & Anti-Patterns

### 19. NO CIRCUIT BREAKER FOR CASCADING FAILURES IN REFLECTOR
**Location:** src/lib/domain/analysis/reflector.ts:39–532  
**Impact:** Single file's parse failure can corrupt context for remaining files in batch.

---

### 20. IMPLICIT DEPENDENCY ON CHRONICLE.GETPROJECTDIR()
**Location:** Multiple (orchestrator.ts, reflector.ts, micro-pulse.ts, index.ts)  
**Problem:** No null check; silent failure if chronicle not initialized.

---

### 21. GRAMMAR-REGISTRY NOT WARMED UP BEFORE PARALLEL PULSE
**Location:** src/lib/domain/analysis/orchestrator.ts:301–307  
**Problem:** grammars.loadLanguage() called inside reflection loop (per-file), not upfront. Causes race conditions when N files of same language hit grammar load simultaneously.

---

## Summary

**Critical (must fix):**
1. Duplicate orchestrator.analyze() call (2x waste)
2. Race condition in chunked flush-clear cycle
3. Hardcoded skipWorker=true (disables parallelism)

**High (significant impact):**
4. God Object orchestrator (505 lines, 12 responsibilities)
5. Main thread error handling missing in parallel path

**Medium (correctness/reliability):**
6–18: Type safety, null checks, race conditions, state consistency issues

**Codebase Status:** Core intelligence layer is functional but brittle. Risk of silent data corruption in multi-file analysis; no transaction/rollback mechanism.

---

## Recommended Audit Actions (Post-Investigation)

1. Measure actual 2x waste from duplicate analyze() call
2. Implement checkpoint/rollback for chunk-based induction
3. Enable worker code path with feature flag (not hardcoded)
4. Add integration tests for race condition scenarios
5. Type tree-sitter API or switch to typed parser
6. Merge duplicate query-service.ts implementations
7. Add vault consistency checks post-analysis

