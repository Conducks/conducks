import { ConducksAdjacencyList, NodeId, ConducksNode, ConducksEdge } from '@/lib/core/graph/adjacency-list.js';
import { ConducksComponent } from '@/registry/types.js';

/**
 * Conducks — Graph Search Engine
 * 
 * Logic for performing Wavefront Resonance search on the graph.
 */
export class ConducksSearch implements ConducksComponent {
  public readonly id = 'search-engine';
  public readonly type = 'analyzer';
  public readonly description = 'Provides pattern-based discovery across the structural graph.';

  constructor(private readonly graph: ConducksAdjacencyList) {}

  /**
   * Performs a Structural Resonance Search.
   * 
   * Ranks symbols by a combination of Direct Term Matching and 
   * Kinetic Gravity (importance in the synapse).
   */
  public search(query: string, limit: number = 20): ConducksNode[] {
    const results = new Map<NodeId, number>();
    const tokens = query.toLowerCase().split(/\s+/);

    for (const node of this.graph.getAllNodes()) {
      let score = 0;
      const nodeName = (node.properties?.name || '').toLowerCase();
      const nodeLabel = (node.label || '').toLowerCase();

      if (!nodeName && !nodeLabel) continue;

      // 1. Direct Term Match (Higher Weight)
      const nodePath = (node.properties?.filePath || '').toLowerCase();
      const canonicalKind = (node.properties?.canonicalKind || '').toLowerCase();
      const canonicalRank = (node.properties?.canonicalRank?.toString() || '');

      for (const token of tokens) {
        if (nodeName === token) score += 100;
        else if (nodeName.includes(token)) score += 20;
        if (nodeLabel.includes(token)) score += 5;
        if (nodePath.includes(token)) score += 10;
        if (canonicalKind === token) score += 50; 
        if (canonicalRank === token) score += 10;
      }

      if (score > 0) {
        // 2. Kinetic Gravity Multiplier
        // Important nodes (highly called) resonate stronger.
        const gravity = node.properties.rank || 1;
        const totalScore = score * gravity;

        results.set(node.id, totalScore);

        // 3. Wavefront Propagation (Transitive Resonance)
        // If this node matches, its immediate neighbors gain "Echo Resonance".
        this.propagateWavefront(node.id, totalScore * 0.5, results, 1);
      }
    }

    // Sort and return top nodes
    return Array.from(results.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => this.graph.getNode(id))
      .filter((n): n is ConducksNode => n !== undefined);
  }

  /**
   * Propagates resonance through the synapse graph.
   */
  private propagateWavefront(
    startId: NodeId, 
    energy: number, 
    results: Map<NodeId, number>, 
    depth: number
  ): void {
    if (depth <= 0 || energy < 1) return;

    const neighbors = this.graph.getNeighbors(startId, 'upstream'); // Propagate to callers
    for (const edge of neighbors) {
      if (!this.graph.hasNode(edge.sourceId)) continue;
      const current = results.get(edge.sourceId) || 0;
      results.set(edge.sourceId, current + energy);
      
      this.propagateWavefront(edge.sourceId, energy * 0.3, results, depth - 1);
    }
  }
}
