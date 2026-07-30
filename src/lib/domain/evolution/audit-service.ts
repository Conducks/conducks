import { SynapsePersistence } from "@/lib/core/persistence/persistence.js";
import { logger } from "@/lib/core/utils/logger.js";

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
    // Same root cause as DriftEngine: `nodes.id` is a PRIMARY KEY, so `LAG(gravity) OVER
    // (PARTITION BY n.id ...)` sees exactly one row per partition, LAG is always NULL, and
    // `WHERE prev_gravity IS NOT NULL` drops every row. The query below can never return a hotspot
    // however much a codebase decays. Reporting STABLE from it is reporting success from a check
    // that ran on nothing, so the honest answer is the INSUFFICIENT_DATA this type already declares
    // and `audit.ts:30` already has a branch for — a branch that was unreachable until now.
    const [probe] = await this.persistence.query<{ rows: number; ids: number }>(
      'SELECT count(*) AS rows, count(DISTINCT id) AS ids FROM nodes');
    if (Number(probe?.rows ?? 0) <= Number(probe?.ids ?? 0)) {
      return {
        status: 'INSUFFICIENT_DATA',
        message: 'Historical audit cannot be computed: the vault stores one row per symbol '
          + '(current state only) and never records earlier gravity or complexity. This is a '
          + 'missing feature, not a clean bill of health — see todo22.',
        hotspots: [],
      } as AuditResult;
    }

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
          n.id, n.name, n.file, n.pulseId,
          n.gravity, n.complexity,
          LAG(n.gravity) OVER (PARTITION BY n.id ORDER BY p.timestamp ASC) as prev_gravity,
          LAG(n.complexity) OVER (PARTITION BY n.id ORDER BY p.timestamp ASC) as prev_complexity
        FROM nodes n
        JOIN pulse_history p ON n.pulseId = p.id
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

    if (rows.length === 0) {
      return {
        status: 'STABLE',
        message: 'Insufficient historical data or stable resonance. No consistent decay patterns found.',
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
