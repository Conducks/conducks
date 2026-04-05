import type { SynapsePersistence } from "@/lib/core/persistence/persistence.js";
import { logger } from "@/lib/core/utils/logger.js";

/**
 * Conducks — Query Template Library (Structural DNA v4) 🏺
 * 
 * Enforces parameterised intent-based analysis. No raw SQL from agents.
 */
export class QueryService {
  private persistence: SynapsePersistence;

  constructor(persistence: SynapsePersistence) {
    this.persistence = persistence;
  }

  /**
   * Executes a named template with validated parameters.
   */
  public async execute(templateName: string, params: Record<string, any>): Promise<any[]> {
    const template = (this as any).TEMPLATES[templateName];
    if (!template) {
      throw new Error(`Unknown query template: ${templateName}`);
    }

    const db = await (this.persistence as any).getRawConnection();
    if (!db) return [];

    // Get latest pulseId
    const pulseRows: any[] = await new Promise((res) => 
      db.all("SELECT id FROM pulses ORDER BY timestamp DESC LIMIT 1", (err: any, rows: any[]) => res(err ? [] : rows))
    );
    if (pulseRows.length === 0) return [];
    const pulseId = pulseRows[0].id;

    // Inject system params
    const finalParams = { ...params, pulseId };
    
    // Convert named params to DuckDB positional/named params if needed
    // DuckDB node-bindings usually support named params with $ prefix
    const sql = template.sql;
    
    return new Promise((resolve, reject) => {
      // Create a copy of params with $ prefix for DuckDB
      const duckParams: Record<string, any> = {};
      for (const [k, v] of Object.entries(finalParams)) {
        duckParams[`$${k}`] = v;
      }

      db.all(sql, duckParams, (err: any, rows: any[]) => {
        if (err) {
          logger.error(`Query Template Failure [${templateName}]: ${err.message}`);
          return reject(err);
        }
        resolve(rows || []);
      });
    });
  }

