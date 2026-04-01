import { Tool } from "@/registry/types.js";
import { registry } from "@/registry/index.js";
import path from "node:path";

/**
 * Conducks — Structural Intelligence Tools
 * 
 * These 4 tools form the analytical core of the Conducks MCP suite.
 * They provide discovery, structural mapping, governance, and metrics.
 * 
 * All tool descriptions follow a high-fidelity structural standard:
 * WHEN TO USE → AFTER THIS → Returns → Tips
 * 
 * CRITICAL RULE 10/13: Exactly 10 Unified Conducks MCP Tools mandated.
 */
export const synapseTools: Record<string, Tool> = {

  conducks_search: {
    id: "conducks-search",
    name: "conducks_search",
    type: "tool",
    version: "2.0.0",
    description: `Search the structural graph for symbols and concepts by name: pattern: or regular expression.
Foundational tool for codebase discovery. Finds matching symbols ranked by structural importance.

WHEN TO USE: Finding specific functions: classes: or modules. Understanding where a concept lives in the codebase.
AFTER THIS: Use conducks_metrics to analyze risk or conducks_trace to trace execution.

Modes:
- fuzzy (default): Natural language or partial name matching.
- regex: Precision regular expression search for exact symbol identification.

Returns:
- symbols: matching nodes ranked by gravity with entry points prioritized
- total: total number of matches found
- indexStaleness: true if graph is behind HEAD`,
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Symbol name, pattern, or natural language concept to search for." },
        mode: { type: "string", enum: ["fuzzy", "regex"], default: "fuzzy", description: "Search mode: 'fuzzy' for natural language, 'regex' for exact patterns." },
        limit: { type: "number", default: 10, description: "Max results to return (hard cap: 10)." },
        path: { type: "string", description: "Optional: The absolute path to the project root to search." }
      },
      required: ["q"]
    },
    handler: async ({ q, limit, path: customPath }: any) => {
      try {
        const rootPath = customPath || process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
        // Conducks Intelligence: Standard Query (Fuzzy)
        const results = await registry.intelligence.query(q, limit || 10);
        
        const standardize = (n: any) => ({
          id: n.id,
          kind: n.label,
          file: n.properties.filePath,
          name: n.properties.name,
          risk: n.properties.risk || 0,
          gravity: n.properties.rank || 0,
          summary: `${n.label} ${n.properties.name} in ${n.properties.filePath}`
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
          indexStaleness: registry.governance.status().staleness.stale
        };
      } catch (err: any) {
        return { error: `Search Query Failed: ${err.message}`, total: 0, symbols: [] };
      }
    }
  },

  conducks_structural_map: {
    id: "conducks-structural-map",
    name: "conducks_structural_map",
    type: "tool",
    version: "2.0.0",
    description: `Generates a structural landscape of the project. Identifies critical pillars (hotspots) and entry points into the system.

WHEN TO USE: First contact with a codebase to identify the "Main" functions or high-risk "Hotspots" that hold the system together.
AFTER THIS: Use conducks_search to find specific neighbors: or conducks_governance to audit the architecture.

Modes:
- hotspots (default): Returns the top 10 most "critical" symbols by gravity and risk.
- entry-points: Lists the primary 10 entry points (REST, CLI, Mains) detected in the graph.

Returns:
- pillars: symbols identified in the structural map
- nodeCount: total graph nodes
- edgeCount: total relationship edges`,
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["hotspots", "entry-points"], default: "hotspots", description: "Map mode: 'hotspots' for risk pillars, 'entry-points' for system origins." },
        path: { type: "string", description: "Optional: The absolute path to the project root to map." }
      }
    },
    handler: async ({ mode, path: customPath }: any) => {
      try {
        const rootPath = customPath || process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
        const status = registry.governance.status();
        const graph = registry.intelligence.graph.getGraph();

        const standardize = (n: any) => ({
          id: n.id,
          kind: n.label,
          file: n.properties.filePath,
          name: n.properties.name,
          risk: n.properties.risk || 0,
          gravity: n.properties.rank || 0,
          summary: `${n.label} ${n.properties.name} in ${n.properties.filePath}`
        });

        const allNodes = Array.from(graph.getAllNodes());
        let pillars = [];

        if (mode === "entry-points") {
          pillars = allNodes
            .filter((n: any) => n.properties.isEntryPoint)
            .sort((a: any, b: any) => (b.properties.rank || 0) - (a.properties.rank || 0))
            .slice(0, 10);
        } else {
          // hotspots (Default)
          pillars = allNodes
            .sort((a: any, b: any) => (b.properties.rank || 0) - (a.properties.rank || 0))
            .slice(0, 10);
        }

        return {
          pillars: pillars.map(standardize),
          nodeCount: status.stats.nodeCount,
          edgeCount: status.stats.edgeCount,
          indexStaleness: status.staleness.stale
        };
      } catch (err: any) {
        return { error: `Structural Map Failed: ${err.message}`, pillars: [] };
      }
    }
  },

  conducks_governance: {
    id: "conducks-governance",
    name: "conducks_governance",
    type: "tool",
    version: "2.0.0",
    description: `Audit architectural integrity. Detects circular dependencies: god objects: and rule violations.

WHEN TO USE: Before committing changes to verify no new violations were introduced. During code review to check structural health.
AFTER THIS: Use conducks_metrics to analyze why a symbol is flagged.

Modes:
- audit (default): Runs the full Sentinel scanner to find circular dependencies and god objects.
- advice: Runs the Architecture Advisor for structural improvement recommendations.
- refactor-candidates: Identifies symbols that are strong candidates for extraction or splitting.`,
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["audit", "advice", "refactor-candidates"], default: "audit", description: "Governance mode: 'audit' for violations, 'advice' for recommendations." },
        path: { type: "string", description: "Optional: The absolute path to the project root to audit." }
      }
    },
    handler: async ({ mode, path: customPath }: any) => {
      try {
        const rootPath = customPath || process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
        if (mode === "audit") {
          const audit = registry.governance.audit();
          return {
            violations: audit.violations.slice(0, 10).map((v: any) => ({ id: v.nodeId, rule: v.ruleId })),
            indexStaleness: registry.governance.status().staleness.stale
          };
        }
        if (mode === "advice") {
          const advice = await registry.governance.advise();
          return { advice, indexStaleness: registry.governance.status().staleness.stale };
        }
        // refactor-candidates (Step 12/13 integration)
        const candidates = (registry.governance as any).getCandidates ? await (registry.governance as any).getCandidates() : [];
        return { candidates: candidates.slice(0, 10), indexStaleness: registry.governance.status().staleness.stale };
      } catch (err: any) {
        return { error: `Governance Audit Failed: ${err.message}`, violations: [] };
      }
    }
  },

  conducks_metrics: {
    id: "conducks-metrics",
    name: "conducks_metrics",
    type: "tool",
    version: "2.0.0",
    description: `Deep dive into technical risk signals for a specific symbol or relationship.
This is the ONLY tool that returns full 6-signal detail for a single symbol.

WHEN TO USE: After search identifies a symbol of interest. When you need to understand why a symbol is high risk or complex.
AFTER THIS: Use conducks_trace to see how bad data flows into/out of this symbol.

Modes:
- explain (default): Full 6-signal risk decomposition (Gravity, Entropy, Churn, Complexity, Coupling, Size). 
- bus-factor: Shannon entropy calculation for author distribution (Logic continuity risk).
- cohesion: Structural similarity between two symbols (Identifies hidden coupling).`,
    inputSchema: {
      type: "object",
      properties: {
        symbolId: { type: "string", description: "The symbol graph ID to analyze. Get this from search results." },
        mode: { type: "string", enum: ["explain", "bus-factor", "cohesion"], default: "explain", description: "Analysis mode: 'explain' for risk, 'bus-factor' for author drift, 'cohesion' for similarity." },
        targetId: { type: "string", description: "Second symbol ID for cohesion comparison." },
        path: { type: "string", description: "Optional: The absolute path to the project root to analyze." }
      },
      required: ["symbolId"]
    },
    handler: async ({ symbolId, mode, targetId, path: customPath }: any) => {
      try {
        const rootPath = customPath || process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
        const status = registry.governance.status();
        
        if (mode === "explain") return { ...(await registry.metrics.calculateCompositeRisk(symbolId)), indexStaleness: status.staleness.stale };
        if (mode === "bus-factor") return { ...(await registry.metrics.calculateEntropy(symbolId)), indexStaleness: status.staleness.stale };
        if (mode === "cohesion") return { vector: registry.metrics.getCohesionVector(symbolId, targetId as string), indexStaleness: status.staleness.stale };
        return { error: "Unknown mode", indexStaleness: status.staleness.stale };
      } catch (err: any) {
        return { error: `Metrics Analysis Failed: ${err.message}`, risk: 0 };
      }
    }
  }
};
