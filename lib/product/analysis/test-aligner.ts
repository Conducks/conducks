import { ConducksAdjacencyList, ConducksNode } from '../../core/graph/adjacency-list.js';

/**
 * Conducks — Test Aligner (Apostle v3.4) 🧪
 * 
 * Bridging the gap between tests and production logic.
 * Traces outgoing edges from test files to identify which structural 
 * symbols are covered by which test suites.
 */
export class TestAligner {
  /**
   * Aligns the graph by populating 'coveredBy' property on production nodes.
   */
  public align(graph: ConducksAdjacencyList): void {
    const nodes = Array.from(graph.getAllNodes());
    
    // 1. Identify all nodes that belong to a test environment
    const testRelevantNodes = nodes.filter((n: any) => n.properties.isTest || (n.properties.isGlobalNode && n.id.includes('/tests/'))) as ConducksNode[];
    console.error(`[TestAligner] Analyzing ${nodes.length} nodes. Found ${testRelevantNodes.length} test-relevant entry points.`);

    for (const startNode of testRelevantNodes) {
      const queue: [string, number][] = [[startNode.id, 0]];
      const visited = new Set<string>([startNode.id]);
      const testFilePath = startNode.properties.filePath;
      const maxDepth = 5;

      while (queue.length > 0) {
        const [currentId, depth] = queue.shift()!;
        if (depth >= maxDepth) continue;

        const neighbors = graph.getNeighbors(currentId, 'downstream');
        console.error(`[TestAligner] BFS: Popped ${currentId} at depth ${depth}. Neighbors: ${neighbors.length}`);
        
        for (const rel of neighbors) {
          console.error(`[TestAligner]   - Edge ${rel.type} -> ${rel.targetId}`);
          if (visited.has(rel.targetId)) continue;
          visited.add(rel.targetId);

          const targetNode = graph.getNode(rel.targetId) as ConducksNode;
          if (!targetNode) continue;

          // 2. Mark production nodes with covering test file
          if (!targetNode.properties.isTest) {
            console.error(`[TestAligner]     -> COVERING: ${targetNode.id} from ${testFilePath}`);
            if (!targetNode.properties.coveredBy) {
              targetNode.properties.coveredBy = [];
            }
            if (!targetNode.properties.coveredBy.includes(testFilePath)) {
              targetNode.properties.coveredBy.push(testFilePath);
            }
          }

          // 3. Continue traversal (deeper into production logic or shared test helpers)
          queue.push([rel.targetId, depth + 1]);
        }
      }
    }
  }
}
