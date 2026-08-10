import { Tool } from "@/contracts/types.js";
import { registry } from "@/registry/index.js";
import { ensureAnchor, releaseAnchor } from "../shared/anchor.js";
import { resolveSymbolId } from "../shared/resolve-symbol.js";
import { enumErr, numErr, boolErr } from "./synapse.js";
import { mcpOk, mcpErr } from "../../../types/mcp-response.js";

/**
 * Conducks — Behavioral Intelligence Tools (Standardized Taxonomy)
 *
 * These 4 tools form the behavioral and mutational core of the Conducks MCP suite.
 * They provide tracing, impact analysis, historical diffing, and graph-verified renaming.
 */

// The enum `conducks_trace` publishes in its inputSchema — kept beside the handler that enforces it,
// so the schema and the guard cannot drift. "execution" is the deprecated alias of "reachability"
// (ADR 0066) and stays accepted.
const TRACE_MODES = ["reachability", "execution", "path"] as const;

// The directions `conducks_impact` publishes. An unknown one used to reach the domain, which treats
// anything that is not "upstream" as downstream — so `direction:"sideways"` returned the DOWNSTREAM
// answer and printed `"direction": "sideways"` back in the payload as though it were real (todo53#P1).
const IMPACT_DIRECTIONS = ["upstream", "downstream"] as const;
// Its declared depth bounds, enforced here rather than left in the schema.
const IMPACT_DEPTH_BOUNDS = { min: 1, max: 10 };

// The modes `conducks_diff` IMPLEMENTS. "historical" was advertised in the schema and implemented
// nowhere: the handler branched on "drift" and let everything else fall through to the working-tree
// path, so a caller asking for history received an answer about their uncommitted edits, byte for
// byte identical to `mode:"uncommitted"` (todo53#P1). Pulse-to-pulse comparison is real but needs
// base/head pulse ids this tool takes no parameters for — it lives on `conducks diff --base/--head`.
const DIFF_MODES = ["uncommitted", "drift"] as const;

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


