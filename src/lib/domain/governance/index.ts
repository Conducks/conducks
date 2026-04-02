import { ConducksAdvisor } from "./advisor.js";
import type { Advice } from "@/types/domain.js";
import { ConducksSentinel } from "./sentinel.js";
import { ContextGenerator } from "./context-generator.js";
import { BlueprintGenerator } from "./blueprint-generator.js";
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

  constructor(
    private graph: ConducksAdjacencyList,
    private advisor: ConducksAdvisor,
    private sentinel: ConducksSentinel,
    private contextGenerator: ContextGenerator,
    private blueprint: BlueprintGenerator
  ) {}

  /**
   * Performs an architectural audit (Cycles, God Objects, HUBs).
   */
  public audit() {
    const violations: string[] = [];
    const cycles = this.graph.detectCycles();
    for (const cycle of cycles) violations.push(`ARCH-3: Circular: ${cycle.join(" -> ")}`);
    return { success: violations.length === 0, violations };
  }

  /**
   * Generates structural advice for codebase improvement.
   */
  public async advise(): Promise<Advice[]> {
    return this.advisor.analyze(this.graph);
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
