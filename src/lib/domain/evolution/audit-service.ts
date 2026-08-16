import { SynapsePersistence } from "@/lib/core/persistence/persistence.js";
import { logger } from "@/lib/core/utils/index.js";

/**
 * Conducks — Geological Audit Service 🧬 🏺 🟦
 * 
 * Aggregates structural velocity across a temporal window to detect long-term decay.
 * Performance Optimized: Uses in-database Window Functions (LAG) for Phase 9.1.
 */
export class AuditService {
  constructor(private readonly persistence: SynapsePersistence) {}

  /**
   * Performs a high-performance longitudinal audit over the last N pulses.
   */
  public async audit(windowSize: number = 5): Promise<AuditResult> {

    const startTime = Date.now();

    // 1. Unified Windowed Structural Trend Query
    const archeologicalQuery = `
      WITH pulse_history AS (
        SELECT id, timestamp
        FROM pulses
        ORDER BY timestamp DESC
        LIMIT ?
      ),
      node_history AS (
        SELECT
          h.nodeId AS id, n.name, n.file, h.pulseId,
          h.gravity, h.complexity,
          LAG(h.gravity) OVER (PARTITION BY h.nodeId ORDER BY p.timestamp ASC) as prev_gravity,
          LAG(h.complexity) OVER (PARTITION BY h.nodeId ORDER BY p.timestamp ASC) as prev_complexity
        FROM node_history h
        JOIN pulse_history p ON h.pulseId = p.id
        JOIN nodes n ON n.id = h.nodeId
      )
      SELECT
        id, name, file,
        AVG(gravity - prev_gravity) as avg_g_delta,
        AVG(complexity - prev_complexity) as avg_c_delta,
        COUNT(*) as data_points
      FROM node_history
      WHERE prev_gravity IS NOT NULL
      GROUP BY id, name, file
      HAVING (AVG(gravity - prev_gravity) * 0.6 + AVG(complexity - prev_complexity) * 0.4) > 0.05
      ORDER BY (AVG(gravity - prev_gravity) * 0.6 + AVG(complexity - prev_complexity) * 0.4) DESC
      LIMIT 20
    `;

    let rows: any[] = [];
    try {
      rows = await this.persistence.query(archeologicalQuery, [windowSize]);
    } catch (err: any) {
      logger.error(`[AuditService] Performance Regression in Archeological Scan: ${err.message}`);
    }

    const duration = Date.now() - startTime;
    logger.info(`[AuditService] Structural archeology completed in ${duration}ms (Window: ${windowSize}).`);

    // ADR 0073: the same shape as ADR 0044's `DriftEngine.compare()` — a comparison that ran and
    // had nothing to compare (no pulse pair yet, or the query threw and was caught above) is not
    // the same fact as "compared and found no decay". Collapsing both into STABLE is exactly the
    // "check that ran on nothing is not a pass" failure named there; `INSUFFICIENT_DATA` is the
    // status this type already declared for it and never returned.
    if (rows.length === 0) {
      return {
        status: 'INSUFFICIENT_DATA',
        message: 'No historical data to compare — the archeological scan ran and had nothing to compare (needs at least two pulses with matching node_history rows).',
        hotspots: [],
        window_size: windowSize
      };
    }

    const hotspots = rows.map(row => {
        const velocity = (row.avg_g_delta * 0.6) + (row.avg_c_delta * 0.4);
        return {
            id: row.id,
            name: row.name,
            file: row.file,
            avg_velocity: velocity,
            trend: velocity > 0.1 ? 'ACCELERATING' : 'STABLE',
            data_points: row.data_points
        };
    });

    return {
        status: hotspots.length > 5 ? 'DECAYING' : 'STABLE',
        message: `Archeological scan complete. Identified ${hotspots.length} major decay hotspots.`,
        hotspots,
        window_size: windowSize
    };
  }
}

export interface AuditResult {
  status: 'HEALTHY' | 'STABLE' | 'DECAYING' | 'INSUFFICIENT_DATA';
  message: string;
  hotspots: Array<{
    id: string;
    name: string;
    file: string;
    avg_velocity: number;
    trend: string;
    data_points: number;
  }>;
  window_size?: number;
}
