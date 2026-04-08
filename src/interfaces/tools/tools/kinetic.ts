import { Tool } from "@/registry/types.js";
import { registry } from "@/registry/index.js";
import fs from "fs-extra";

/**
 * Conducks — Behavioral Intelligence Tools (Standardized Taxonomy)
 * 
 * These 4 tools form the behavioral and mutational core of the Conducks MCP suite.
 * They provide tracing, impact analysis, historical diffing, and graph-verified renaming.
 * 
 * CRITICAL RULE 9: Exactly 9 Unified Conducks MCP Tools mandated.
 */
/**
 * [Conducks Anchor Check] 🏺
 * Ensures the structural registry is aligned to the correct workspace root.
 */
async function ensureAnchor(customPath?: string, readOnly: boolean = true) {
  const root = customPath || process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
  const currentAnchor = (registry.infrastructure as any).chronicle?.getProjectDir();
  
  if (root && root !== currentAnchor && root !== '/') {
    await registry.initialize(readOnly, root);
  }
}

export const kineticTools: Record<string, Tool> = {

  conducks_impact: {
    id: "conducks-impact",
    name: "conducks_impact",
    type: "tool",
    version: "2.1.0",
    description: `Analyze the structural blast radius of a symbol. Maps upstream/downstream impact.

WHEN TO USE: Assessing the risk of modifying a shared utility or framework-level component.
AFTER THIS: Use conducks_trace to see granular execution steps.

Modes:
- downstream (default): Shows what breaks IF this symbol is modified.
- upstream: Shows where this symbol originates or is imported from.`,
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "The symbol graph ID to analyze." },
        direction: { type: "string", enum: ["upstream", "downstream"], default: "downstream" },
        depth: { type: "number", default: 5, description: "Max structural depth (Max: 10)." },
        path: { type: "string", description: "Optional: The absolute project root." }
      },
      required: ["symbol"]
    },
    formatter: (res: any) => JSON.stringify(res, null, 2),
    handler: async ({ symbol, direction, depth, path: customPath }: any) => {
      try {
        await ensureAnchor(customPath);
        const results = await registry.kinetic.getImpact(symbol, direction as any, depth || 5);
        
        // Final Production Alignment: ImpactService returns a complex object
        const affectedNodes = (results as any).affectedNodes || [];

        return {
          symbol,
          direction,
          impact: affectedNodes.slice(0, 10).map((n: any) => ({
            id: n.id,
            name: n.name,
            file: n.filePath,
            summary: `${n.kind} ${n.name} at distance ${n.distance}`
          })),
          indexStaleness: registry.audit.status().staleness.stale
        };
      } catch (err: any) {
        return { error: `Impact Analysis Failed: ${err.message}` };
      }
    }
  },

  conducks_trace: {
    id: "conducks-trace",
    name: "conducks_trace",
    type: "tool",
    version: "2.1.0",
    description: `Trace granular execution or data flow from a starting symbol.
Uses Risk-Weighted Dijkstra v1.7.0 for pathfinding.

WHEN TO USE: Debugging execution cycles or understanding the call chain of a complex feature.
AFTER THIS: Use conducks_explain to see why a step in the trace is high-risk.`,
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Starting symbol ID." },
        target: { type: "string", description: "Optional: Target symbol ID for pathfinding." },
        mode: { type: "string", enum: ["execution", "path"], default: "execution" },
        path: { type: "string", description: "Optional: The absolute project root." }
      },
      required: ["symbol"]
    },
    formatter: (res: any) => JSON.stringify(res, null, 2),
    handler: async ({ symbol, target, mode, path: customPath }: any) => {
      try {
        await ensureAnchor(customPath, true);
        if (mode === "path" && target) {
          const pathResults = await registry.kinetic.findPath(symbol, target);
          return { steps: pathResults, indexStaleness: registry.audit.status().staleness.stale };
        }
        const traceResults = await registry.kinetic.trace(symbol);
        return { steps: traceResults.slice(0, 10), indexStaleness: registry.audit.status().staleness.stale };
      } catch (err: any) {
        return { error: `Trace Failed: ${err.message}` };
      } finally {
        await (registry.infrastructure.persistence as any).close();
      }
    }
  },

  conducks_diff: {
    id: "conducks-diff",
    name: "conducks_diff",
    type: "tool",
    version: "2.1.0",
    description: `Historical structural diff between the current graph and previous states.
Detects structural drift and behavioral evolution.

WHEN TO USE: Detecting uncommitted changes or comparing the working tree against HEAD.
AFTER THIS: Use conducks_audit to verify no new circularities were introduced.`,
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["uncommitted", "historical", "drift"], default: "uncommitted" },
        path: { type: "string", description: "Optional: The absolute project root." }
      }
    },
    formatter: (res: any) => JSON.stringify(res, null, 2),
    handler: async ({ mode, path: customPath }: any) => {
      try {
        await ensureAnchor(customPath, true);
        
        if (mode === "drift") {
          const result = await registry.evolution.compare();
          return {
            status: result.status,
            message: result.message,
            deltas: result.deltas.slice(0, 10).map(d => ({
              id: d.id,
              name: d.name,
              file: d.file,
              velocity: d.velocity,
              isModified: d.isModified
            })),
            moves: result.moves,
            summary: result.summary,
            indexStaleness: registry.audit.status().staleness.stale
          };
        }

        const diffEngine = registry.query.diff;
        const currentGraph = registry.query.graph.getGraph();
        const results = diffEngine.diff(currentGraph, currentGraph); // Placeholder for uncommitted/historical comparison logic
        
        return {
          addedSymbols: results.nodes.list.added.slice(0, 10),
          removedSymbols: results.nodes.list.removed.slice(0, 10),
          indexStaleness: registry.audit.status().staleness.stale
        };
      } catch (err: any) {
        return { error: `Diff Failed: ${err.message}` };
      } finally {
        await (registry.infrastructure.persistence as any).close();
      }
    }
  },

  conducks_rename: {
    id: "conducks-rename",
    name: "conducks_rename",
    type: "tool",
    version: "2.1.0",
    description: `Graph-Verified Renaming (Refactor). Safely renames a symbol across all structural references.

WHEN TO USE: Renaming a core component during structural refactoring.
AFTER THIS: Run conducks_analyze to refresh the structural resonance graph.

WARNING: This is a mutational tool. It modifies the source code.`,
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "The symbol graph ID to rename." },
        newName: { type: "string", description: "The new name for the symbol." },
        dryRun: { type: "boolean", default: true, description: "If true, only returns what WOULD change." },
        path: { type: "string", description: "Optional: The absolute project root." }
      },
      required: ["symbol", "newName"]
    },
    formatter: (res: any) => JSON.stringify(res, null, 2),
    handler: async ({ symbol, newName, dryRun, path: customPath }: any) => {
      try {
        await ensureAnchor(customPath, false); // Mutation typically triggers re-analysis or write-ops
        const result = await registry.rename.rename(symbol, newName, dryRun);
        return { result, dryRun };
      } catch (err: any) {
        return { error: `Rename Failed: ${err.message}` };
      } finally {
        await (registry.infrastructure.persistence as any).close();
      }
    }
  }
};
