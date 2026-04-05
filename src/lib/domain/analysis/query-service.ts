import { SynapsePersistence } from "@/lib/core/persistence/persistence.js";
import { Logger } from "@/lib/core/utils/logger.js";

const logger = new Logger("QueryService");

/**
 * Conducks — Architectural Query Templates (Oracle Standard)
 * 
 * Formal parameterised SQL library for high-speed structural intelligence.
 * These templates replace expensive graph traversals with indexed SQL scans.
 */
export class QueryService {
  /**
   * Conducks — Architectural Query Templates (Oracle Standard)
   * 
   * Formal parameterised SQL library for high-speed structural intelligence.
   * These templates replace expensive graph traversals with indexed SQL scans.
   */
  public static readonly QUERIES: Record<string, { description: string, params: string[], sql: string }> = {

    // ── USAGE ANALYSIS ─────────────────────────────────────────────────────────

    find_usages: {
      description: "Find all callers of a specific symbol",
      params: ["symbolId", "edgeType", "$pulseId", "limit"],
      sql: `
        SELECT
          e.sourceId as id, n.name, n.file, n.structureId,
          n.namespaceId, n.risk, n.canonicalKind, n.canonicalRank
        FROM edges e
        JOIN nodes n ON e.sourceId = n.id AND e.pulseId = n.pulseId
        WHERE e.targetId = ?
        AND e.type = ?
        AND e.pulseId = ?
        ORDER BY n.risk DESC
        LIMIT ?
      `
    },

    find_imports: {
      description: "Find all files that import a specific module or file",
      params: ["targetId", "$pulseId", "limit"],
      sql: `
        SELECT
          e.sourceId as id, n.name, n.file, n.namespaceId,
          n.risk, n.gravity, n.canonicalKind, n.canonicalRank
        FROM edges e
        JOIN nodes n ON e.sourceId = n.id AND e.pulseId = n.pulseId
        WHERE e.targetId = ?
        AND e.type = 'IMPORTS'
        AND e.pulseId = ?
        ORDER BY n.gravity DESC
        LIMIT ?
      `
    },

    unused_exports: {
      description: "Find exported symbols never imported by any other file",
      params: ["$pulseId", "limit"],
      sql: `
        SELECT
          n.id, n.name, n.file, n.risk,
          json_extract_string(n.kinetic, '$.tenureDays') AS tenureDays,
          n.canonicalKind, n.canonicalRank
        FROM nodes n
        LEFT JOIN edges e ON e.targetId = n.id
          AND e.type = 'IMPORTS'
          AND e.pulseId = n.pulseId
        WHERE json_extract(n.dna, '$.isExported') = true
        AND e.id IS NULL
        AND n.canonicalKind IN ('BEHAVIOR', 'STRUCTURE')
        AND n.pulseId = ?
        ORDER BY n.risk DESC
        LIMIT ?
      `
    },

    // ── DEAD CODE ───────────────────────────────────────────────────────────────

    dead_code: {
      description: "Find symbols with no incoming edges — dead code candidates",
      params: ["minTenureDays", "$pulseId", "limit"],
      sql: `
        SELECT
          n.id, n.name, n.file, n.risk, n.gravity, n.complexity,
          n.canonicalKind, n.semantic_kind, n.structureId,
          json_extract_string(n.kinetic, '$.tenureDays')    AS tenureDays,
          json_extract_string(n.kinetic, '$.primaryAuthor') AS primaryAuthor
        FROM nodes n
        LEFT JOIN edges e ON e.targetId = n.id AND e.pulseId = n.pulseId
        WHERE e.id IS NULL
        AND n.isEntryPoint = false
        AND n.canonicalKind IN ('BEHAVIOR', 'STRUCTURE')
        AND CAST(json_extract_string(n.kinetic, '$.tenureDays') AS INTEGER) >= ?
        AND n.pulseId = ?
        ORDER BY n.risk DESC, CAST(json_extract_string(n.kinetic, '$.tenureDays') AS INTEGER) DESC
        LIMIT ?
      `
    },

    high_risk_dead_code: {
      description: "Dead code that is also high complexity — dangerous to leave",
      params: ["minComplexity", "minTenureDays", "$pulseId", "limit"],
      sql: `
        SELECT
          n.id, n.name, n.file, n.risk, n.complexity,
          json_extract_string(n.kinetic, '$.tenureDays')    AS tenureDays,
          json_extract_string(n.kinetic, '$.primaryAuthor') AS primaryAuthor
        FROM nodes n
        LEFT JOIN edges e ON e.targetId = n.id AND e.pulseId = n.pulseId
        WHERE e.id IS NULL
        AND n.isEntryPoint = false
        AND n.complexity >= ?
        AND CAST(json_extract_string(n.kinetic, '$.tenureDays') AS INTEGER) >= ?
        AND n.pulseId = ?
        ORDER BY n.risk DESC
        LIMIT ?
      `
    },

    // ── BLAST RADIUS & IMPACT ───────────────────────────────────────────────────

    blast_radius: {
      description: "Find all direct dependents of a symbol — who breaks if this changes",
      params: ["symbolId", "$pulseId", "limit"],
      sql: `
        SELECT
          e.sourceId as id, n.name, n.file, n.risk,
          n.structureId, n.namespaceId, e.weight, e.type,
          n.canonicalKind, n.canonicalRank
        FROM edges e
        JOIN nodes n ON e.sourceId = n.id AND e.pulseId = n.pulseId
        WHERE e.targetId = ?
        AND e.pulseId = ?
        ORDER BY e.weight DESC, n.risk DESC
        LIMIT ?
      `
    },

    deep_impact: {
      description: "Transitive dependents up to N hops — full blast radius",
      params: ["symbolId", "$pulseId", "maxDepth", "$pulseId", "$pulseId", "limit"],
      sql: `
        WITH RECURSIVE impact AS (
          SELECT targetId AS id, sourceId AS dependentId, 1 AS depth
          FROM edges
          WHERE targetId = ?
          AND pulseId = ?

          UNION ALL

          SELECT e.targetId, e.sourceId, i.depth + 1
          FROM edges e
          JOIN impact i ON e.targetId = i.dependentId
          WHERE i.depth < ?
          AND e.pulseId = ?
        )
        SELECT DISTINCT
          n.id, n.name, n.file, n.risk,
          n.canonicalKind, n.namespaceId,
          MIN(i.depth) AS hopDistance
        FROM impact i
        JOIN nodes n ON i.dependentId = n.id AND n.pulseId = ?
        GROUP BY n.id, n.name, n.file, n.risk, n.canonicalKind, n.namespaceId
        ORDER BY hopDistance ASC, n.risk DESC
        LIMIT ?
      `
    },

    structural_siblings: {
      description: "Find all symbols in the same class as a given symbol",
      params: ["symbolId", "$pulseId", "symbolId", "$pulseId"],
      sql: `
        SELECT id, name, risk, complexity, gravity, semantic_kind, visibility, canonicalKind, canonicalRank
        FROM nodes
        WHERE structureId = (
          SELECT structureId FROM nodes
          WHERE id = ? AND pulseId = ?
        )
        AND id != ?
        AND pulseId = ?
        ORDER BY risk DESC
      `
    },

    // ── HIERARCHY NAVIGATION ────────────────────────────────────────────────────

    symbols_in_structure: {
      description: "Find all symbols inside a class or interface",
      params: ["structureId", "$pulseId"],
      sql: `
        SELECT
          id, name, semantic_kind, risk, gravity,
          complexity, visibility, isEntryPoint, canonicalKind, canonicalRank,
          json_extract_string(dna, '$.isAsync')    AS isAsync,
          json_extract_string(dna, '$.isStatic')   AS isStatic,
          json_extract_string(dna, '$.returns')    AS returns
        FROM nodes
        WHERE structureId = ?
        AND pulseId = ?
        ORDER BY gravity DESC
      `
    },

    symbols_in_namespace: {
      description: "Find all symbols inside a folder/namespace",
      params: ["namespaceIdPattern", "canonicalKind", "canonicalKind", "$pulseId", "limit"],
      sql: `
        SELECT
          id, name, file, canonicalKind, semantic_kind,
          risk, gravity, complexity, structureId, canonicalRank
        FROM nodes
        WHERE namespaceId LIKE ?
        AND (? = '' OR canonicalKind = ?)
        AND pulseId = ?
        ORDER BY gravity DESC
        LIMIT ?
      `
    },

    full_ancestry: {
      description: "Get complete containment context for a symbol in one query",
      params: ["symbolId", "$pulseId"],
      sql: `
        SELECT
          n.*,
          parent.name    AS parentName,
          unit.name      AS fileName,
          ns.name        AS namespaceName,
          structure.name AS className
        FROM nodes n
        LEFT JOIN nodes parent    ON n.parentId    = parent.id AND n.pulseId = parent.pulseId
        LEFT JOIN nodes unit      ON n.unitId      = unit.id AND n.pulseId = unit.pulseId
        LEFT JOIN nodes ns        ON n.namespaceId = ns.id AND n.pulseId = ns.pulseId
        LEFT JOIN nodes structure ON n.structureId = structure.id AND n.pulseId = structure.pulseId
        WHERE n.id = ?
        AND n.pulseId = ?
      `
    },

    class_health_rollup: {
      description: "Health metrics for all classes in a file",
      params: ["unitId", "$pulseId"],
      sql: `
        SELECT
          structureId,
          AVG(risk)        AS classRisk,
          SUM(complexity)  AS totalComplexity,
          COUNT(*)         AS methodCount,
          MAX(gravity)     AS peakGravity,
          MIN(risk)        AS lowestMethodRisk
        FROM nodes
        WHERE unitId = ?
        AND canonicalKind = 'BEHAVIOR'
        AND pulseId = ?
        GROUP BY structureId
        ORDER BY classRisk DESC
      `
    },

    // ── ARCHITECTURAL ANALYSIS ──────────────────────────────────────────────────

    high_risk_symbols: {
      description: "Find symbols above a risk threshold",
      params: ["minRisk", "namespaceId", "namespaceId", "$pulseId", "limit"],
      sql: `
        SELECT
          id, name, file, risk, gravity, complexity,
          canonicalKind, semantic_kind, structureId, canonicalRank
        FROM nodes
        WHERE risk >= ?
        AND (? = '' OR namespaceId LIKE ?)
        AND pulseId = ?
        ORDER BY risk DESC
        LIMIT ?
      `
    },

    hotspots: {
      description: "Highest combined risk and gravity — most dangerous important symbols",
      params: ["$pulseId", "limit"],
      sql: `
        SELECT
          id, name, file, risk, gravity, complexity,
          canonicalKind, semantic_kind, structureId,
          (risk * 0.6 + gravity * 0.4) AS hotspotScore,
          json_extract_string(kinetic, '$.resonance')     AS churn,
          json_extract_string(kinetic, '$.primaryAuthor') AS primaryAuthor
        FROM nodes
        WHERE canonicalKind IN ('BEHAVIOR', 'STRUCTURE')
        AND pulseId = ?
        ORDER BY hotspotScore DESC
        LIMIT ?
      `
    },

    entry_points: {
      description: "All entry points ranked by gravity",
      params: ["$pulseId", "limit"],
      sql: `
        SELECT
          id, name, file, gravity, risk, complexity,
          canonicalKind, semantic_kind, namespaceId
        FROM nodes
        WHERE isEntryPoint = true
        AND pulseId = ?
        ORDER BY gravity DESC
        LIMIT ?
      `
    },

    find_by_name: {
      description: "Find symbols by name, optionally scoped to namespace or kind",
      params: ["query", "namespaceId", "canonicalKind", "$pulseId", "limit"],
      sql: `
        SELECT
          id, name, file, risk, gravity, complexity,
          canonicalKind, semantic_kind, structureId, namespaceId
        FROM nodes
        WHERE (name = CAST(? AS TEXT) OR name LIKE ('%' || CAST(? AS TEXT) || '%'))
        AND (CAST(? AS TEXT) = '' OR namespaceId LIKE ('%' || CAST(? AS TEXT) || '%'))
        AND (CAST(? AS TEXT) = '' OR canonicalKind = CAST(? AS TEXT))
        AND pulseId = ?
        ORDER BY gravity DESC
        LIMIT ?
      `
    },

    cross_namespace_coupling: {
      description: "Find unexpected dependencies between namespaces — architectural lie detector",
      params: ["$pulseId", "limit"],
      sql: `
        SELECT
          source.namespaceId AS fromNamespace,
          target.namespaceId AS toNamespace,
          COUNT(*)           AS edgeCount,
          AVG(e.weight)      AS avgCoupling,
          MAX(source.risk)   AS maxSourceRisk
        FROM edges e
        JOIN nodes source ON e.sourceId = source.id AND e.pulseId = source.pulseId
        JOIN nodes target ON e.targetId = target.id AND e.pulseId = target.pulseId
        WHERE source.namespaceId != target.namespaceId
        AND source.namespaceId IS NOT NULL
        AND target.namespaceId IS NOT NULL
        AND e.pulseId = ?
        GROUP BY source.namespaceId, target.namespaceId
        ORDER BY edgeCount DESC
        LIMIT ?
      `
    },

    cycles: {
      description: "Find all circular dependency groups — Tarjan SCC results",
      params: ["$pulseId", "limit"],
      sql: `
        SELECT
          n.id, n.name, n.file, n.risk, n.namespaceId,
          json_extract_string(n.metadata, '$.anomaly') AS anomaly
        FROM nodes n
        WHERE json_extract_string(n.metadata, '$.anomaly') = 'cycle'
        AND n.pulseId = ?
        ORDER BY n.risk DESC
        LIMIT ?
      `
    },

    layer_distribution: {
      description: "Architectural layer breakdown — how many symbols at each level",
      params: ["$pulseId"],
      sql: `
        SELECT
          canonicalRank,
          canonicalKind,
          COUNT(*)   AS symbolCount,
          AVG(risk)  AS avgRisk,
          AVG(gravity) AS avgGravity,
          SUM(CASE WHEN isEntryPoint THEN 1 ELSE 0 END) AS entryPointCount
        FROM nodes
        WHERE pulseId = ?
        GROUP BY canonicalRank, canonicalKind
        ORDER BY canonicalRank
      `
    }
  };

