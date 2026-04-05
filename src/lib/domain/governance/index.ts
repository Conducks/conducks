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

  constructor(
    private graph: ConducksAdjacencyList,
    private advisor: ConducksAdvisor,
    private sentinel: ConducksSentinel,
    private contextGenerator: ContextGenerator,
    private blueprint: BlueprintGenerator,
    private persistence?: SynapsePersistence
  ) {
    if (persistence) {
      this.guard = new RegressionGuard(persistence as any);
    }
  }

  /**
   * Performs an architectural audit (Cycles, God Objects, Orphans).
   */
  public audit() {
    const violations: string[] = [];
    
    // 1. Circular Dependency Detection
    const cycles = this.graph.detectCycles();
    for (const cycle of cycles) {
      violations.push(`ARCH-3: Circular: ${cycle.join(" -> ")}`);
    }

    // 2. Orphaned Edge Detection (Refactoring Alerts) 🏺
    // [Apostolic State-Sync] We scan the global synapse for dangling links.
    const allEdges = this.graph.getAllEdges();
    const orphanedEdges = allEdges.filter(e => {
      // Ignore virtual or metadata edges if they exist, focus on structural
      if (e.type === 'MEMBER_OF') return false; 
      return !this.graph.hasNode(e.targetId);
    });

    let internalOrphans = 0;
    let externalOrphans = 0;

    for (const orphan of orphanedEdges) {
      const sourceNode = this.graph.getNode(orphan.sourceId);
      const sourceName = sourceNode ? sourceNode.properties.name : orphan.sourceId;
      
      const isExternalId = orphan.targetId.includes('::') && !orphan.targetId.startsWith('/');
      if (isExternalId) {
        externalOrphans++;
        // We report them but with a lower priority label
        violations.push(`ECOSYSTEM-1: Unresolved Library Symbol: [${sourceName}] -> [${orphan.targetId}]`);
      } else {
        internalOrphans++;
        violations.push(`REFACTOR-1: Orphaned Edge: [${sourceName}] -> [${orphan.targetId}] (Broken Link)`);
      }
    }

    return { 
      success: internalOrphans === 0, 
      violations,
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
