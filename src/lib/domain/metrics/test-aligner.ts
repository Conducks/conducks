import { ConducksAdjacencyList, NodeId, ConducksNode, ConducksEdge } from '@/lib/core/graph/adjacency-list.js';
import { ConducksComponent } from "@/registry/types.js";

/**
 * Conducks — Test Aligner (Conducks) 🧪
 * 
 * Bridging the gap between tests and production logic.
 */
export class TestAligner implements ConducksComponent {
  public readonly id = 'test-aligner';
  public readonly type = 'analyzer';
  public readonly description = 'Traces test coverage by mapping test suites to structural production logic.';
  /**
   * Aligns the graph by populating 'coveredBy' property on production nodes.
   */
  public align(graph: ConducksAdjacencyList): void {
    const nodes = Array.from(graph.getAllNodes());

    // 1. Identify all nodes that belong to a test environment
    const testRelevantNodes = nodes.filter((n: any) => {
      const isTest = n.properties.isTest || (n.properties.isGlobalNode && n.id.includes('/tests/'));
      return isTest;
    }) as ConducksNode[];

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
          if (!targetNode.properties.isTest) {
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