  private readonly QUERIES: Record<string, any>;

  constructor(private persistence: SynapsePersistence) {
    this.QUERIES = QueryService.QUERIES;
  }

  /**
   * Apostolic Re-Anchoring 🏺
   * Re-wires the service to a new structural vault handle.
   */
  public setPersistence(persistence: SynapsePersistence) {
    this.persistence = persistence;
  }

  /**
   * Universal Structural Query Execution
   */
  public async execute<T = any>(templateId: string, userParams: any[] = [], limit?: number): Promise<T[]> {
    const template = this.QUERIES[templateId];
    if (!template) {
      throw new Error(`Architectural Query Template '${templateId}' not found.`);
    }

    // 1. Resolve Latest Pulse
    const latestPulseId = await this.getLatestPulseId();
    if (!latestPulseId && template.sql.includes('pulseId')) {
      logger.warn("No structural pulse found. Query may return empty results.");
      return [];
    }

    // 2. Refined Parameter Mapping 🏺
    const finalParams: any[] = [];
    const sanitizedUserParams = [...userParams.filter(p => !['$pulseId', '$limit'].includes(p))];
    const finalLimit = limit || 10;
    
    const logicalValues = new Map<string, any>();
    template.params.forEach((p: string) => {
      if (p === '$pulseId') {
        logicalValues.set(p, latestPulseId);
      } else if (p === 'limit') {
        logicalValues.set(p, finalLimit);
      } else {
        const val = sanitizedUserParams.shift();
        logicalValues.set(p, val === undefined ? '' : val);
      }
    });

    // Final mapping based on physical expectations of the specific query
    if (templateId === 'find_by_name') {
       const q = logicalValues.get('query');
       const ns = logicalValues.get('namespaceId');
       const k = logicalValues.get('canonicalKind');
       finalParams.push(q, q, ns, ns, k, k, latestPulseId, finalLimit);
    } else {
       template.params.forEach((p: string) => {
         if (p === '$pulseId') finalParams.push(latestPulseId);
         else if (p === 'limit') finalParams.push(finalLimit);
         else finalParams.push(logicalValues.get(p));
       });
    }

    logger.info(`Oracle Request: ${templateId} | Enriched Params: ${JSON.stringify(finalParams)}`);
    
    try {
      const results = await (this.persistence as any).query(template.sql, finalParams);
      return results;
    } catch (err: any) {
      logger.error(`Oracle Fault: ${templateId} failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * List all available Oracle Standard templates with descriptions.
   */
  public listTemplates() {
    return Object.entries(this.QUERIES).map(([id, t]) => ({
      id,
      description: t.description,
      params: (t as any).params
    }));
  }

  private async getLatestPulseId(): Promise<string | null> {
    const rows = await this.persistence.query("SELECT id FROM pulses ORDER BY timestamp DESC LIMIT 1");
    if (!rows || rows.length === 0) return null;
    return (rows[0] as any).id;
  }
}
