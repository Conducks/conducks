import { ConducksAdjacencyList } from "@/lib/core/graph/index.js";

interface StructuralSignature {
  density: number;
  avgKineticEnergy: number;
  nodeTypeWeights: Record<string, number>;
  cohesionVariance: number;
  /** File extensions present, and the third-party packages imported. See `ecosystemOf`. */
  languages: Set<string>;
  packages: Set<string>;
}

/**
 * Conducks — Project Resonance Analyzer
 * 
 * Logic for comparing two structural foundation repositories.
 */
export class ResonanceAnalyzer {
  /**
   * Compares the 'current' graph with an 'other' graph.
   */
  public analyzeResonance(current: ConducksAdjacencyList, other: ConducksAdjacencyList) {
    const sig1 = this.getSignature(current);
    const sig2 = this.getSignature(other);
    
    // 1. Density Similarity (0-1)
    const densitySim = 1 - Math.abs(sig1.density - sig2.density) / Math.max(sig1.density, sig2.density, 1);
    
    // 2. Kinetic Distribution Similarity (0-1)
    const kineticSim = 1 - Math.abs(sig1.avgKineticEnergy - sig2.avgKineticEnergy) / Math.max(sig1.avgKineticEnergy, sig2.avgKineticEnergy, 1);
    
    // 3. Node Type Weights (Weighted Jaccard)
    let typeSim = 0;
    const allTypes = new Set([...Object.keys(sig1.nodeTypeWeights), ...Object.keys(sig2.nodeTypeWeights)]);
    let intersection = 0;
    let union = 0;
    
    for (const type of allTypes) {
      const w1 = sig1.nodeTypeWeights[type] || 0;
      const w2 = sig2.nodeTypeWeights[type] || 0;
      intersection += Math.min(w1, w2);
      union += Math.max(w1, w2);
    }
    typeSim = union > 0 ? (intersection / union) : 1;

    // 4. ECOSYSTEM overlap — the thing the summary was ASSERTING without measuring.
    //
    // The three components above describe SHAPE: how densely the graph is connected, how the node
    // kinds are distributed. Two projects that share no language, no framework and no dependency can
    // score high on all three simply by being about the same size — and the verdict printed for any
    // score over 0.7 was "Strong Architectural Resonance (Same Ecosystem)."
    //
    // MEASURED: the scraper subject (pure Python + Playwright) against the sofie subject
    // (TypeScript + Electron + React) → 70%, "Same Ecosystem". Against the orchestrator subject
    // (TypeScript + Next.js) → 80%, "Same Ecosystem". They share no file extension and not one
    // dependency. The number was a fact about graph shape; the sentence was a claim about kinship.
    const ecosystemSim = this.jaccard(
      new Set([...sig1.languages, ...[...sig1.packages].map(p => `pkg:${p}`)]),
      new Set([...sig2.languages, ...[...sig2.packages].map(p => `pkg:${p}`)]),
    );

    // Final Resonance Score (Weighted Average)
    const structureScore = (densitySim * 0.3) + (kineticSim * 0.3) + (typeSim * 0.4);

    return {
      similarity: Math.round(structureScore * 100),
      metrics: {
        density: densitySim,
        kinetic: kineticSim,
        typology: typeSim,
        ecosystem: ecosystemSim,
      },
      /** Kept separate from `similarity`, which has always meant structural shape. */
      sharedLanguages: [...sig1.languages].filter(l => sig2.languages.has(l)).sort(),
      sharedPackages: [...sig1.packages].filter(p => sig2.packages.has(p)).sort().slice(0, 20),
      summary: this.summarize(structureScore, ecosystemSim)
    };
  }

  private getSignature(graph: ConducksAdjacencyList): StructuralSignature {
    const nodes = Array.from(graph.getAllNodes());
    const stats = graph.stats;
    
    const density = stats.nodeCount > 0 ? (stats.edgeCount / stats.nodeCount) : 0;
    const avgKinetic = nodes.length > 0 
      ? nodes.reduce((sum, n) => sum + (n.properties.kineticEnergy || 0), 0) / nodes.length 
      : 0;
      
    const typeWeights: Record<string, number> = {};
    nodes.forEach(n => {
      typeWeights[n.label] = (typeWeights[n.label] || 0) + 1;
    });

    return {
      density,
      avgKineticEnergy: avgKinetic,
      nodeTypeWeights: typeWeights,
      cohesionVariance: 0, // Placeholder for future evolution
      ...this.ecosystemOf(nodes),
      packages: this.packagesOf(graph),
    };
  }

  /**
   * What this project is BUILT FROM: the source languages present and the third-party packages it
   * imports. Read from the graph the pulse already holds — file extensions on real nodes, and the
   * `package` property the boundary classifier stamps on every dependency edge.
   */
  private ecosystemOf(nodes: any[]): { languages: Set<string>; packages: Set<string> } {
    const languages = new Set<string>();
    const packages = new Set<string>();
    for (const n of nodes) {
      const file = String(n.properties?.filePath ?? '');
      if (file && !file.startsWith('external://')) {
        const ext = file.slice(file.lastIndexOf('.') + 1).toLowerCase();
        if (ext && ext.length <= 5 && ext !== file) languages.add(ext);
      }
    }
    return { languages, packages };
  }

  /**
   * The THIRD-PARTY packages, read from the origin the boundary classifier already stamped on each
   * dependency edge — the same source `supply-chain` reports from, so the two commands cannot
   * disagree about what counts as a dependency.
   *
   * Reading ECOSYSTEM nodes instead would count the standard library (`os`, `json`, `fs`, `crypto`)
   * and the taxonomy's own scaffolding (`ecosystem::global`, `ecosystem::legend`), which every
   * project shares — putting a floor under every comparison.
   */
  private packagesOf(graph: ConducksAdjacencyList): Set<string> {
    const out = new Set<string>();
    for (const e of graph.getAllEdges()) {
      const props = (e as any).properties;
      if (!props || props.origin !== 'dependency' || !props.package) continue;
      out.add(String(props.package).toLowerCase());
    }
    return out;
  }

  private jaccard(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 0;
    let shared = 0;
    for (const x of a) if (b.has(x)) shared++;
    return shared / (a.size + b.size - shared);
  }

  /**
   * Says what was measured, and never more.
   *
   * The old wording promoted a shape score into a claim about kinship — "(Same Ecosystem)" — which
   * the analyzer had no input capable of supporting. Now the shape verdict and the stack verdict are
   * two sentences because they are two findings, and a high shape score over a disjoint stack reads
   * as what it is: a coincidence of size.
   */
  private summarize(score: number, ecosystem: number): string {
    const shape =
      score > 0.9 ? "Near-identical structural shape" :
      score > 0.7 ? "Similar structural shape" :
      score > 0.4 ? "Partially similar structural shape" :
                    "Different structural shape";
    const stack =
      ecosystem > 0.6 ? "same stack (languages and dependencies largely shared)" :
      ecosystem > 0.2 ? "partly shared stack" :
      ecosystem > 0   ? "different stack (little overlap in languages or dependencies)" :
                        "NO shared language or dependency — the shape score is a coincidence of size, not kinship";
    return `${shape}; ${stack}.`;
  }
}
