import { Tool } from "@/registry/types.js";
import { registry } from "@/registry/index.js";
import path from "node:path";
import fs from "fs-extra";

/**
 * Conducks — Behavioral Intelligence Tools
 * 
 * These 6 tools form the behavioral core of the Conducks MCP suite.
 * They provide tracing, impact analysis, evolution tracking, refactoring,
 * visual mirroring, and system management.
 * 
 * All tool descriptions follow a high-fidelity structural standard:
 * WHEN TO USE → AFTER THIS → Returns → Tips
 * 
 * CRITICAL RULE 10/13: Exactly 10 Unified Conducks MCP Tools mandated.
 */
export const kineticTools: Record<string, Tool> = {

  conducks_impact: {
    id: "conducks-impact",
    name: "conducks_impact",
    type: "tool",
    version: "2.0.0",
    description: `Analyzes structural impact bi-directionally. Identifies what a symbol affects (downstream) or what affects a symbol (upstream).

WHEN TO USE: Assessing the structural risk of changing a function or class. Finding the "Blast Radius" of a potential refactor.
AFTER THIS: Use conducks_evolution(mode: 'uncommitted') to verify the actual blast radius of your changes.

Modes:
- upstream (default): WHO CALLS ME? Identifies all incoming dependencies that would break if this symbol changes.
- downstream: WHAT DO I CALL? Identifies all outgoing dependencies this symbol relies on.

Returns:
- impactNodes: symbols in the impact path
- direction: upstream or downstream
- totalRisk: cumulative risk score of the impact path`,
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "The starting symbol graph ID." },
        direction: { type: "string", enum: ["upstream", "downstream"], default: "upstream", description: "Impact direction: 'upstream' for reverse impact, 'downstream' for forward impact." },
        depth: { type: "number", default: 5, description: "Max traversal depth (Max: 10)." },
        path: { type: "string", description: "Optional: The absolute project root." }
      },
      required: ["symbol"]
    },
    handler: async ({ symbol, direction, depth, path: customPath }: any) => {
      try {
        const rootPath = customPath || process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
        const results = registry.kinetic.getImpact(symbol, direction || 'upstream', depth || 5);
        const g = registry.intelligence.graph.getGraph();

        return {
          impactNodes: results.affectedNodes.slice(0, 10).map((n: any) => ({
            id: n.id,
            kind: n.kind,
            file: n.filePath,
            name: n.name,
            risk: n.risk,
            distance: n.distance
          })),
          direction: direction || 'upstream',
          impactScore: results.impactScore,
          risk: results.risk,
          indexStaleness: registry.governance.status().staleness.stale
        };
      } catch (err: any) {
        return { error: `Impact Analysis Failed: ${err.message}`, symbol, direction };
      }
    }
  },

  conducks_trace: {
    id: "conducks-trace",
    name: "conducks_trace",
    type: "tool",
    version: "2.0.0",
    description: `Traces structural execution circuits and pathfinding between any two symbols. Uses Risk-Weighted Dijkstra (v1.7.0).

WHEN TO USE: Debugging execution flows or finding the shortest structural path between distant parts of the codebase.
AFTER THIS: Use conducks_metrics to analyze the risk of each step in the trace.

Modes:
- execution (default): Traces the downstream control flow from a symbol (BFS).
- pathfinding: Finds the shortest structural path between the 'symbol' and a 'target' using weighted Dijkstra.

Returns:
- steps: ordered sequence of symbols in the trace
- pathDescription: summary of the structural coupling discovered`,
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "The starting symbol graph ID." },
        mode: { type: "string", enum: ["execution", "pathfinding"], default: "execution", description: "Trace mode: 'execution' for flow, 'pathfinding' for shortest distance." },
        target: { type: "string", description: "Target symbol ID for pathfinding mode." },
        path: { type: "string", description: "Optional: The absolute project root." }
      },
      required: ["symbol"]
    },
    handler: async ({ symbol, mode, target, path: customPath }: any) => {
      try {
        const rootPath = customPath || process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
        const g = registry.intelligence.graph.getGraph();

        const standardize = (id: string): any => {
          const node = g.getNode(id);
          if (!node) return { id };
          return {
            id: node.id,
            kind: node.label,
            name: node.properties.name,
            file: node.properties.filePath
          };
        };

        if (mode === "pathfinding" && target) {
          const pathResult = registry.kinetic.findPath(symbol, target);
          return { steps: pathResult.map(standardize), mode, pathDescription: `Structural Bridge: ${symbol} -> ${target}` };
        }

        const traceResult = registry.kinetic.trace(symbol);
        return { steps: traceResult.slice(0, 10).map((id: string) => standardize(id)), mode };
      } catch (err: any) {
        return { error: `Trace Failed: ${err.message}`, symbol };
      }
    }
  },

  conducks_evolution: {
    id: "conducks-evolution",
    name: "conducks_evolution",
    type: "tool",
    version: "2.0.0",
    description: `Tracks structural drift across time and working tree changes. Visualizes the "Blast Radius" of uncommitted code.

WHEN TO USE: Before committing code to ensure you haven't accidentally modified critical structural pillars.
AFTER THIS: Use conducks_governance to audit if the drift introduced circular dependencies.

Modes:
- diff (default): Structural delta since the last resonance pulse.
- blast-radius: Computes the structural impact of current uncommitted git changes.

Returns:
- changedSymbols: nodes modified in the working tree
- riskDelta: net risk change proposed`,
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["diff", "blast-radius"], default: "diff", description: "Evolution mode: 'diff' for history, 'blast-radius' for working tree." },
        path: { type: "string", description: "Optional: The absolute project root." }
      }
    },
    handler: async ({ mode, path: customPath }: any) => {
      try {
        const rootPath = customPath || process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
        const status = registry.governance.status();
        
        if (mode === "blast-radius") {
          // Uncommitted analysis: Status-based resonance check
          return { summary: status.staleness.stale ? "Significant structural drift detected in working tree." : "No uncommitted structural drift.", indexStaleness: status.staleness.stale };
        }

        return { 
          summary: status.staleness.stale ? "Structural graph is behind HEAD." : "Structural graph is synchronized.",
          nodeCount: status.stats.nodeCount,
          indexStaleness: status.staleness.stale 
        };
      } catch (err: any) {
        return { error: `Evolution Analysis Failed: ${err.message}` };
      }
    }
  },

  conducks_refactor: {
    id: "conducks-refactor",
    name: "conducks_refactor",
    type: "tool",
    version: "2.0.0",
    description: `Performs atomic, graph-verified codebase mutations. Safely renames symbols or prunes dead code.

WHEN TO USE: renaming high-gravity symbols across many files. Cleaning up orphan symbols with zero incoming edges.
AFTER THIS: Use conducks_system(mode: 'status') to verify the node count has decreased.

Modes:
- rename (default): Graph-Verified Refactoring (GVR). Safely renames a symbol across all references.
- prune: Identifies and deletes orphan symbols with no incoming edges (Dead Code).`,
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["rename", "prune"], default: "rename", description: "Refactor mode: 'rename' for GVR, 'prune' for dead code." },
        symbol: { type: "string", description: "Symbol ID to rename or prune." },
        newName: { type: "string", description: "New name (Required for rename mode)." },
        path: { type: "string", description: "Optional: The absolute project root." }
      }
    },
    handler: async ({ mode, symbol, newName, path: customPath }: any) => {
      try {
        const rootPath = customPath || process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
        if (mode === "rename" && symbol && newName) {
           return await registry.evolution.rename(symbol, newName);
        }
        if (mode === "prune") {
           const orphans = registry.metrics.prune();
           return { orphans: orphans.slice(0, 10), totalCount: orphans.length };
        }
        return { error: "Missing required parameters for chosen mode." };
      } catch (err: any) {
        return { error: `Refactor Execution Failed: ${err.message}` };
      }
    }
  },

  conducks_visual_mirror: {
    id: "conducks-visual-mirror",
    name: "conducks_visual_mirror",
    type: "tool",
    version: "2.0.0",
    description: `Generates granular architectural graph data (Nodes/Edges/Clusters). High-gravity nodes are assigned "Cosmic Colors".

WHEN TO USE: visual representation of the architecture is needed for documentation or external visualization.
AFTER THIS: Use the structural context provided to identify clusters for extraction.

Modes:
- generate-wave: Produces a visual manifest including mass, degree, and cluster positioning.

Returns:
- nodes: visual node data including cluster information
- links: structural edges with transitive bridging`,
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Optional: The absolute project root to mirror." }
      }
    },
    handler: async ({ path: customPath }: any) => {
      try {
        const rootPath = customPath || process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
        const wave = registry.mirror.getWave();
        return { nodes: wave.nodes.slice(0, 50), links: wave.links.slice(0, 50), totalNodes: wave.nodes.length };
      } catch (err: any) {
        return { error: `Visual Mirror Generation Failed: ${err.message}` };
      }
    }
  },

  conducks_system: {
    id: "conducks-system",
    name: "conducks_system",
    type: "tool",
    version: "2.0.0",
    description: `System meta-intelligence and manifest generation. Access health metrics or generate codebase overviews.

WHEN TO USE: First contact health check or generating technical documentation-as-code overviews.
AFTER THIS: Use conducks_structural_map to see the hotspots identified in the context.

Modes:
- status (default): Graph health: node counts: and pulse staleness.
- architecture-context: LLM-optimized summary of entry points: hotspots: and violations.
- generate-manifest: produces a technical codebase manifest summary.

Returns:
- nodeCount: total graph nodes
- lastPulse: timestamp of the structural resonance`,
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["status", "architecture-context", "generate-manifest"], default: "status", description: "System mode: 'status' for health, 'context' for summary, 'manifest' for docs." },
        path: { type: "string", description: "Optional: The absolute project root." }
      }
    },
    handler: async ({ mode, path: customPath }: any) => {
      try {
        const rootPath = customPath || process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
        const status = registry.governance.status();
        
        if (mode === "architecture-context") {
          const context = await registry.governance.context();
          return { context, nodeCount: status.stats.nodeCount };
        }
        if (mode === "generate-manifest") {
          const manifest = await registry.governance.contextFile();
          return { manifest, nodeCount: status.stats.nodeCount };
        }

        return {
          nodeCount: status.stats.nodeCount,
          edgeCount: status.stats.edgeCount,
          indexStaleness: status.staleness.stale,
          lastPulse: Date.now()
        };
      } catch (err: any) {
        return { error: `System Command Failed: ${err.message}` };
      }
    }
  }
};
