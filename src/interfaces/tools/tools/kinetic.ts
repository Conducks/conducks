import { Tool } from "@/contracts/types.js";
import { registry } from "@/registry/index.js";
import { execSync } from "node:child_process";
import { ensureAnchor } from "../shared/anchor.js";
import { mcpOk, mcpErr } from "../../../types/mcp-response.js";

/**
 * Conducks — Behavioral Intelligence Tools (Standardized Taxonomy)
 *
 * These 4 tools form the behavioral and mutational core of the Conducks MCP suite.
 * They provide tracing, impact analysis, historical diffing, and graph-verified renaming.
 *
 * CRITICAL RULE 9: Exactly 9 Unified Conducks MCP Tools mandated.
 */

// MCP6: validate symbol/nodeId param
function validateSymbol(value: string, paramName: string = 'symbol') {
  if (!value || value.trim() === '') {
    return mcpErr('INVALID_SYMBOL', `${paramName} must not be empty`, 'Pass a valid symbol name like "UserService" or "parseConfig"');
  }
  if (value.includes('..')) {
    return mcpErr('INVALID_SYMBOL', 'Symbol ID must not contain ".."', 'Pass a valid symbol name like "UserService" or "parseConfig"');
  }
  return null;
}

// Resolve short name to full node ID; returns resolved ID string or null on failure
function resolveSymbolId(symbol: string): string | null {
  const graph = registry.infrastructure.graphEngine.getGraph();
  if (symbol.includes('::')) return symbol.toLowerCase();
  const matches = graph.findNodesByName(symbol);
  if (matches.length === 0) return null;
  const best = matches.reduce((a: any, b: any) =>
    ((b.properties?.gravity ?? 0) > (a.properties?.gravity ?? 0) ? b : a)
  );
  return best.id as string;
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
    // MCP2: tool annotations
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "The symbol graph ID to analyze." },
        direction: { type: "string", enum: ["upstream", "downstream"], default: "downstream" },
        // MCP1: numeric bounds
        depth: { type: "number", default: 5, minimum: 1, maximum: 10, description: "Max structural depth." },
        path: { type: "string", description: "Optional: The absolute project root." }
      },
      required: ["symbol"]
    },
    formatter: (res: unknown) => JSON.stringify(res, null, 2),
    handler: async ({ symbol, direction, depth, path: customPath }: any) => {
      // MCP6: symbol validation
      const symbolErr = validateSymbol(symbol);
      if (symbolErr) return symbolErr;

      try {
        await ensureAnchor(customPath);
        const resolvedId = resolveSymbolId(symbol);
        if (!resolvedId) return mcpErr('SYMBOL_NOT_FOUND', `No symbol matching "${symbol}"`, 'Use conducks_query to find valid symbol IDs', false);
        const results = await registry.kinetic.getImpact(resolvedId, direction as any, depth || 5);

        // Final Production Alignment: ImpactService returns a complex object
        const affectedNodes = (results as any).affectedNodes || [];
        const impact = affectedNodes.slice(0, 10).map((n: any) => ({
          id: n.id,
          name: n.name,
          file: n.filePath,
          summary: `${n.kind} ${n.name} at distance ${n.distance}`
        }));

        // MCP7: pagination meta, MCP8: clean envelope
        return mcpOk(
          { symbol, direction, impact, indexStaleness: registry.audit.status().staleness.stale },
          { nodeCount: impact.length, truncated: affectedNodes.length > 10 }
        );
      } catch (err: any) {
        // MCP3: structured error
        return mcpErr('IMPACT_FAILED', err.message, 'Check that the project has been analyzed first.', true);
      } finally {
        await (registry.infrastructure.persistence as any).close();
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
    // MCP2: tool annotations
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
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
    formatter: (res: unknown) => JSON.stringify(res, null, 2),
    handler: async ({ symbol, target, mode, path: customPath }: any) => {
      // MCP6: symbol validation
      const symbolErr = validateSymbol(symbol);
      if (symbolErr) return symbolErr;

      try {
        await ensureAnchor(customPath, true);
        const resolvedId = resolveSymbolId(symbol);
        if (!resolvedId) return mcpErr('SYMBOL_NOT_FOUND', `No symbol matching "${symbol}"`, 'Use conducks_query to find valid symbol IDs', false);
        if (mode === "path" && target) {
          const resolvedTarget = resolveSymbolId(target);
          if (!resolvedTarget) return mcpErr('SYMBOL_NOT_FOUND', `No symbol matching "${target}"`, 'Use conducks_query to find valid symbol IDs', false);
          const pathResults = await registry.kinetic.findPath(resolvedId, resolvedTarget);
          return mcpOk(
            { steps: pathResults, indexStaleness: registry.audit.status().staleness.stale },
            { nodeCount: pathResults.length, truncated: false }
          );
        }
        const traceResults = await registry.kinetic.trace(resolvedId);
        const steps = traceResults.slice(0, 10);
        return mcpOk(
          { steps, indexStaleness: registry.audit.status().staleness.stale },
          { nodeCount: steps.length, truncated: traceResults.length > 10 }
        );
      } catch (err: any) {
        // MCP3: structured error
        return mcpErr('TRACE_FAILED', err.message, 'Check that the project has been analyzed first.', true);
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
    // MCP2: tool annotations
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["uncommitted", "historical", "drift"], default: "uncommitted" },
        path: { type: "string", description: "Optional: The absolute project root." }
      }
    },
    formatter: (res: unknown) => JSON.stringify(res, null, 2),
    handler: async ({ mode, path: customPath }: any) => {
      try {
        await ensureAnchor(customPath, true);

        if (mode === "drift") {
          const result = await registry.evolution.compare();
          const deltas = result.deltas.slice(0, 10).map((d: any) => ({
            id: d.id,
            name: d.name,
            file: d.file,
            velocity: d.velocity,
            isModified: d.isModified
          }));
          return mcpOk({
            status: result.status,
            message: result.message,
            deltas,
            moves: result.moves,
            summary: result.summary,
            indexStaleness: registry.audit.status().staleness.stale
          }, { nodeCount: deltas.length, truncated: result.deltas.length > 10 });
        }

        // Parse git diff to find changed lines and map them to structural symbols
        let rawDiff = "";
        try {
          const cwd = (registry.infrastructure as any).chronicle?.getProjectDir() || process.cwd();
          rawDiff = execSync('git diff -U0', { encoding: 'utf-8', cwd });
        } catch {
          return mcpErr('GIT_DIFF_FAILED', 'Git diff failed — is this a git repository?', 'Ensure the project directory is a git repository.', false);
        }

        if (!rawDiff.trim()) {
          return mcpOk({ message: "No uncommitted structural changes detected.", indexStaleness: registry.audit.status().staleness.stale });
        }

        const currentGraph = registry.query.graph.getGraph();
        const allNodes = Array.from(currentGraph.getAllNodes() as Iterable<any>);
        const impactedSymbols: string[] = [];

        let currentFile = "";
        for (const line of rawDiff.split('\n')) {
          if (line.startsWith('+++ b/')) {
            currentFile = line.replace('+++ b/', '').toLowerCase();
          } else if (line.startsWith('@@')) {
            const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
            if (match && currentFile) {
              const start = parseInt(match[1], 10);
              const count = parseInt(match[2] || '1', 10);
              for (let i = 0; i < count; i++) {
                const changedLine = start + i;
                const hit = allNodes.find((n: any) =>
                  (n.properties.file || n.properties.filePath || '').toLowerCase().endsWith(currentFile) &&
                  n.properties.lineStart <= changedLine && n.properties.lineStart + (n.properties.complexity || 1) >= changedLine
                );
                if (hit && !impactedSymbols.includes(hit.id)) impactedSymbols.push(hit.id);
              }
            }
          }
        }

        const symbols = impactedSymbols.slice(0, 15);
        return mcpOk(
          { impactedSymbols: symbols, totalImpacted: impactedSymbols.length, indexStaleness: registry.audit.status().staleness.stale },
          { nodeCount: symbols.length, truncated: impactedSymbols.length > 15 }
        );
      } catch (err: any) {
        // MCP3: structured error
        return mcpErr('DIFF_FAILED', err.message, 'Check that the project has been analyzed first.', true);
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
    // MCP2: tool annotations — rename is destructive
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
    },
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
    formatter: (res: unknown) => JSON.stringify(res, null, 2),
    handler: async ({ symbol, newName, dryRun, path: customPath }: any) => {
      // MCP6: symbol validation
      const symbolErr = validateSymbol(symbol);
      if (symbolErr) return symbolErr;

      try {
        await ensureAnchor(customPath, true); // GVR is memory-safe and FS-verified. NO write lock needed for DNA.
        const resolvedId = resolveSymbolId(symbol) ?? symbol;
        const result = await registry.rename.rename(resolvedId, newName, dryRun);
        return mcpOk({ result, dryRun });
      } catch (err: any) {
        // MCP3: structured error
        return mcpErr('RENAME_FAILED', err.message, 'Check that the symbol exists and the project has been analyzed first.', true);
      } finally {
        await (registry.infrastructure.persistence as any).close();
      }
    }
  }
};
