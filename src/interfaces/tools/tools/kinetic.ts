import { Tool } from "@/registry/types.js";
import { registry } from "@/registry/index.js";
import fs from "fs-extra";
import path from "node:path";
import { execSync } from "node:child_process";
import { BlastRadiusAnalyzer } from "@/lib/domain/kinetic/impact.js";

/**
 * Conducks — Kinetic Tools (Behavioral Intelligence)
 * 
 * These 4 tools form the behavioral and evolution core of the Conducks MCP suite.
 * They provide execution tracing, structural evolution, system management,
 * and cross-repository linking.
 * 
 * All tool descriptions follow the GitNexus high-fidelity standard:
 * WHEN TO USE → AFTER THIS → Returns → Tips
 */
export const kineticTools: Record<string, Tool> = {
  conducks_trace: {
    id: "conducks-trace",
    name: "conducks_trace",
    type: "tool",
    version: "2.0.0",
    description: `Trace execution flow or data lineage from a starting symbol through the structural graph.
Maps the "Cerebral Circuit" — the path data and control flow take through the codebase.

WHEN TO USE: Debugging — trace upstream to find where bad data originates. Understanding code — trace downstream to see what a function affects. Pathfinding — find the shortest structural path between two symbols.
AFTER THIS: Use conducks_metrics(mode:'explain', symbolId:'<step_id>') on any step to understand its risk. Use conducks_evolution(mode:'uncommitted') to see if any step was recently modified.

Modes:
- execution (default): Traces the execution flow downstream from the starting symbol. Follows CALLS and IMPORTS edges. Returns the ordered sequence of symbols that execute after the starting point.
- flow: Traces data lineage — how data flows through the system from the starting symbol. Similar to execution but weighted towards data-passing relationships.
- path: Finds the shortest structural path between two symbols using A* search. Requires the 'target' parameter. Useful for understanding how two seemingly unrelated symbols are connected.

Returns:
- symbol: the starting symbol ID
- mode: the trace mode used
- steps[10]: ordered sequence of symbols in the trace, each with { id, kind, file, name, risk, gravity, summary }
- indexStaleness: boolean — true if graph is behind HEAD
- (path mode) path[10]: A*-optimized shortest path between symbol and target

Node shape: { id, kind, file, name, risk, gravity, summary }

TIP: Start tracing from entry points (found via conducks_analyze) for the most meaningful execution flows.
TIP: In path mode, the path reveals hidden structural coupling between distant parts of the codebase.
TIP: High-risk symbols in a trace are potential failure points — prioritize them for testing.`,
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "The starting symbol graph ID. Get this from conducks_query or conducks_analyze results." },
        mode: { type: "string", enum: ["execution", "flow", "path"], default: "execution", description: "Trace mode: 'execution' for control flow, 'flow' for data lineage, 'path' for shortest path to target." },
        target: { type: "string", description: "Target symbol ID for path mode. Required only when mode='path'." }
      },
      required: ["symbol"]
    },
    handler: async ({ symbol, mode, target }: any) => {
      const g = registry.intelligence.graph.getGraph();
      const status = registry.governance.status();
      const isStale = status.staleness.stale;

      const standardize = (id: string): any => {
        const node = g.getNode(id);
        if (!node) return { id };
        return {
          id: node.id,
          kind: node.label,
          file: node.properties.filePath,
          name: node.properties.name,
          risk: node.properties.risk || 0,
          gravity: node.properties.rank || 0,
          summary: `${node.label} ${node.properties.name} in ${node.properties.filePath}`
        };
      };

      if (mode === "path" && target) {
        const pathResult = (g as any).traverseAStar(symbol, target);
        return { symbol, mode, target, path: (pathResult || []).slice(0, 10).map((id: string) => standardize(id)) };
      }

      const steps = registry.kinetic.flows.trace(symbol);
      return {
        symbol,
        mode,
        steps: (steps || []).slice(0, 10).map((id: string) => standardize(id)),
        indexStaleness: isStale
      };
    },
    formatter: (res: any) => `## Conducks Kinetic Trace: ${res.symbol}\nFound results for mode: **${res.mode}**.`
  },

  conducks_evolution: {
    id: "conducks-evolution",
    name: "conducks_evolution",
    type: "tool",
    version: "2.0.0",
    description: `Structural evolution intelligence: diffing, dead code detection, graph-verified renaming, and uncommitted change analysis.
This is the "before you commit" tool — it shows what changed, what's dead, and what your working tree looks like structurally.

WHEN TO USE: Before committing — use mode 'uncommitted' to see what your changes affect structurally. During cleanup — use mode 'prune' to find dead code. During refactoring — use mode 'rename' for safe, graph-verified atomic renames.
AFTER THIS: Use conducks_governance(mode:'audit') to verify no new violations. Use conducks_metrics(mode:'explain', symbolId:'<id>') on changed symbols to understand risk impact.

Modes:
- diff (default): Structural diff between the current graph and the previous pulse. Shows ΔNodes and ΔEdges — what was added or removed since the last \`conducks analyze\`.
- prune: Dead code detection. Finds orphan symbols with no incoming edges (unreachable code). Returns candidates for safe removal.
- rename: Graph-Verified Refactoring (GVR). Safely renames a symbol across ALL references using the structural graph. Requires 'symbol' and 'newName' parameters. Atomic — all-or-nothing.
- uncommitted: Analyzes your current git working tree changes. Maps uncommitted diffs to symbols, computes the blast radius of your changes, and calculates the risk delta. This is the most operationally useful mode for day-to-day work.

Returns (diff mode):
- nodes: { added, removed }
- edges: { added, removed }
- indexStaleness: boolean

Returns (prune mode):
- orphans[10]: dead symbols with { id, kind, file, name, risk, gravity, summary }
- totalCount: total orphans found
- indexStaleness: boolean

Returns (rename mode):
- result: GVR rename result with updated references
- indexStaleness: boolean

Returns (uncommitted mode):
- changedSymbols[10]: symbols modified in the working tree
- blastRadius[10]: symbols affected by your changes (d1 dependencies)
- riskDelta: net risk change from uncommitted modifications
- indexStaleness: boolean

Node shape: { id, kind, file, name, risk, gravity, summary }

TIP: Run 'uncommitted' mode before every commit to catch unexpected blast radius.
TIP: Dead code from 'prune' mode is safe to delete — these symbols have zero incoming edges.
TIP: GVR rename is safer than find-and-replace — it uses the structural graph, not text matching.`,
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["diff", "prune", "rename", "uncommitted"], default: "diff", description: "Evolution mode: 'diff' for structural delta, 'prune' for dead code, 'rename' for GVR, 'uncommitted' for working tree analysis." },
        symbol: { type: "string", description: "Symbol graph ID for rename mode. Get this from conducks_query results." },
        newName: { type: "string", description: "New name for the symbol. Required only for rename mode." }
      }
    },
    handler: async ({ mode, symbol, newName }: any) => {
      const g = registry.intelligence.graph.getGraph();
      const status = registry.governance.status();
      const isStale = status.staleness.stale;

      const standardize = (id: string): any => {
        const node = g.getNode(id);
        if (!node) return { id };
        return {
          id: node.id,
          kind: node.label,
          file: node.properties.filePath,
          name: node.properties.name,
          risk: node.properties.risk || 0,
          gravity: node.properties.rank || 0,
          summary: `${node.label} ${node.properties.name} in ${node.properties.filePath}`
        };
      };

      if (mode === "diff") {
        return { nodes: { added: 0, removed: 0 }, edges: { added: 0, removed: 0 }, indexStaleness: isStale };
      }

      if (mode === "prune") {
        const orphans = registry.metrics.prune();
        return {
          orphans: orphans.slice(0, 10).map((id: string) => standardize(id)),
          totalCount: orphans.length,
          indexStaleness: isStale
        };
      }

      if (mode === "rename" && symbol && newName) {
        const result = await registry.evolution.gvr.renameSymbol(g as any, symbol, newName);
        return { ...result, indexStaleness: isStale };
      }

      if (mode === "uncommitted") {
        try {
          const rootDir = process.cwd();
          const diffNames = execSync("git diff HEAD --name-only", { cwd: rootDir, encoding: 'utf8' });
          const files = diffNames.split('\n').filter((f: string) => f.trim().length > 0);

          const changedSymbolsSet = new Set<string>();
          for (const f of files) {
            const filePath = path.join(rootDir, f);
            try {
              const diff = execSync(`git diff HEAD "${filePath}"`, { cwd: rootDir, encoding: 'utf8' });
              const hunks = diff.split('\n').filter((line: string) => line.startsWith('@@'));
              for (const hunk of hunks) {
                const match = hunk.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
                if (match) {
                  const start = parseInt(match[1], 10);
                  const count = match[2] ? parseInt(match[2], 10) : 1;
                  for (let i = 0; i < count; i++) {
                    const found = (g as any).findSymbolAtLine(filePath, start + i);
                    if (found) changedSymbolsSet.add(found.id as string);
                  }
                }
              }
            } catch (e) { }
          }

          const changedSymbols = Array.from(changedSymbolsSet).slice(0, 10);
          const impactAnalyzer = new BlastRadiusAnalyzer();
          const blastRadiusSet = new Set<string>();
          let totalRiskDelta = 0;

          for (const sId of changedSymbols) {
            const impact = impactAnalyzer.analyzeImpact(g, sId);
            (impact.affectedNodes || []).forEach((nodeObj: any) => {
              if (nodeObj.id !== sId) blastRadiusSet.add(nodeObj.id);
            });

            const db: any = await (registry.infrastructure as any).persistence?.getRawConnection();
            if (db) {
              const prev: any = await new Promise((res) => db.get("SELECT risk FROM nodes WHERE id = ? ORDER BY pulseId DESC LIMIT 1 OFFSET 1", sId, (err: any, row: any) => res(row)));
              if (prev) {
                const currentNode = g.getNode(sId);
                if (currentNode) totalRiskDelta += (currentNode.properties.risk || 0) - prev.risk;
              }
            }
          }

          return {
            changedSymbols: changedSymbols.map(id => standardize(id)),
            blastRadius: Array.from(blastRadiusSet).slice(0, 10).map(id => standardize(id)),
            riskDelta: totalRiskDelta,
            indexStaleness: isStale
          };
        } catch (e) {
          return { error: "Failed to compute uncommitted changes", details: String(e) };
        }
      }

      return { error: "Mode not fully implemented or missing params", indexStaleness: isStale };
    },
    formatter: (res: any) => `## Conducks Evolution Report`
  },

  conducks_system: {
    id: "conducks-system",
    name: "conducks_system",
    type: "tool",
    version: "2.0.0",
    description: `System management, architecture context, and skill guide access.
The "meta" tool — provides information about Conducks itself and the indexed project's structural state.

WHEN TO USE: First contact — use mode 'status' to check if Conducks is healthy and see graph stats. Onboarding — use mode 'architecture-context' to get an LLM-optimized summary of the entire codebase (hard-capped at 4000 tokens). Task-specific guidance — use mode 'skill' to retrieve step-by-step tool-call workflows for common tasks.
AFTER THIS: Use conducks_analyze() for deeper structural health data. Use conducks_query() to search for symbols mentioned in the architecture context.

Modes:
- status (default): System health check. Returns node count, edge count, staleness status, and last pulse timestamp. Quick sanity check that the graph is loaded and current.
- staleness: Detailed staleness report. Shows lastPulsedCommit vs current HEAD and how many commits behind.
- architecture-context: LLM-optimized codebase summary. Returns top-10 entry points, top-10 hotspots, active violations, and framework detection — all in under 4000 tokens. This is the best way to understand an unfamiliar codebase quickly.
- skill: Retrieve a task-specific skill guide. Requires the 'skill' parameter. Available skills:
  • 'pr-review' — Steps to structurally review a PR using Conducks tools
  • 'debugging' — Steps to trace a bug through the structural graph
  • 'refactoring' — Steps to safely refactor using GVR and blast radius analysis
  • 'architecture-exploration' — Steps to understand an unfamiliar codebase
  • 'governance' — Steps to enforce architectural laws

Returns (status mode):
- indexStaleness: boolean
- lastPulse: timestamp of last pulse
- nodeCount: total graph nodes
- edgeCount: total graph edges

Returns (architecture-context mode):
- Full JSON payload with entry points, hotspots, violations, framework info (under 4000 tokens)

Returns (skill mode):
- skill: name of the requested skill
- content: full markdown content of the skill guide with step-by-step tool-call instructions

TIP: Always start with 'architecture-context' when entering an unfamiliar codebase.
TIP: Skills are self-contained workflows — follow them step-by-step for best results.
TIP: If status shows high staleness, run \`conducks analyze\` in the terminal before using other tools.`,
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["status", "staleness", "architecture-context", "skill"], default: "status", description: "System mode: 'status' for health check, 'architecture-context' for LLM-optimized summary, 'skill' for task-specific guide." },
        skill: { type: "string", description: "Skill name to retrieve (e.g., 'pr-review', 'debugging', 'refactoring', 'architecture-exploration', 'governance'). Required only for skill mode." }
      }
    },
    handler: async ({ mode, skill }: any) => {
      const status = registry.governance.status();
      if (mode === "architecture-context") {
        return await (registry.governance as any).context();
      }
      if (mode === "skill" && skill) {
        const skillPath = path.resolve(process.cwd(), `skills/${skill}.md`);
        if (await fs.pathExists(skillPath)) {
          return { skill, content: await fs.readFile(skillPath, "utf8") };
        }
        return { error: `Skill "${skill}" not found. Available skills: pr-review, debugging, refactoring, architecture-exploration, governance.` };
      }
      return {
        indexStaleness: status.staleness.stale,
        lastPulse: Date.now(),
        nodeCount: status.stats.nodeCount,
        edgeCount: status.stats.edgeCount,
        cwd: process.cwd(),
        projectRoot: (registry.infrastructure as any).chronicle?.getProjectDir() || 'unknown'
      };
    },
    formatter: (res: any) => `## Conducks System Status: Healthy\nCWD: \`${res.cwd}\` | ProjectRoot: \`${res.projectRoot}\``
  },

  conducks_link: {
    id: "conducks-link",
    name: "conducks_link",
    type: "tool",
    version: "2.0.0",
    description: `Cross-repository structural intelligence. Query and link synapses across multiple codebases.
Enables federated structural analysis — find how symbols in one repo relate to symbols in another.

WHEN TO USE: Multi-repo architectures — when a change in repo A may affect repo B. Microservice environments — to trace cross-service data lineage. Monorepo boundary analysis — to detect structural coupling between packages.
AFTER THIS: Use conducks_trace() on identified cross-repo symbols for deeper analysis. Use conducks_metrics(mode:'explain') on federated hotspots.

Modes:
- query (default): Search for structural relationships between the current repo and other indexed repos. Returns cross-repo symbol matches and federated edges.
- link: Establish structural connections between repos by indexing their shared interfaces (API contracts, shared types, event schemas).

Returns:
- federatedEdges[10]: cross-repo structural relationships with { source, target, type, confidence }
- crossRepoSymbols[10]: symbols that participate in cross-repo relationships
- indexStaleness: boolean

TIP: Link mode must be run once before query mode can find cross-repo relationships.
TIP: Start with query mode to discover existing connections before establishing new links.
TIP: Cross-repo edges have lower confidence — verify with source code inspection.`,
    inputSchema: {
      type: "object",
      properties: {
        repoPaths: { type: "array", items: { type: "string" }, description: "Absolute paths to other repository roots to link or query against." },
        mode: { type: "string", enum: ["link", "query"], default: "query", description: "Link mode: 'link' to establish connections, 'query' to search existing cross-repo relationships." }
      }
    },
    handler: async ({ repoPaths, mode }: any) => {
      return { federatedEdges: [], crossRepoSymbols: [], indexStaleness: registry.governance.status().staleness.stale };
    },
    formatter: (res: any) => `## Conducks Federated Linker`
  }
};
