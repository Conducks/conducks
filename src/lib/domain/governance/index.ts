import { ConducksAdvisor } from "./advisor.js";
import type { Advice } from "@/types/domain.js";
import { ConducksSentinel } from "./sentinel.js";
import { ContextGenerator } from "./context-generator.js";
import { BlueprintGenerator } from "./blueprint-generator.js";
import { RegressionGuard } from "./guard.js";
import { ConducksAdjacencyList } from "@/lib/core/graph/adjacency-list.js";
import { SynapsePersistence } from "@/lib/core/persistence/persistence.js";
import { chronicle } from "@/lib/core/git/chronicle-interface.js";
import { ConducksComponent } from "@/registry/types.js";
import path from "node:path";

/**
 * Conducks — Governance Domain Service
 * 
 * Logic for architectural auditing, advisory, and context generation.
 */
export class GovernanceService implements ConducksComponent {
  public readonly id = 'governance-service';
  public readonly type = 'analyzer';
  public readonly description = 'Orchestrates architectural auditing and structural advice.';
  private guard: RegressionGuard | null = null;
  private persistence: SynapsePersistence | null = null;

  constructor(
    private graph: ConducksAdjacencyList,
    private advisor: ConducksAdvisor,
    private sentinel: ConducksSentinel,
    private contextGenerator: ContextGenerator,
    private blueprint: BlueprintGenerator,
    persistence?: SynapsePersistence
  ) {
    this.persistence = persistence || null;
    if (persistence) {
      this.guard = new RegressionGuard(persistence as any);
    }
  }

  /**
   * Apostolic Re-Anchoring 🏺
   * Re-wires the service to a new structural vault handle.
   */
  public setPersistence(persistence: SynapsePersistence) {
    this.persistence = persistence;
    this.guard = new RegressionGuard(persistence as any);
    this.contextGenerator.setPersistence(persistence);
  }

  /**
   * Performs an architectural audit (Cycles, God Objects, Orphans).
   * Distinguishes between internal risks (Violations) and external context (Discoveries).
   */
  public audit() {
    const violations: any[] = [];
    const discoveries: any[] = [];
    const projectRoot = chronicle.getProjectDir() || process.cwd();
    
    // 1. Circular Dependency Detection (Apostolic Filtering) 🏺
    // Only flag multi-node cycles. Self-loops on units/files are common but not "decay".
    const cycles = this.graph.detectCycles().filter(c => c.length > 1);
    for (const cycle of cycles) {
      violations.push({
        id: cycle[0],
        type: 'CIRCULAR',
        message: `ARCH-3: Circular: ${cycle.join(" -> ")}`
      });
    }

    // 2. Orphaned Edge Detection (Refactoring Alerts)
    const allEdges = this.graph.getAllEdges();
    const orphanedEdges = allEdges.filter(e => {
      if (e.type === 'MEMBER_OF') return false; 
      return !this.graph.hasNode(e.targetId);
    });

    let internalOrphans = 0;
    let externalOrphans = 0;

    for (const orphan of orphanedEdges) {
      const sourceNode = this.graph.getNode(orphan.sourceId);
      const sourceName = sourceNode ? sourceNode.properties.name : orphan.sourceId;
      
      // Apostolic Rule: Standard Libraries and node_modules are Discoveries, not Violations.
      const isNodeBuiltin = orphan.targetId.startsWith('node:');
      
      // Precision Check: Does it start with an absolute path or relative path?
      const isPathLike = orphan.targetId.startsWith('/') || orphan.targetId.startsWith('./') || orphan.targetId.startsWith('../');
      
      // If it's path-like, is it within our project root?
      const isInternalPath = isPathLike && (orphan.targetId.startsWith(projectRoot) || orphan.targetId.startsWith('@/'));

      const isExternalId = isNodeBuiltin || !isInternalPath;

      if (isExternalId) {
        externalOrphans++;
        discoveries.push({
          id: orphan.targetId,
          source: sourceName,
          type: 'ECOSYSTEM',
          message: `ECOSYSTEM-1: External Symbol: [${sourceName}] -> [${orphan.targetId}]`
        });
      } else {
        // It's an internal orphan. 
        // We only flag it as a VIOLATION if the target ID doesn't seem to exist on disk.
        // If it DOES exist on disk but isn't in our graph, it's just a Missing Induction (Discovery).
        let existsOnDisk = false;
        try {
           const potentialPath = orphan.targetId.split('::')[0];
           existsOnDisk = path.isAbsolute(potentialPath) && require('fs').existsSync(potentialPath);
        } catch {}

        if (existsOnDisk) {
          externalOrphans++; // Categorize as discovery
          discoveries.push({
            id: orphan.targetId,
            source: sourceName,
            type: 'MISSING_INDUCTION',
            message: `DISCOVERY-1: Path exists but not induced: [${sourceName}] -> [${orphan.targetId}]`
          });
        } else {
          internalOrphans++;
          violations.push({
            id: orphan.targetId,
            source: sourceName,
            type: 'REFACTOR',
            message: `REFACTOR-1: Orphaned Edge: [${sourceName}] -> [${orphan.targetId}] (Broken Internal Link)`
          });
        }
      }
    }

    return { 
      success: internalOrphans === 0 && cycles.length === 0, 
      violations,
      discoveries: discoveries.slice(0, 20),
      stats: {
        cycles: cycles.length,
        orphans: internalOrphans,
        ecosystem_dangling: externalOrphans
      }
    };
  }

  /**
   * Generates structural advice for codebase improvement.
   */
  public async advise(): Promise<Advice[]> {
    return this.advisor.analyze(this.graph);
  }

  /**
   * Evaluates structural regression against a threshold.
   */
  public async shouldBlock(threshold?: number) {
    if (!this.guard) throw new Error("Regression guard requires persistence layer.");
    return this.guard.shouldBlock(threshold);
  }

  /**
   * Generates localized structural context for AI agents.
   */
  public async generateContext(persistence: SynapsePersistence) {
    return this.contextGenerator.generateTop10Context(persistence);
  }

  /**
   * Generates a high-level ARCHITECTURE.md manifest.
   */
  public async generateManifest(persistence: SynapsePersistence) {
    return this.contextGenerator.generateFileSummary(persistence);
  }

  /**
   * Generates an interactive structural blueprint.
   */
  public generateBlueprint() {
    return this.blueprint.generate(this.graph);
  }

  /**
   * Calculates the current structural health status.
   */
  public status() {
    const lastCommit = chronicle.getLastPulsedCommit(this.graph) || "none";
    const currentHead = chronicle.getHeadHash();
    const isStale = currentHead && lastCommit !== "none" && currentHead !== lastCommit;
    
    return {
      status: "ready",
      projectName: path.basename(chronicle.getProjectDir() || "unknown"),
      framework: this.graph.getMetadata('framework') || "generic",
      staleness: {
        stale: isStale,
        lastAnalyzedCommit: lastCommit,
        currentHead: currentHead || "non-git",
        commitsBehind: isStale ? chronicle.getCommitsBehind(lastCommit) : 0,
      },
      stats: {
        nodeCount: this.graph.stats.nodeCount,
        edgeCount: this.graph.stats.edgeCount,
        density: (this.graph.stats as any).density || 0
      }
    };
  }
}

export type { Advice };
export { ConducksAdvisor } from "./advisor.js";
export { ConducksSentinel } from "./sentinel.js";
export { ContextGenerator } from "./context-generator.js";
export { BlueprintGenerator } from "./blueprint-generator.js";
export { GuidanceOracle } from "./oracle.js";
export { RegressionGuard } from "./guard.js";
