import { ConducksAdvisor } from "./advisor.js";
import type { Advice } from "@/contracts/index.js";
import { ConducksSentinel } from "./sentinel.js";
import { RegressionGuard } from "./guard.js";
import { ConducksAdjacencyList, IMPORT_CYCLE_IGNORED_EDGE_TYPES, NodeId } from "@/lib/core/graph/index.js";
import { SynapsePersistence } from "@/lib/core/persistence/persistence.js";
import { chronicle } from "@/lib/core/git/index.js";
import fs from "node:fs";
import { classifyFreshness, isStale } from "@/lib/core/persistence/freshness.js";
import { SOURCE_EXTENSIONS } from "@/contracts/index.js";
import path from "node:path";
import { loadSentinelRules, LAYER_FRAGMENTS, ALLOWED_DEPENDENCIES, type SentinelRule } from "./sentinel-rules.js";

/**
 * The graph-level verdict, from the node count alone.
 *
 * A vault holding NOTHING must not report the same word as a healthy one (ADR 0124). Both `status()`
 * and `statusFromVault()` used to return the string literal `'ready'`, so the field was incapable of
 * saying anything else: after `conducks clean`, a 0-node vault printed `Status: READY`,
 * `Staleness: SYNCHRONIZED`, `Pulse: none` and an empty hotspot list, and nothing anywhere said the
 * graph was empty. Shared by both callers deliberately — the same field name answering differently
 * on the CLI and MCP surfaces is how `density` drifted 5,000x.
 */
export function emptyOrReady(nodeCount: number): 'empty' | 'ready' {
  return nodeCount === 0 ? 'empty' : 'ready';
}

/**
 * Conducks — Governance Domain Service
 *
 * Logic for architectural auditing, advisory, and context generation.
 */
export class GovernanceService {
  private guard: RegressionGuard | null = null;
  private persistence: SynapsePersistence | null = null;

