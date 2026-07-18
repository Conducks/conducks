# Agent 04 — Wave 4 (A4 + A11)

## Task
Add public accessors to ConducksAdjacencyList; remove all `(graph as any)` casts and `g.outEdges` direct access.

## Changes

### adjacency-list.ts
Added two public accessors after `getAllNodes()`:
- `getNodesMap(): Map<NodeId, ConducksNode>` — returns `this.nodes`
- `getOutEdgesMap(): Map<NodeId, Set<ConducksEdge>>` — returns `this.outEdges`

### linker.ts (lines 16, 93)
Replaced `(graph as any).nodes.values()` with `graph.getNodesMap().values()` in both `link()` and `fuzzyLink()`.

### daac.ts (line 134)
Replaced `(graph as any).nodes as Map<NodeId, ConducksNode>` with `graph.getNodesMap()`.

### cochange-engine.ts (lines 78–79)
`getNeighborsByFilePath` is already public — removed `(graph as any)` cast. Also removed inner `(n: any)` casts (type now inferred).

### analysis/index.ts (line 218)
`getAllEdges()` is already public — replaced `(graph as any).getAllEdges()` with `graph.getAllEdges()`.

### advisor.ts (line 21)
`detectCycles()` is already public — replaced `(graph as any).detectCycles(...)` with `graph.detectCycles(...)`.

### mirror.engine.ts (lines 31, 179, 193)
- Removed `const g = this.graph as any`
- Added `const outEdgesMap = this.graph.getOutEdgesMap()`
- Replaced both `g.outEdges` loop references with `outEdgesMap`
- Line 193: `edge.category` is not on ConducksEdge interface (pre-existing gap); cast `edge as any` surgically for that single property access only.

## Result
`npx tsc --noEmit` — clean, zero errors.
