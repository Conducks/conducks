# Deep Audit: Graph Ingestion Pipeline & Linker Integration

**Audit Date:** 2026-06-20  
**Scope:** End-to-end flow from reflection → spectrum ingestion → node/edge storage → resolution  
**Tool:** Manual code analysis (caveman-ultra read-only mode)

---

## Executive Summary

The Conducks graph pipeline has **critical gaps in cross-file symbol resolution**. Raw imports (`isRaw: true`) created during reflection are manually resolved by `orchestrator.analyze()` but **only at the unit/file level**, NOT at the symbol level. The `GlobalSymbolLinker` exists but is **never called**. Intra-file bare symbols are deferred to `IntraLinker.resolve()` which runs **after the full graph loads from the vault**, making it unable to detect duplicates during streaming.

**Impact:** High. Bare symbols that depend on batch ordering can create multiple nodes with the same logical identity, breaking graph invariants.

---

## Issue Breakdown

### 1. Raw Import Resolution Flow — PARTIAL CORRECTNESS

**Path:** `orchestrator.ts:320–336`

Raw imports (`isRaw: true`) are handled in the spectrum processing loop:

```typescript
if (rel.type === 'IMPORTS' && (rel.metadata as any)?.isRaw) {
  const specifier = (rel.metadata as any).specifier;
  const linkage = this.reflector.imports.link(specifier, res.path, allPaths, undefined, context);
  if (linkage) {
    this.graph.getGraph().addEdge({
      id: `NEURAL::${unitId}->${linkage.targetId}`,
      sourceId: unitId,
      targetId: linkage.targetId.includes('::') ? linkage.targetId : `${linkage.targetId}::unit`,
      type: linkage.type,
      confidence: 1.0,
      properties: { specifier }
    });
  }
}
```

**Status:** ✓ Raw imports ARE resolved (lines 322–336)

**BUT:** Resolution is **file-level only** (targets are `${path}::unit`, NOT `${path}::symbolname`).

**Example:**
- Specifier: `'./utils'` from `src/foo.ts`
- Result: Edge to `src/utils.ts::unit`
- Missing: What if `utils.ts` exports `logError()`? The caller wants to link to `src/utils.ts::logerror`, not the file itself.

**Severity:** MEDIUM — Imports resolve to files correctly, but symbol-level resolution is deferred.

---

### 2. Spectrum Relationships Processing — SILENT SKIP

**Path:** `graph-engine.ts:210–242` (Pass 2: Ingest Local Relationships)

```typescript
for (const rel of spectrum.relationships) {
  // IMPORTS are skipped here; handled by Pass 3 in Orchestrator for high-fidelity resolution.
  if (rel.type === 'IMPORTS') continue; 
  if (rel.type === 'MEMBER_OF') continue; 
  // ... handle CALLS, CONSTRUCTS, etc.
}
```

**Status:** ✓ Correct — IMPORTS are explicitly excluded to prevent duplication.

**But:** All other relationships (`CALLS`, `CONSTRUCTS`, `ACCESSES`, `TYPE_REFERENCE`) are ingested locally with BARE targetNames.

**Issue:** Lines 216–232 attempt smart resolution:

```typescript
let targetId = rel.targetName.toLowerCase();
if (!targetId.includes('::')) {
  const localCandidate = `${filePath}::${targetId}`;
  if (this.graph.hasNode(localCandidate)) {
    targetId = localCandidate;
  }
} else if (targetId.startsWith('/') || targetId.includes('\\')) {
  if (!this.graph.hasNode(targetId)) {
    targetId = targetId.split('::').pop()!;
  }
}
```

**The Problem:**
- If `fileA.ts` calls `doWork()` defined in `fileB.ts` (same batch):
  - `fileB.ts` processes first → `doWork` node created: `fileB::dowork`
  - `fileA.ts` processes second → edge created to `fileA::dowork` (local candidate) — WRONG
- **Batch ordering determines correctness.**

