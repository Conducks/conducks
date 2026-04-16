import { ConducksGraph } from "@/lib/core/graph/graph-engine.js";
import { SynapsePersistence } from "@/lib/core/persistence/persistence.js";
import { DeadCodeAnalyzer, Finding } from "../evolution/dead-code.js";
import { ResonanceAnalyzer } from "./resonance.js";
import { TestAligner } from "./test-aligner.js";
import { chronicle } from "@/lib/core/git/chronicle-interface.js";
import { calculateShannonEntropy, normalizeEntropyRisk } from "@/lib/core/algorithms/entropy.js";
import { ConducksComponent } from "@/registry/types.js";

/**
 * Conducks — Metrics Domain Service
 * 
 * Centralized logic for structural risk assessment, 
 * author distribution analysis, and structural similarity.
 */
export class MetricsService implements ConducksComponent {
  public readonly id = 'metrics-service';
  public readonly type = 'analyzer';
  public readonly description = 'Orchestrates structural risk assessment and kinetic metrics.';

  constructor(
    private graph: ConducksGraph,
    private deadCode: DeadCodeAnalyzer,
    private resonance: ResonanceAnalyzer,
    private aligner?: TestAligner
  ) {}

  /**
   * Calculates Shannon Entropy and normalized risk for a symbol's ownership.
   */
  public async calculateEntropy(symbolId: string) {
    const g = this.graph.getGraph();
    const node = g.getNode(symbolId);
    if (!node || !node.properties.filePath) return { entropy: 0, risk: 0 };

    const distribution = (await chronicle.getAuthorDistribution(node.properties.filePath)) || {};
    const authors = Object.keys(distribution);
    const entropy = calculateShannonEntropy(distribution);
    const risk = normalizeEntropyRisk(entropy, authors.length || 1);

    return { entropy, risk, authorCount: authors.length };
  }

  /**
   * Computes a multi-signal risk score (0.0 to 10.0).
   * Signal Weights: Gravity (40%), Entropy (30%), Churn (20%), Fan-out (10%).
   */
  public async calculateCompositeRisk(nodeId: string) {
    const g = this.graph.getGraph();
    const node = g.getNode(nodeId);
    if (!node) return null;

    const rank = node.properties.rank || 0;
    const entropy = node.properties.entropy || 0;
    const res = node.properties.resonance || 0;
    const outgoing = g.getNeighbors(nodeId, 'downstream').length;
    const complexity = node.properties.complexity || 1;

    const factors: string[] = [];
    if (rank > 0.7) factors.push("High Structural Gravity (Core system bridge)");
    if (entropy > 0.6) factors.push("Unstable Ownership (High author entropy)");
    if (res > 50) factors.push("High Kinetic Churn (Frequent modifications)");
    if (outgoing > 8) factors.push("God Object Candidate (High fan-out)");
    if (complexity > 50) factors.push("Critical Complexity (Difficult to maintain)");

    const score = (rank * 0.4) + (entropy * 0.3) + (Math.min(res / 100, 1.0) * 0.2) + (Math.min(outgoing / 10, 1.0) * 0.1);

    return {
      score,
      factors,
      breakdown: {
        gravity: { value: rank, weight: 0.4 },
        entropy: { value: entropy, weight: 0.3 },
        churn: { value: Math.min(res / 100, 1.0), weight: 0.2 },
        fanOut: { value: Math.min(outgoing / 10, 1.0), weight: 0.1 }
      }
    };
  }

  /**
   * Calculates the structural similarity (Jaccard) between two symbols.
   */
  public getLevelSimilarity(sourceId: string, targetId: string): number {
    const g = this.graph.getGraph();
    const sN = new Set(g.getNeighbors(sourceId, 'downstream').map(n => n.targetId));
    const tN = g.getNeighbors(targetId, 'downstream').map(n => n.targetId);
    
    if (sN.size === 0 && tN.length === 0) return 0;
    
    const intersection = tN.filter(n => sN.has(n));
    const union = new Set([...sN, ...tN]);
    return intersection.length / union.size;
  }

  /**
   * Identifies orphan symbols with no incoming edges.
   */
  public prune() {
    return this.deadCode.analyze(this.graph.getGraph());
  }

  /**
   * Compares the current structural resonance with another repository.
   * Standardizes project-loading logic within the domain service.
   */
  public async compare(otherPath: string) {
    const otherGraph = new ConducksGraph();
    const otherPersistence = new SynapsePersistence(otherPath, true);
    await otherPersistence.load(otherGraph.getGraph());
    
    return this.resonance.analyzeResonance(this.graph.getGraph(), otherGraph.getGraph());
  }
}

export type { Finding };
export { DeadCodeAnalyzer } from "../evolution/dead-code.js";
export { ResonanceAnalyzer } from "./resonance.js";
export { TestAligner } from "./test-aligner.js";
