import { Tool } from "@/registry/types.js";
import { registry } from "@/registry/index.js";

/**
 * Conducks — Synapse Tools (Structural Intelligence)
 * 
 * These 4 tools form the analytical core of the Conducks MCP suite.
 * They provide structural health summaries, graph querying, governance
 * auditing, and deep-dive metric decomposition.
 * 
 * All tool descriptions follow the GitNexus high-fidelity standard:
 * WHEN TO USE → AFTER THIS → Returns → Tips
 */
export const synapseTools: Record<string, Tool> = {
  conducks_analyze: {
    id: "conducks-analyze",
    name: "conducks_analyze",
    type: "tool",
    version: "2.0.0",
    description: `High-level structural health summary of the indexed codebase.
Returns hotspots (highest-gravity symbols), entry points, architectural violations, and overall graph stats.

WHEN TO USE: First step when starting work on a codebase. Run this before any other tool to understand structural health, identify high-risk areas, and see active architectural violations. Also run after \`conducks analyze\` CLI to see the latest pulse results.
AFTER THIS: Use conducks_query() to search for specific symbols. Use conducks_metrics(mode:'explain', symbolId:'...') to deep-dive into any hotspot. Use conducks_governance(mode:'audit') for the full violation list.

Returns:
- symbolCount: total nodes in the structural graph
- edgeCount: total relationships (CALLS, IMPORTS, INHERITS, etc.)
- hotspots[10]: top symbols by PageRank gravity — these are the most structurally important symbols
- entryPoints[10]: detected entry points (main, handlers, routes) ranked by gravity
- violations[10]: active architectural law violations ({id, rule})
- indexStaleness: boolean — true if the graph is behind HEAD (run \`conducks analyze\` to refresh)

Node shape (all lists): { id, kind, file, name, risk, gravity, summary }

TIP: If indexStaleness is true, results may be outdated. Run \`conducks analyze\` in the terminal first.
TIP: Hotspots with high gravity AND high risk are the most dangerous symbols — changes to them have the widest blast radius.`,
    inputSchema: {
      type: "object",
      properties: {
        fullAnalysis: { type: "boolean", description: "If true, initiates a full project-wide structural pulse before returning results." }
      }
    },
    handler: async ({ fullAnalysis }: any) => {
      if (fullAnalysis) {
        await (registry.analysis as any).fullPulse();
      }

      registry.intelligence.resonate();
      const status = registry.governance.status();
      const graph = registry.intelligence.graph.getGraph();
      const nodes = Array.from(graph.getAllNodes());

      const standardize = (n: any) => ({
        id: n.id,
        kind: n.label,
        file: n.properties.filePath,
        name: n.properties.name,
        risk: n.properties.risk || 0,
        gravity: n.properties.rank || 0,
        summary: `${n.label} ${n.properties.name} in ${n.properties.filePath}`
      });

      const hotspots = nodes
        .sort((a: any, b: any) => (b.properties.rank || 0) - (a.properties.rank || 0))
        .slice(0, 10)
        .map(standardize);

      const entryPoints = nodes
        .filter((n: any) => n.properties.isEntryPoint)
        .sort((a: any, b: any) => (b.properties.rank || 0) - (a.properties.rank || 0))
        .slice(0, 10)
        .map(standardize);

      const audit = registry.governance.audit();

      return {
        symbolCount: status.stats.nodeCount,
        edgeCount: status.stats.edgeCount,
        hotspots,
        entryPoints,
        violations: audit.violations.slice(0, 10).map((v: any) => ({ id: v.nodeId, rule: v.ruleId })),
        indexStaleness: status.staleness.stale
      };
    },
    formatter: (res: any) => `## Conducks Analysis Summary\nNodes: ${res.symbolCount} | Edges: ${res.edgeCount}\nFound **${res.entryPoints.length}** entry points and **${res.violations.length}** architectural violations.`
  },

  conducks_query: {
    id: "conducks-query",
    name: "conducks_query",
    type: "tool",
    version: "2.0.0",
    description: `Query the structural graph for symbols and relationships by name, pattern, or concept.
Returns matching symbols ranked by structural importance: entry points first, then by PageRank gravity.

WHEN TO USE: Finding specific functions, classes, or modules. Understanding where a concept lives in the codebase. Narrowing down before a deep-dive with conducks_metrics.
AFTER THIS: Use conducks_metrics(mode:'explain', symbolId:'<id>') for full risk decomposition of a result. Use conducks_trace(symbol:'<id>') to trace execution flow from a result.

Returns:
- symbols[10]: matching nodes ranked by gravity, entry points prioritized
- total: total number of matches (may exceed the 10-item limit)
- indexStaleness: boolean — true if graph is behind HEAD

Node shape: { id, kind, file, name, risk, gravity, summary }

Search modes:
- fuzzy (default): Natural language or partial name matching. Best for exploratory queries.
- pattern: Exact pattern matching for precise symbol lookup.

TIP: Entry points are always ranked first — they're the most useful starting points.
TIP: Results are capped at 10. Use more specific queries to narrow results on large repos.
TIP: The "id" field in results is the symbol's unique graph identifier — use it with conducks_trace and conducks_metrics.`,
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Symbol name, pattern, or natural language concept to search for." },
        mode: { type: "string", enum: ["fuzzy", "pattern"], default: "fuzzy", description: "Search mode: 'fuzzy' for natural language/partial match, 'pattern' for exact matching." },
        limit: { type: "number", default: 10, description: "Max results to return (hard cap: 10)." }
      },
      required: ["q"]
    },
    handler: async ({ q, mode, limit }: any) => {
      const results = await (registry.intelligence.search as any).search(q, 10);
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

      const ranked = results.sort((a: any, b: any) => {
        if (a.properties.isEntryPoint && !b.properties.isEntryPoint) return -1;
        if (!a.properties.isEntryPoint && b.properties.isEntryPoint) return 1;
        return (b.properties.rank || 0) - (a.properties.rank || 0);
      }).slice(0, Math.min(limit || 10, 10));

      return {
        symbols: ranked.map(standardize),
        total: results.length,
        indexStaleness: registry.governance.status().staleness.stale
      };
    },
    formatter: (res: any) => {
      return `## Conducks Intelligence: Query Results\nFound **${res.total}** symbols. Results ranked by gravity and structural orientation.`;
    }
  },

  conducks_governance: {
    id: "conducks-governance",
    name: "conducks_governance",
    type: "tool",
    version: "2.0.0",
    description: `Audit architectural integrity. Detects circular dependencies, god objects, hub overload, and rule violations.

WHEN TO USE: Before committing changes — to verify no new violations were introduced. During code review — to check structural health of modified areas. When investigating technical debt — to find the worst offenders.
AFTER THIS: Use conducks_metrics(mode:'explain', symbolId:'<violating_symbol>') to understand why a symbol is flagged. Use conducks_trace(symbol:'<id>') to trace the violation's blast radius.

Modes:
- audit (default): Runs the full Sentinel scanner. Returns all active violations including circular dependencies (ARCH-3), god objects, and hub overload.
- advice: Runs the Conducks Advisor for structural improvement recommendations. Returns actionable suggestions ranked by impact.
- refactor-candidates: Identifies symbols that are strong candidates for extraction or splitting based on cohesion analysis.

Returns (audit mode):
- violations[10]: active violations with { id (nodeId), rule (ruleId) }
- indexStaleness: boolean

Returns (advice mode):
- advice: structured improvement recommendations
- indexStaleness: boolean

TIP: Run this after every significant code change to catch regressions early.
TIP: Circular dependency violations (ARCH-3) are the most critical — they indicate structural decay.
TIP: Use with conducks_evolution(mode:'diff') to see if recent changes introduced new violations.`,
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["audit", "advice", "refactor-candidates"], default: "audit", description: "Governance mode: 'audit' for violations, 'advice' for recommendations, 'refactor-candidates' for split/extract candidates." }
      }
    },
    handler: async ({ mode }: any) => {
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
      return { results: [], indexStaleness: registry.governance.status().staleness.stale };
    },
    formatter: (res: any) => `## Conducks Governance Audit\nDetected **${res.violations?.length || 0}** architectural violations.`
  },

  conducks_metrics: {
    id: "conducks-metrics",
    name: "conducks_metrics",
    type: "tool",
    version: "2.0.0",
    description: `Deep-dive into technical risk signals for a specific symbol or the overall codebase.
This is the ONLY tool that returns full detail for a single symbol. All other tools return summaries.

WHEN TO USE: After conducks_query() or conducks_analyze() identifies a symbol of interest. When you need to understand WHY a symbol is high-risk. When comparing structural coupling between two symbols.
AFTER THIS: Use conducks_trace(symbol:'<id>') to trace execution flow. Use conducks_evolution(mode:'uncommitted') to see if the symbol was recently modified.

Modes:
- hotspots (default): Returns the top 10 highest-gravity symbols across the entire codebase. No symbolId required.
- explain: Full 6-signal risk decomposition for ONE symbol. Requires symbolId. Returns:
  - gravity: PageRank centrality (0-1) — how structurally important this symbol is
  - entropy: Shannon entropy of author distribution — how many people touch this code
  - churn: normalized change frequency — how often this code changes
  - fanOut: outgoing dependency count — how many things this symbol depends on
  - composite score: weighted combination (gravity 40%, entropy 30%, churn 20%, fanOut 10%)
  - breakdown: per-signal value and weight for transparency
- entropy: Shannon entropy calculation for a specific symbol. Requires symbolId.
- cohesion: Structural cohesion vector between two symbols. Requires symbolId and targetId. Returns a 0-1 score where 1.0 = identical dependency neighborhoods.

Node shape (hotspots mode): { id, kind, file, name, risk, gravity, summary }

TIP: The 'explain' mode is the most powerful — it tells you exactly WHY a symbol is risky.
TIP: High entropy + high churn = "bus factor risk" — too many authors touching frequently-changed code.
TIP: High gravity + low fanOut = "structural pillar" — critical but well-contained.
TIP: Use 'cohesion' mode to identify god objects (low cohesion with many neighbors).`,
    inputSchema: {
      type: "object",
      properties: {
        symbolId: { type: "string", description: "The symbol graph ID to analyze. Required for explain/entropy/cohesion modes. Get this from conducks_query or conducks_analyze results." },
        mode: { type: "string", enum: ["hotspots", "entropy", "cohesion", "explain"], default: "explain", description: "Analysis mode: 'hotspots' for top-N overview, 'explain' for full risk decomposition, 'entropy' for author distribution, 'cohesion' for structural similarity." },
        targetId: { type: "string", description: "Second symbol ID for cohesion comparison. Required only for cohesion mode." }
      }
    },
    handler: async ({ symbolId, mode, targetId }: any) => {
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

      if (mode === "hotspots") {
        const nodes = Array.from(graph.getAllNodes());
        return {
          hotspots: nodes.sort((a: any, b: any) => (b.properties.rank || 0) - (a.properties.rank || 0))
            .slice(0, 10)
            .map(standardize)
        };
      }

      if (!symbolId) return { error: "symbolId is required for this mode. Get it from conducks_query or conducks_analyze results." };

      if (mode === "explain") return { ...(await registry.metrics.calculateCompositeRisk(symbolId)), indexStaleness: status.staleness.stale };
      if (mode === "entropy") return { ...(await registry.metrics.calculateEntropy(symbolId)), indexStaleness: status.staleness.stale };
      if (mode === "cohesion") return { vector: registry.intelligence.getCohesionVector(symbolId, targetId), indexStaleness: status.staleness.stale };
      return { error: "Unknown mode", indexStaleness: status.staleness.stale };
    },
    formatter: (res: any) => `## Conducks Metrics Decomposition`
  }
};
