import { ConducksAdjacencyList, NodeId, ConducksNode } from "../adjacency-list.js";

/**
 * Conducks — Structural Ranking & Anchoring
 * 
 * Implements PageRank-based Gravity analysis and entry point heuristics.
 */
export class StructuralRanker {
  /**
   * High-Fidelity PageRank Convergence
   */
  public static calculateGravity(graph: ConducksAdjacencyList, iterations: number = 30, damping: number = 0.85): void {
    const nodes = Array.from(graph.getAllNodes());
    if (nodes.length === 0) return;

    // 1. Identify Architectural Anchors
    const anchors = nodes.filter(node => {
      const p = node.properties;
      const ck = p.canonicalKind;
      return ck === 'STRUCTURE' || ck === 'FUNCTION' || ck === 'BEHAVIOR' || ck === 'INFRA' || p.isModule || node.label === 'module' || node.label === 'unit';
    });

    const AN = anchors.length;
    if (AN === 0) return;

    let ranks = new Map<NodeId, number>();
    for (const node of anchors) ranks.set(node.id, 1 / AN);

    // 2. Power Iteration
    for (let i = 0; i < iterations; i++) {
      const nextRanks = new Map<NodeId, number>();
      let sinkRank = 0;

      for (const node of anchors) {
        const out = graph.getNeighbors(node.id, 'downstream');
        const archOut = out ? out.filter(e => ranks.has(e.targetId)) : [];
        if (archOut.length === 0) sinkRank += ranks.get(node.id)!;
      }

      for (const node of anchors) {
        let rankSum = 0;
        const incoming = graph.getNeighbors(node.id, 'upstream');
        if (incoming) {
          for (const edge of incoming) {
            if (!ranks.has(edge.sourceId)) continue;
            const srcOut = graph.getNeighbors(edge.sourceId, 'downstream');
            const srcOutDegree = srcOut ? srcOut.filter(e => ranks.has(e.targetId)).length : 1;
            rankSum += ranks.get(edge.sourceId)! / Math.max(1, srcOutDegree);
          }
        }

        const newRank = ((1 - damping) / AN) + damping * (rankSum + (sinkRank / AN));
        nextRanks.set(node.id, newRank);
      }
      ranks = nextRanks;
    }

    // 3. Commit Gravity
    for (const node of nodes) {
      const rank = ranks.get(node.id) || 0;
      node.properties.rank = rank;
      node.properties.gravity = rank;
      node.properties.kineticEnergy = rank * AN;
    }

    // 4. Conducks — Identify Entry Points after importance is known
    this.detectEntryPoints(graph);
  }

  /**
   * Conducks — Entry Point Intelligence
   */
  public static detectEntryPoints(graph: ConducksAdjacencyList): void {
    const entryPointNames = new Set(['main', 'app', 'run', 'start', 'cli', 'index', 'handler', 'server', 'cmd', 'entry']);
    const entryPointFiles = new Set(['main.py', 'app.py', 'index.ts', 'server.ts', 'cli.ts', 'main.go', 'main.rs']);

    for (const node of graph.getAllNodes()) {
      const props = node.properties;
      const lowerName = props.name?.toLowerCase() || '';
      const basename = props.filePath ? props.filePath.split('/').pop() || '' : '';

      let isEntry = false;

      // 1. Explicit Framework Routes (Detected during refraction)
      if (node.label === 'route' || node.label.includes('route') || props.kind?.includes('route')) {
        isEntry = true;
      }

      // 2. Transitive Root Signature
      const incoming = graph.getNeighbors(node.id, 'upstream').length;
      const outgoing = graph.getNeighbors(node.id, 'downstream').length;

      if (incoming === 0 && outgoing > 0) {
        if (node.label === 'module' || node.label === 'file' || node.label === 'function' || node.label === 'class') {
           isEntry = true;
        }
      }

      // 3. Global Constants & Naming Heuristics
      if (entryPointNames.has(lowerName)) isEntry = true;
      if (basename && entryPointFiles.has(basename)) isEntry = true;
      if (props.isEntryPoint) isEntry = true;

      node.properties.isEntryPoint = isEntry;
    }
  }
}
