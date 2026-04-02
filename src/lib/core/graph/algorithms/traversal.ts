import { ConducksAdjacencyList, NodeId, ConducksNode } from "../adjacency-list.js";

/**
 * Conducks — Structural Graph Traversal Algorithms
 * 
 * High-performance pathfinding and impact analysis for architectural intelligence.
 */
export class GraphTraversal {
  /**
   * Recursive BFS traversal to calculate "Blast Radius" (Impact Analysis).
   */
  public static traverseUpstream(graph: ConducksAdjacencyList, startId: NodeId, maxDepth: number = 5): Map<NodeId, number> {
    const depths = new Map<NodeId, number>();
    const queue: [NodeId, number][] = [[startId.toLowerCase(), 0]];
    const visited = new Set<NodeId>();

    while (queue.length > 0) {
      const [currentId, depth] = queue.shift()!;

      if (visited.has(currentId) || depth > maxDepth) continue;
      visited.add(currentId);
      depths.set(currentId, depth);

      for (const edge of graph.getNeighbors(currentId, 'upstream')) {
        queue.push([edge.sourceId, depth + 1]);
      }
    }

    return depths;
  }

  /**
   * Conducks — Kinetic A* Search
   * High-precision pathfinding between symbols using structural heuristics.
   */
  public static traverseAStar(graph: ConducksAdjacencyList, startId: NodeId, targetId: NodeId, heuristic?: (n: ConducksNode) => number): NodeId[] {
    const sId = startId.toLowerCase();
    const tId = targetId.toLowerCase();
    const openSet = new Set<NodeId>([sId]);
    const cameFrom = new Map<NodeId, NodeId>();
    const gScore = new Map<NodeId, number>([[sId, 0]]);
    const fScore = new Map<NodeId, number>([[sId, 0]]);

    const h = (nodeId: NodeId) => {
      const node = graph.getNode(nodeId);
      if (!node) return 1000;
      if (heuristic) return heuristic(node);
      const targetLayer = graph.getNode(tId)?.properties.layer || 0;
      return Math.abs(targetLayer - (node.properties.layer || 0));
    };

    fScore.set(sId, h(sId));

    while (openSet.size > 0) {
      let currentId: NodeId | null = null;
      let lowestFScore = Infinity;

      for (const id of openSet) {
        const score = fScore.get(id) ?? Infinity;
        if (score < lowestFScore) {
          lowestFScore = score;
          currentId = id;
        }
      }

      if (!currentId) break;

      if (currentId === tId) {
        const path = [currentId];
        let step = currentId;
        while (cameFrom.has(step)) {
          step = cameFrom.get(step)!;
          path.unshift(step);
        }
        return path;
      }

      openSet.delete(currentId);

      for (const edge of graph.getNeighbors(currentId, 'downstream')) {
        const weight = edge.confidence || 1.0;
        const tentativeGScore = (gScore.get(currentId) || 0) + weight;

        if (tentativeGScore < (gScore.get(edge.targetId) ?? Infinity)) {
          cameFrom.set(edge.targetId, currentId);
          gScore.set(edge.targetId, tentativeGScore);
          fScore.set(edge.targetId, tentativeGScore + h(edge.targetId));
          openSet.add(edge.targetId);
        }
      }
    }

    return [];
  }
}
