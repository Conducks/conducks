import { ConducksAdjacencyList, NodeId, ConducksNode } from '@/lib/core/graph/adjacency-list.js';
import { ConducksComponent } from "@/registry/types.js";

interface StructuralSignature {
  density: number;
  avgKineticEnergy: number;
  nodeTypeWeights: Record<string, number>;
  cohesionVariance: number;
}

/**
 * Conducks — Project Resonance Analyzer
 * 
 * Logic for comparing two structural foundation repositories.
 */
export class ResonanceAnalyzer implements ConducksComponent {
  public readonly id = 'resonance-analyzer';
  public readonly type = 'analyzer';
  public readonly description = 'Calculates structural resonance and similarity between codebases.';
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

    // Final Resonance Score (Weighted Average)
    const totalScore = (densitySim * 0.3) + (kineticSim * 0.3) + (typeSim * 0.4);

    return {
      similarity: Math.round(totalScore * 100),
      metrics: {
        density: densitySim,
        kinetic: kineticSim,
        typology: typeSim
      },
      summary: this.summarize(totalScore)
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
      cohesionVariance: 0 // Placeholder for future evolution
    };
  }

  private summarize(score: number): string {
    if (score > 0.9) return "Identical Architectural Resonance (Pristine Mirror).";
    if (score > 0.7) return "Strong Architectural Resonance (Same Ecosystem).";
    if (score > 0.4) return "Partial Structural Resonance (Potential Sub-pattern).";
    return "Weak Resonance (Low Structural Similarity).";
  }
}
