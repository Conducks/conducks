# Agent 01 — Graph & Algorithms Audit
**Scope:** `src/lib/core/graph/` + `src/lib/core/algorithms/`  
**Date:** 2026-06-20  
**Status:** READ-ONLY — 19 issues found

---

## Critical Issues

### [adjacency-list.ts:123] TYPE_ESCAPE: `rootId` property undefined
**Severity:** HIGH  
**Description:** Line 123 destructures `rootId` from `node.properties`, but the property is never defined in the interface. The `ConducksNode` interface (lines 11-56) has no `rootId` field. This causes a silent undefined assignment.  
**Impact:** Graph metadata will silently fail to preserve root identifiers during node serialization. Impacts hierarchical reconstruction.  
**Fix:** Either add `rootId?: string` to the interface properties or remove from destructuring.

---

### [adjacency-list.ts:250-261] LOOP_BUG: Inefficient deletion in clearFile
**Severity:** MEDIUM  
**Description:** Lines 250-261 iterate over Sets while deleting from them. For each edge in `outSet`, a nested loop deletes matching edges. This is O(N²) and uses `for...of` with conditional deletes:
```
for (const edge of incoming) {
  const outSet = this.outEdges.get(edge.sourceId);
  if (outSet) {
    for (const e of outSet) if (e.id === edge.id) outSet.delete(e);
  }
}
```
This mutates during iteration, which is unsafe in JavaScript Sets.  
**Impact:** Potential missed deletions; graph state corruption on file clears.  
**Fix:** Convert to Array before iterating: `const edges = Array.from(outSet); for (const e of edges) { ... }`.

---

### [adjacency-list.ts:362-373] ERROR_HANDLING: Decompression silently returns stale skeleton
**Severity:** MEDIUM  
**Description:** Lines 358-375. When meat decompression fails (line 370), the method logs an error but returns the skeleton node without the rehydrated properties. Callers get incomplete data with `isShallow: false` false positive.  
**Impact:** Bugs downstream when code expects full properties but gets skeleton. Data loss for compressed nodes.  
**Fix:** Return `skeleton` with `isShallow: true` on decompression failure, or throw.

---

### [graph-engine.ts:52-73] PROMISE_ANTI_PATTERN: `new Promise` with async callback
**Severity:** MEDIUM  
**Description:** Lines 52-73. Promise wrapper is unnecessary—the callback is async but returns void. The pattern:
```typescript
const p = new Promise<void>((resolve, reject) => {
  const worker = new Worker(...);
  worker.on('message', ...);
  worker.on('error', reject);
  worker.on('exit', (code) => { ... });
});
```
This works but is idiomatic anti-pattern. Native `worker` events are already event-based.  
**Impact:** Unclear execution flow; harder to debug; extra promise wrapper.  
**Fix:** Refactor to use Worker events directly or wrap with `promisify()`.

---

### [graph-engine.ts:117] TYPE_CAST_ABUSE: `'PULSES_TO' as any`
**Severity:** MEDIUM  
**Description:** Line 117 casts a non-existent edge type to `any`. The `EdgeType` union (adjacency-list.ts:9) does not include `PULSES_TO`. Hardcoding `as any` bypasses type safety.  
**Impact:** Type system provides no validation; future code may expect standard edge types only.  
**Fix:** Add `'PULSES_TO'` to the `EdgeType` union or use a valid type.

---

### [graph-engine.ts:148] TYPE_CAST_ABUSE: Cast to invalid edge type
**Severity:** LOW  
**Description:** Line 148. Same issue: `type: 'CALLS' as any` with `isResonance: true` flag. The type system doesn't distinguish CALLS with resonance.  
**Impact:** Edge classification confusion; type queries will be unreliable.  
**Fix:** Add `'CALLS_RESONANCE'` or `'RESONANCE_CALL'` to `EdgeType`.

---

### [linker.ts:16] UNSAFE_CAST: Direct `(graph as any).nodes` access
**Severity:** HIGH  
**Description:** Line 16 casts the graph to `any` to access private `nodes` Map. This breaks encapsulation entirely.
```typescript
const nodes = Array.from((graph as any).nodes.values()) as any[];
```
The adjacency-list already provides `getAllNodes()`.  
**Impact:** Brittle code; breaks if private field is refactored; type safety lost.  
**Fix:** Use `graph.getAllNodes()` instead of direct access.