export const kineticTools: Record<string, Tool> = {

  conducks_impact: {
    id: "conducks-impact",
    name: "conducks_impact",
    layer: "code",
    type: "tool",
    version: "2.1.0",
    description: `Analyze the structural blast radius of a symbol. Maps upstream/downstream impact.

WHEN TO USE: Assessing the risk of modifying a shared utility or framework-level component.
AFTER THIS: Use conducks_trace to see granular execution steps.

Modes:
- upstream (default): callers — who points AT this symbol. This is the blast radius: what breaks IF you modify it.
- downstream: dependencies — what this symbol itself relies on.

The default matches the CLI (\`conducks impact\`), the registry, and the analyzer: asking about a
symbol means "what breaks if I change it" unless you say otherwise.`,
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
        direction: { type: "string", enum: [...IMPACT_DIRECTIONS], default: "upstream" },
        // MCP1: numeric bounds
        depth: { type: "number", default: 5, minimum: IMPACT_DEPTH_BOUNDS.min, maximum: IMPACT_DEPTH_BOUNDS.max, description: "Max structural depth." },
        path: { type: "string", description: "Optional: The absolute project root." }
      },
      required: ["symbol"]
    },
    formatter: (res: unknown) => JSON.stringify(res, null, 2),
    handler: async ({ symbol, direction = "upstream", depth, path: customPath }: any) => {
      // MCP6: symbol validation
      const symbolErr = validateSymbol(symbol);
      if (symbolErr) return symbolErr;

      const badParam =
        enumErr(direction, IMPACT_DIRECTIONS, 'direction') ??
        numErr(depth, { min: IMPACT_DEPTH_BOUNDS.min, max: IMPACT_DEPTH_BOUNDS.max }, 'depth');
      if (badParam) return badParam;

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
          // WHERE this node touches the symbol — at distance 1 that is the call site itself. The
          // domain layer carries it and this mapping dropped it, so "what breaks if I change X"
          // answered with a list of file names and an agent still could not open the right line
          // (ADR 0109).
          line: n.line ?? n.declaredAt ?? null,
          // Every call site this node makes, not only the first (ADR 0110).
          lines: n.lines?.length ? n.lines : (n.line ? [n.line] : []),
          distance: n.distance,
          summary: `${n.kind} ${n.name} at distance ${n.distance}${n.line ? ` (${n.filePath}:${n.line})` : ''}`
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
        await releaseAnchor();
      }
    }
  },

  conducks_trace: {
    id: "conducks-trace",
    name: "conducks_trace",
    layer: "code",
    type: "tool",
    version: "2.1.0",
    description: `Trace structural reachability or the shortest wiring path from a starting symbol.
Uses Risk-Weighted Dijkstra v1.7.0 for pathfinding.

WHEN TO USE: Mapping what a symbol structurally reaches downstream, or the shortest call path between two symbols.
AFTER THIS: Use conducks_explain to see why a step in the trace is high-risk.

Modes:
- reachability (default): downstream nodes reachable from the symbol, ordered nearest-first by risk-weighted graph distance. This is WIRING — who this symbol can reach — not execution order: a static graph has no way to know which of two direct calls runs first (conducks-docs §6.13). "execution" is accepted as a deprecated alias with identical behaviour, kept for callers on the old enum value.
- path: the shortest structural path to a target symbol.

Each step carries \`id\`, \`name\`, \`kind\`, \`file\` and \`line\` so it can be jumped to directly.`,
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
        // "execution" kept for backward compatibility (deprecated alias of "reachability") — ADR 0066.
        mode: { type: "string", enum: ["reachability", "execution", "path"], default: "reachability" },
        path: { type: "string", description: "Optional: The absolute project root." }
      },
      required: ["symbol"]
    },
    formatter: (res: unknown) => JSON.stringify(res, null, 2),
    handler: async ({ symbol, target, mode, path: customPath }: any) => {
      // MCP6: symbol validation
      const symbolErr = validateSymbol(symbol);
      if (symbolErr) return symbolErr;

      // An unknown mode used to fall through to reachability — the same silent substitution already
      // fixed in `audit` and `prune` (todo28), never wired here (todo53#P1).
      const badMode = enumErr(mode, TRACE_MODES, 'mode');
      if (badMode) return badMode;

      // `mode:"path"` with no target ran reachability and returned a downstream list under a request
      // for a shortest path. A missing target is a refusal, not a different question.
      if (mode === "path" && !target) {
        return mcpErr('INVALID_PARAM', 'mode="path" requires a target symbol', 'Pass target=<symbol>, or use mode="reachability" for downstream reach.', false);
      }

      try {
        await ensureAnchor(customPath, true);
        const resolvedId = resolveSymbolId(symbol);
        if (!resolvedId) return mcpErr('SYMBOL_NOT_FOUND', `No symbol matching "${symbol}"`, 'Use conducks_query to find valid symbol IDs', false);

        // Bare ids average 127 chars and carry no line — a caller cannot jump to one without a
        // second lookup (todo28#P4). Enrich every returned step with what `graph.getNode` already
        // knows, in this tool only.
        const graph = registry.infrastructure.graphEngine.getGraph();
        // Some steps are DANGLING EDGE TARGETS, not nodes: `graph.findnodesbyname` is the target of
        // 7 edges and of 0 rows in `nodes`. Those used to render as a step with the id echoed back as
        // its `name` and `kind: 'unknown'` — indistinguishable at a glance from a real symbol, and
        // refused by every tool it was fed back into. `resolved` says which it is (todo53#P1).
        const describe = (id: string) => {
          const n: any = graph.getNode(id);
          return {
            id,
            resolved: !!n,
            name: n?.properties?.name ?? id,
            kind: n?.label ?? 'UNRESOLVED',
            file: n?.properties?.filePath ?? null,
            line: n?.properties?.range?.start?.line ?? null,
          };
        };

        if (mode === "path" && target) {
          const resolvedTarget = resolveSymbolId(target);
          if (!resolvedTarget) return mcpErr('SYMBOL_NOT_FOUND', `No symbol matching "${target}"`, 'Use conducks_query to find valid symbol IDs', false);
          const pathResults = await registry.kinetic.findPath(resolvedId, resolvedTarget);
          const steps = pathResults.map(describe);
          return mcpOk(
            { steps, indexStaleness: registry.audit.status().staleness.stale },
            // A shortest path is returned whole — `findPath` caps nothing, so this literal is true
            // by construction rather than by assumption (todo53#P2 audit of every `truncated`).
            { nodeCount: steps.length, truncated: false }
          );
        }
        // mode is "reachability", "execution" (deprecated alias) or unset — all reachability.
        const traceResults = await registry.kinetic.trace(resolvedId);
        const steps = traceResults.slice(0, 10).map(describe);
        return mcpOk(
          { steps, indexStaleness: registry.audit.status().staleness.stale },
          { nodeCount: steps.length, truncated: traceResults.length > 10 }
        );
      } catch (err: any) {
        // MCP3: structured error
        return mcpErr('TRACE_FAILED', err.message, 'Check that the project has been analyzed first.', true);
      } finally {
        await releaseAnchor();
      }
    }
  },

  conducks_diff: {
    id: "conducks-diff",
    name: "conducks_diff",
    layer: "code",
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
        mode: { type: "string", enum: [...DIFF_MODES], default: "uncommitted", description: "uncommitted = staged, unstaged and untracked changes in the working tree. drift = structural evolution against the previous pulse. Pulse-to-pulse history is a CLI command (`conducks diff --base <pulse>`), not a mode here." },
        path: { type: "string", description: "Optional: The absolute project root." }
      }
    },
    formatter: (res: unknown) => JSON.stringify(res, null, 2),
    handler: async ({ mode, path: customPath }: any) => {
      const badMode = enumErr(mode, DIFF_MODES, 'mode');
      if (badMode) return badMode;

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

        // The SAME engine the CLI's PR risk report uses. This block used to be a private copy that
        // ran `git diff -U0` (no HEAD, so staged changes were invisible), never asked for untracked
        // files, and ended each symbol at `lineStart + complexity` — a cyclomatic count read as a
        // line span. Measured before the fix: 15 changed files in the tree, `totalImpacted: 0`, while
        // the CLI reported 7 symbols against the same graph (todo53#P1).
        const cwd = (registry.infrastructure as any).chronicle?.getProjectDir() || process.cwd();
        const changes = registry.analyze.changeSet(cwd);
        if (changes === null) {
          return mcpErr('GIT_DIFF_FAILED', 'Git diff failed — is this a git repository?', 'Ensure the project directory is a git repository.', false);
        }
        if (changes.length === 0) {
          return mcpOk({ message: "No uncommitted structural changes detected.", changedFiles: 0, impactedSymbols: [], totalImpacted: 0, indexStaleness: registry.audit.status().staleness.stale });
        }

        const impactedSymbols = registry.analyze.impactedSymbols(
          registry.query.graph.getGraph().getAllNodes() as Iterable<any>,
          changes,
        );

        const symbols = impactedSymbols.slice(0, 15);
        return mcpOk(
          {
            impactedSymbols: symbols,
            totalImpacted: impactedSymbols.length,
            // The denominator: symbols are drawn from these files, so "0 impacted" out of 15 changed
            // files reads differently from "0 impacted" out of 0 (ADR 0145).
            changedFiles: changes.length,
            indexStaleness: registry.audit.status().staleness.stale,
          },
          { nodeCount: symbols.length, truncated: impactedSymbols.length > 15 }
        );
      } catch (err: any) {
        // MCP3: structured error
        return mcpErr('DIFF_FAILED', err.message, 'Check that the project has been analyzed first.', true);
      } finally {
        await releaseAnchor();
      }
    }
  },

  conducks_rename: {
    id: "conducks-rename",
    name: "conducks_rename",
    layer: "code",
    type: "tool",
    version: "2.1.0",
    description: `Graph-Verified Renaming (Refactor). Safely renames a symbol across all structural references.

WHEN TO USE: Renaming a core component during structural refactoring.
AFTER THIS: Run 'conducks analyze' in the terminal to refresh the structural graph. There is no
analyze TOOL — the MCP server holds a read-only vault by policy, so re-indexing is a CLI step. Until
it runs, every other tool answers from a graph that still holds the OLD name.

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

      // A NON-BOOLEAN is refused before anything else. `dryRun: "no"` is truthy and would have been
      // read as a dry run, which is safe by luck rather than by rule — and the opposite string would
      // not be.
      const badDryRun = boolErr(dryRun, 'dryRun');
      if (badDryRun) return badDryRun;

      // DRY RUN UNLESS EXPLICITLY TOLD OTHERWISE.
      //
      // The inputSchema declares `default: true`, but a JSON Schema default is DOCUMENTATION — the MCP
      // server does not inject it — so an omitted `dryRun` arrived as `undefined`, and the domain
      // signature is `rename(symbolId, newName, dryRun: boolean = false)`. Undefined became FALSE, and
      // the only destructive tool on this surface mutated source files by default while advertising
      // that it would not.
      //
      // The CLI has always been safe (`--confirm` to write), so the two surfaces held OPPOSITE defaults
      // for a destructive operation — which is how a caller moving between them destroys work
      // (todo61). Anything other than an explicit `false` is a dry run; a caller that means to write
      // says so.
      const isDryRun = dryRun !== false;

      try {
        await ensureAnchor(customPath, true); // GVR is memory-safe and FS-verified. NO write lock needed for DNA.
        const resolvedId = resolveSymbolId(symbol) ?? symbol;
        const result = await registry.rename.rename(resolvedId, newName, isDryRun);
        return mcpOk({ result, dryRun: isDryRun });
      } catch (err: any) {
        // MCP3: structured error
        return mcpErr('RENAME_FAILED', err.message, 'Check that the symbol exists and the project has been analyzed first.', true);
      } finally {
        await releaseAnchor();
      }
    }
  }
};
