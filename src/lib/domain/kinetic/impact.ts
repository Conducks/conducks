import { BaseAnalyzer } from './trace.js';
import { ConducksAdjacencyList, NodeId } from "@/lib/core/graph/index.js";
import { ConducksComponent } from "@/contracts/index.js";

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
      'DEPENDS_ON': 2.5,   // Minimal impact
      // A re-export is a pass-through, not a hop worth penalising: `export { x } from './y'` means
      // every consumer of the barrel is a consumer of `y::x`. Weighted BELOW a call so a caller
      // reached through a barrel still ranks with the callers reached directly — without this the
      // edge existed and the traversal ignored it, and "who uses this" answered with only the
      // consumers who happened to import from the origin file (ADR 0109).
      'ALIASES': 0.5
    };

    const findings = this.dijkstra(graph, startId, direction, weights, maxWeight);

    const affectedNodes = Array.from(findings.entries()).map(([nodeId, data]) => {
      const node = graph.getNode(nodeId);
      // WHERE this node touches the chain. The edge ADJACENT to it — the last hop — is the one it
      // actually wrote, so its `line` is the reference site inside THIS file. At distance 1 that is
      // literally the call site being asked about.
      //
      // Without it, "who calls X" answered with a list of file names and the caller still had to
      // grep for the line. An agent restricted to conducks could not complete the task at all
      // (ADR 0108).
      const adjacent = data.path.length > 0 ? data.path[data.path.length - 1] : undefined;
      const refLine = Number((adjacent as any)?.properties?.line ?? 0) || null;
      // EVERY call site, not just the first. A caller that invokes the target eleven times is one
      // node with eleven lines, and reporting one of them silently understated the blast radius
      // (ADR 0110).
      const refLines = ((adjacent as any)?.properties?.lines as number[] | undefined)?.filter(Boolean)
        ?? (refLine ? [refLine] : []);
      return {
        id: nodeId,
        name: node?.properties.name || 'Unknown',
        kind: node?.label || 'unknown',
        filePath: node?.properties.filePath || 'unknown',
        /** The line in THIS file that references the chain — the call site. */
        line: refLine,
        /** Every such line, when the same caller references the target more than once. */
        lines: refLines,
        /** Where this symbol is itself declared. */
        declaredAt: Number((node?.properties as any)?.range?.start?.line ?? (node?.properties as any)?.lineStart ?? 0) || null,
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