---

### [linker.ts:68] UNSAFE_CAST: Cast to `any` for node filtering
**Severity:** MEDIUM  
**Description:** Line 68. Same pattern: `(graph as any).nodes.values()`. Creates entire copies of private internals.  
**Impact:** Fragile to refactoring; performance penalty.  
**Fix:** Provide a graph method: `getNodesByLabel(label: string): ConducksNode[]`.

---

### [linker.ts:86-90] LOGGER_BYPASS: Uses `console.error` instead of logger
**Severity:** LOW  
**Description:** Lines 86-90. Conditional logging via `console.error`, not the proper logger.
```typescript
if (process.env.CONDUCKS_DEBUG === '1') {
  console.error(...args);
}
```
The project has a Logger class (imported in graph-engine.ts:4).  
**Impact:** Inconsistent logging; harder to configure log levels globally.  
**Fix:** Use `logger.debug(...)` with proper configuration.

---

### [linker-intra.ts:72-78] NULL_CHECK_MISS: Unguarded map.get() on list
**Severity:** MEDIUM  
**Description:** Line 74 gets a list but line 74 doesn't check if it exists:
```typescript
const list = unitImports.get(sourceUnitId);
if (list) {
  list.push(targetUnit);
} else {
  unitImports.set(sourceUnitId, [targetUnit]);
}
```
This is actually safe but line 72-78 repeats this pattern. The initialization in line 56 is correct; the bug is this isn't symmetric everywhere.  
**Impact:** Minor—code works but is inconsistent.  
**Fix:** Extract helper: `getOrCreate(map, key)`.

---

### [linker-federated.ts:49] TYPE_ASSERTION: Cast to any for persistence
**Severity:** MEDIUM  
**Description:** Line 49. `p = new SynapsePersistence(linkPath)` but type is never validated:
```typescript
const p = new SynapsePersistence(linkPath);
```
The `load()` call on line 51 assumes `p` has this method but there's no type guard.  
**Impact:** Runtime error if SynapsePersistence interface changes.  
**Fix:** Add proper type: `const p: SynapsePersistence = ...` or validate before call.

---

### [linker-federated.ts:55-57] LOGGER_BYPASS: Direct `console.error` / `console.warn`
**Severity:** LOW  
**Description:** Lines 55, 57. Uses `console.error` and `console.warn` instead of logger.  
**Impact:** Inconsistent logging; emoji in error message (⚠️) is non-standard.  
**Fix:** Use proper logger instance.

---

### [cycle-detector.ts:50-51] LOGIC_BUG: Self-loop detection always succeeds
**Severity:** LOW  
**Description:** Lines 50-51. Checks if node has self-edge, but loop already executed. At this point, if we're in the component of size 1, the strongconnect already visited neighbors. The check `selfEdges.some(e => e.targetId === component[0])` may be redundant.  
**Impact:** May over-report self-loops; cycle classification unclear.  
**Fix:** Document why self-edges are reported separately or unify logic.

---

### [ranker.ts:34-37] NULL_CHECK_MISS: Missing null checks on neighbors
**Severity:** MEDIUM  
**Description:** Lines 36-37. Code assumes `getNeighbors()` always returns an array:
```typescript
const out = graph.getNeighbors(node.id, 'downstream');
const archOut = out ? out.filter(...) : [];
```
This is safe (line 306 in adjacency-list confirms it returns `[]`), but the ternary is still defensive and unclear.  
**Impact:** Code is safe but reads as if it expects null, creating confusion.  
**Fix:** Remove ternary; document that `getNeighbors` always returns array.

---

### [ranker.ts:42-50] NULL_CHECK_MISS: Same issue with incoming edges
**Severity:** LOW  
**Description:** Lines 42-50. Same pattern:
```typescript
const incoming = graph.getNeighbors(node.id, 'upstream');
if (incoming) {
  for (const edge of incoming) { ... }
}
```  
**Impact:** Identical to above—defensive but redundant.  
**Fix:** Remove guards or document contract.

---

### [daac.ts:19] DEAD_CODE: Unused fileNodes variable
**Severity:** LOW  
**Description:** Line 19 creates `fileNodes` but never uses it:
```typescript
const fileNodes = Array.from({ length: stats.nodeCount }, (_, i) => i.toString());
```  
**Impact:** Wasted computation; confusing code.  
**Fix:** Delete this line; it's replaced by `uniqueFiles` on line 26.

