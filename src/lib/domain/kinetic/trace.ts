import { ConducksAdjacencyList, NodeId, ConducksEdge } from "@/lib/core/graph/index.js";

/**
 * Structural Priority Queue (Min-Heap)
 * 
 * Optimized for Dijkstra traversals in large structural graphs.
 */
export class PriorityQueue<T extends { weight: number }> {
  private heap: T[] = [];

  public push(item: T): void {
    this.heap.push(item);
    this.siftUp();
  }

  public pop(): T | undefined {
    if (this.size() === 0) return undefined;
    const top = this.heap[0];
    const bottom = this.heap.pop()!;
    if (this.size() > 0) {
      this.heap[0] = bottom;
      this.siftDown();
    }
    return top;
  }

  public size(): number {
    return this.heap.length;
  }

  private siftUp(): void {
    let nodeIdx = this.size() - 1;
    while (nodeIdx > 0) {
      let parentIdx = Math.floor((nodeIdx - 1) / 2);
      if (this.heap[nodeIdx].weight >= this.heap[parentIdx].weight) break;
      [this.heap[nodeIdx], this.heap[parentIdx]] = [this.heap[parentIdx], this.heap[nodeIdx]];
      nodeIdx = parentIdx;
    }
  }

  private siftDown(): void {
    let nodeIdx = 0;
    while (true) {
      let left = (nodeIdx * 2) + 1;
      let right = (nodeIdx * 2) + 2;
      let smallest = nodeIdx;

      if (left < this.size() && this.heap[left].weight < this.heap[smallest].weight) smallest = left;
      if (right < this.size() && this.heap[right].weight < this.heap[smallest].weight) smallest = right;

      if (smallest === nodeIdx) break;
      [this.heap[nodeIdx], this.heap[smallest]] = [this.heap[smallest], this.heap[nodeIdx]];
      nodeIdx = smallest;
    }
  }
}

/**
 * Base Analyzer Logic
 * 
 * Provides shared traversal utilities for any component that needs to
 * query the Conducks knowledge graph.
 */
export abstract class BaseAnalyzer {

  /**
   * Performs a breadth-first search on the graph from a starting point.
   *
   * Todo28#P3: `dijkstra`'s pop order is already non-decreasing by weight (that is what makes a
   * min-heap a min-heap), so this was *usually* already close to distance order — but the pop order
   * is not a SORT, it is an artifact of push/pop interleaving, so nodes tied at the same weight (the
   * common case: several direct calls from one function all sit at weight 1.0) came out in whatever
   * order the heap happened to settle them, not in any order a caller could rely on. Measured on
   * `AnalysisService.analyze`: `synapsepersistence.beginpulse`, a direct call, was returned LAST of
   * 10 despite running first — because "first" has no graph meaning at that tier.
   *
   * The explicit sort below makes the one thing this traversal can honestly claim explicit and
   * guaranteed: **ascending risk-weighted graph distance from `startId`, nearest first.** That is
   * wiring — how far a node sits, not when it runs (ADR 0066; conducks-docs §6.13, "trace verifies
   * wiring, never logic"). Nodes tied at the same distance are NOT further ordered by anything
   * meaningful — `Array.prototype.sort` is stable (ES2019+), so ties keep dijkstra's pop order,
   * which carries no temporal claim and must not be read as one.
   */
  protected bfs(
    graph: any,
    startId: NodeId,
    direction: 'upstream' | 'downstream',
    maxDepth: number = 10
  ): Map<NodeId, { depth: number; path: ConducksEdge[] }> {
    const findings = this.dijkstra(graph, startId, direction, {}, maxDepth);
    const ordered = Array.from(findings.entries()).sort((a, b) => a[1].weight - b[1].weight);
    const results = new Map<NodeId, { depth: number; path: ConducksEdge[] }>();

    for (const [id, data] of ordered) {
      results.set(id, { depth: Math.round(data.weight), path: data.path });
    }
    return results;
  }

