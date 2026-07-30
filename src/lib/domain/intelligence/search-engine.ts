import { ConducksAdjacencyList, NodeId, ConducksNode } from '@/lib/core/graph/adjacency-list.js';

/**
 * Conducks — Graph Search Engine
 * 
 * Logic for performing Wavefront Resonance search on the graph.
 */
export class ConducksSearch {

  constructor(private readonly graph: ConducksAdjacencyList) {}

  /**
   * Performs a Structural Resonance Search.
   * 
   * Ranks symbols by a combination of Direct Term Matching and 
   * Kinetic Gravity (importance in the synapse).
   */
  public search(query: string, limit: number = 20): ConducksNode[] {
    const results = new Map<NodeId, number>();
    const trimmed = query.trim();

    // `*` is the documented INVENTORY query (features.md, "Symbol Listing"): the heaviest symbols
    // first, for reading a codebase top-down rather than searching for a name you already know.
    // Scoring treated it as a literal token, so it matched no node name and every project answered
    // "No symbols found" — a documented feature that had no implementation behind it.
    if (trimmed === "*" || trimmed === "") return this.inventory(limit);

    const tokens = trimmed.toLowerCase().split(/\s+/);

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
        this.propagateWavefront(node.id, totalScore * 0.5, results, 3);
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
   * The full inventory: named symbols ordered by structural gravity, heaviest first.
   *
   * Containers are excluded. An inventory answering `ECOSYSTEM`, `REPOSITORY` and `DIRECTORY` before
   * a single function would bury the answer under the folder tree the user is already looking at —
   * "show me the heaviest things here" means symbols, not the directories holding them.
   */
  private inventory(limit: number): ConducksNode[] {
    const CONTAINERS = new Set(["ECOSYSTEM", "REPOSITORY", "DIRECTORY"]);
    // getAllNodes() is an IterableIterator, not an array — materialise before sorting.
    return Array.from(this.graph.getAllNodes())
      .filter((n: ConducksNode) => {
        if (!n.properties?.name) return false;
        return !CONTAINERS.has(String(n.properties.canonicalKind ?? ""));
      })
      .sort((a: ConducksNode, b: ConducksNode) => {
        const gravity = (b.properties.rank ?? 0) - (a.properties.rank ?? 0);
        if (gravity !== 0) return gravity;
        // Stable, readable tie-break: rank is 0 for everything until `resonate` has run.
        return String(a.properties.name).localeCompare(String(b.properties.name));
      })
      .slice(0, limit);
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