  private readonly TEMPLATES: Record<string, { description: string, sql: string }> = {
    // ── USAGE ANALYSIS ───────────────────────────────────────────────────────
    find_usages: {
      description: "Find all callers of a specific symbol",
      sql: `
        SELECT
          e.sourceId, n.name, n.file, n.structureId,
          n.namespaceId, n.risk, n.canonicalKind
        FROM edges e
        JOIN nodes n ON e.sourceId = n.id
        WHERE e.targetId = $symbolId
        AND e.type = $edgeType
        AND e.pulseId = $pulseId
        ORDER BY n.risk DESC
        LIMIT $limit
      `
    },

    find_imports: {
      description: "Find all files that import a specific module or file",
      sql: `
        SELECT
          e.sourceId, n.name, n.file, n.namespaceId,
          n.risk, n.gravity
        FROM edges e
        JOIN nodes n ON e.sourceId = n.id
        WHERE e.targetId = $targetId
        AND e.type = 'IMPORTS'
        AND e.pulseId = $pulseId
        ORDER BY n.gravity DESC
        LIMIT $limit
      `
    },

    unused_exports: {
      description: "Find exported symbols never imported by any other file",
      sql: `
        SELECT
          n.id, n.name, n.file, n.risk,
          json_extract(n.kinetic, '$.tenureDays') AS tenureDays
        FROM nodes n
        LEFT JOIN edges e ON e.targetId = n.id
          AND e.type = 'IMPORTS'
          AND e.pulseId = n.pulseId
        WHERE json_extract(n.dna, '$.isExported') = true
        AND e.id IS NULL
        AND n.canonicalKind IN ('BEHAVIOR', 'STRUCTURE')
        AND n.pulseId = $pulseId
        ORDER BY tenureDays DESC
        LIMIT $limit
      `
    },

    // ── DEAD CODE ────────────────────────────────────────────────────────────
    dead_code: {
      description: "Find symbols with no incoming edges — dead code candidates",
      sql: `
        SELECT
          n.id, n.name, n.file, n.risk, n.gravity, n.complexity,
          n.canonicalKind, n.semantic_kind, n.structureId,
          json_extract(n.kinetic, '$.tenureDays')    AS tenureDays,
          json_extract(n.kinetic, '$.primaryAuthor') AS primaryAuthor,
          json_extract(n.kinetic, '$.authorCount')   AS authorCount
        FROM nodes n
        LEFT JOIN edges e ON e.targetId = n.id AND e.pulseId = n.pulseId
        WHERE e.id IS NULL
        AND n.isEntryPoint = false
        AND n.canonicalKind IN ('BEHAVIOR', 'STRUCTURE')
        AND json_extract(n.kinetic, '$.tenureDays') >= $minTenureDays
        AND n.pulseId = $pulseId
        ORDER BY n.risk DESC, tenureDays DESC
        LIMIT $limit
      `
    },

    // ── BLAST RADIUS & IMPACT ────────────────────────────────────────────────
    blast_radius: {
      description: "Find all direct dependents of a symbol",
      sql: `
        SELECT
          e.sourceId, n.name, n.file, n.risk,
          n.structureId, n.namespaceId, e.weight, e.type
        FROM edges e
        JOIN nodes n ON e.sourceId = n.id
        WHERE e.targetId = $symbolId
        AND e.pulseId = $pulseId
        ORDER BY e.weight DESC, n.risk DESC
        LIMIT $limit
      `
    },

    deep_impact: {
      description: "Transitive dependents up to N hops — full blast radius",
      sql: `
        WITH RECURSIVE impact AS (
          SELECT targetId AS id, sourceId AS dependentId, 1 AS depth
          FROM edges
          WHERE targetId = $symbolId
          AND pulseId = $pulseId

          UNION ALL

          SELECT e.targetId, e.sourceId, i.depth + 1
          FROM edges e
          JOIN impact i ON e.targetId = i.dependentId
          WHERE i.depth < $maxDepth
          AND e.pulseId = $pulseId
        )
        SELECT DISTINCT
          n.id, n.name, n.file, n.risk,
          n.canonicalKind, n.namespaceId,
          MIN(i.depth) AS hopDistance
        FROM impact i
        JOIN nodes n ON i.dependentId = n.id
        GROUP BY n.id, n.name, n.file, n.risk, n.canonicalKind, n.namespaceId
        ORDER BY hopDistance ASC, n.risk DESC
        LIMIT $limit
      `
    },

    structural_siblings: {
      description: "Find all symbols in the same class as a given symbol",
      sql: `
        SELECT id, name, risk, complexity, gravity, semantic_kind, visibility
        FROM nodes
        WHERE structureId = (
          SELECT structureId FROM nodes
          WHERE id = $symbolId AND pulseId = $pulseId
        )
        AND id != $symbolId
        AND pulseId = $pulseId
        ORDER BY risk DESC
      `
    },

    // ── HIERARCHY NAVIGATION ─────────────────────────────────────────────────
    symbols_in_structure: {
      description: "Find all symbols inside a class or interface",
      sql: `
        SELECT
          id, name, semantic_kind, risk, gravity,
          complexity, visibility, isEntryPoint,
          json_extract(dna, '$.isAsync')    AS isAsync,
          json_extract(dna, '$.isStatic')   AS isStatic,
          json_extract(dna, '$.returns')    AS returns
        FROM nodes
        WHERE structureId = $structureId
        AND pulseId = $pulseId
        ORDER BY gravity DESC
      `
    },

    symbols_in_namespace: {
      description: "Find all symbols inside a folder/namespace",
      sql: `
        SELECT
          id, name, file, canonicalKind, semantic_kind,
          risk, gravity, complexity, structureId
        FROM nodes
        WHERE namespaceId LIKE $namespaceId
        AND ($canonicalKind = '' OR canonicalKind = $canonicalKind)
        AND pulseId = $pulseId
        ORDER BY gravity DESC
        LIMIT $limit
      `
    },

    full_ancestry: {
      description: "Get complete containment context for a symbol in one query",
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
        WHERE n.id = $symbolId
        AND n.pulseId = $pulseId
      `
    },

    // ── ARCHITECTURAL ANALYSIS ───────────────────────────────────────────────
    high_risk_symbols: {
      description: "Find symbols above a risk threshold",
      sql: `
        SELECT
          id, name, file, risk, gravity, complexity,
          canonicalKind, semantic_kind, structureId
        FROM nodes
        WHERE risk >= $minRisk
        AND pulseId = $pulseId
        ORDER BY risk DESC
        LIMIT $limit
      `
    },

    layer_distribution: {
      description: "Aggregate distribution across the 8-layer taxonomy",
      sql: `
        SELECT canonicalRank, canonicalKind, COUNT(*) as symbolCount
        FROM nodes 
        WHERE pulseId = $pulseId
        GROUP BY canonicalRank, canonicalKind
        ORDER BY canonicalRank
      `
    }
  };
}