  constructor(
    private graph: ConducksAdjacencyList,
    private advisor: ConducksAdvisor,
    private sentinel: ConducksSentinel,
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
    // ARCH-3 is a MODULE IMPORT cycle (ADR 0017), so traverse only edges that are a module-level
    // runtime dependency. IMPORT_CYCLE_IGNORED_EDGE_TYPES drops structural containment
    // (interface→property, class→method, symbol→file — ADR 0010), type references, which the
    // compiler erases (ADR 0016), and call-level coupling, where a CALLS edge onto a parameter's
    // method is resolved onto the owning class only because that parameter is type-annotated.
    // A genuine architectural cycle spans ≥2 files; a single-file loop (recursion, a type owning
    // its own members) is an implementation detail, not a module-dependency smell.
    const cycles = this.graph.detectCycles({ ignoreTypes: IMPORT_CYCLE_IGNORED_EDGE_TYPES, ignoreTypeOnly: true }).filter(c => {
      if (c.length <= 1) return false;
      const files = new Set(c.map(id => {
        const n = this.graph.getNode(id);
        return String(n?.properties.filePath || n?.properties.file || id);
      }));
      return files.size > 1;
    });

    for (const cycle of cycles) {
      violations.push({
        id: cycle[0],
        type: 'CIRCULAR',
        message: `ARCH-3: Circular: ${cycle.join(" -> ")}`
      });
    }

    // 1a. Symbol-level mutual-call tangles (ARCH-6), a DISCOVERY and not a violation.
    //
    // ADR 0017 removed these from ARCH-3 on purpose: a module import cycle and two functions calling
    // each other are different facts, and conflating them made ARCH-3 fire on ordinary mutual
    // recursion. Removing them left them reported NOWHERE, so a real tangle — a knot of symbols with
    // no entry order — became invisible. This reports them under their own name and severity.
    //
    // CALLS only: no containment, no type references, no imports. Self-recursion (length 1) is
    // excluded — it is a normal shape, not a tangle. Unlike ARCH-3 this does NOT require the cycle to
    // span files: mutual calls inside one file are exactly the case ARCH-3 refuses to look at.
    const tangles = this.graph.detectCycles({ onlyTypes: new Set(['CALLS']) })
      .filter(c => c.length > 1);

    for (const tangle of tangles.slice(0, 20)) {
      const names = tangle.map(id => {
        const n = this.graph.getNode(id);
        return String(n?.properties.name || id.split('::').pop() || id);
      });
      discoveries.push({
        id: tangle[0],
        type: 'TANGLE',
        message: `ARCH-6: Mutual call tangle (${tangle.length} symbols): ${names.join(" -> ")}`
      });
    }

    // 1b. Self-import detection (distinct from ARCH-3 module cycles).
    // A file that imports/re-exports from its own module path — e.g. `export * from './self'` —
    // is a degenerate self-reference (dead stub / accidental barrel loop), not a cross-file
    // dependency cycle. The cross-file rule above deliberately skips these, so flag them here.
    const fileOf = (id: NodeId): string | undefined => {
      const n = this.graph.getNode(id);
      return (n?.properties.filePath || n?.properties.file) as string | undefined;
    };
    // A self-referential import is flagged ONLY via the orchestrator's explicit marker: a `self::`
    // edge, emitted precisely when an import specifier resolves back to its own file (`export * from
    // './self'`, `@/`-alias to self). We do NOT infer it from generic unit → unit self-loops — those
    // arise from other resolution paths (fuzzy name matches, Go/Python intra-package links) and are
    // not self-re-export stubs. Matching the marker keeps ARCH-4 free of false positives.
    const selfImportFiles = new Set<string>();
    for (const e of this.graph.getAllEdges()) {
      if (!(e.id || '').startsWith('self::')) continue;
      const f = fileOf(e.sourceId);
      if (f) selfImportFiles.add(f);
    }
    for (const f of selfImportFiles) {
      violations.push({
        id: f,
        type: 'SELF_IMPORT',
        message: `ARCH-4: Self-import: ${f} imports/re-exports from its own module`,
      });
    }

    // 2. Orphaned Edge Detection (Refactoring Alerts)
    let internalOrphans = 0;
    let externalOrphans = 0;

    const allEdges = this.graph.getAllEdges();
    const orphanedEdges = allEdges.filter(e => {
      if (e.type === 'MEMBER_OF') return false; 
      return !this.graph.hasNode(e.targetId);
    });

    // An edge has TWO ends and this check only ever read one. 199 `PULSES_TO` edges pointed FROM a
    // variable name — not a node id — and `audit` reported nothing, because a missing SOURCE was
    // invisible to it (ADR 0051 fixed those edges; the blind spot outlived them). A dangling source
    // is the same defect as a dangling target and is reported the same way.
    const sourcelessEdges = allEdges.filter(e => {
      if (e.type === 'MEMBER_OF') return false;
      return !this.graph.hasNode(e.sourceId);
    });
    for (const e of sourcelessEdges) {
      internalOrphans++;
      violations.push({
        id: e.sourceId,
        source: e.sourceId,
        type: 'REFACTOR',
        message: `REFACTOR-2: Edge from a node that does not exist: [${e.sourceId}] -> [${e.targetId}] (${e.type})`
      });
    }

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
          const cycles = this.graph.detectCycles({ ignoreTypes: IMPORT_CYCLE_IGNORED_EDGE_TYPES, ignoreTypeOnly: true }).filter(c => {
            if (c.length <= 1) return false;
            // Intra-file self-references (e.g. a singleton's class → getInstance → file-unit) are
            // not circular MODULE dependencies — only cross-file cycles are architectural smells.
            const files = new Set(c.map(id => {
              const n = this.graph.getNode(id);
              return String(n?.properties.filePath || n?.properties.file || id);
            }));
            return files.size > 1;
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
          // A rank inversion is a MORE-ABSTRACT (lower rank) module depending on a MORE-CONCRETE
          // one. This is only meaningful at MODULE granularity — at symbol level a function
          // (BEHAVIOR) using a class (STRUCTURE) is normal code, not an inversion. So skip any
          // edge where both ends are symbol-level tiers (rank >= STRUCTURE). Module-level
          // inversions are better caught by the layer_boundaries rule (ADR 0005).
          const SYMBOL_LEVEL = 7; // CanonicalRank[STRUCTURE]; STRUCTURE/BEHAVIOR/ATOM/... are intra-file symbols
          // A RANK INVERSION IS A DEPENDENCY, so only dependency edges can be one — the same
          // correction ADR 0120 made to `layer_boundaries`, which had the identical defect: a
          // comment saying "depending on" above a loop that walked every edge type.
          //
          // A `GOVERNS` edge is a `MODULE.md` documenting the directory it sits in, and it read as
          // "Rank inversion: MODULE.md (rank 5) -> graph (rank 4)". Twelve of the twenty-one
          // findings `guard` carried as "pre-existing, tracked" were that one pair; the ECOSYSTEM
          // carve-out below already removed 458 of the same shape (ADR 0121).
          const DEPENDENCY_EDGES = new Set(['IMPORTS', 'EXTENDS', 'IMPLEMENTS', 'DEPENDS_ON']);
          const allEdges = this.graph.getAllEdges();
          for (const edge of allEdges) {
            if (!DEPENDENCY_EDGES.has(String(edge.type))) continue;
            const src = this.graph.getNode(edge.sourceId);
            const tgt = this.graph.getNode(edge.targetId);
            if (!src || !tgt) continue;
            const srcRank = src.properties.canonicalRank ?? -1;
            const tgtRank = tgt.properties.canonicalRank ?? -1;
            if (srcRank < 0 || tgtRank < 0) continue;
            if (srcRank >= SYMBOL_LEVEL && tgtRank >= SYMBOL_LEVEL) continue; // normal symbol dependency
            // An external package is not a rank inversion — it is what a dependency IS. ECOSYSTEM is
            // rank 0 because the ranks are a CONTAINMENT ladder (ecosystem contains repository
            // contains directory contains unit), and this rule reads them as a DEPENDENCY ladder.
            // Conflating the two orderings made every `import path from 'node:path'` a violation:
            // all 458 findings `conducks guard` has carried as "pre-existing, tracked" were this one
            // pair, UNIT -> ECOSYSTEM, and not one of them was real. A number carried as acceptable
            // for long enough stops being read, which is why it was worth triaging rather than
            // ratcheting (todo25#P6, ADR 0048).
            if (tgt.properties.canonicalKind === 'ECOSYSTEM') continue;
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
            // A layer contract governs what SHIPS. A unit test imports the unit it tests — that is
            // the definition of one — and `tests/unit/interfaces/tools/filter-builder.test.ts`
            // classifies as `mcp` on its path while actually testing a `domain` module. Routing it
            // through the registry to satisfy the rule would convert every unit test into an
            // integration test, which is a worse codebase bought with a greener gate.
            if (/(^|\/)tests?\//.test(f) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(f)) return null;
            for (const [name, frag] of LAYER_FRAGMENTS) if (f.includes(frag)) return name; // order matters
            return null;
          };
          // THE CONTRACT IS ABOUT IMPORTS. The comment above has always said so, and the loop
          // walked EVERY edge type except MEMBER_OF — so a `CALLS` edge from a CLI command to a
          // domain function counted as a breach, which is precisely what composition exists to make
          // legal: the CLI names no domain module, the registry hands it the function.
          //
          // Measured on conducks, `conducks guard` blocked with four "illegal" dependencies —
          //   cli → domain   (execute → advise)          mcp → domain  (kinetic.ts → getImpact)
          //   cli → core     (execute → reclaimIfBloated) mcp → core   (kinetic.ts → getGraph)
          // — every one of them a call routed through the registry, while
          // `tests/architecture/boundaries.test.ts`, which reads the actual import statements, was
          // GREEN. Two gates, one contract, opposite verdicts, and the one that blocks commits was
          // the wrong one (ADR 0120).
          //
          // EXTENDS and IMPLEMENTS are in the set because both require a real import of the base;
          // TYPE_REFERENCE is NOT, because `import type` erases at compile time and the file-reading
          // gate exempts it — the two must agree or this is back where it started.
          const DEPENDENCY_EDGES = new Set(['IMPORTS', 'EXTENDS', 'IMPLEMENTS', 'DEPENDS_ON']);
          const seen = new Set<string>();
          for (const edge of this.graph.getAllEdges()) {
            if (!DEPENDENCY_EDGES.has(String(edge.type))) continue;
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
  /**
   * The same answer as `status()`, read from the vault instead of the in-memory graph.
   *
   * Everything this reports is already a column or a row: the counts are `count(*)`, and the
   * framework and last-pulsed commit are rows in `metadata`. Materialising 2,381 nodes and 12,590
   * edges to read three numbers costs ~165 MB and 146 ms, which is what a read-only MCP session was
   * paying to answer "is my index stale". Prefer this on any read path; `status()` stays for
   * callers that already hold a materialised graph and would otherwise pay a round trip for nothing.
   */
  public async statusFromVault() {
    if (!this.persistence) return this.status();

    const [counts] = await this.persistence.query<{ nodes: number; edges: number }>(
      'SELECT (SELECT count(*) FROM nodes) AS nodes, (SELECT count(*) FROM edges) AS edges');
    const meta = await this.persistence.query<{ key: string; value: string }>(
      "SELECT key, value FROM metadata WHERE key IN ('framework', 'lastAnalyzedCommit')");
    const byKey = new Map(meta.map(m => [m.key, m.value]));

    const lastCommit = byKey.get('lastAnalyzedCommit') || 'none';
    const currentHead = chronicle.getHeadHash();
    const isStale = Boolean(currentHead && lastCommit !== 'none' && currentHead !== lastCommit);

    return {
      // COMPUTED, not the constant `'ready'` this used to return. A vault holding nothing reported
      // READY and SYNCHRONIZED with an empty hotspot list, and nothing anywhere said the graph was
      // empty — the ADR 0124 family, where nothing-checked reads as clean. `'ready'` was a literal
      // in both this and `status()`, so the field could never have said anything else.
      status: emptyOrReady(Number(counts?.nodes ?? 0)),
      projectName: path.basename(chronicle.getProjectDir() || 'unknown'),
      framework: byKey.get('framework') || 'generic',
      staleness: {
        stale: isStale,
        lastAnalyzedCommit: lastCommit,
        currentHead: currentHead || 'non-git',
        commitsBehind: isStale ? chronicle.getCommitsBehind(lastCommit) : 0,
        pulseId: (await this.persistence.currentPulse())?.id ?? 'none',
        servedFrom: this.persistence.servedFromSnapshot() ? 'previous-pulse-snapshot' : 'vault',
      },
      stats: {
        nodeCount: Number(counts?.nodes ?? 0),
        edgeCount: Number(counts?.edges ?? 0),
        // `density` is RELATIONSHIPS PER SYMBOL (edges / nodes), the same metric every other caller
        // reports — the adjacency list's `stats`, the resonance signature, and the CLI's
        // "relationships/symbol" line. This used to compute graph-theoretic density
        // (edges / n(n-1)), which is ~0.0006 for any real codebase and disagreed with the CLI's
        // 3.28 under the same field name, so a caller reading both got two numbers 5,000x apart.
        density: Number(counts?.nodes ?? 0) > 0
          ? Number(counts?.edges ?? 0) / Number(counts.nodes)
          : 0,
      },
    };
  }

  /**
   * What is on DISK against what the vault analyzed — the question `status().staleness` does not ask.
   *
   * `staleness` compares HEAD to the last pulsed commit, so it cannot move until something is
   * committed, and while working nothing is. Measured: edit a file, delete the only call to a
   * symbol, and `status` printed SYNCHRONIZED while `impact` still reported the deleted caller.
   *
   * Lives in the DOMAIN because `cli` may not import `core` (ADR 0005) and `classifyFreshness` is
   * core — the architecture test caught exactly that import, which is how this landed in the right
   * layer. Same engine `monitor` and `watch` read (ADR 0036).
   *
   * `added` is reported and never counted as stale: `analyze` is incremental by mtime, so a file
   * older than the last pulse legitimately carries no hash (see `isStale`).
   */
  public async checkWorkingTree(): Promise<{ changed: number; added: number; removed: number; tracked: number; stale: boolean }> {
    const nothing = { changed: 0, added: 0, removed: 0, tracked: 0, stale: false };
    if (!this.persistence) return nothing;
    try {
      const stored = await this.persistence.getAllFileHashes();
      const onDisk = await chronicle.discoverFiles();
      const f = classifyFreshness(
        stored, onDisk, SOURCE_EXTENSIONS,
        abs => { try { return fs.readFileSync(abs, "utf8"); } catch { return null; } },
        abs => fs.existsSync(abs),
        p => path.extname(p),
      );
      return {
        changed: f.changed.length, added: f.added.length, removed: f.removed.length,
        tracked: f.tracked, stale: isStale(f),
      };
    } catch {
      return nothing;   // an unreadable vault is already reported by the health block in `status`
    }
  }

  public status() {
    const lastCommit = chronicle.getLastPulsedCommit(this.graph) || "none";
    const currentHead = chronicle.getHeadHash();
    const isStale = currentHead && lastCommit !== "none" && currentHead !== lastCommit;
    
    return {
      // Computed for the same reason as `statusFromVault` — the two must never disagree under one
      // field name, which is exactly how `density` drifted 5,000x between the CLI and MCP.
      status: emptyOrReady(this.graph.stats.nodeCount),
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
export { RegressionGuard } from "./guard.js";
export { loadSentinelRules, getDefaultRules } from "./sentinel-rules.js";
export type { SentinelRule, SentinelCondition, SentinelRuleFile } from "./sentinel-rules.js";
