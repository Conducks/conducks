import { Tool } from "@/registry/types.js";
import { registry } from "@/registry/index.js";

/**
 * Conducks — Structural Intelligence Tools (Standardized Taxonomy)
 * 
 * These 4 tools form the analytical core of the Conducks MCP suite.
 * They provide discovery, structural health, governance, and precision metrics.
 * 
 * CRITICAL RULE 10/13: Exactly 9 Unified Conducks MCP Tools mandated.
 */

/**
 * [Apostolic Anchor Check] 🏺
 * Ensures the structural registry is aligned to the correct workspace root
 * before executing any tool. This prevents "Detached Root" errors when
 * the MCP server is launched from an arbitrary directory.
 */
async function ensureAnchor(customPath?: string, readOnly: boolean = true) {
  const root = customPath || process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
  const currentAnchor = (registry.infrastructure as any).chronicle?.getProjectDir();
  
  if (root && root !== currentAnchor && root !== '/') {
    await registry.initialize(readOnly, root);
  }
}

export const synapseTools: Record<string, Tool> = {

  conducks_query: {
    id: "conducks-query",
    name: "conducks_query",
    type: "tool",
    version: "2.1.0",
    description: `Search the structural graph for symbols and concepts by name or pattern.
Foundational tool for codebase discovery. Supports Fuzzy search, Oracle templates, and Filters.

WHEN TO USE: Finding specific functions, classes, or modules; analyzing usage or dead code.
AFTER THIS: Use conducks_explain to analyze risk or conducks_trace to trace execution.

Modes:
- fuzzy (default): Natural language or partial name matching.
- template: Execute named Oracle Standard SQL templates (e.g., 'find_usages', 'hotspots', 'dead_code').

Returns:
- symbols: matching nodes ranked by gravity with entry points prioritized
- total: total number of matches found`,
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Symbol name, pattern, or search concept (for fuzzy mode)." },
        mode: { type: "string", enum: ["fuzzy", "template"], default: "fuzzy", description: "Query modality." },
        template: { type: "string", description: "The named Oracle template to execute (for template mode)." },
        params: { type: "object", description: "Parameters for the Oracle template (as a JSON object)." },
        limit: { type: "number", default: 10, description: "Max results to return (Max: 10)." },
        path: { type: "string", description: "Optional: The absolute project root." }
      }
    },
    formatter: (res: any) => JSON.stringify(res, null, 2),
    handler: async ({ q, mode, template, params, limit, path: customPath }: any) => {
      try {
        await ensureAnchor(customPath, true);
        
        // 1. [Mode: Templates] Discovery - Lists available Oracle queries
        if (mode === 'template' && !template) {
          const templates = (registry.analyze.query as any).listTemplates();
          return { 
            message: "Conducks Oracle Standard Library Active.",
            available_templates: templates 
          };
        }

        // 2. [Mode: Template] Structural Analysis - Executes a named query
        if (mode === 'template' && template) {
          const rawParams = Array.isArray(params) ? params : (params ? Object.values(params) : []);
          const results = await registry.analyze.query.execute(template as any, rawParams);
          return { template, total: results.length, symbols: results };
        }

        // 3. [Mode: Fuzzy] Discovery - Default name/pattern search
        const pattern = `%${q || ''}%`;
        const results = await registry.analyze.query.execute('search', [pattern, pattern, limit || 10]);
        
        const standardize = (n: any) => ({
          id: n.id,
          name: n.name,
          kind: n.canonicalKind,
          rank: n.canonicalRank,
          location: {
            file: n.file,
            namespace: n.namespaceName,
            parent: n.parentName
          },
          risk: n.risk || 0,
          gravity: n.gravity || 0
        });

        return {
          q,
          symbols: results.map(standardize),
          total: results.length,
          indexStaleness: registry.audit.status().staleness.stale
        };
      } catch (err: any) {
        return { error: `Query Failed: ${err.message}` };
      } finally {
        await (registry.infrastructure.persistence as any).close();
      }
    }
  },

  conducks_status: {
    id: "conducks-status",
    name: "conducks_status",
    type: "tool",
    version: "2.1.0",
    description: `Structural health and system manifest generation. Maps hotspots and entry points.

WHEN TO USE: First contact with a codebase or checking graph health and node counts.
AFTER THIS: Use conducks_query to find specific symbols.

Modes:
- health (default): Summary of symbols, edges, and index staleness.
- map: Lists the primary entry points and structural hotspots.
- manifest: Generates an LLM-optimized technical summary of the codebase.
- pulse: Triggers a micro-pulse for a specific file to update the live map.`,
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["health", "map", "manifest", "pulse"], default: "health" },
        file: { type: "string", description: "The relative or absolute path of the file to pulse (for 'pulse' mode)." },
        path: { type: "string", description: "Optional: The absolute project root." }
      }
    },
    formatter: (res: any) => JSON.stringify(res, null, 2),
    handler: async ({ mode, file, path: customPath }: any) => {
      try {
        await ensureAnchor(customPath, mode !== 'pulse');
        const status = registry.audit.status();
        
        if (mode === "map") {
          const hotspots = await registry.analyze.query.execute('hotspots', [10]);
          return { stats: status.stats, staleness: status.staleness, hotspots };
        }

        if (mode === "manifest") {
          const manifest = await registry.audit.contextFile();
          return { manifest, stats: status.stats };
        }

        if (mode === "pulse") {
          if (!file) return { error: "Mode 'pulse' requires a 'file' parameter." };
          const result = await (registry.analyze as any).resonate(file);
          return result;
        }

        return { 
          stats: status.stats, 
          staleness: status.staleness,
          anchor: (registry.infrastructure as any).chronicle.getProjectDir()
        };
      } catch (err: any) {
        return { error: `Status Request Failed: ${err.message}` };
      } finally {
        await (registry.infrastructure.persistence as any).close();
      }
    }
  },

  conducks_audit: {
    id: "conducks-audit",
    name: "conducks_audit",
    type: "tool",
    version: "2.1.0",
    description: `Audit architectural integrity. Detects circular dependencies, god objects, and violations.

WHEN TO USE: Before committing changes or during code review to check structural health.
AFTER THIS: Use conducks_explain to analyze why a symbol is flagged.

Modes:
- scan (default): Full integrity audit for circularities and god objects.
- advice: Professional structural improvement recommendations.
- guard: Defensive regression check. Blocks if risk exceeds threshold.
- archeology: Longitudinal historical analysis of structural decay over time (Window: 5 pulses).`,
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["scan", "advice", "guard", "archeology"], default: "scan" },
        threshold: { type: "number", default: 0.1, description: "Max allowed decay (for guard mode)." },
        window: { type: "number", default: 5, description: "Historical window size (for archeology mode)." },
        path: { type: "string", description: "Optional: The absolute project root." }
      }
    },
    formatter: (res: any) => JSON.stringify(res, null, 2),
    handler: async ({ mode, threshold, window, path: customPath }: any) => {
      try {
        await ensureAnchor(customPath, true);
        
        if (mode === "guard") {
          const result = await registry.audit.guard(threshold || 0.1);
          return { block: result.block, risk: result.risk, factors: result.factors, hotspots: result.hotspots, indexStaleness: registry.audit.status().staleness.stale };
        }

        if (mode === "archeology") {
          const result = await registry.evolution.audit(window || 5);
          return { ...result, indexStaleness: registry.audit.status().staleness.stale };
        }

        if (mode === "advice") {
          const advice = await registry.audit.advise();
          return { advice, indexStaleness: registry.audit.status().staleness.stale };
        }
        
        const audit = registry.audit.audit();
        return {
          success: audit.success,
          violations: audit.violations,
          totalViolations: audit.violations.length,
          discoveriesSummary: `Identified ${audit.stats.ecosystem_dangling} external library symbols (Information only).`,
          discoveries: audit.discoveries,
          stats: audit.stats,
          indexStaleness: registry.audit.status().staleness.stale
        };
      } catch (err: any) {
        return { error: `Audit Failed: ${err.message}` };
      } finally {
        await (registry.infrastructure.persistence as any).close();
      }
    }
  },

  conducks_explain: {
    id: "conducks-explain",
    name: "conducks_explain",
    type: "tool",
    version: "2.1.0",
    description: `Deep dive into technical risk and behavior for a specific symbol.
Quantifies gravity, entropy, churn, and complexity.

WHEN TO USE: Understanding why a symbol is high risk or structuraly complex.
AFTER THIS: Use conducks_trace to see how data flows through this symbol.`,
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "The symbol graph ID to explain." },
        path: { type: "string", description: "Optional: The absolute project root." }
      },
      required: ["symbol"]
    },
    formatter: (res: any) => JSON.stringify(res, null, 2),
    handler: async ({ symbol, path: customPath }: any) => {
      try {
        await ensureAnchor(customPath, true);
        const risk: any = await registry.explain.calculateCompositeRisk(symbol);
        const ancestry = await registry.analyze.query.execute('full_ancestry', [symbol]);
        const node = ancestry.length > 0 ? ancestry[0] : null;

        return { 
          ...risk, 
          context: node ? {
            name: node.name,
            file: node.file,
            parent: node.parentName,
            container: node.className || node.namespaceName,
            kind: node.canonicalKind,
            rank: node.canonicalRank
          } : undefined,
          indexStaleness: registry.audit.status().staleness.stale 
        };
      } catch (err: any) {
        return { error: `Explanation Failed: ${err.message}` };
      } finally {
        await (registry.infrastructure.persistence as any).close();
      }
    }
  },

  conducks_guide: {
    id: "conducks-guide",
    name: "conducks_guide",
    type: "tool",
    version: "2.1.0",
    description: `Access the dynamic architectural guidance library. Serves engineering standards and rules.

WHEN TO USE: You need specific guidance on UI, Backend, Security, or Project Structure.
AFTER THIS: Apply the provided rules to your implementation.`,
    inputSchema: {
      type: "object",
      properties: {
        skill: { type: "string", description: "Optional: The ID of the skill to retrieve (e.g., 'frontend/tools/color')." },
        path: { type: "string", description: "Optional: The absolute project root." }
      }
    },
    formatter: (res: any) => JSON.stringify(res, null, 2),
    handler: async ({ skill, path: customPath }: any) => {
      try {
        await ensureAnchor(customPath, true);
        await (registry.oracle as any).bootstrap();

        if (skill) {
          const detail = registry.oracle.get(skill);
          if (!detail) return { error: `Skill '${skill}' not found.`, available: registry.oracle.list().map(s => s.id) };
          return { skill: detail.id, name: detail.name, content: detail.content };
        }

        return {
          message: "Conducks Dynamic Guidance Library Active.",
          available_modules: registry.oracle.list().map(s => ({ id: s.id, name: s.name, description: s.description }))
        };
      } catch (err: any) {
        return { error: `Oracle Request Failed: ${err.message}` };
      } finally {
        await (registry.infrastructure.persistence as any).close();
      }
    }
  }
};
