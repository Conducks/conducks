import { BaseAnalyzer } from './trace.js';
import { ConducksAdjacencyList, NodeId } from '../../core/graph/adjacency-list.js';

/**
 * Conducks — Blast Radius Analyzer
 * 
 * Calculates the recursive impact of changing a node in the codebase.
 * It traverses the 'upstream' (callers/importers) graph to find
 * all potentially affected symbols.
 */
export class BlastRadiusAnalyzer extends BaseAnalyzer {
  public readonly id = 'blast-radius-analyzer';
  public readonly version = '1.0.0';

  /**
   * Apostle v3 — Weighted Blast Radius
   * Uses Dijkstra to factor in structural relationship strength.
   */
  public analyzeImpact(graph: ConducksAdjacencyList, startId: NodeId, maxWeight: number = 5) {
    const weights: Record<string, number> = {
      'EXTENDS': 0.5,     // Critical impact
      'IMPLEMENTS': 0.7,  // High impact
      'CALLS': 1.0,       // Standard impact
      'IMPORTS': 2.0,     // Low/Indirect impact
      'DEPENDS_ON': 2.5   // Minimal impact
    };

    const findings = this.dijkstra(graph, startId, 'upstream', weights, maxWeight);
    
    const affectedNodes = Array.from(findings.entries()).map(([nodeId, data]) => {
      const node = graph.getNode(nodeId);
      return {
        id: nodeId,
        name: node?.properties.name || 'Unknown',
        distance: data.weight,
        path: data.path.map(e => e.type)
      };
    });

    // Score is the sum of inverse weighted distances
    const score = affectedNodes.reduce((acc, node) => acc + (1 / node.distance), 0);

    return {
      targetId: startId,
      impactScore: Math.round(score * 100) / 100,
      risk: this.getRiskLevel(score),
      affectedCount: affectedNodes.length,
      affectedNodes: affectedNodes.sort((a, b) => a.distance - b.distance)
    };
  }

  /**
   * Translates a raw score into a human-readable risk level.
   */
  private getRiskLevel(score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (score < 2) return 'LOW';
    if (score < 5) return 'MEDIUM';
    if (score < 15) return 'HIGH';
    return 'CRITICAL';
  }
}
