import { BaseAnalyzer } from './trace.js';
import { ConducksAdjacencyList, NodeId } from '@/lib/core/graph/adjacency-list.js';
import { ConducksComponent } from "@/contracts/types.js";

/**
 * Conducks — Blast Radius Analyzer
 */
export class BlastRadiusAnalyzer extends BaseAnalyzer implements ConducksComponent {
  // The ONLY domain class that still carries this contract, because it is the only one actually
  // registered and looked up by id — `conducks-core.ts` does `registerComponent(...)` and later
  // `getComponent("blast-radius-analyzer")`. Everything else that used to implement it declared an
  // id and a type that nothing read (ADR 0052).
  public readonly id = 'blast-radius-analyzer';
  public readonly type = 'analyzer' as const;
  public readonly description = 'Calculates the recursive structural impact and risk score of changes.';

  /**
   * Conducks — Weighted Blast Radius
   * Uses Dijkstra to factor in structural relationship strength.
   * direction: 'upstream' (who is affected by ME) or 'downstream' (what impacts ME)
   */
  public analyzeImpact(graph: ConducksAdjacencyList, startId: NodeId, direction: 'upstream' | 'downstream' = 'upstream', maxWeight: number = 5) {
    const weights: Record<string, number> = {
      'EXTENDS': 0.5,      // Critical impact
      'IMPLEMENTS': 0.7,   // High impact
      'CALLS': 1.0,        // Standard impact
      'CONSTRUCTS': 1.2,   // instantiation
      'MEMBER_OF': 1.5,    // membership
      'IMPORTS': 2.0,      // Low/Indirect impact
      'DEPENDS_ON': 2.5    // Minimal impact
    };

    const findings = this.dijkstra(graph, startId, direction, weights, maxWeight);

    const affectedNodes = Array.from(findings.entries()).map(([nodeId, data]) => {
      const node = graph.getNode(nodeId);
      return {
        id: nodeId,
        name: node?.properties.name || 'Unknown',
        kind: node?.label || 'unknown',
        filePath: node?.properties.filePath || 'unknown',
        distance: data.weight,
        path: data.path.map(e => e.type)
      };
    });

    // Score is the sum of inverse weighted distances
    const score = affectedNodes.reduce((acc, node) => acc + (node.distance === 0 ? 1.0 : 1 / node.distance), 0);

    return {
      targetId: startId,
      direction,
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
