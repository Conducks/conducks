import { ConducksAdjacencyList, NodeId, ConducksNode, ConducksEdge } from '@/lib/core/graph/adjacency-list.js';
import { ConducksComponent } from '@/registry/types.js';

/**
 * Structural Priority Queue (Min-Heap)
 * 
 * Optimized for Dijkstra traversals in large structural graphs.
 * Provides O(log N) insertion and extraction.
 */
class PriorityQueue<T extends { weight: number }> {
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
export abstract class BaseAnalyzer implements ConducksComponent {
  public abstract readonly id: string;
  public readonly type = 'analyzer';
  public abstract readonly version: string;

  /**
   * Performs a breadth-first search on the graph from a starting point.
   * Legacy wrapper for Dijkstra with uniform weights.
   */
  protected bfs(
    graph: any, 
    startId: NodeId, 
    direction: 'upstream' | 'downstream',
    maxDepth: number = 10
  ): Map<NodeId, { depth: number; path: ConducksEdge[] }> {
    const findings = this.dijkstra(graph, startId, direction, {}, maxDepth);
    const results = new Map<NodeId, { depth: number; path: ConducksEdge[] }>();
    
    for (const [id, data] of findings.entries()) {
      results.set(id, { depth: Math.round(data.weight), path: data.path });
    }
    return results;
  }

  /**
   * Performs a Dijkstra traversal to find the "Shortest Weighted Path".
   * Factor in architectural relationship weights (e.g., EXTENDS > CALLS > IMPORTS).
   * 
   * Optimization (v1.7.0): Uses a Binary Heap Priority Queue for O(E log V).
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
        const edgeWeight = weights[edge.type] || 1.0;
        pq.push({ id: nextId.toLowerCase(), weight: currentWeight + edgeWeight, path: [...path, edge] });
      }
    }

    return results;
  }
}

/**
 * Conducks — Trace Analyzer
 * 
 * Provides high-fidelity execution tracing and pathfinding.
 */
export class TraceAnalyzer extends BaseAnalyzer {
  public readonly id = 'trace-analyzer';
  public readonly version = '2.0.0';

  constructor(private readonly graph?: ConducksAdjacencyList) {
    super();
  }

  public trace(symbolId: NodeId, depth: number = 10): NodeId[] {
    const g = this.graph || (null as any);
    if (!g) return [];
    const results = this.bfs(g, symbolId, 'downstream', depth);
    return Array.from(results.keys());
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