**Severity:** HIGH — Cross-file CALLS/CONSTRUCTS can target wrong nodes if files process out of dependency order.

---

### 3. GlobalSymbolLinker — DECLARED BUT NEVER CALLED

**Path:** `linker.ts`, `conducks-core.ts:56`, analysis/index.ts

**Evidence:**

- `linker.ts` exports `GlobalSymbolLinker` class.
- `conducks-core.ts` declares: `private linker = new GlobalSymbolLinker();`
- **NEVER CALLED** — no `this.linker.link()` anywhere in the codebase.

**grep results:**
```
src/lib/domain/analysis/conducks-core.ts:  private linker = new GlobalSymbolLinker();
```

No calls. The linker is unused dead code.

**Severity:** CRITICAL — Import node resolution logic exists but is unreachable.

---

### 4. IntraLinker — RUNS AFTER VAULT LOAD

**Path:** `analysis/index.ts:176–178`

```typescript
const intraLinker = new IntraLinker();
const resolvedEdges = intraLinker.resolve(this.graph.getGraph());
await this.persistence.updateEdgeTargets(resolvedEdges);
```

**Timing:** After `persistence.load()` (line 161), so the full graph is in RAM.

**What it does (linker-intra.ts:33–117):**
1. Builds `unitId → symbol name → nodeId` lookup (line 34–50)
2. Builds source → imported units map from IMPORTS edges (line 55–80)
3. For each unresolved edge (bare targetId), searches:
   - Same file first
   - Then imported files in dependency order

**Correctness:** ✓ HIGH — Works because all nodes exist.

**But:** Cannot detect duplicates created during streaming.

**Example scenario:**
1. Batch 1 processes `fileA.ts` → creates edge `fileA::caller → dowork`
2. Batch 1 processes `fileB.ts` → creates node `fileB::dowork`
3. IntraLinker later resolves the edge to `fileB::dowork` ✓
4. But if batch 2 is processed **before** batch 1 completes:
   - Edge to bare `dowork` might resolve to `fileC::dowork` (wrong file)
   - Later IntraLinker can't know a better resolution exists

**Severity:** MEDIUM — Batching hides ordering issues, but they can still occur.

---

### 5. Node Deduplication — MISSING

**Path:** `graph-engine.ts:169–207` (ingestSpectrum), `adjacency-list.ts:99–163` (addNode)

**Issue:** No check for duplicate symbol ingestion.

When `ingestSpectrum()` is called:
```typescript
const nodeId = m.id ? m.id.toLowerCase() : `${filePath}::${metaNode.name.toLowerCase()}`;
// ... then directly adds the node
this.graph.addNode({ id: nodeId, ... });
```

**Scenario:**
1. File `foo.ts` has function `bar()` with `metadata.id = 'custom-id-123'`
2. First call to `ingestSpectrum()` → creates node `custom-id-123`
3. Second call (re-induction) → creates node `custom-id-123` again
4. `addNode()` will **overwrite** the existing node with new properties.

**Risk:** If the new induction has different property values (e.g., line range, complexity), the old edges pointing to the first node become stale.

**Severity:** MEDIUM — Risk of property corruption during incremental updates.

---

### 6. MEMBER_OF Direction — CORRECT BUT INCONSISTENT CONSUMPTION

**Path:** `orchestrator.ts:268–276`, `graph-engine.ts:197–207`

All MEMBER_OF edges created with **child → parent** direction:

```typescript
this.graph.getGraph().addEdge({
  id: `member::${unitId}->${parentId}`,
  sourceId: unitId,
  targetId: parentId,
  type: 'MEMBER_OF',
  ...
});
```

**Examples:**
- `file::unit → directory::path` (child first)
- `symbol → file::unit` (child first)

**Traversal consumption (traversal.ts:12–29):**

```typescript
public static traverseUpstream(graph: ConducksAdjacencyList, startId: NodeId, maxDepth: number = 5): Map<NodeId, number> {
  // ...
  for (const edge of graph.getNeighbors(currentId, 'upstream')) {
    queue.push([edge.sourceId, depth + 1]);  // Follow backward to sourceId
  }
}
```

