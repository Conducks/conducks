import { ConducksAdjacencyList, ConducksNode, EdgeType } from "@/lib/core/graph/adjacency-list.js";

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
    // Conducks: Support optional labels (e.g. ()-[:EDGE]->())
    const pattern = /\(([^)]*)\)-\[:([^\]]+)\]->\(([^)]*)\)/;
    const match = queryString.match(pattern);

    if (!match) {
      return [];
    }

    const [, sourceLabel, edgeType, targetLabel] = match;
    const results: any[] = [];

    const nodes = Array.from(graph.getAllNodes());
    for (const sourceNode of nodes) {
      // Label filter (if specified)
      if (sourceLabel && sourceLabel.trim() !== "" && !sourceNode.label.toLowerCase().includes(sourceLabel.toLowerCase())) continue;

      const neighbors = graph.getNeighbors(sourceNode.id, 'downstream');
      for (const edge of neighbors) {
        // Edge type filter (case-insensitive)
        if (edgeType && edgeType.trim() !== "*" && edge.type.toUpperCase() !== edgeType.toUpperCase()) continue;

        const targetNode = graph.getNode(edge.targetId);
        if (targetNode) {
          // Target label filter (if specified)
          if (targetLabel && targetLabel.trim() !== "" && !targetNode.label.toLowerCase().includes(targetLabel.toLowerCase())) continue;

          results.push({
            source: sourceNode.properties.name,
            type: edge.type,
            target: targetNode.properties.name,
            sourceFile: sourceNode.properties.filePath,
            targetFile: targetNode.properties.filePath,
            confidence: edge.confidence
          });
        }
      }
    }

    return results;
  }
}
