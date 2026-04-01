import { Tool } from "@/registry/types.js";
import { registry } from "@/registry/index.js";

/**
 * Conducks — Synapse Tools (Structural Intelligence)
 * 
 * These 4 tools form the analytical core of the Conducks MCP suite.
 * They provide structural health summaries, graph querying, governance
 * auditing, and deep-dive metric decomposition.
 * 
 * All tool descriptions follow a high-fidelity structural standard:
 * WHEN TO USE → AFTER THIS → Returns → Tips
 */
export const synapseTools: Record<string, Tool> = {
  conducks_analyze: {
    id: "conducks-analyze",
    name: "conducks_analyze",
    type: "tool",
    version: "2.0.0",
    description: `High level structural summary of the indexed project. 
Returns hotspots: entry points: architectural violations: and graph statistics.

THIS IS THE PRIMARY INDEXING TOOL. Use this to bootstrap a new repository or refresh the structural resonance of an existing one.

WHEN TO USE: First step when starting work on a codebase. Run this BEFORE any other tool to understand structural health and identify high risk code.
MANDATORY REFRESH: Run periodically or when indexStaleness is true to sync the graph with the current HEAD.
MANDATORY BOOTSTRAP: If other tools return empty results you MUST run this with fullAnalysis set to true to perform the initial structural crawl.

AFTER THIS: Use conducks_query to search for specific symbols. Use conducks_metrics to deep dive into any hotspot. Use conducks_governance for the full violation list.

Returns:
- symbolCount: total nodes in the structural graph
- edgeCount: total relationships like CALLS: IMPORTS: and INHERITS
- hotspots: the 10 most structurally important symbols ranked by PageRank gravity
- entryPoints: detected entry points like main: handlers: and routes
- violations: active architectural rule violations
- indexStaleness: true if the graph is behind HEAD

Node shape: { id, kind, file, name, risk, gravity, summary }

TIP: Always run with fullAnalysis set to true if you are entering a new codebase for the first time.
TIP: Hotspots with high gravity and high risk are the most dangerous symbols.`,
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
    description: `Query the structural graph for symbols and relationships by name: pattern: or concept.
Returns matching symbols ranked by structural importance: entry points first: then by PageRank gravity.

PREREQUISITE: You MUST run conducks_analyze with fullAnalysis set to true at least once before using this tool in a new repository. If results are empty the graph is likely in a Void State.

WHEN TO USE: Finding specific functions: classes: or modules. Understanding where a concept lives in the codebase. Narrowing down before a deep dive with conducks_metrics.
AFTER THIS: Use conducks_metrics for full risk decomposition of a result. Use conducks_trace to trace execution flow from a result.

Returns:
- symbols: matching nodes ranked by gravity with entry points prioritized
- total: total number of matches found
- indexStaleness: true if graph is behind HEAD

Node shape: { id, kind, file, name, risk, gravity, summary }

Search modes:
- fuzzy (default): Natural language or partial name matching.
- pattern: Exact pattern matching for precise symbol lookup.

TIP: Entry points are always ranked first. They are the most useful starting points.
TIP: Results are capped at 10. Use more specific queries to narrow results on large repositories.
TIP: The id field in results is the unique identifier. Use it with conducks_trace and conducks_metrics.`,
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
      // Ensure registry is initialized for structural resonance
      const rootPath = process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
      await registry.initialize(true, rootPath);
      
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
    description: `Audit architectural integrity. Detects circular dependencies: god objects: hub overload: and rule violations.

PREREQUISITE: You MUST run conducks_analyze with fullAnalysis set to true to populate the structural graph before an audit can be performed.

WHEN TO USE: Before committing changes to verify no new violations were introduced. During code review to check structural health of modified areas. When investigating technical debt to find the worst offenders.
AFTER THIS: Use conducks_metrics with mode set to explain to understand why a symbol is flagged. Use conducks_trace to trace the violation blast radius.

Modes:
- audit (default): Runs the full Sentinel scanner to find circular dependencies and god objects.
- advice: Runs the Architecture Advisor for structural improvement recommendations.
- refactor-candidates: Identifies symbols that are strong candidates for extraction or splitting.

Returns:
- violations: active violations including the node ID and rule ID
- indexStaleness: true if the graph is behind HEAD

TIP: Run this after every significant code change to catch regressions early.
TIP: Circular dependency violations are the most critical. They indicate structural decay.
TIP: Use with conducks_evolution to see if recent changes introduced new violations.`,
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["audit", "advice", "refactor-candidates"], default: "audit", description: "Governance mode: 'audit' for violations, 'advice' for recommendations, 'refactor-candidates' for split/extract candidates." }
      }
    },
    handler: async ({ mode }: any) => {
      // Ensure registry is initialized
      const rootPath = process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
      await registry.initialize(true, rootPath);

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
    description: `Deep dive into technical risk signals for a specific symbol or the entire codebase.
This is the ONLY tool that returns full detail for a single symbol. Other tools return summaries.

PREREQUISITE: You MUST run conducks_analyze with fullAnalysis set to true to index the codebase before you can decompose metrics.

WHEN TO USE: After conducks_query identifies a symbol of interest. When you need to understand why a symbol is high risk. When comparing structural coupling between two symbols.
AFTER THIS: Use conducks_trace to trace execution flow. Use conducks_evolution with mode set to uncommitted to see if the symbol was recently modified.

Modes:
- hotspots (default): Returns the 10 highest gravity symbols across the codebase.
- explain: Full 6-signal risk decomposition for a single symbol. Requires symbolId.
- entropy: Shannon entropy calculation for author distribution.
- cohesion: Structural similarity between two symbols. Requires targetId.

Returns:
- gravity: PageRank centrality (0 to 1) showing structural importance
- entropy: Shannon entropy of author distribution
- churn: normalized change frequency
- fanOut: outgoing dependency count
- composite score: weighted combination of all signals

TIP: The explain mode is the most powerful. It tells you exactly why a symbol is risky.
TIP: High entropy and high churn indicates a bus factor risk.
TIP: High gravity and low fanOut indicates a structural pillar.
TIP: Use cohesion mode to identify god objects with many neighbors.`,
    inputSchema: {
      type: "object",
      properties: {
        symbolId: { type: "string", description: "The symbol graph ID to analyze. Required for explain/entropy/cohesion modes. Get this from conducks_query or conducks_analyze results." },
        mode: { type: "string", enum: ["hotspots", "entropy", "cohesion", "explain"], default: "explain", description: "Analysis mode: 'hotspots' for top-N overview, 'explain' for full risk decomposition, 'entropy' for author distribution, 'cohesion' for structural similarity." },
        targetId: { type: "string", description: "Second symbol ID for cohesion comparison. Required only for cohesion mode." }
      }
    },
    handler: async ({ symbolId, mode, targetId }: any) => {
      // Ensure registry is initialized
      const rootPath = process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
      await registry.initialize(true, rootPath);

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
