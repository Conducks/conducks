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
    hotspots: any[] 
  }> {
    const drift: DriftResult = await this.driftEngine.compare();

    if (drift.status === 'STABLE') {
      return { 
        block: false, 
        risk: 0, 
        message: 'Structural resonance is stable. No regression detected.', 
        hotspots: [] 
      };
    }

    // 1. Calculate the Global Risk of the Pulse
    // We average the velocity of all significant deltas
    const deltas = drift.deltas || [];
    const totalVelocity = deltas.reduce((sum: number, d: any) => sum + (d.velocity || 0), 0);
    const avgRisk = deltas.length > 0 ? (totalVelocity / deltas.length) : 0;

    // 2. Decision Logic
    const isBlocking = avgRisk > threshold;

    return {
      block: isBlocking,
      risk: avgRisk,
      message: isBlocking 
        ? `🔥 ARCHITECTURAL REGRESSION: Global risk (${avgRisk.toFixed(3)}) exceeds threshold (${threshold}).`
        : `✅ Stability acceptable: Global risk (${avgRisk.toFixed(3)}) within limits.`,
      hotspots: deltas
    };
  }
}