**Status:** ✓ CORRECT — `traverseUpstream()` correctly follows edges backward (upstream = against edge direction).

**BUT:** Ranker (ranker.ts:40–50) uses a different convention:

```typescript
const incoming = graph.getNeighbors(node.id, 'upstream');
if (incoming) {
  for (const edge of incoming) {
    if (!ranks.has(edge.sourceId)) continue;
    const srcOut = graph.getNeighbors(edge.sourceId, 'downstream');
    // ... sums rank contribution from sourceId
  }
}
```

This correctly treats `upstream` as "edges pointing TO this node" (child→parent edges for MEMBER_OF).

**Status:** ✓ CONSISTENT

---

### 7. Fuzzy Linking — DOUBLE-BROKEN

**Path:** `linker.ts:66–84`

```typescript
private fuzzyLink(node: any, name: string, graph: ConducksAdjacencyList): void {
  const candidates = Array.from((graph as any).nodes.values()).filter((n: any) => 
    n.properties.name === name && (n.label === 'function' || n.label === 'class')
  );
  // ...
}
```

**Problem 1:** Checks `n.label === 'function'` but nodes have `canonicalKind = 'BEHAVIOR'`, not `label = 'function'`.

**Example:**
- Node stored with: `{ label: 'UNIT', canonicalKind: 'BEHAVIOR', properties: { name: 'doWork' } }`
- Filter checks: `n.label === 'function'` — NEVER matches.

**Problem 2:** Never called (GlobalSymbolLinker.link() is never invoked).

**Severity:** CRITICAL — Fuzzy fallback is unreachable and broken.

---

### 8. Cycle Detector — MEMBER_OF CREATES FALSE POSITIVES

**Path:** `cycle-detector.ts:10–66`

No special handling for MEMBER_OF edges.

**Scenario:**
- `Ecosystem → Repository → Directory → File → Symbol` all connected via MEMBER_OF
- Tarjan's algorithm finds the entire hierarchy as an SCC (if cycles exist)
- Report: "Cycle detected in file hierarchy" — FALSE POSITIVE

**Option:** Existing code allows `ignoreTypes`:

```typescript
if (ignoreTypes.includes(edge.type)) continue;
```

**But:** No caller passes `ignoreTypes: ['MEMBER_OF']`.

**Call site:** `conducks-core.ts:352–358`

```typescript
public audit(): any {
  const graph = this.graph.getGraph();
  const violations: string[] = [];
  const cycles = graph.detectCycles();  // No ignoreTypes passed
  for (const cycle of cycles) violations.push(`ARCH-3: Circular: ${cycle.join(" -> ")}`);
  return { success: violations.length === 0, violations };
}
```

**Severity:** MEDIUM — False positives pollute audit results, but the logic is correct.

---

### 9. Spectrum Nodes with metadata.id but No unitId — ORPHAN RISK

**Path:** `graph-engine.ts:174–194`

When ingesting spectrum nodes:

```typescript
const parentId = m.parentId ? m.parentId.toLowerCase() : (unitId || null);

this.graph.addNode({
  id: nodeId,
  properties: { 
    ...metaNode,
    ...m,
    filePath,
    parentId: parentId,
    unitId: unitId || null,
    ...
  }
});

if (parentId) {
  this.graph.addEdge({
    id: `MEMBER::${nodeId}->${parentId}`,
    sourceId: nodeId,
    targetId: parentId,
    type: 'MEMBER_OF',
    ...
  });
}
```

**Issue:** If `unitId` is null (happens if `ingestSpectrum()` is called without unitId):
- Node has `unitId: null`
- MEMBER_OF edge targets `parentId`
- IntraLinker (line 41) skips nodes where `unitId` is falsy
- Node becomes unreachable for symbol resolution

