import { ConducksAdjacencyList, NodeId } from "../adjacency-list.js";

/**
 * Conducks — Tarjan's Cycle Detection Algorithm
 * 
 * High-performance SCC-based cycle detection for architectural auditing.
 * Linear time complexity: O(V + E).
 */
export class CycleDetector {
  public static detect(graph: ConducksAdjacencyList): NodeId[][] {
    const cycles: NodeId[][] = [];
    let index = 0;
    const stack: NodeId[] = [];
    const onStack = new Set<NodeId>();
    const indices = new Map<NodeId, number>();
    const lowlink = new Map<NodeId, number>();

    const strongconnect = (nodeId: NodeId) => {
      indices.set(nodeId, index);
      lowlink.set(nodeId, index);
      index++;
      stack.push(nodeId);
      onStack.add(nodeId);

      const neighbors = graph.getNeighbors(nodeId, 'downstream');
      for (const edge of neighbors) {
        if (!indices.has(edge.targetId)) {
          strongconnect(edge.targetId);
          lowlink.set(nodeId, Math.min(lowlink.get(nodeId)!, lowlink.get(edge.targetId)!));
        } else if (onStack.has(edge.targetId)) {
          lowlink.set(nodeId, Math.min(lowlink.get(nodeId)!, indices.get(edge.targetId)!));
        }
      }

      if (lowlink.get(nodeId) === indices.get(nodeId)) {
        const component: NodeId[] = [];
        let w: NodeId;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          component.push(w);
        } while (w !== nodeId);

        if (component.length > 1) {
          cycles.push(component);
        } else if (component.length === 1) {
          const selfEdges = graph.getNeighbors(component[0], 'downstream');
          if (selfEdges.some(e => e.targetId === component[0])) {
            cycles.push(component);
          }
        }
      }
    };

    const allNodes = Array.from(graph.getAllNodes());
    for (const node of allNodes) {
      if (!indices.has(node.id)) {
        strongconnect(node.id);
      }
    }

    return cycles;
  }
}
