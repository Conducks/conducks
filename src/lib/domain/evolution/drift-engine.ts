import { SynapsePersistence } from "@/lib/core/persistence/persistence.js";
import { logger } from "@/lib/core/utils/index.js";

/**
 * Conducks — Structural Drift Engine 🕵️‍♂️
 * 
 * Analyzes the delta between two structural pulses to detect architectural decay.
 * PageRank velocity, complexity bloat, and coupling entropy.
 */
/**
 * The velocity above which a symbol counts as DECAYING.
 *
 * There were two thresholds and one word. The human message counted `velocity > 0.05`; the
 * machine-readable `summary.decay_count` counted `velocity > 0`, which is any movement at all in
 * the decaying direction, including noise. On this repository they printed 3 and 153 on the same
 * screen, both labelled "decay", with nothing saying which was meant (todo26).
 *
 * One definition now serves both. A reader comparing the sentence to the summary sees one number.
 */
export const DECAY_VELOCITY_THRESHOLD = 0.05;

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
    // A failed query and a genuinely quiet codebase both leave these arrays empty, and until this
    // flag existed the caller could not tell them apart: `deltas.some(...)` is false on an empty
    // array, so a thrown query reported STABLE — a green verdict from a comparison that never ran.
    let queryFailed = false;
    try {
      exactRows = await this.persistence.query(exactDriftQuery, [currentPulseId, targetPrevPulseId]);
    } catch (err: any) {
      queryFailed = true;
      logger.error(`[DriftEngine] Exact drift query failed: ${err.message}`);
    }
    try {
      moveRows = await this.persistence.query(moveQuery, [currentPulseId, targetPrevPulseId, targetPrevPulseId]);
    } catch (err: any) {
      queryFailed = true;
      logger.error(`[DriftEngine] Move query failed: ${err.message}`);
    }

    const deltas = exactRows.map(row => {
      const gDelta = row.current_gravity - row.prev_gravity;
      const cDelta = row.current_complexity - row.prev_complexity;
      // A NULL fingerprint on either side means structural identity was never comparable for this
      // row — the opposite of "nothing changed". Before this guard, `null !== null` is false in
      // JS, so a symbol missing a fingerprint on both sides reported isShifted=false: the same
      // ADR 0044 class of bug ("a check that ran on nothing is not a pass"), on drift's other join
      // key. UNIT nodes are legitimately fingerprint-less by design (todo26 Phase 0) and will
      // always land here — that is correct: a UNIT was never eligible for shift detection, and it
      // must say so rather than claim it checked and found nothing wrong.
      const identityGap = row.current_fingerprint == null || row.prev_fingerprint == null;
      const isShifted = !identityGap && row.current_fingerprint !== row.prev_fingerprint;

      return {
        id: row.id,
        name: row.name,
        file: row.file,
        gravity_delta: gDelta,
        complexity_delta: cDelta,
        isModified: isShifted,
        identityGap,
        velocity: (gDelta * 0.5) + (cDelta * 0.5)
      };
    // `d.identityGap` keeps a fingerprint-less row in the result instead of letting the velocity
    // filter drop it — a near-zero gravity/complexity delta plus isModified=false used to make it
    // vanish from `deltas` entirely, which is the "silently skipped" failure todo26 names.
    }).filter(d => Math.abs(d.velocity) > 0.001 || d.isModified || d.identityGap);

    const moves = moveRows.map((row: any) => ({
      from: row.prev_id,
      to: row.current_id,
      name: row.name,
      file: row.file,
      gravity: row.current_gravity
    }));
    
    // STABLE has to be EARNED. Two states used to collapse into it and both read as good news:
    // a query that threw, and a pair of pulses with nothing comparable between them (this repo's
    // own vault: 70 pulses, 0 rows in node_history, verdict "stable across 0 symbols"). The
    // comment below already named the failure — "the same failure as reporting STABLE from a check
    // that ran on nothing" — and only the message half was fixed. This is the status half.
    const status: DriftResult['status'] =
      queryFailed ? 'UNAVAILABLE'
      : (exactRows.length === 0 && moves.length === 0) ? 'INSUFFICIENT_DATA'
      : deltas.some(d => d.velocity > DECAY_VELOCITY_THRESHOLD) ? 'DECAYING'
      : 'STABLE';

    return {
      status,
      // The message must agree with the status. It used to say "stable" unconditionally, so a
      // DECAYING result printed "Structural resonance stable across N symbols" beside a list of
      // decay hotspots — reassuring text over a warning.
      message: (() => {
        if (status === 'UNAVAILABLE') return 'Drift could not be assessed: the comparison query failed. This is NOT a stable result.';
        if (status === 'INSUFFICIENT_DATA') return `No symbols were comparable between these two pulses, so no drift verdict was reached. Check that node_history holds rows for pulse ${targetPrevPulseId}.`;
        const decaying = deltas.filter(d => d.velocity > DECAY_VELOCITY_THRESHOLD).length;
        const renames = moves.length > 0 ? ` ${moves.length} structural rename(s) detected.` : '';
        const gapCount = deltas.filter(d => d.identityGap).length;
        // Named explicitly rather than folded into "stable" — a gap row was not checked for a
        // structural shift, it was skipped for lack of a fingerprint on one side (todo26).
        const gapNote = gapCount > 0
          ? ` ${gapCount} symbol(s) had no fingerprint on one side of the comparison — shift and move detection is blind for them, not confirmed stable.`
          : '';
        return decaying > 0
          ? `Structural decay in ${decaying} of ${exactRows.length} symbols compared.${renames}${gapNote}`
          : `Structural resonance stable across ${exactRows.length} symbols.${renames}${gapNote}`;
      })(),
      deltas,
      moves,
      summary: {
        total_symbols: exactRows.length,
        decay_count: deltas.filter(d => d.velocity > DECAY_VELOCITY_THRESHOLD).length,
        improvement_count: deltas.filter(d => d.velocity < 0).length,
        move_count: moves.length,
        identity_gap_count: deltas.filter(d => d.identityGap).length
      }
    } as DriftResult;
  }
}

export interface DriftResult {
  // INSUFFICIENT_DATA = the comparison ran and had nothing to compare.
  // UNAVAILABLE       = the comparison could not run at all. Neither is a pass.
  status: 'STABLE' | 'DECAYING' | 'IMPROVING' | 'INSUFFICIENT_DATA' | 'UNAVAILABLE';
  message: string;
  deltas: Array<{
    id: string;
    name: string;
    file: string;
    gravity_delta: number;
    complexity_delta: number;
    isModified: boolean;
    // true when either side of the comparison had no fingerprint — the row was not checked for a
    // structural shift, it could not be. Never read `isModified === false` as "confirmed unchanged"
    // without also checking this (todo26).
    identityGap: boolean;
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
    identity_gap_count: number;
  };
}
