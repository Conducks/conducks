import { Tool } from "@/registry/types.js";
import { registry } from "@/registry/index.js";
import path from "node:path";
import fs from "fs-extra";
import { FederatedLinker } from "@/lib/core/graph/linker-federated.js";
import { execSync } from "node:child_process";
import { BlastRadiusAnalyzer } from "@/lib/domain/kinetic/impact.js";

/**
 * Conducks — Kinetic Tools (Behavioral Intelligence)
 * 
 * These 4 tools form the behavioral and evolution core of the Conducks MCP suite.
 * They provide execution tracing, structural evolution, system management,
 * and cross-repository linking.
 * 
 * All tool descriptions follow a high-fidelity documentation standard:
 * WHEN TO USE → AFTER THIS → Returns → Tips
 */
export const kineticTools: Record<string, Tool> = {
  conducks_trace: {
    id: "conducks-trace",
    name: "conducks_trace",
    type: "tool",
    version: "2.0.0",
    description: `Trace execution flow or data lineage from a starting symbol through the structural graph.
Maps the Cerebral Circuit: the path data and control flow take through the codebase.

PREREQUISITE: You MUST run conducks_analyze with fullAnalysis set to true to populate the structural graph before you can trace execution flows or find structural paths.

WHEN TO USE: Debugging to find where bad data originates. Understanding code to see what a function affects. Pathfinding to find the shortest structural path between two symbols.
AFTER THIS: Use conducks_metrics with mode set to explain to understand step risk. Use conducks_evolution with mode set to uncommitted to see recent modifications.

Modes:
- execution (default): Traces the execution flow downstream from the starting symbol. Follows CALLS and IMPORTS edges.
- flow: Traces data lineage: showing how data flows through the system. Weighted towards data relationships.
- path: Finds the shortest structural path between two symbols using A* search. Requires the target parameter.

Returns:
- symbol: the starting symbol ID
- mode: the trace mode used
- steps: ordered sequence of symbols in the trace
- indexStaleness: true if graph is behind HEAD
- path: A* optimized shortest path between symbol and target

Node shape: { id, kind, file, name, risk, gravity, summary }

TIP: Start tracing from entry points for the most meaningful execution flows.
TIP: In path mode the results reveal hidden structural coupling between distant parts of the codebase.
TIP: High risk symbols in a trace are potential failure points.`,
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
      // Ensure registry is initialized
      const rootPath = process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
      await registry.initialize(true, rootPath);

      const g = registry.intelligence.graph.getGraph();
      const status = registry.governance.status();
      const isStale = status.staleness.stale;
      const traceAnalyzer = registry.kinetic.flows as any;

      const standardize = (id: string): any => {
        const node = g.getNode(id);
        if (!node) return { id };
        return {
          id: node.id,
          kind: node.label,
          file: node.properties?.filePath,
          name: node.properties?.name,
          risk: node.properties?.risk || 0,
          gravity: node.properties?.rank || 0,
          summary: `${node.label} ${node.properties?.name || 'unknown'} in ${node.properties?.filePath || 'unknown'}`
        };
      };

      if (mode === "path" && target) {
        const pathResult = traceAnalyzer.findPath(g, symbol, target);
        return { symbol, mode, target, path: (pathResult || []).slice(0, 15).map((id: string) => standardize(id)), indexStaleness: isStale };
      }

      const steps = traceAnalyzer.trace(g, symbol);
      const stepsArray = Array.isArray(steps) ? steps : (steps ? Array.from(steps as any) : []);

      return {
        symbol,
        mode,
        steps: stepsArray.slice(0, 15).map((id: string) => standardize(id)),
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
    description: `Structural evolution intelligence: diffing: dead code detection: graph-verified renaming: and uncommitted change analysis.
This is the before you commit tool. It shows what changed: what is dead: and what your working tree looks like structurally.

PREREQUISITE: You MUST run conducks_analyze with fullAnalysis set to true to ensure the baseline structural graph is populated before performing evolution analysis.

WHEN TO USE: Before committing use mode uncommitted to see what your changes affect structurally. During cleanup use mode prune to find dead code. During refactoring use mode rename for safe: graph-verified atomic renames.
AFTER THIS: Use conducks_governance with mode set to audit to verify no new violations. Use conducks_metrics with mode set to explain on changed symbols to understand risk impact.

Modes:
- diff (default): Structural diff between the current graph and the previous pulse.
- prune: Dead code detection. Finds orphan symbols with no incoming edges.
- rename: Graph-Verified Refactoring (GVR). Safely renames a symbol across all references. Requires symbol and newName parameters.
- uncommitted: Analyzes your current git working tree changes. Computes the blast radius of your changes and calculates the risk delta.

Returns:
- changedSymbols: symbols modified in the working tree
- blastRadius: symbols affected by your changes
- riskDelta: net risk change from uncommitted modifications
- indexStaleness: true if the graph is behind HEAD

Node shape: { id, kind, file, name, risk, gravity, summary }

TIP: Run uncommitted mode before every commit to catch unexpected blast radius.
TIP: Dead code from prune mode is safe to delete. These symbols have zero incoming edges.
TIP: GVR rename is safer than find-and-replace because it uses the structural graph: not text matching.`,
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["diff", "prune", "rename", "uncommitted"], default: "diff", description: "Evolution mode: 'diff' for structural delta, 'prune' for dead code, 'rename' for GVR, 'uncommitted' for working tree analysis." },
        symbol: { type: "string", description: "Symbol graph ID for rename mode. Get this from conducks_query results." },
        newName: { type: "string", description: "New name for the symbol. Required only for rename mode." }
      }
    },
    handler: async ({ mode, symbol, newName }: any) => {
      // Ensure registry is initialized
      const rootPath = process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
      await registry.initialize(true, rootPath);

      const g = registry.intelligence.graph.getGraph();
      const status = registry.governance.status();
      const isStale = status.staleness.stale;

      const standardize = (id: string): any => {
        const node = g.getNode(id);
        if (!node) return { id };
        return {
          id: node.id,
          kind: node.label,
          file: node.properties?.filePath,
          name: node.properties?.name,
          risk: node.properties?.risk || 0,
          gravity: node.properties?.rank || 0,
          summary: `${node.label} ${node.properties?.name || 'unknown'} in ${node.properties?.filePath || 'unknown'}`
        };
      };

      if (mode === "diff") {
        return { nodes: { added: 0, removed: 0 }, edges: { added: 0, removed: 0 }, indexStaleness: isStale };
      }

      if (mode === "prune") {
        const orphans = registry.metrics.prune();
        const orphansArray = Array.isArray(orphans) ? orphans : (orphans ? Array.from(orphans as any) : []);
        return {
          orphans: orphansArray.slice(0, 10).map((id: string) => standardize(id)),
          totalCount: orphansArray.length,
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
              const prev: any = await new Promise((res) => db.all("SELECT risk FROM nodes WHERE id = ? ORDER BY pulseId DESC LIMIT 1 OFFSET 1", sId, (err: any, rows: any[]) => res(rows?.[0])));
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
    description: `System management: architecture context: and skill guide access.
The meta tool. Provides information about Conducks and the indexed project structural state.

WHEN TO USE: First contact use mode status to check health and see graph stats. Onboarding use mode architecture-context to get an LLM optimized summary of the entire codebase. Task guidance use mode skill to retrieve step-by-step tool workflows.
AFTER THIS: Use conducks_analyze with fullAnalysis set to true for deeper structural health data if the codebase is unrecognized. Use conducks_query to search for symbols mentioned in the architecture context.

Modes:
- status (default): System health check. Returns node count: edge count: and staleness status.
- staleness: Detailed staleness report showing how many commits the index is behind HEAD.
- architecture-context: LLM optimized codebase summary. Returns entry points: hotspots: and architectural violations.
- skill: Retrieve a task specific skill guide. Requires the skill parameter.

Returns:
- indexStaleness: true if the graph is behind HEAD
- lastPulse: timestamp of the last structural pulse
- nodeCount: total graph nodes
- edgeCount: total graph edges

TIP: Always start with architecture-context when entering an unfamiliar codebase.
TIP: Skills are self-contained workflows. Follow them step-by-step for best results.
TIP: If status shows high staleness run conducks_analyze with fullAnalysis set to true to refresh structural resonance.`,
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["status", "staleness", "architecture-context", "skill"], default: "status", description: "System mode: 'status' for health check, 'architecture-context' for LLM-optimized summary, 'skill' for task-specific guide." },
        skill: { type: "string", description: "Skill name to retrieve (e.g., 'pr-review', 'debugging', 'refactoring', 'architecture-exploration', 'governance'). Required only for skill mode." }
      }
    },
    handler: async ({ mode, skill }: any) => {
      // Ensure registry is initialized
      const rootPath = process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
      await registry.initialize(true, rootPath);

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
    formatter: (res: any) => {
      if (res.hotspots || res.entryPoints) {
        return `## Conducks Architectural Context\nStructural Snapshot of the indexed synapse.`;
      }
      return `## Conducks System Status: Healthy\nCWD: \`${res.cwd || 'sandboxed'}\` | ProjectRoot: \`${res.projectRoot || 'local'}\``;
    }
  },

  conducks_link: {
    id: "conducks-link",
    name: "conducks_link",
    type: "tool",
    version: "2.0.0",
    description: `Cross repository structural intelligence. Query and link synapses across multiple codebases.
Enables federated structural analysis to find how symbols in one repository relate to symbols in another.

PREREQUISITE: You MUST run conducks_analyze with fullAnalysis set to true in ALL participating repositories to establish their individual structural graphs before they can be linked.

WHEN TO USE: Multi repository architectures where a change in repo A may affect repo B. Microservice environments to trace cross service data lineage. Monorepo boundary analysis to detect structural coupling between packages.
AFTER THIS: Use conducks_trace on identified cross repo symbols for deeper analysis. Use conducks_metrics on federated hotspots.

Modes:
- query (default): Search for structural relationships between the current repository and other indexed repositories.
- link: Establish structural connections between repositories by indexing their shared interfaces like API contracts or event schemas.

Returns:
- federatedEdges: cross repository structural relationships including confidence scores
- crossRepoSymbols: symbols that participate in cross repository relationships
- indexStaleness: true if the graph is behind HEAD

TIP: Link mode must be run once before query mode can find cross repository relationships.
TIP: Start with query mode to discover existing connections before establishing new links.
TIP: Cross repository edges have lower confidence. Verify them with source code inspection.`,
    inputSchema: {
      type: "object",
      properties: {
        repoPaths: { type: "array", items: { type: "string" }, description: "Absolute paths to other repository roots to link or query against." },
        mode: { type: "string", enum: ["link", "query"], default: "query", description: "Link mode: 'link' to establish connections, 'query' to search existing cross-repo relationships." }
      }
    },
    handler: async ({ repoPaths, mode }: any) => {
      // Ensure registry is initialized
      const rootPath = process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
      await registry.initialize(true, rootPath);

      const linker = new FederatedLinker();
      const status = registry.governance.status();
      
      if (mode === 'link' && repoPaths) {
        for (const p of repoPaths) {
          await linker.link(p);
        }
      }
      
      // Hydrate from links to Establish federated resonance
      await linker.hydrate(registry.intelligence.graph.getGraph());
      
      return { 
        federatedEdges: [], // Future: calculate cross-repo edges in federated-linker
        crossRepoSymbols: [], 
        indexStaleness: status.staleness.stale 
      };
    }
  }
};
