import { SynapsePersistence } from "@/lib/core/persistence/persistence.js";
import { logger } from "@/lib/core/utils/logger.js";

/**
 * Conducks — Structural Drift Engine 🕵️‍♂️
 * 
 * Analyzes the delta between two structural pulses to detect architectural decay.
 * PageRank velocity, complexity bloat, and coupling entropy.
 */
export class DriftEngine {
  constructor(private readonly persistence: SynapsePersistence) {}

  /**
   * Compares the current pulse against a previous one.
   * If pulseId is not provided, uses the two most recent pulses.
   */
  public async compare(prevPulseId?: string): Promise<DriftResult> {
    // 1. Resolve Pulses
    let pulses: any[] = [];
    try {
      pulses = await this.persistence.query("SELECT id, timestamp FROM pulses ORDER BY timestamp DESC LIMIT 2");
    } catch (err: any) {
      logger.error(`[DriftEngine] Failed to fetch pulses: ${err.message}`);
    }

    if (pulses.length < 2 && !prevPulseId) {
      return {
        status: 'INSUFFICIENT_DATA',
        message: 'Insufficient historical data for drift analysis (Need at least 2 pulses).',
        deltas: [],
        moves: []
      };
    }

    const currentPulseId = pulses[0].id;
    const targetPrevPulseId = prevPulseId || pulses[1].id;

    // 2. Query Deltas (Exact Matches via ID)
    const exactDriftQuery = `
      SELECT
        c.nodeId as id, n.name, n.file, c.fingerprint as current_fingerprint,
        p.fingerprint as prev_fingerprint,
        c.gravity as current_gravity, p.gravity as prev_gravity,
        c.complexity as current_complexity, p.complexity as prev_complexity
      FROM node_history c
      JOIN node_history p ON c.nodeId = p.nodeId
      JOIN nodes n ON n.id = c.nodeId
      WHERE c.pulseId = ? AND p.pulseId = ?
    `;

    // 3. Query Structural "Moves" (Same DNA, Different ID)
    const moveQuery = `
      SELECT
        c.nodeId as current_id, p.nodeId as prev_id, n.name, n.file,
        c.fingerprint, c.gravity as current_gravity, p.gravity as prev_gravity
      FROM node_history c
      JOIN node_history p ON c.fingerprint = p.fingerprint AND c.nodeId != p.nodeId
      JOIN nodes n ON n.id = c.nodeId
      WHERE c.pulseId = ? AND p.pulseId = ?
      AND c.nodeId NOT IN (SELECT nodeId FROM node_history WHERE pulseId = ?)
    `;

    // Sequential queries — lazy persistence closes connection between calls
    let exactRows: any[] = [];
    let moveRows: any[] = [];
    try {
      exactRows = await this.persistence.query(exactDriftQuery, [currentPulseId, targetPrevPulseId]);
    } catch (err: any) {
      logger.error(`[DriftEngine] Exact drift query failed: ${err.message}`);
    }
    try {
      moveRows = await this.persistence.query(moveQuery, [currentPulseId, targetPrevPulseId, targetPrevPulseId]);
    } catch (err: any) {
      logger.error(`[DriftEngine] Move query failed: ${err.message}`);
    }

    const deltas = exactRows.map(row => {
      const gDelta = row.current_gravity - row.prev_gravity;
      const cDelta = row.current_complexity - row.prev_complexity;
      const isShifted = row.current_fingerprint !== row.prev_fingerprint;

      return {
        id: row.id,
        name: row.name,
        file: row.file,
        gravity_delta: gDelta,
        complexity_delta: cDelta,
        isModified: isShifted,
        velocity: (gDelta * 0.5) + (cDelta * 0.5)
      };
    }).filter(d => Math.abs(d.velocity) > 0.001 || d.isModified);

    const moves = moveRows.map((row: any) => ({
      from: row.prev_id,
      to: row.current_id,
      name: row.name,
      file: row.file,
      gravity: row.current_gravity
    }));
    
    return {
      status: deltas.some(d => d.velocity > 0.05) ? 'DECAYING' : 'STABLE',
      // The message must agree with the status. It used to say "stable" unconditionally, so a
      // DECAYING result printed "Structural resonance stable across N symbols" beside a list of
      // decay hotspots — reassuring text over a warning, which is the same failure as reporting
      // STABLE from a check that ran on nothing.
      message: (() => {
        const decaying = deltas.filter(d => d.velocity > 0.05).length;
        const renames = moves.length > 0 ? ` ${moves.length} structural rename(s) detected.` : '';
        return decaying > 0
          ? `Structural decay in ${decaying} of ${exactRows.length} symbols compared.${renames}`
          : `Structural resonance stable across ${exactRows.length} symbols.${renames}`;
      })(),
      deltas,
      moves,
      summary: {
        total_symbols: exactRows.length,
        decay_count: deltas.filter(d => d.velocity > 0).length,
        improvement_count: deltas.filter(d => d.velocity < 0).length,
        move_count: moves.length
      }
    } as DriftResult;
  }
}

export interface DriftResult {
  status: 'STABLE' | 'DECAYING' | 'IMPROVING' | 'INSUFFICIENT_DATA';
  message: string;
  deltas: Array<{
    id: string;
    name: string;
    file: string;
    gravity_delta: number;
    complexity_delta: number;
    isModified: boolean;
    velocity: number;
  }>;
  moves: Array<{
    from: string;
    to: string;
    name: string;
    file: string;
    gravity: number;
  }>;
  summary?: {
    total_symbols: number;
    decay_count: number;
    improvement_count: number;
    move_count: number;
  };
}