  /**
   * Performs a Dijkstra traversal to find the "Shortest Weighted Path".
   * Factor in architectural relationship weights (e.g., EXTENDS > CALLS > IMPORTS).
   */
  protected dijkstra(
    graph: ConducksAdjacencyList,
    startId: NodeId,
    direction: 'upstream' | 'downstream',
    weights: Record<string, number>,
    maxWeight: number = 10
  ): Map<NodeId, { weight: number; path: ConducksEdge[] }> {
    const results = new Map<NodeId, { weight: number; path: ConducksEdge[] }>();
    const pq = new PriorityQueue<{ id: NodeId; weight: number; path: ConducksEdge[] }>();
    
    pq.push({ id: startId.toLowerCase(), weight: 0, path: [] });
    const visited = new Map<NodeId, number>();

    while (pq.size() > 0) {
      const { id: currentId, weight: currentWeight, path } = pq.pop()!;

      if (visited.has(currentId) && visited.get(currentId)! <= currentWeight) continue;
      if (currentWeight > maxWeight) continue;
      
      visited.set(currentId, currentWeight);

      if (currentId !== startId.toLowerCase()) {
        results.set(currentId, { weight: currentWeight, path });
      }

      for (const edge of graph.getNeighbors(currentId, direction)) {
        const nextId = direction === 'downstream' ? edge.targetId : edge.sourceId;

        // CONTAINMENT IS ONE-WAY. A MEMBER_OF edge runs child -> container. Following it FORWARD is
        // a real claim: change the function and the file changed. Following it BACKWARD says every
        // OTHER symbol in that file was affected too — co-location, not dependency.
        //
        // Measured on a hand-derived fixture: `impact format upstream` reported `unusedHelper` at
        // distance 3.5. Its only edge in the whole graph is MEMBER_OF service.ts, and it never
        // references `format`; 3.5 = 2 + 1.5, and 1.5 is precisely the MEMBER_OF weight followed
        // from the container back down into a sibling.
        //
        // This rule was proven in ADR 0129 and could not ship until ADR 0131 removed the duplicate
        // route nodes — the cross-service test was reaching a REQUEST through container hops only
        // because resolution had landed on a bare duplicate that lacked the direct CALLS edge.
        if (edge.type === 'MEMBER_OF' && direction === 'upstream') continue;
        const edgeWeight = weights[edge.type] || 1.0;
        pq.push({ id: nextId.toLowerCase(), weight: currentWeight + edgeWeight, path: [...path, edge] });
      }
    }

    return results;
  }
}

/**
 * Conducks — Trace Analyzer
 */
export class TraceAnalyzer extends BaseAnalyzer {

  constructor(private readonly graph?: ConducksAdjacencyList) {
    super();
  }

  /**
   * Returns the ids reachable downstream from `symbolId`, ordered nearest-first by risk-weighted
   * graph distance (see `bfs` above). This is a REACHABILITY order, not an execution order — a
   * static graph has no notion of "runs before" between two direct calls at the same distance.
   */
  public trace(symbolId: NodeId, depth: number = 10): NodeId[] {
    const g = this.graph || (null as any);
    if (!g) return [];
    const results = this.bfs(g, symbolId, 'downstream', depth);
    // A step ENTERED through MEMBER_OF is location, not dependency (todo38#P2). `trace main`
    // reported `main.ts → src → oracle2 → oracle2` — the containment ladder, with the repository
    // twice — because Dijkstra reports every node it visits. The traversal still WALKS the edge:
    // imports are unit-scoped (`service.ts::unit -IMPORTS-> format`), so a symbol's import-carried
    // dependency is reached THROUGH its container, and cutting the edge would lose it. Containment
    // may carry a walk; it is never itself the answer.
    return Array.from(results.entries())
      .filter(([, data]) => data.path.length === 0 || data.path[data.path.length - 1].type !== 'MEMBER_OF')
      .map(([id]) => id);
  }

  /**
   * Finds the shortest structural path between two symbols.
   * Optimization (v1.7.0): Uses Risk-Weighted Dijkstra instead of A*.
   */
  public findPath(startId: NodeId, targetId: NodeId): NodeId[] {
    const g = this.graph || (null as any);
    if (!g) return [];
    const weights: Record<string, number> = {
      'EXTENDS': 0.1,      // Extremely strong coupling
      'IMPLEMENTS': 0.2,   // Strong coupling
      'CALLS': 1.0,        // Standard coupling
      'MEMBER_OF': 1.2,
      'IMPORTS': 1.5,      // Loose coupling
      'DEPENDS_ON': 2.0    // Very loose coupling
    };

    const findings = this.dijkstra(g, startId, 'downstream', weights, 50);
    const target = targetId.toLowerCase();
    
    if (findings.has(target)) {
      const data = findings.get(target)!;
      const pathNodes = [startId.toLowerCase()];
      for (const edge of data.path) {
        pathNodes.push(edge.targetId.toLowerCase());
      }
      return pathNodes;
    }

    return [];
  }
}