**Current callers:**
- `orchestrator.ts:318` — always passes `unitId` ✓
- `analysis/index.ts:154` — passed for metadata-only (package.json, requirements.txt) ✓

**Severity:** LOW — All production callers pass unitId, but the code is fragile.

---

### 10. Edge Rebinding — SURGICAL BUT RISKY

**Path:** `adjacency-list.ts:211–228` (rebindEdgeTarget)

```typescript
public rebindEdgeTarget(edge: ConducksEdge, newTargetId: NodeId): void {
  const oldTargetId = edge.targetId;
  if (oldTargetId === newTargetId) return;

  const oldInSet = this.inEdges.get(oldTargetId);
  if (oldInSet) {
    oldInSet.delete(edge);
    if (oldInSet.size === 0) this.inEdges.delete(oldTargetId);
  }

  edge.targetId = newTargetId;
  if (!this.inEdges.has(newTargetId)) this.inEdges.set(newTargetId, new Set());
  this.inEdges.get(newTargetId)!.add(edge);
}
```

**Status:** ✓ CORRECT — Properly removes from old in-set, updates edge, adds to new in-set.

**But:** Does NOT update `outEdges[sourceId]`.

The edge object is shared between `outEdges[sourceId]` and `inEdges[targetId]` (same reference).

Mutating `edge.targetId` updates both maps.

**Status:** ✓ WORKS — Reference semantics make this safe.

---

## Linker Call Flow — NOT INTEGRATED

### GlobalSymbolLinker (UNUSED)

**Declared:** `conducks-core.ts:56`  
**Imported:** `linker.ts:1–10`  
**Called:** NEVER  
**Would do:** Cross-file import node resolution (for import statements, not dependencies)

### IntraLinker (ACTIVE)

**Called:** `analysis/index.ts:176–178`  
**Timing:** After full graph loads, after gravity computed  
**Resolves:** Bare CALLS/CONSTRUCTS/TYPE_REFERENCE/ACCESSES targetIds to symbol nodes  
**Impact:** Fixes batch-ordering issues retroactively

### FederatedLinker (ACTIVE)

**Called:** `analysis/index.ts:180–181`  
**Timing:** After IntraLinker  
**Loads:** External project graphs  
**Impact:** Brings in neighbor symbols

---

## Data Flow Verification

### Phase 1: Spectrum Generation (reflector)

```
Input: Source code (foo.ts)
reflector.reflect()
Output: PrismSpectrum {
  nodes: [
    { name: 'bar', kind: 'function', metadata: { id: 'foo.ts::bar' } },
    { name: 'MyClass', kind: 'class', metadata: { id: 'foo.ts::myclass' } }
  ],
  relationships: [
    { sourceName: 'bar', targetName: './utils', type: 'IMPORTS', metadata: { specifier: './utils', isRaw: true } },
    { sourceName: 'bar', targetName: 'doWork', type: 'CALLS', metadata: { isRaw: false } }
  ]
}
```

### Phase 2: Raw Import Resolution (orchestrator:320–336)

```
For each relationship with isRaw: true:
  reflector.imports.link(specifier, path, allPaths) → linkage.targetId = '/abs/path/utils.ts'
  Add edge: unitId → linkage.targetId::unit
  
Result: File-level edges created
```

### Phase 3: Spectrum Ingestion (graph-engine:169–242)

```
For each spectrum.node:
  ingestSpectrum() → addNode(nodeId, properties)
  
For each spectrum.relationship:
  If IMPORTS: skip (handled in Phase 2)
  Else: addEdge(sourceId, targetId) where targetId is bare unless found locally
  
Result: Bare symbols stored, deferred resolution
```

### Phase 4: Full Graph Load + IntraLinker (analysis/index.ts:161–178)

```
persistence.load(graph)
→ Graph now contains all nodes from vault
→ intraLinker.resolve(graph)
→ For each bare targetId: search IMPORTS adjacency, find real node
→ updateEdgeTargets(resolvedEdges)
→ Edges rebound to actual symbol nodes
```

