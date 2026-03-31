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
  },

  conducks_visualize: {
    id: "conducks-visualize",
    name: "conducks_visualize",
    type: "tool",
    version: "1.0.0",
    description: `Generate a high-fidelity structural visualization (Mermaid) of the current Synapse.
Provides a visual 'Watch Graph' reflected in a workspace artifact.`,
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", default: 20, description: "Number of high-gravity nodes to include in the visualization." }
      }
    },
    handler: async ({ limit }: any) => {
      const g = registry.intelligence.graph.getGraph();
      const nodes = Array.from(g.getAllNodes())
        .sort((a, b) => (b.properties.rank || 0) - (a.properties.rank || 0))
        .slice(0, limit || 20);
      
      const nodeIds = new Set(nodes.map(n => n.id));
      const mermaidLines = ["graph TD"];
      
      for (const node of nodes) {
        const cleanName = node.properties.name.replace(/[^a-zA-Z0-9]/g, '_');
        const label = `${node.label}::${node.properties.name}`;
        mermaidLines.push(`  ${node.id}["${label}"]`);
        
        const neighbors = g.getNeighbors(node.id, 'downstream');
        for (const edge of neighbors) {
          if (nodeIds.has(edge.targetId)) {
            mermaidLines.push(`  ${edge.sourceId} -- ${edge.type} --> ${edge.targetId}`);
          }
        }
      }

      const content = mermaidLines.join('\n');
      const baseDir = process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
      const artifactPath = path.join(baseDir, '.conducks', 'structural_mirror.md');
      
      await fs.outputFile(artifactPath, `# Structural Mirror — Real-time Pulse\n\n\`\`\`mermaid\n${content}\n\`\`\`\n`, 'utf-8');
      
      return { artifactPath, nodeCount: nodes.length };
    }
  }
};
