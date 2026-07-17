import { SynapsePersistence } from "@/lib/core/persistence/persistence.js";
import { Logger } from "@/lib/core/utils/logger.js";

const logger = new Logger("QueryService");

/**
 * Conducks — Architectural Query Templates (Oracle Standard)
 * 
 * Formal parameterised SQL library for high-speed structural intelligence.
 * These templates replace expensive graph traversals with indexed SQL scans.
 */
/** Numeric defaults for named params — used when the caller provides no value. */
const PARAM_DEFAULTS: Record<string, number | string> = {
  minTenureDays: 0,
  minRisk: 0,
  minComplexity: 1,
  minConfidence: 0,
  maxDepth: 5,
  depth: 5,
  limit: 10,
};

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
      params: ["symbolId", "edgeType", "limit"],
      sql: `
        SELECT
          e.sourceId as id, n.name, n.file, n.structureId,
          n.namespaceId, n.risk, n.canonicalKind, n.canonicalRank
        FROM edges e
        JOIN nodes n ON e.sourceId = n.id
        WHERE e.targetId = ?
        AND e.type = ?
        ORDER BY n.risk DESC
        LIMIT ?
      `
    },

    find_imports: {
      description: "Find all files that import a specific module or file",
      params: ["targetId", "limit"],
      sql: `
        SELECT
          e.sourceId as id, n.name, n.file, n.namespaceId,
          n.risk, n.gravity, n.canonicalKind, n.canonicalRank
        FROM edges e
        JOIN nodes n ON e.sourceId = n.id
        WHERE e.targetId = ?
        AND e.type = 'IMPORTS'
        ORDER BY n.gravity DESC
        LIMIT ?
      `
    },

    unused_exports: {
      description: "Find exported symbols never imported by any other file",
      params: ["limit"],
      sql: `
        SELECT
          n.id, n.name, n.file, n.risk,
          json_extract_string(n.kinetic, '$.tenureDays') AS tenureDays,
          n.canonicalKind, n.canonicalRank
        FROM nodes n
        LEFT JOIN edges e ON e.targetId = n.id
          AND e.type = 'IMPORTS'
        WHERE json_extract(n.dna, '$.isExported') = true
        AND e.id IS NULL
        AND n.canonicalKind IN ('BEHAVIOR', 'STRUCTURE')
        ORDER BY n.risk DESC
        LIMIT ?
      `
    },

    // ── DEAD CODE ───────────────────────────────────────────────────────────────

    dead_code: {
      description: "Find symbols with no callers AND not imported as a named binding",
      params: ["minTenureDays", "limit"],
      sql: `
        SELECT
          n.id, n.name, n.file, n.risk, n.gravity, n.complexity,
          n.canonicalKind, n.semantic_kind, n.structureId,
          json_extract_string(n.kinetic, '$.tenureDays')    AS tenureDays,
          json_extract_string(n.kinetic, '$.primaryAuthor') AS primaryAuthor
        FROM nodes n
        WHERE NOT EXISTS (SELECT 1 FROM edges WHERE targetId = n.id AND type IN ('CALLS', 'CONSTRUCTS'))
        AND (
          NOT EXISTS (SELECT 1 FROM edges WHERE targetId = n.unitId AND type = 'IMPORTS')
          OR NOT EXISTS (SELECT 1 FROM edges WHERE targetId = n.id AND type = 'IMPORTS')
        )
        AND n.isEntryPoint = false
        AND n.canonicalKind IN ('BEHAVIOR', 'STRUCTURE')
        AND n.unitId IS NOT NULL
        AND n.file NOT LIKE '%/interfaces/cli/commands/%'
        AND NOT (
          json_extract(n.dna, '$.isExported') = true
          AND EXISTS (SELECT 1 FROM edges WHERE targetId = n.unitId AND type = 'IMPORTS')
        )
        AND COALESCE(TRY_CAST(json_extract_string(n.kinetic, '$.tenureDays') AS INTEGER), 0) >= ?
        ORDER BY n.risk DESC, n.complexity DESC
        LIMIT ?
      `
    },

    high_risk_dead_code: {
      description: "Dead code that is also high complexity — dangerous to leave",
      params: ["minComplexity", "minTenureDays", "limit"],
      sql: `
        SELECT
          n.id, n.name, n.file, n.risk, n.complexity,
          json_extract_string(n.kinetic, '$.tenureDays')    AS tenureDays,
          json_extract_string(n.kinetic, '$.primaryAuthor') AS primaryAuthor
        FROM nodes n
        WHERE NOT EXISTS (SELECT 1 FROM edges WHERE targetId = n.id AND type IN ('CALLS', 'CONSTRUCTS'))
        AND (
          NOT EXISTS (SELECT 1 FROM edges WHERE targetId = n.unitId AND type = 'IMPORTS')
          OR NOT EXISTS (SELECT 1 FROM edges WHERE targetId = n.id AND type = 'IMPORTS')
        )
        AND n.isEntryPoint = false
        AND n.complexity >= ?
        AND n.file NOT LIKE '%/interfaces/cli/commands/%'
        AND NOT (
          json_extract(n.dna, '$.isExported') = true
          AND EXISTS (SELECT 1 FROM edges WHERE targetId = n.unitId AND type = 'IMPORTS')
        )
        AND COALESCE(TRY_CAST(json_extract_string(n.kinetic, '$.tenureDays') AS INTEGER), 0) >= ?
        ORDER BY n.risk DESC
        LIMIT ?
      `
    },

    // ── BLAST RADIUS & IMPACT ───────────────────────────────────────────────────

    blast_radius: {
      description: "Find all direct dependents of a symbol — who breaks if this changes",
      params: ["symbolId", "limit"],
      sql: `
        SELECT
          e.sourceId as id, n.name, n.file, n.risk,
          n.structureId, n.namespaceId, e.weight, e.type,
          n.canonicalKind, n.canonicalRank
        FROM edges e
        JOIN nodes n ON e.sourceId = n.id
        WHERE e.targetId = ?
        ORDER BY e.weight DESC, n.risk DESC
        LIMIT ?
      `
    },

    deep_impact: {
      description: "Transitive dependents up to N hops — full blast radius",
      params: ["symbolId", "maxDepth", "limit"],
      sql: `
        WITH RECURSIVE impact AS (
          SELECT targetId AS id, sourceId AS dependentId, 1 AS depth
          FROM edges
          WHERE targetId = ?

          UNION ALL

          SELECT e.targetId, e.sourceId, i.depth + 1
          FROM edges e
          JOIN impact i ON e.targetId = i.dependentId
          WHERE i.depth < ?
        )
        SELECT DISTINCT
          n.id, n.name, n.file, n.risk,
          n.canonicalKind, n.namespaceId,
          MIN(i.depth) AS hopDistance
        FROM impact i
        JOIN nodes n ON i.dependentId = n.id
        GROUP BY n.id, n.name, n.file, n.risk, n.canonicalKind, n.namespaceId
        ORDER BY hopDistance ASC, n.risk DESC
        LIMIT ?
      `
    },

    structural_siblings: {
      description: "Find all symbols in the same class as a given symbol",
      params: ["symbolId", "symbolId"],
      sql: `
        SELECT id, name, risk, complexity, gravity, semantic_kind, visibility, canonicalKind, canonicalRank
        FROM nodes
        WHERE structureId = (
          SELECT structureId FROM nodes
          WHERE id = ?
        )
        AND id != ?
        ORDER BY risk DESC
      `
    },

    // ── HIERARCHY NAVIGATION ────────────────────────────────────────────────────

    symbols_in_structure: {
      description: "Find all symbols inside a class or interface",
      params: ["structureId"],
      sql: `
        SELECT
          id, name, semantic_kind, risk, gravity,
          complexity, visibility, isEntryPoint, canonicalKind, canonicalRank,
          json_extract_string(dna, '$.isAsync')    AS isAsync,
          json_extract_string(dna, '$.isStatic')   AS isStatic,
          json_extract_string(dna, '$.returns')    AS returns
        FROM nodes
        WHERE structureId = ?
        ORDER BY gravity DESC
      `
    },

    symbols_in_namespace: {
      description: "Find all symbols inside a folder/namespace",
      params: ["namespaceIdPattern", "canonicalKind", "canonicalKind", "limit"],
      sql: `
        SELECT
          id, name, file, canonicalKind, semantic_kind,
          risk, gravity, complexity, structureId, canonicalRank
        FROM nodes
        WHERE namespaceId LIKE ?
        AND (? = '' OR canonicalKind = ?)
        ORDER BY gravity DESC
        LIMIT ?
      `
    },

    full_ancestry: {
      description: "Get complete containment context for a symbol in one query",
      params: ["symbolId"],
      sql: `
        SELECT
          n.*,
          parent.name    AS parentName,
          unit.name      AS fileName,
          ns.name        AS namespaceName,
          structure.name AS className
        FROM nodes n
        LEFT JOIN nodes parent    ON n.parentId    = parent.id
        LEFT JOIN nodes unit      ON n.unitId      = unit.id
        LEFT JOIN nodes ns        ON n.namespaceId = ns.id
        LEFT JOIN nodes structure ON n.structureId = structure.id
        WHERE n.id = ?
      `
    },

    class_health_rollup: {
      description: "Health metrics for all classes in a file",
      params: ["unitId"],
      sql: `
        SELECT
          structureId,
          AVG(risk)        AS classRisk,
          SUM(complexity)  AS totalComplexity,
          CAST(COUNT(*) AS INTEGER) AS methodCount,
          MAX(gravity)     AS peakGravity,
          MIN(risk)        AS lowestMethodRisk
        FROM nodes
        WHERE unitId = ?
        AND canonicalKind = 'BEHAVIOR'
        GROUP BY structureId
        ORDER BY classRisk DESC
      `
    },

    // ── ARCHITECTURAL ANALYSIS ──────────────────────────────────────────────────

    high_risk_symbols: {
      description: "Find symbols above a risk threshold",
      params: ["minRisk", "namespaceId", "namespaceId", "limit"],
      sql: `
        SELECT
          id, name, file, risk, gravity, complexity,
          canonicalKind, semantic_kind, structureId, canonicalRank
        FROM nodes
        WHERE risk >= ?
        AND (CAST(? AS VARCHAR) = '' OR namespaceId LIKE CAST(? AS VARCHAR))
        ORDER BY risk DESC
        LIMIT ?
      `
    },

    hotspots: {
      description: "Highest combined risk and gravity — most dangerous important symbols",
      params: ["limit"],
      sql: `
        SELECT
          id, name, file, risk, gravity, complexity,
          canonicalKind, semantic_kind, structureId,
          (risk * 0.6 + gravity * 0.4) AS hotspotScore,
          json_extract_string(kinetic, '$.resonance')     AS churn,
          json_extract_string(kinetic, '$.primaryAuthor') AS primaryAuthor
        FROM nodes
        WHERE canonicalKind IN ('BEHAVIOR', 'STRUCTURE')
        ORDER BY hotspotScore DESC
        LIMIT ?
      `
    },

    entry_points: {
      description: "All entry points ranked by gravity",
      params: ["limit"],
      sql: `
        SELECT
          id, name, file, gravity, risk, complexity,
          canonicalKind, semantic_kind, namespaceId
        FROM nodes
        WHERE isEntryPoint = true
        AND name IS NOT NULL
        AND name != canonicalKind
        ORDER BY gravity DESC
        LIMIT ?
      `
    },

    find_by_name: {
      description: "Find symbols by name, optionally scoped to namespace or kind",
      params: ["query", "namespaceId", "canonicalKind", "limit"],
      sql: `
        SELECT
          id, name, file, risk, gravity, complexity,
          canonicalKind, semantic_kind, structureId, namespaceId
        FROM nodes
        WHERE (LOWER(name) = LOWER(CAST(? AS TEXT)) OR LOWER(name) LIKE ('%' || LOWER(CAST(? AS TEXT)) || '%'))
        AND (CAST(? AS TEXT) = '' OR namespaceId LIKE ('%' || CAST(? AS TEXT) || '%'))
        AND (CAST(? AS TEXT) = '' OR canonicalKind = CAST(? AS TEXT))
        ORDER BY gravity DESC
        LIMIT ?
      `
    },

    cross_namespace_coupling: {
      description: "Find unexpected dependencies between top-level modules — architectural lie detector",
      params: ["limit"],
      sql: `
        SELECT
          regexp_extract(source.file, '^(.+?/[^/]+)', 1) AS fromModule,
          regexp_extract(target.file, '^(.+?/[^/]+)', 1) AS toModule,
          CAST(COUNT(*) AS INTEGER) AS edgeCount,
          AVG(e.weight)      AS avgCoupling,
          MAX(source.risk)   AS maxSourceRisk
        FROM edges e
        JOIN nodes source ON e.sourceId = source.id
        JOIN nodes target ON e.targetId = target.id
        WHERE source.file IS NOT NULL
        AND target.file IS NOT NULL
        AND regexp_extract(source.file, '^(.+?/[^/]+)', 1) != regexp_extract(target.file, '^(.+?/[^/]+)', 1)
        GROUP BY fromModule, toModule
        ORDER BY edgeCount DESC
        LIMIT ?
      `
    },

    cycles: {
      description: "Find all circular dependency groups — Tarjan SCC results",
      params: ["limit"],
      sql: `
        SELECT
          n.id, n.name, n.file, n.risk, n.namespaceId,
          json_extract_string(n.metadata, '$.anomaly') AS anomaly
        FROM nodes n
        WHERE json_extract_string(n.metadata, '$.anomaly') = 'cycle'
        ORDER BY n.risk DESC
        LIMIT ?
      `
    },

    layer_distribution: {
      description: "Architectural layer breakdown — how many symbols at each level",
      params: [],
      sql: `
        SELECT
          canonicalRank,
          canonicalKind,
          CAST(COUNT(*) AS INTEGER)   AS symbolCount,
          AVG(risk)  AS avgRisk,
          AVG(gravity) AS avgGravity,
          CAST(SUM(CASE WHEN isEntryPoint THEN 1 ELSE 0 END) AS INTEGER) AS entryPointCount
        FROM nodes
        GROUP BY canonicalRank, canonicalKind
        ORDER BY canonicalRank
      `
    },

    kinetic_hotspots: {
      description: "Symbols with the highest churn in the last 90 days — per-symbol kinetic columns",
      params: ["limit"],
      sql: `
        SELECT id, name, blame_age_days, churn_count_90d, entropy_score, last_author
        FROM nodes
        WHERE churn_count_90d IS NOT NULL
        ORDER BY churn_count_90d DESC
        LIMIT ?
      `
    },

    suspicious_fallbacks: {
      description: "Find functions that appear to be legacy fallbacks based on structural patterns",
      params: ["minConfidence", "minTenureDays", "limit"],
      sql: `
        SELECT
          n.id, n.name, n.file, n.risk, n.gravity, n.complexity,
          n.canonicalKind, n.canonicalRank,
          json_extract_string(n.kinetic, '$.tenureDays') AS tenureDays,
          json_extract_string(n.dna, '$.fallbackAnalysis.confidence') AS fallbackConfidence,
          json_extract_string(n.dna, '$.fallbackAnalysis.patterns.usageRatio.ratio') AS fallbackRatio,
          json_extract_string(n.dna, '$.fallbackAnalysis.patterns.namingPatterns.score') AS namingScore
        FROM nodes n
        WHERE json_extract(n.dna, '$.fallbackAnalysis.isFallback') = true
        AND CAST(json_extract_string(n.dna, '$.fallbackAnalysis.confidence') AS REAL) >= ?
        AND CAST(json_extract_string(n.kinetic, '$.tenureDays') AS INTEGER) >= ?
        AND n.canonicalKind IN ('BEHAVIOR', 'STRUCTURE')
        ORDER BY
          CAST(json_extract_string(n.dna, '$.fallbackAnalysis.confidence') AS REAL) DESC,
          n.risk DESC
        LIMIT ?
      `
    },

    type_coupling: {
      description: "Types and interfaces imported by the most distinct files — compile-time coupling hotspots. Change these → ripple everywhere.",
      params: ["minImporters", "limit"],
      sql: `
        SELECT
          n.id, n.name, n.file, n.risk,
          CAST(COUNT(DISTINCT e.sourceId) AS INTEGER) AS importerCount
        FROM nodes n
        JOIN edges e ON e.targetId = n.id
          AND e.type IN ('IMPORTS', 'TYPE_REFERENCE')
        WHERE n.canonicalKind IN ('ATOM', 'STRUCTURE')
        AND n.file NOT LIKE '%node_modules%'
        AND n.file NOT LIKE '%.test.%'
        AND n.unitId IS NOT NULL
        GROUP BY n.id, n.name, n.file, n.risk
        HAVING importerCount >= CAST(? AS INTEGER)
        ORDER BY importerCount DESC
        LIMIT ?
      `
    }
  };

  private readonly QUERIES: Record<string, any>;

  constructor(private persistence: SynapsePersistence) {
    this.QUERIES = QueryService.QUERIES;
  }

  /**
   * Conducks Re-Anchoring 🏺
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

    // Build ordered values in one pass — keeps duplicate param names (e.g. ["symbolId", "symbolId"])
    // from overwriting each other in a Map.
    const orderedValues: any[] = template.params.map((p: string) => {
      if (p === '$pulseId') return latestPulseId;
      if (p === 'limit') return finalLimit;
      const val = sanitizedUserParams.shift();
      return val === undefined || val === '' ? (PARAM_DEFAULTS[p] ?? '') : val;
    });

    // Final mapping — find_by_name needs a custom positional expansion
    if (templateId === 'find_by_name') {
      // params: ["query", "namespaceId", "canonicalKind"]
      const [q, ns, k] = orderedValues;
      finalParams.push(q, q, ns, ns, k, k, finalLimit);
    } else {
      finalParams.push(...orderedValues);
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
