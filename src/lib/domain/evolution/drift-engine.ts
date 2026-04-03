import { DuckDbPersistence } from "@/lib/core/persistence/persistence.js";
import { logger } from "@/lib/core/utils/logger.js";

/**
 * Conducks — Structural Drift Engine 🕵️‍♂️
 * 
 * Analyzes the delta between two structural pulses to detect architectural decay.
 * PageRank velocity, complexity bloat, and coupling entropy.
 */
export class DriftEngine {
  constructor(private readonly persistence: DuckDbPersistence) {}

  /**
   * Compares the current pulse against a previous one.
   * If pulseId is not provided, uses the two most recent pulses.
   */
  public async compare(prevPulseId?: string): Promise<DriftResult> {
    const db = await this.persistence.getRawConnection();
    if (!db) throw new Error("Persistence layer is offline.");

    // 1. Resolve Pulses
    const pulses: any[] = await new Promise((res) => db.all("SELECT id, timestamp FROM pulses ORDER BY timestamp DESC LIMIT 2", (err: any, rows: any[]) => res(err ? [] : rows)));
    
    if (pulses.length < 2 && !prevPulseId) {
      return { 
        status: 'STABLE', 
        message: 'Insufficient historical data for drift analysis (Need at least 2 pulses).',
        deltas: [] 
      };
    }

    const currentPulseId = pulses[0].id;
    const targetPrevPulseId = prevPulseId || pulses[1].id;

    // 2. Query Deltas
    // We join the nodes table on itself for matching IDs across different pulseIds
    const driftQuery = `
      SELECT 
        c.id, 
        c.name, 
        c.file,
        c.gravity as current_gravity,
        p.gravity as prev_gravity,
        c.complexity as current_complexity,
        p.complexity as prev_complexity,
        c.entropy as current_entropy,
        p.entropy as prev_entropy
      FROM nodes c
      JOIN nodes p ON c.id = p.id
      WHERE c.pulseId = ? AND p.pulseId = ?
    `;

    const rows: any[] = await new Promise((res) => db.all(driftQuery, [currentPulseId, targetPrevPulseId], (err: any, rows: any[]) => res(err ? [] : rows)));

    const deltas = rows.map(row => {
      const gDelta = row.current_gravity - row.prev_gravity;
      const cDelta = row.current_complexity - row.prev_complexity;
      const eDelta = row.current_entropy - row.prev_entropy;

      return {
        id: row.id,
        name: row.name,
        file: row.file,
        gravity_delta: gDelta,
        complexity_delta: cDelta,
        entropy_delta: eDelta,
        velocity: (gDelta * 0.4) + (cDelta * 0.4) + (eDelta * 0.2)
      };
    }).filter(d => Math.abs(d.velocity) > 0.01)
      .sort((a, b) => b.velocity - a.velocity)
      .slice(0, 100);

    const hotspots = deltas.filter(d => d.velocity > 0.05).slice(0, 5);
    
    return {
      status: hotspots.length > 0 ? 'DECAYING' : 'STABLE',
      message: hotspots.length > 0 
        ? `Structural decay detected in ${hotspots.length} hotspots.` 
        : `Structural resonance is stable across ${rows.length} symbols.`,
      deltas: deltas,
      hotspots: hotspots,
      summary: {
        total_symbols: rows.length,
        decay_count: deltas.filter(d => d.velocity > 0).length,
        improvement_count: deltas.filter(d => d.velocity < 0).length
      }
    };
  }
}

export interface DriftResult {
  status: 'STABLE' | 'DECAYING' | 'IMPROVING';
  message: string;
  deltas: Array<{
    id: string;
    name: string;
    file: string;
    gravity_delta: number;
    complexity_delta: number;
    entropy_delta: number;
    velocity: number;
  }>;
  hotspots?: any[];
  summary?: {
    total_symbols: number;
    decay_count: number;
    improvement_count: number;
  };
}
