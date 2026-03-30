import { ConducksAdjacencyList, ConducksNode, ConducksEdge } from "@/lib/core/graph/adjacency-list.js";

/**
 * Conducks — GQL (Graph Query Language) Parser
 * 
 * A simplified Cypher-like parser for structural pattern matching.
 * Syntax: (NodeLabel)-[:EDGE_TYPE]->(NodeLabel)
 */
export class GQLParser {
  /**
   * Executes a GQL query on the provided graph.
   */
  public query(graph: ConducksAdjacencyList, queryString: string): any[] {
    const pattern = /\(([^)]*)\)-\[:([^\]]*)\]->\(([^)]*)\)/;
    const match = queryString.match(pattern);

    if (!match) {
      return [];
    }

    const [, sourceLabel, edgeType, targetLabel] = match;
    const results: any[] = [];

    for (const sourceNode of Array.from(graph.getAllNodes())) {
      if (sourceLabel && !sourceNode.label.toLowerCase().includes(sourceLabel.toLowerCase())) continue;

      const neighbors = graph.getNeighbors(sourceNode.id, 'downstream');
      for (const edge of neighbors) {
        if (edgeType && edge.type !== edgeType.toUpperCase()) continue;

        const targetNode = graph.getNode(edge.targetId);
        if (targetNode) {
          if (targetLabel && !targetNode.label.toLowerCase().includes(targetLabel.toLowerCase())) continue;
          
          results.push({
            source: sourceNode.properties.name,
            type: edge.type,
            target: targetNode.properties.name,
            sourceFile: sourceNode.properties.filePath,
            targetFile: targetNode.properties.filePath
          });
        }
      }
    }

    return results;
  }
}
