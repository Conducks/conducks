import { DuckDbPersistence } from "@/lib/core/persistence/persistence.js";
import { logger } from "@/lib/core/utils/logger.js";

/**
 * Conducks — Geological Audit Service 🧬 🏺 🟦
 * 
 * Aggregates structural velocity across a temporal window to detect long-term decay.
 * Performance Optimized: Uses in-database Window Functions (LAG) for Phase 9.1.
 */
export class AuditService {
  constructor(private readonly persistence: DuckDbPersistence) {}

  /**
   * Performs a high-performance longitudinal audit over the last N pulses.
   */
  public async audit(windowSize: number = 5): Promise<AuditResult> {
    const db = await this.persistence.getRawConnection();
    if (!db) throw new Error("Persistence layer is offline.");

    const startTime = Date.now();

    // 1. Unified Windowed Structural Trend Query
    // Calculates avg velocity per symbol across the entire historical window in one pass.
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
          n.gravity, n.complexity, n.entropy,
          LAG(n.gravity) OVER (PARTITION BY n.id ORDER BY p.timestamp ASC) as prev_gravity,
          LAG(n.complexity) OVER (PARTITION BY n.id ORDER BY p.timestamp ASC) as prev_complexity,
          LAG(n.entropy) OVER (PARTITION BY n.id ORDER BY p.timestamp ASC) as prev_entropy
        FROM nodes n
        JOIN pulse_history p ON n.pulseId = p.id
      )
      SELECT 
        id, name, file,
        AVG(gravity - prev_gravity) as avg_g_delta,
        AVG(complexity - prev_complexity) as avg_c_delta,
        AVG(entropy - prev_entropy) as avg_e_delta,
        COUNT(*) as data_points
      FROM node_history
      WHERE prev_gravity IS NOT NULL
      GROUP BY id, name, file
      HAVING (AVG(gravity - prev_gravity) * 0.4 + AVG(complexity - prev_complexity) * 0.4 + AVG(entropy - prev_entropy) * 0.2) > 0.05
      ORDER BY (AVG(gravity - prev_gravity) * 0.4 + AVG(complexity - prev_complexity) * 0.4 + AVG(entropy - prev_entropy) * 0.2) DESC
      LIMIT 20;
    `;

    const rows: any[] = await new Promise((res) => db.all(archeologicalQuery, [windowSize], (err: any, rows: any[]) => {
        if (err) {
            logger.error(`[AuditService] Performance Regression in Archeological Scan: ${err.message}`);
            res([]);
        } else {
            res(rows);
        }
    }));

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
        const velocity = (row.avg_g_delta * 0.4) + (row.avg_c_delta * 0.4) + (row.avg_e_delta * 0.2);
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
