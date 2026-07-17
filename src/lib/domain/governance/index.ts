import { ConducksAdvisor } from "./advisor.js";
import type { Advice } from "@/types/domain.js";
import { ConducksSentinel } from "./sentinel.js";
import { ContextGenerator } from "./context-generator.js";
import { BlueprintGenerator } from "./blueprint-generator.js";
import { RegressionGuard } from "./guard.js";
import { ConducksAdjacencyList } from "@/lib/core/graph/adjacency-list.js";
import { SynapsePersistence } from "@/lib/core/persistence/persistence.js";
import { chronicle } from "@/lib/core/git/chronicle-interface.js";
import { ConducksComponent } from "@/contracts/types.js";
import path from "node:path";
import { loadSentinelRules, LAYER_FRAGMENTS, ALLOWED_DEPENDENCIES, type SentinelRule } from "./sentinel-rules.js";

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
   * Conducks Re-Anchoring 🛡️
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
    
    // 1. Circular Dependency Detection (Conducks Filtering) 🛡️
    // Only flag multi-node cycles that are NOT purely hierarchical (no MEMBER_OF edges).
    const cycles = this.graph.detectCycles().filter(c => {
      if (c.length <= 1) return false;
      
      // Check if any edge in the cycle is a MEMBER_OF edge.
      // If so, it's a hierarchical "Unit Noise" cycle, not an architectural violation.
      for (let i = 0; i < c.length; i++) {
        const sourceId = c[i];
        const targetId = c[(i + 1) % c.length];
        const edges = this.graph.getNeighbors(sourceId, 'downstream');
        if (edges.some(e => e.targetId === targetId && e.type === 'MEMBER_OF')) {
          return false;
        }
      }
      return true;
    });

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
      
      // Conducks Rule: Standard Libraries and node_modules are Discoveries, not Violations.
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
   * Evaluates user-configured sentinel rules (YAML DSL) against the current graph.
   * Loads rules from `.conducks/sentinel.yml` in the project root, falling back to defaults.
   *
   * Supports conditions: has_cycles, rank_violation, dead_code, high_churn, deep_nesting.
   */
  public auditWithRules(rootDir?: string): {
    success: boolean;
    violations: Array<{ id: string; ruleId: string; severity: 'error' | 'warning' | 'info'; message: string }>;
  } {
    const projectRoot = rootDir || chronicle.getProjectDir() || process.cwd();
    const rules = loadSentinelRules(projectRoot);

    const violations: Array<{ id: string; ruleId: string; severity: 'error' | 'warning' | 'info'; message: string }> = [];

    for (const rule of rules) {
      switch (rule.condition) {
        case 'has_cycles': {
          const cycles = this.graph.detectCycles().filter(c => {
            if (c.length <= 1) return false;
            for (let i = 0; i < c.length; i++) {
              const sourceId = c[i];
              const targetId = c[(i + 1) % c.length];
              const edges = this.graph.getNeighbors(sourceId, 'downstream');
              if (edges.some(e => e.targetId === targetId && e.type === 'MEMBER_OF')) return false;
            }
            return true;
          });
          for (const cycle of cycles) {
            violations.push({
              id: cycle[0],
              ruleId: rule.id,
              severity: rule.severity,
              message: `[${rule.name}] Circular dependency: ${cycle.join(' -> ')}`,
            });
          }
          break;
        }

        case 'rank_violation': {
          // A rank violation is an edge where a lower-rank node imports from a higher-rank node
          // (canonicalRank: lower number = more foundational; a BEHAVIOR depending on STRUCTURE is fine;
          //  but a STRUCTURE depending on BEHAVIOR is a rank inversion)
          const allEdges = this.graph.getAllEdges();
          for (const edge of allEdges) {
            if (edge.type === 'MEMBER_OF') continue;
            const src = this.graph.getNode(edge.sourceId);
            const tgt = this.graph.getNode(edge.targetId);
            if (!src || !tgt) continue;
            const srcRank = src.properties.canonicalRank ?? -1;
            const tgtRank = tgt.properties.canonicalRank ?? -1;
            if (srcRank < 0 || tgtRank < 0) continue;
            // Violation: higher-ranked (more abstract) depending on lower-ranked (more concrete)
            // i.e. src rank > tgt rank means src is more abstract and should not depend on something more concrete
            if (srcRank > tgtRank && (rule.threshold === undefined || Math.abs(srcRank - tgtRank) >= rule.threshold)) {
              violations.push({
                id: edge.sourceId,
                ruleId: rule.id,
                severity: rule.severity,
                message: `[${rule.name}] Rank inversion: [${src.properties.name}](rank ${srcRank}) -> [${tgt.properties.name}](rank ${tgtRank})`,
              });
            }
          }
          break;
        }

        case 'layer_boundaries': {
          // Clean-Architecture guard (ADR 0005): an import edge from layer A to layer B is legal
          // only if B ∈ ALLOWED_DEPENDENCIES[A]. Same-layer edges are always legal.
          const layerOf = (file: string): string | null => {
            if (!file) return null;
            const f = file.toLowerCase();
            for (const [name, frag] of LAYER_FRAGMENTS) if (f.includes(frag)) return name; // order matters
            return null;
          };
          const seen = new Set<string>();
          for (const edge of this.graph.getAllEdges()) {
            if (edge.type === 'MEMBER_OF') continue;
            const src = this.graph.getNode(edge.sourceId);
            const tgt = this.graph.getNode(edge.targetId);
            if (!src || !tgt) continue;
            const s = layerOf(String(src.properties.filePath || src.properties.file || ''));
            const t = layerOf(String(tgt.properties.filePath || tgt.properties.file || ''));
            if (!s || !t || s === t) continue;
            if (!(ALLOWED_DEPENDENCIES[s] || []).includes(t)) {
              const key = `${s}->${t}`;
              if (seen.has(key)) continue; // one violation per illegal layer-pair, not per edge
              seen.add(key);
              violations.push({
                id: edge.sourceId,
                ruleId: rule.id,
                severity: rule.severity,
                message: `[${rule.name}] Illegal layer dependency: ${s} → ${t} (e.g. ${src.properties.name} → ${tgt.properties.name})`,
              });
            }
          }
          break;
        }

        case 'dead_code': {
          // Dead code: nodes with no incoming edges, not marked as entry points, and not exported
          const allNodes = Array.from(this.graph.getAllNodes());
          for (const node of allNodes) {
            if (node.properties.isEntryPoint) continue;
            if (node.properties.isExport) continue;
            const incoming = this.graph.getNeighbors(node.id, 'upstream').filter(e => e.type !== 'MEMBER_OF');
            if (incoming.length === 0) {
              violations.push({
                id: node.id,
                ruleId: rule.id,
                severity: rule.severity,
                message: `[${rule.name}] Unreachable module: [${node.properties.name || node.id}]`,
              });
            }
          }
          break;
        }

        case 'high_churn': {
          // High churn: nodes whose kineticEnergy exceeds the threshold
          const threshold = rule.threshold ?? 30;
          const allNodes = Array.from(this.graph.getAllNodes());
          for (const node of allNodes) {
            const energy = node.properties.kineticEnergy ?? 0;
            if (energy >= threshold) {
              violations.push({
                id: node.id,
                ruleId: rule.id,
                severity: rule.severity,
                message: `[${rule.name}] High churn: [${node.properties.name || node.id}] has kinetic energy ${energy} (threshold: ${threshold})`,
              });
            }
          }
          break;
        }

        case 'deep_nesting': {
          // Deep nesting: nodes whose depth exceeds the threshold
          const threshold = rule.threshold ?? 5;
          const allNodes = Array.from(this.graph.getAllNodes());
          for (const node of allNodes) {
            const depth = node.properties.depth ?? 0;
            if (depth > threshold) {
              violations.push({
                id: node.id,
                ruleId: rule.id,
                severity: rule.severity,
                message: `[${rule.name}] Deep nesting: [${node.properties.name || node.id}] at depth ${depth} (threshold: ${threshold})`,
              });
            }
          }
          break;
        }
      }
    }

    return {
      success: violations.filter(v => v.severity === 'error').length === 0,
      violations,
    };
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
export { loadSentinelRules, getDefaultRules } from "./sentinel-rules.js";
export type { SentinelRule, SentinelCondition, SentinelRuleFile } from "./sentinel-rules.js";
