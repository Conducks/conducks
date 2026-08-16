import { ConducksGraph } from "@/lib/core/graph/graph-engine.js";
import { SynapsePersistence } from "@/lib/core/persistence/persistence.js";
import { DeadCodeAnalyzer, Finding } from "../evolution/dead-code.js";
import { ResonanceAnalyzer } from "./resonance.js";
import { TestAligner } from "./test-aligner.js";
import { chronicle } from "@/lib/core/git/index.js";
import { calculateShannonEntropy, normalizeEntropyRisk } from "@/lib/core/algorithms/entropy.js";

/**
 * Conducks — Metrics Domain Service
 * 
 * Centralized logic for structural risk assessment, 
 * author distribution analysis, and structural similarity.
 */
export class MetricsService {

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
    if (!node || !node.properties.filePath) return { entropy: 0, risk: 0, authorCount: 0 };

    const distribution = await chronicle.getAuthorDistribution(node.properties.filePath);
    // A null distribution is "git could not be read", not "one careful owner". Reporting risk 0
    // for it made the least-known file look like the safest one on the board.
    if (distribution === null) {
      return { entropy: 0, risk: 0, authorCount: 0, unavailable: true };
    }
    const authors = Object.keys(distribution);
    const entropy = calculateShannonEntropy(distribution);
    const risk = normalizeEntropyRisk(entropy, authors.length || 1);

    return { entropy, risk, authorCount: authors.length };
  }

  /**
   * `calculateCompositeRisk` lived here TOO, and was dead — zero callers, zero tests.
   *
   * The registry wires risk to `ConducksCore.calculateCompositeRisk`, and the two returned
   * DIFFERENT SHAPES under one name: this one `{ gravity: { value, weight } }`, the live one plain
   * numbers. `explain` was written against this shape and served by the other, so every signal it
   * printed read `NaN` while the composite score above them was correct (ADR 0105).
   *
   * Deleted rather than reconciled: a second implementation nothing calls is not a fallback, it is
   * a second answer waiting to be picked by accident. Its `factors` logic — the only thing it had
   * that the live one lacked — moved to `ConducksCore` rather than being lost with it (ADR 0112).
   */

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