**Issue:** If symbol X is created twice with different properties, IntraLinker picks "first match" (highest gravity after resonate). Earlier creation wins.

---

## Summary Table

| Issue | File:Line | Severity | Status | Impact |
|-------|-----------|----------|--------|--------|
| Raw imports file-level only | orchestrator:322–336 | MEDIUM | ✓ Works | Symbols defer to IntraLinker |
| Spectrum CALLS/CONSTRUCTS bare | graph-engine:216–232 | HIGH | ✓ Deferred | Batch ordering risk |
| GlobalSymbolLinker unused | linker.ts | CRITICAL | Dead code | No import→symbol linking |
| Fuzzy fallback broken | linker.ts:69 | CRITICAL | Unreachable | Never called + label mismatch |
| Cycle detector false positives | cycle-detector.ts | MEDIUM | ✓ Workaround available | Audit report pollution |
| Node deduplication missing | adjacency-list.ts:99 | MEDIUM | Overwrite behavior | Property corruption risk |
| unitId null risk | graph-engine:176 | LOW | Guarded by callers | Fragile API |
| IntraLinker timing | analysis/index.ts:176 | MEDIUM | ✓ Correct | Only works after vault load |

---

## Specific Findings

### Bare Symbol Resolution Path

**Question:** "Does a symbol defined in fileA get correctly resolved when fileB calls it?"

**Answer:** Conditional.

1. **If fileA processes before fileB (lucky batch order):**
   - IngestSpectrum creates node `fileA::symbol`
   - Spectrum relationship: `{ sourceName: 'caller', targetName: 'symbol', type: 'CALLS' }`
   - Smart resolution (graph-engine:223–225) finds local candidate `fileB::symbol` → WRONG (overwrites correct)

2. **If fileB processes before fileA (unlucky batch order):**
   - IngestSpectrum creates edge `fileB::caller → symbol` (bare, no match)
   - IntraLinker later finds `fileA::symbol` → CORRECT

**Conclusion:** Order-dependent. IntraLinker retroactively fixes unlucky orders, but lucky orders break.

### Raw Specifier Resolution

**Question:** "When does a bare specifier like `'./utils'` become `'/path/utils.ts::unit'`?"

**Answer:**

1. **Reflector creates:** `{ sourceName: 'unit', targetName: './utils', type: 'IMPORTS', metadata: { specifier: './utils', isRaw: true } }`
2. **Orchestrator processes (line 322–336):**
   - `reflector.imports.link('./utils', filePath, allPaths)` → resolves to `/abs/utils.ts`
   - Creates edge: `filePath::unit → /abs/utils.ts::unit`
3. **Symbol-level imports never created** — only file-level edges.

### Deduplication Behavior

**Question:** "What if the same symbol is inducted twice?"

**Answer:**

1. First induction: Creates node `fileX::symbol` with properties `{ lineStart: 10, complexity: 5, ... }`
2. Second induction: Calls `addNode(...)` with same id but new properties `{ lineStart: 15, complexity: 8, ... }`
3. `addNode()` **overwrites** the skeleton and recompresses the meat (adjacency-list.ts:138–152)
4. Old edges are still attached (they reference the node object)
5. New edges created by second induction attach to same node object
6. Result: **Properties are updated, edges coexist**, but first creation's properties are lost.

---

## Recommendations (Read-Only, Not Implemented)

1. **Fix fuzzy linking:** Remove or fix `GlobalSymbolLinker.fuzzyLink()` label checks
2. **Defer all bare symbols:** Don't attempt smart resolution in `ingestSpectrum()`, always store bare and resolve in IntraLinker
3. **Cycle detector option:** Pass `ignoreTypes: ['MEMBER_OF']` in `audit()` method
4. **Deduplication:** Check `hasNode()` before `addNode()`, merge properties instead of overwriting
5. **Timing guarantees:** Document that IntraLinker depends on full vault load; can't be called during streaming

---

**End of Audit**
