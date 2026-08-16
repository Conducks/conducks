import { ConducksAdjacencyList, ConducksNode } from '@/lib/core/graph/adjacency-list.js';
import { isTestNode } from "@/contracts/index.js";

/**
 * Conducks — Test Aligner (Conducks) 🧪
 * 
 * Bridging the gap between tests and production logic.
 */
export class TestAligner {
  /**
   * Aligns the graph by populating 'coveredBy' property on production nodes.
   */
  public align(graph: ConducksAdjacencyList): void {
    const nodes = Array.from(graph.getAllNodes());

    // 1. Identify all nodes that belong to a test environment
    // One predicate (`isTestNode`), because this used to carry its own — and the parse-time
    // `properties.isTest` it preferred is absent from every vault-loaded node, so the local
    // fallback was the only thing working and only for global nodes.
    const testRelevantNodes = nodes.filter((n: any) => isTestNode(n)) as ConducksNode[];

    for (const startNode of testRelevantNodes) {
      const queue: [string, number][] = [[startNode.id, 0]];
      const visited = new Set<string>([startNode.id]);
      const testFilePath = startNode.properties.filePath;
      const maxDepth = 5;

      while (queue.length > 0) {
        const [currentId, depth] = queue.shift()!;
        if (depth >= maxDepth) continue;

        const neighbors = graph.getNeighbors(currentId, 'downstream');

        for (const rel of neighbors) {
          if (visited.has(rel.targetId)) continue;
          visited.add(rel.targetId);

          const targetNode = graph.getNode(rel.targetId) as ConducksNode;
          if (!targetNode) continue;

          // 2. Mark production nodes with covering test file
          if (!isTestNode(targetNode)) {
            if (!targetNode.properties.coveredBy) {
              targetNode.properties.coveredBy = [];
            }
            if (!targetNode.properties.coveredBy.includes(testFilePath)) {
              targetNode.properties.coveredBy.push(testFilePath);
            }
          }

          // 3. Continue traversal (deeper into production logic)
          queue.push([rel.targetId, depth + 1]);
        }
      }
    }
  }
}
