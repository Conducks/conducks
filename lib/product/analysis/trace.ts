import { ConducksAdjacencyList, NodeId, ConducksEdge } from '../../core/graph/adjacency-list.js';
import { ConducksComponent } from '../../core/registry/types.js';

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
   */
  protected dijkstra(
    graph: ConducksAdjacencyList,
    startId: NodeId,
    direction: 'upstream' | 'downstream',
    weights: Record<string, number>,
    maxWeight: number = 10
  ): Map<NodeId, { weight: number; path: ConducksEdge[] }> {
    const results = new Map<NodeId, { weight: number; path: ConducksEdge[] }>();
    const pq: Array<{ id: NodeId; weight: number; path: ConducksEdge[] }> = [{ id: startId, weight: 0, path: [] }];
    const visited = new Map<NodeId, number>();

    while (pq.length > 0) {
      pq.sort((a, b) => a.weight - b.weight);
      const { id: currentId, weight: currentWeight, path } = pq.shift()!;

      if (visited.has(currentId) && visited.get(currentId)! <= currentWeight) continue;
      if (currentWeight > maxWeight) continue;
      
      visited.set(currentId, currentWeight);

      if (currentId !== startId) {
        results.set(currentId, { weight: currentWeight, path });
      }

      for (const edge of graph.getNeighbors(currentId, direction)) {
        const nextId = direction === 'downstream' ? edge.targetId : edge.sourceId;
        const edgeWeight = weights[edge.type] || 1.0;
        pq.push({ id: nextId, weight: currentWeight + edgeWeight, path: [...path, edge] });
      }
    }

    return results;
  }
}
