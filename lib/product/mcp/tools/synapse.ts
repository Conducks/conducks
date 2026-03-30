import { Tool } from "../../../core/registry/tool-registry.js";
import { conducks } from "../../../../src/conducks-core.js";

/**
 * Apostle v6 — Synapse Tools (Structural Intelligence)
 * 
 * Aligned with the 8 Unified Apostle MCP Tools specification.
 */
export const synapseTools: Record<string, Tool> = {
  conducks_analyze: {
    id: "conducks-analyze",
    name: "conducks_analyze",
    type: "tool",
    version: "2.0.0",
    description: "Analysis Domain: Get a high-level summary of the structural health, hotspots, and entry points.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      await conducks.recalculateGravity();
      const status = conducks.status();
      const graph = conducks.graph.getGraph();
      const nodes = Array.from(graph.getAllNodes());
      
      const hotspots = nodes
        .sort((a, b) => (b.properties.rank || 0) - (a.properties.rank || 0))
        .slice(0, 10)
        .map(n => ({ id: n.id, gravity: n.properties.rank }));

      const entryPoints = nodes
        .filter(n => n.properties.isEntryPoint)
        .sort((a, b) => (b.properties.rank || 0) - (a.properties.rank || 0))
        .slice(0, 10)
        .map(n => ({ id: n.id, kind: n.label, gravity: n.properties.rank }));

      const audit = await conducks.audit();

      return {
        symbolCount: status.stats.nodeCount,
        edgeCount: status.stats.edgeCount,
        hotspots,
        entryPoints,
        violations: audit.violations.slice(0, 5),
        indexStaleness: conducks.checkStaleness()
      };
    },
    formatter: (res: any) => `## Conducks Analysis Summary\nNodes: ${res.symbolCount} | Edges: ${res.edgeCount}\nFound **${res.entryPoints.length}** entry points and **${res.violations.length}** architectural violations.`
  },

  conducks_query: {
    id: "conducks-query",
    name: "conducks_query",
    type: "tool",
    version: "2.0.0",
    description: "Intelligence Domain: Query the structural graph for symbols and relationships. Ranked by gravity.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Symbol name or natural language concept." },
        mode: { type: "string", enum: ["fuzzy", "pattern"], default: "fuzzy" },
        limit: { type: "number", default: 10 }
      },
      required: ["q"]
    },
    handler: async ({ q, mode, limit }: any) => {
      const results = conducks.query(q);
      const ranked = results.sort((a, b) => {
        // Apostle v5.1: Prioritize Entry Points
        if (a.properties.isEntryPoint && !b.properties.isEntryPoint) return -1;
        if (!a.properties.isEntryPoint && b.properties.isEntryPoint) return 1;
        return (b.properties.rank || 0) - (a.properties.rank || 0);
      }).slice(0, limit || 10);
      return { 
        symbols: ranked.map(n => ({ 
          id: n.id, 
          name: n.properties.name, 
          kind: n.label, 
          gravity: n.properties.rank, 
          isEntryPoint: !!n.properties.isEntryPoint,
          file: n.properties.filePath 
        })),
        total: results.length,
        indexStaleness: conducks.checkStaleness()
      };
    },
    formatter: (res: any) => {
      const entries = res.symbols.filter((s: any) => s.isEntryPoint).length;
      return `## Conducks Intelligence: Query Results\nFound **${res.total}** symbols. ${entries > 0 ? `Detected **${entries}** entry points.` : ''} Results ranked by gravity and structural orientation.`;
    }
  },

  conducks_governance: {
    id: "conducks-governance",
    name: "conducks_governance",
    type: "tool",
    version: "2.0.0",
    description: "Governance Domain: Audit architectural integrity (cycles, hubs, violations).",
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["audit", "advice", "refactor-candidates"], default: "audit" }
      }
    },
    handler: async ({ mode }: any) => {
      if (mode === "audit") {
        const audit = await conducks.audit();
        return { violations: audit.violations, indexStaleness: conducks.checkStaleness() };
      }
      if (mode === "advice") {
        const advice = await conducks.advise();
        return { advice, indexStaleness: conducks.checkStaleness() };
      }
      return { results: [], indexStaleness: conducks.checkStaleness() };
    },
    formatter: (res: any) => `## Conducks Governance Audit\nDetected **${res.violations?.length || 0}** architectural violations.`
  },

  conducks_metrics: {
    id: "conducks-metrics",
    name: "conducks_metrics",
    type: "tool",
    version: "2.0.0",
    description: "Metrics Domain: Deep-dive into technical signals (entropy, cohesion, risk).",
    inputSchema: {
      type: "object",
      properties: {
        symbolId: { type: "string", description: "The symbol to analyze (required for explain/entropy/cohesion)." },
        mode: { type: "string", enum: ["hotspots", "entropy", "cohesion", "explain"], default: "explain" },
        targetId: { type: "string", description: "Target symbol for cohesion mode." }
      }
    },
    handler: async ({ symbolId, mode, targetId }: any) => {
      if (mode === "hotspots") {
        const nodes = Array.from(conducks.graph.getGraph().getAllNodes());
        return { 
          hotspots: nodes.sort((a, b) => (b.properties.rank || 0) - (a.properties.rank || 0)).slice(0, 10)
            .map(n => ({ id: n.id, gravity: n.properties.rank }))
        };
      }
      if (!symbolId) return { error: "symbolId is required for this mode." };

      if (mode === "explain") return { ...(await conducks.calculateCompositeRisk(symbolId)), indexStaleness: conducks.checkStaleness() };
      if (mode === "entropy") return { ...(await conducks.calculateEntropy(symbolId)), indexStaleness: conducks.checkStaleness() };
      if (mode === "cohesion") return { vector: conducks.getCohesionVector(symbolId, targetId), indexStaleness: conducks.checkStaleness() };
      return { error: "Unknown mode", indexStaleness: conducks.checkStaleness() };
    },
    formatter: (res: any) => `## Conducks Metrics Decomposition`
  }
};
