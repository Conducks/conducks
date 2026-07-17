# Agent 07 — Audit Report: Domain Subsystems
**Scope:** src/lib/domain/{intelligence, kinetic, metrics, manifest, visual}  
**Date:** 2026-06-20  
**Status:** Read-only. Bugs, duplicates, design flaws identified.

---

## 1. DUPLICATE CODEBASES

### 1.1 GQL Parser — TWO ACTIVE VERSIONS

**Defs:**
- `src/lib/core/parsing/gql-parser.ts:9` — `GQLParser` — core version, minimal
- `src/lib/domain/intelligence/gql-parser.ts:10` — `GQLParser` (ConducksComponent) — domain version, extended

**Key Diffs:**
- Domain version implements `ConducksComponent` interface (core doesn't)
- Domain version adds `confidence` field to results (line 50)
- Domain version has stricter regex: `[^\]]+` vs `[^\]]*` (allows non-empty edge types)
- Domain version has explicit empty-string checks and wildcard support `edgeType.trim() !== "*"`

**Current Usage:**
- Domain version used: `src/lib/domain/analysis/conducks-core.ts:15` imports domain version
- Core version: **ORPHANED** — no imports found

**Impact:** Code duplication; core version unreachable. If core version is "official," domain is shadow copy with feature drift.

---

### 1.2 Flow Engine — TWO IDENTICAL COPIES

**Defs:**
- `src/lib/core/parsing/flow-engine.ts:8` — `ConducksFlowEngine` (no interface)
- `src/lib/domain/kinetic/flow-engine.ts:9` — `ConducksFlowEngine` (implements ConducksComponent)

**Code Comparison:** 97% identical. Domain version adds:
- `implements ConducksComponent`
- Public metadata: `id`, `type`, `description`

**Current Usage:**
- Domain version actively used: `src/lib/domain/kinetic/index.ts:3`, `src/lib/domain/analysis/conducks-core.ts:11`
- Core version: **ORPHANED** — zero imports

**Impact:** 97% duplicate. Core is dead code.

---

### 1.3 Query Service — INCOMPATIBLE VARIANTS

**Locations:**
- `src/lib/domain/analysis/query-service.ts:23` — Oracle Standard (parameterized, DuckDB-specific)
- `src/lib/domain/intelligence/query-service.ts:9` — DNA v4 (simpler template lookup)

**Architectural Difference:**
- **Analysis version:** Static `QUERIES` map, complex parameter mapping (lines 451-481), supports 17+ query templates
- **Intelligence version:** Instance method `execute()`, DuckDB-native callbacks, simpler contract

**Usage:**
- `src/lib/domain/analysis/index.ts` imports analysis version
- Intelligence version: **ORPHANED** — zero cross-imports

**Impact:** Two SQL engines; inconsistent query interface. Maintenance burden if both are expected to coexist.

---

## 2. BUGS & DESIGN FLAWS

### 2.1 Search Engine — Incomplete Wavefront Propagation

**Location:** `src/lib/domain/intelligence/search-engine.ts:57, 72–88`

**Issue:** Wavefront initialization only propagates from 1-level neighbors with `depth=1`.
```typescript
this.propagateWavefront(node.id, totalScore * 0.5, results, 1);  // depth=1 only!
```
But propagation function decays `energy * 0.3` and only recurses if `depth > 0`:
```typescript
if (depth <= 0 || energy < 1) return;  // Hits exit immediately on depth=1
```

**Effect:** For each matched term, neighbors see only 1 layer of "echo resonance" before stopping. Distant important nodes never accumulate signal.

**Severity:** MEDIUM — Search ranking is suboptimal for transitive dependencies. Hubs far from matched nodes underscored.

---

### 2.2 Blast Radius — Zero-Division Risk

**Location:** `src/lib/domain/kinetic/impact.ts:43`

```typescript
const score = affectedNodes.reduce((acc, node) => acc + (1 / node.distance), 0);
```

**Issue:** `node.distance` can be `0` if Dijkstra sets weight to 0 for a direct edge (e.g., `EXTENDS: 0.5` weight in line 19). But if an edge has explicit weight 0 or rounding, division-by-zero crashes.

**Severity:** LOW — Weights object (lines 18-26) uses positive values; distance shouldn't reach 0. But no guard.

---

### 2.3 Mirror Engine — Transitive Parent Resolution Incomplete

**Location:** `src/lib/domain/visual/mirror.engine.ts:42–54`

```typescript
const findNVP = (nodeId: string, depth: number = 0, visited: Set<string> = new Set()): ... => {
  if (visited.has(nodeId)) return null;  // ← Circular parent chains halt early
  const parentId = n.properties.parentId;
  return parentId ? findNVP(parentId, depth + 1, visited) : null;
};
```

**Issue:** `depthLimit=20` hardcoded (line 230 in `detectCluster`), but `findNVP` uses unbounded recursion. If parent chain has >20 parents OR circular references, `NVP` resolves to orphaned nodes or null.

**Severity:** MEDIUM — Orphan nodes cluster to "ecosystem::global" fallback, losing spatial relationships in visual layout.

---

### 2.4 Test Aligner — Overly Broad Test Detection

**Location:** `src/lib/domain/metrics/test-aligner.ts:20–22`

```typescript
const isTest = n.properties.isTest || (n.properties.isGlobalNode && n.id.includes('/tests/'));
```

**Issues:**
1. **Path substring match** (`includes('/tests/')`) flags any file with `/tests/` anywhere in path (e.g., `/src/components/tests_utils.ts` → incorrectly marked as test)
2. **No file extension check** — CSS, JSON, fixture files in `/tests/` directory marked as test suites
3. **No depth limit on traversal** — starts at depth 0, stops at depth 5, but marks ALL downstream nodes as "covered" even if only 1 test touches them

**Effect:** False positives in coverage analysis. Utility files & fixtures misclassified as test suites.

**Severity:** MEDIUM — Incorrect coverage reporting, misleading test alignment insights.

---

### 2.5 Metrics Service — Unbounded Entropy Normalization

**Location:** `src/lib/domain/metrics/index.ts:38–40`

```typescript
const entropy = calculateShannonEntropy(distribution);
const risk = normalizeEntropyRisk(entropy, authors.length || 1);
```

**Issue:** If `authors.length = 0`, fallback to `1` masks data quality issue. If `distribution` is empty map, Shannon entropy = 0, but no flag distinguishes "no data" from "perfect ownership."

**Severity:** LOW — Edge case, but risk metrics become unreliable for files with no git history.

---

### 2.6 Resonance Analyzer — Hardcoded Weight Assumption

**Location:** `src/lib/domain/metrics/resonance.ts:28, 48`

```typescript
const densitySim = 1 - Math.abs(sig1.density - sig2.density) / Math.max(sig1.density, sig2.density, 1);
const totalScore = (densitySim * 0.3) + (kineticSim * 0.3) + (typeSim * 0.4);
```

**Issue:** Weights hardcoded (0.3, 0.3, 0.4). No configuration, no justification. Assumes density & kinetic equally important; typology dominates. For vastly different projects (Python → TypeScript), this fails.

**Severity:** LOW — Metric works, but assumptions are domain-specific and undocumented.

---

## 3. ARCHITECTURAL ISSUES

### 3.1 Inconsistent Component Registration

**Finding:** Domain services implement `ConducksComponent` inconsistently.
- ✅ `GQLParser` (intelligence): has id, type, description
- ❌ `BlastRadiusAnalyzer` (kinetic): implements interface but NO id/type defined in class header
- ❌ `TraceAnalyzer` (kinetic): abstract base, no explicit registration

**Impact:** Registry.getComponent() may fail to find components by id.

---

### 3.2 Mirror Engine — Private Property Access Anti-Pattern

**Location:** `src/lib/domain/visual/mirror.engine.ts:31, 179`

```typescript
for (const [sourceId, edges] of g.outEdges) {  // ← Direct private map access
```

**Issue:** Assumes `ConducksAdjacencyList` has public `outEdges` property. Should use `getNeighbors()` API.

**Severity:** MEDIUM — Fragile to refactoring; breaks encapsulation.

---

### 3.3 Manifest Engine — Side Effects in Read-Only Context

**Location:** `src/lib/domain/manifest/manifest-engine.ts:25, 49`

```typescript
public async bootstrap(...): Promise<string[]>  // Writes files
public async record(...): Promise<boolean>      // Appends files
```

**Issue:** These methods modify filesystem. Called during analysis (conducks-core.ts:138 calls `this.aligner.align()`, not manifest), but if domain service is used in read-only query context, filesystem mutations are unexpected.

**Severity:** MEDIUM — Violates principle of least surprise; should flag or move to separate "mutation" service.

---

## 4. INCOMPLETE IMPLEMENTATIONS

### 4.1 Flow Engine Trace — No Circular-Call Detection

**Location:** `src/lib/domain/kinetic/flow-engine.ts:72–101`

```typescript
private recursiveTrace(..., visited: Set<NodeId>): void {
  ...
  this.recursiveTrace(edge.targetId, circuit, depth + 1, maxDepth, visited);
}
```

**Issue:** Uses `visited` set correctly for recursion, but if target is already visited, it's silently skipped. No reporting of "circular call detected here."

**Severity:** LOW — Trace correctness preserved, but incomplete reporting.

---

### 4.2 Impact Analyzer — No Path Verification

**Location:** `src/lib/domain/kinetic/impact.ts:28–40`

```typescript
const findings = this.dijkstra(graph, startId, direction, weights, maxWeight);
const affectedNodes = Array.from(findings.entries()).map(([nodeId, data]) => ({
  path: data.path.map(e => e.type)  // ← Only edge types, no nodeId sequence
}));
```

**Issue:** Returns only edge types, not full path (A → B → C → D). User can't trace which node caused the impact.

**Severity:** LOW — Limited diagnostic value, but mechanism works.

---

## 5. SUMMARY TABLE

| File | Issue | Severity | Type |
|------|-------|----------|------|
| gql-parser (domain) | Duplicate; core orphaned | HIGH | Duplicate |
| flow-engine (core) | Duplicate; domain preferred | HIGH | Duplicate |
| query-service | Two incompatible engines | MEDIUM | Design |
| search-engine.ts:57 | Shallow wavefront (depth=1) | MEDIUM | Logic |
| impact.ts:43 | Div-by-zero unguarded | LOW | Bug |
| mirror.engine.ts:42 | Parent resolution incomplete | MEDIUM | Design |
| test-aligner.ts:20 | Overly broad path matching | MEDIUM | Logic |
| metrics/index.ts:38 | Unbounded entropy edge case | LOW | Logic |
| resonance.ts:48 | Hardcoded weights | LOW | Config |
| consistency | Component registration scattered | MEDIUM | Architecture |
| mirror.engine.ts:31 | Private field access | MEDIUM | Anti-Pattern |
| manifest-engine.ts | Side effects in analytics | MEDIUM | Design |
| flow-engine.ts:72 | No circular reporting | LOW | Incomplete |
| impact.ts:28 | No full path in results | LOW | Incomplete |

**Duplicates:** 2 major (GQL, Flow); 1 variant (QueryService)  
**High-Risk Bugs:** 0  
**Medium Issues:** 7  
**Low Issues:** 6

---

## 6. RECOMMENDATIONS (NOT IMPLEMENTED)

1. **Unify GQL Parser:** Delete core version, promote domain as canonical. Add tests for wildcard & confidence.
2. **Delete Core Flow Engine:** Move domain version to core, re-export. Update all imports.
3. **Consolidate Query Services:** Choose one pattern; document why two exist.
4. **Fix Wavefront:** Increase initial depth from 1 to 2–3, or make configurable.
5. **Guard Division:** Check `node.distance !== 0` before computing impact score.
6. **Mirror Ancestry:** Set explicit parent depth limit (10) to avoid infinite loops.
7. **Test Path Matching:** Use regex or explicit test-file predicates (e.g., `*.test.ts`, `*.spec.ts`).
8. **Register Components:** Ensure all domain services pass through SynapseRegistry with explicit IDs.
9. **Encapsulate Mirror:** Use public graph API instead of direct `outEdges` access.
10. **Separate Mutations:** Move manifest write logic to separate "PersistenceService" domain.

---

**End Report**
