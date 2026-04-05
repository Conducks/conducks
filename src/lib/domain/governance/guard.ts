import { DuckDbPersistence } from "@/lib/core/persistence/persistence.js";
import { DriftEngine, DriftResult } from "@/lib/domain/evolution/drift-engine.js";
import { logger } from "@/lib/core/utils/logger.js";

/**
 * Conducks — Structural Regression Guard 🛡️ 🏺 🟦
 * 
 * Enforces structural integrity by blocking commits that introduce significant decay.
 * PageRank velocity, complexity bloat, and coupling entropy.
 */
export class RegressionGuard {
  private driftEngine: DriftEngine;

  constructor(private readonly persistence: DuckDbPersistence) {
    this.driftEngine = new DriftEngine(persistence);
  }

  /**
   * Evaluates the latest pulse against a configurable threshold.
   * Returns true if the structural delta is within acceptable limits.
   */
  public async shouldBlock(threshold: number = 0.1): Promise<{ 
    block: boolean, 
    risk: number, 
    message: string, 
    hotspots: any[],
    factors: string[]
  }> {
    const drift: DriftResult = await this.driftEngine.compare();

    if (drift.status === 'STABLE') {
      return { 
        block: false, 
        risk: 0, 
        message: 'Structural resonance is stable. No regression detected.', 
        hotspots: [],
        factors: []
      };
    }

    // 1. Calculate the Global Risk of the Pulse
    const deltas = drift.deltas || [];
    const totalVelocity = deltas.reduce((sum: number, d: any) => sum + (d.velocity || 0), 0);
    const avgRisk = deltas.length > 0 ? (totalVelocity / deltas.length) : 0;

    // 2. Identify Semantic Factors (The "Why")
    const factors: string[] = [];
    const highDriftCount = deltas.filter(d => d.velocity > (threshold * 1.5)).length;
    const complexityBloat = deltas.some(d => d.complexity_delta > 10);
    
    if (highDriftCount > 0) factors.push(`${highDriftCount} units exceeded the critical drift velocity.`);
    if (complexityBloat) factors.push("Significant complexity bloat detected in core symbols.");
    if (totalVelocity > (threshold * 5)) factors.push("Major architectural footprint expansion detected.");
    if (drift.moves && drift.moves.length > 0) factors.push(`${drift.moves.length} structural renames detected in this pulse.`);

    // 3. Decision Logic
    const isBlocking = avgRisk > threshold;

    return {
      block: isBlocking,
      risk: avgRisk,
      message: isBlocking 
        ? `🔥 ARCHITECTURAL REGRESSION: Global risk (${avgRisk.toFixed(3)}) exceeds threshold (${threshold}).`
        : `✅ Stability acceptable: Global risk (${avgRisk.toFixed(3)}) within limits.`,
      hotspots: deltas,
      factors
    };
  }
}