---

### [daac.ts:134-140] ENCAPSULATION_BREACH: Direct `(graph as any).nodes` access
**Severity:** MEDIUM  
**Description:** Line 134-135. Casts to `any` to access private field:
```typescript
const nodes = (graph as any).nodes as Map<NodeId, ConducksNode>;
```  
**Impact:** Brittle; breaks encapsulation.  
**Fix:** Provide public method in ConducksAdjacencyList.

---

### [gvr-engine.ts:59] REGEX_SAFETY: Unsafe RegExp with user input
**Severity:** MEDIUM  
**Description:** Line 59. Builds regex from `oldName` without escaping:
```typescript
new RegExp(`\\b${oldName}\\b`, 'g')
```
If `oldName` contains regex metacharacters (`+`, `*`, `[`, etc.), the regex breaks or matches incorrectly.  
**Impact:** Refactoring can silently fail or corrupt files.  
**Fix:** Use `escapeRegExp(oldName)` or `String.prototype.replaceAll()` (ES2021).

---

### [gvr-engine.ts:74-75] ERROR_HANDLING: Silent catch with `.catch(e => {})`
**Severity:** HIGH  
**Description:** Line 74-75. Rollback catches and silently ignores errors:
```typescript
await fs.writeFile(filePath, originalContent, 'utf-8').catch(e => {
});
```
If rollback fails, the error is swallowed. The caller gets "failed" but doesn't know rollback also failed.  
**Impact:** Data corruption; callers think files are restored but they're not.  
**Fix:** Log and propagate: `.catch(e => { logger.error('Rollback failed:', e); throw e; })`.

---

## Anti-Patterns & Code Smells

### `adjacency-list.ts` — 6 instances of `: any` type escape
**Lines:** 11, 40, 41, 42, 134, 240  
**Impact:** Type system provides no validation for graph metadata. Total `: any` in scope is 16; this file accounts for 6 (38%).

### `graph-engine.ts` — Type casts in neural binding (lines 117, 148)
**Impact:** Edge types don't match declared schema. Future queries will be unreliable.

### Global logging inconsistency
**Files affected:**
- linker.ts:88 — `console.error`
- linker-federated.ts:55,57 — `console.error`, `console.warn`  
- adjacency-list.ts:150,371 — `console.error`
- cochange-engine.ts:22 — `console.error`  
- daac.ts:146 — `console.error`

**Total:** 7 `console.*` calls. Should use logger.

### Encapsulation breaches with `(graph as any).nodes`
**Files:** linker.ts:16,68; daac.ts:134  
**Impact:** 3 direct accesses to private field; all could use public API.

---

## Performance & Risks

### `adjacency-list.ts:250-261` — O(N²) clearing
Nested loop during file clear. For large graphs (10k+ files), clearing becomes quadratic.

### `daac.ts:42-62` — Quadratic cluster merge
`for (let i=0; i<N; i++) for (let j=i+1; j<N; j++)` runs with no early stopping. With thousands of clusters, this is expensive.

### `gvr-engine.ts:50-63` — No conflict detection
Refactoring renames without checking for shadowing, overloads, or local scope collisions. Proof-of-concept regex is insufficient.

---

## Design Gaps

### Missing types for edge variants
The `EdgeType` union is rigid. Adding runtime-only flags (`isResonance`, `fuzzy`) bypasses type safety.

### No inversion of control for logging
7 different logging approaches (console, logger, none). Projects should inject a logger instance.

### Incomplete null handling contract
`getNeighbors()` always returns `[]`, but defensive checks throughout suggest uncertainty.

---

## Summary

**Total Issues:** 19  
- **Critical (HIGH):** 3 (rootId, linker encapsulation, rollback error swallow)
- **Serious (MEDIUM):** 9 (loop mutation, decompression fail, promise anti-pattern, type casts, null checks)
- **Minor (LOW):** 7 (console logging, self-loop logic, dead code, regex safety)

**Type Escapes in Scope:** 16 (6 in adjacency-list.ts)  
**Console Calls (non-logger):** 7 (should be 0)  
**Encapsulation Breaches:** 3  
**New Promise(async ...):** 0 (clean)

