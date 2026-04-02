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
export const synapseTools: Record<string, Tool> = {

  conducks_query: {
    id: "conducks-query",
    name: "conducks_query",
    type: "tool",
    version: "2.1.0",
    description: `Search the structural graph for symbols and concepts by name or pattern.
Foundational tool for codebase discovery. Finds matching symbols ranked by structural importance.

WHEN TO USE: Finding specific functions, classes, or modules.
AFTER THIS: Use conducks_explain to analyze risk or conducks_trace to trace execution.

Modes:
- fuzzy (default): Natural language or partial name matching.
- regex: Precision regular expression search.

Returns:
- symbols: matching nodes ranked by gravity with entry points prioritized
- total: total number of matches found`,
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Symbol name, pattern, or search concept." },
        limit: { type: "number", default: 10, description: "Max results to return (Max: 10)." },
        path: { type: "string", description: "Optional: The absolute project root." }
      },
      required: ["q"]
    },
    formatter: (res: any) => JSON.stringify(res, null, 2),
    handler: async ({ q, limit, path: customPath }: any) => {
      try {
        const rootPath = customPath || process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
        const results = await registry.query.query(q, limit || 10);
        
        const standardize = (n: any) => ({
          id: n.id,
          kind: n.label,
          file: n.properties.filePath,
          name: n.properties.name,
          risk: n.properties.risk || 0,
          gravity: n.properties.rank || 0
        });

        const ranked = results
          .filter((n: any) => n !== undefined)
          .sort((a: any, b: any) => {
            if (a.properties.isEntryPoint && !b.properties.isEntryPoint) return -1;
            if (!a.properties.isEntryPoint && b.properties.isEntryPoint) return 1;
            return (b.properties.rank || 0) - (a.properties.rank || 0);
          }).slice(0, Math.min(limit || 10, 10));

        return {
          symbols: ranked.map(standardize),
          total: results.length,
          indexStaleness: registry.audit.status().staleness.stale
        };
      } catch (err: any) {
        return { error: `Query Failed: ${err.message}` };
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

Returns:
- stats: node/edge counts and health status
- hotspots: ranked list of critical symbols (for 'map' mode)`,
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["health", "map", "manifest"], default: "health" },
        path: { type: "string", description: "Optional: The absolute project root." }
      }
    },
    formatter: (res: any) => JSON.stringify(res, null, 2),
    handler: async ({ mode, path: customPath }: any) => {
      try {
        const rootPath = customPath || process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
        const status = registry.audit.status();
        
        if (mode === "map") {
          const graph = registry.query.graph.getGraph();
          const hotspots = Array.from(graph.getAllNodes())
            .sort((a: any, b: any) => (b.properties.rank || 0) - (a.properties.rank || 0))
            .slice(0, 10)
            .map((n: any) => ({ id: n.id, name: n.properties.name, risk: n.properties.risk || 0 }));
          
          return { stats: status.stats, staleness: status.staleness, hotspots };
        }

        if (mode === "manifest") {
          const manifest = await registry.audit.contextFile();
          return { manifest, stats: status.stats };
        }

        return { 
          stats: status.stats, 
          staleness: status.staleness,
          anchor: (registry.infrastructure as any).chronicle.getProjectDir()
        };
      } catch (err: any) {
        return { error: `Status Request Failed: ${err.message}` };
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
- advice: Professional structural improvement recommendations.`,
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["scan", "advice"], default: "scan" },
        path: { type: "string", description: "Optional: The absolute project root." }
      }
    },
    formatter: (res: any) => JSON.stringify(res, null, 2),
    handler: async ({ mode, path: customPath }: any) => {
      try {
        const rootPath = customPath || process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
        if (mode === "advice") {
          const advice = await registry.audit.advise();
          return { advice, indexStaleness: registry.audit.status().staleness.stale };
        }
        
        const audit = registry.audit.audit();
        return {
          violations: audit.violations.slice(0, 10).map((v: any) => ({ id: v.nodeId, rule: v.ruleId })),
          indexStaleness: registry.audit.status().staleness.stale
        };
      } catch (err: any) {
        return { error: `Audit Failed: ${err.message}` };
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
AFTER THIS: Use conducks_trace to see how data flows through this symbol.

Returns:
- breakdown: 6-signal risk scores
- summary: overall technical debt assessment`,
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
        const rootPath = customPath || process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
        const risk = await registry.explain.calculateCompositeRisk(symbol);
        return { ...risk, indexStaleness: registry.audit.status().staleness.stale };
      } catch (err: any) {
        return { error: `Explanation Failed: ${err.message}` };
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
AFTER THIS: Apply the provided rules to your implementation.

No Arguments: Returns the list of all available guidance modules.
'skill' Argument: Returns the specific markdown content for a module (e.g., 'frontend/tools/color').`,
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
        const rootPath = customPath || process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
        
        // Ensure Oracle is bootstrapped (lazy load)
        await (registry.oracle as any).bootstrap();

        if (skill) {
          const detail = registry.oracle.get(skill);
          if (!detail) {
            return { error: `Skill '${skill}' not found in the Oracle.`, available: registry.oracle.list().map(s => s.id) };
          }
          return { skill: detail.id, name: detail.name, content: detail.content };
        }

        const list = registry.oracle.list();
        return {
          message: "Conducks Dynamic Guidance Library Active.",
          available_modules: list.map(s => ({ id: s.id, name: s.name, description: s.description }))
        };
      } catch (err: any) {
        return { error: `Oracle Request Failed: ${err.message}` };
      }
    }
  }
};
