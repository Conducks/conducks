import { BlastRadiusAnalyzer } from "@/lib/domain/kinetic/index.js";
import { ConducksComponent } from "@/contracts/index.js";
import { SynapseRegistry } from "@/lib/core/registry/index.js";
import { AnalyzeOrchestrator } from "@/lib/domain/analysis/orchestrator.js";
import { PythonProvider } from "@/lib/core/parsing/index.js";
import { TypeScriptProvider } from "@/lib/core/parsing/index.js";
import { grammars } from "@/lib/core/parsing/index.js";
import { ConducksGraph } from "@/lib/core/graph/index.js";
import { ConducksSearch } from "@/lib/domain/intelligence/index.js";
import { ConducksFlowEngine } from "@/lib/domain/kinetic/index.js";
import { SynapsePersistence } from "@/lib/core/persistence/index.js";
import { ConducksDiffEngine } from "@/lib/core/graph/index.js";
import { GVREngine } from "@/lib/domain/evolution/index.js";
import { IMPORT_CYCLE_IGNORED_EDGE_TYPES, CycleDetector, formatCycleCluster } from "@/lib/core/graph/index.js";
import { DeadCodeAnalyzer } from "@/lib/domain/evolution/index.js";
import { ConducksAdvisor } from "@/lib/domain/governance/index.js";
import { CoChangeEngine } from "@/lib/core/algorithms/index.js";
import { calculateShannonEntropy, normalizeEntropyRisk } from "@/lib/core/algorithms/index.js";
import { chronicle, anchorChronicle } from "@/lib/core/git/index.js";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Project Conducks — Application Core
 */
export class Conducks {

  public graph = new ConducksGraph();
  public search = new ConducksSearch(this.graph.getGraph());
  public flows = new ConducksFlowEngine(this.graph.getGraph());
  private diffEngine = new ConducksDiffEngine();
  private gvr = new GVREngine();
  private death = new DeadCodeAnalyzer();
  private advisor = new ConducksAdvisor();

  private orchestrator: AnalyzeOrchestrator;
  private registry = new SynapseRegistry<ConducksComponent>();
  private persistence: SynapsePersistence;

  constructor(options?: { baseDir?: string }) {
    this.persistence = new SynapsePersistence(options?.baseDir || chronicle.getProjectDir() || process.cwd());
    this.orchestrator = new AnalyzeOrchestrator(this.registry, this.graph, this.persistence);
    this.setupDefaults();
  }

  private setupDefaults(): void {
    const impactAnalyzer = new BlastRadiusAnalyzer();
    this.registry.registerComponent(impactAnalyzer);

    // Conducks: The Gospel Core (Multi-Lens Resonance 💎)
    const ts = new TypeScriptProvider();
    this.registry.registerProvider(".ts", ts);
    this.registry.registerProvider(".tsx", ts);
    this.registry.registerProvider(".js", ts);
    this.registry.registerProvider(".jsx", ts);
    this.registry.registerProvider(".py", new PythonProvider());
  }

  /**
   * Orchestrates the Topological Structural Pulse (Conducks).
   * 
   * Parallelizes reflection by independent dependency batches to maximize 
   * structural throughput.
   */
  public async pulse(files: Array<{ path: string, source: string }>): Promise<string> {
    console.error("[Conducks] Initiating Conducks 'Structural Resonance' Pulse...");

    console.error("[ConducksCore] Loading persistence...");
    await this.persistence.load(this.graph.getGraph());
    console.error("[ConducksCore] Persistence loaded.");

    console.error("[ConducksCore] Initializing grammars...");
    await grammars.init();
    console.error("[ConducksCore] Grammars initialized.");
    await grammars.loadLanguage("python");
    console.error(`[ConducksCore] Grammar loaded.`);

    // Conducks: Kinetic Root Alignment
    if (files.length > 0) {
      const firstFile = files[0].path;
      
      // Improved Heuristic: Find the root containing .git or .conducks
      let currentDir = path.dirname(path.resolve(firstFile));
      let projectRoot = currentDir;
      
      while (currentDir !== path.parse(currentDir).root) {
        if (fs.existsSync(path.join(currentDir, '.git')) || fs.existsSync(path.join(currentDir, '.conducks'))) {
          projectRoot = currentDir;
          break;
        }
        currentDir = path.dirname(currentDir);
      }

      anchorChronicle(projectRoot);
    }

    console.error(`[ConducksCore] Calling Orchestrator with ${files.length} units.`);
    const result = await this.orchestrator.analyze(files);
    const framework = (this.orchestrator as any).context?.getFramework?.();
    if (framework) {
      this.graph.getGraph().setMetadata('framework', framework);
    }
    console.error(`[ConducksCore] Orchestrator call complete.`);

    // Conducks: Align Test Coverage

    // Conducks: Architectural Audit (Mark Anomalies)
    this.advisor.analyze(this.graph.getGraph());

    // Conducks: Final structural resonance (Reflects gravity and entry points)
    await this.resonate();

    // Conducks: Sync Staleness Sensor (Store HEAD hash)
    const headHash = chronicle.getHeadHash();
    if (headHash) {
      console.error(`[ConducksCore] Capturing pulse snapshot at: ${headHash}`);
      chronicle.setLastPulsedCommit(this.graph.getGraph(), headHash);
      console.error(`[ConducksCore] Metadata set. Current metadata:`, Array.from(this.graph.getGraph().getAllMetadata().entries()));
    }

    await this.persistence.save(this.graph.getGraph(), { nodeCount: result.nodeCount, edgeCount: result.edgeCount });
    return result.pulseId;
  }

  public query(query: string) {
    return this.search.search(query);
  }

  public trace(startId: string) { return this.flows.trace(startId); }

  public getImpact(symbolId: string, direction: 'upstream' | 'downstream' = 'upstream', depth: number = 5): any {
    const analyzer = this.registry.getComponent("blast-radius-analyzer") as any;
    if (!analyzer) throw new Error("Conducks Error: Blast Radius Analyzer not found.");
    return analyzer.analyzeImpact(this.graph.getGraph(), symbolId, direction, depth);
  }

  public async diffWithBase(): Promise<any> {
    const base = new ConducksGraph();
    await this.persistence.load(base.getGraph());
    return this.diffEngine.diff(base.getGraph(), this.graph.getGraph());
  }

  public async rename(symbolId: string, newName: string): Promise<any> {
    return this.gvr.renameSymbol(this.graph.getGraph(), symbolId, newName);
  }

  public prune(): any[] { return this.death.analyze(this.graph.getGraph()); }

  public async advise(): Promise<any[]> {
    let cochangeFindings: any[] = [];
    // CoChangeEngine creates TEMP tables — requires a read-write connection.
    // Only run during analyze (write mode); skip in all read-only contexts (MCP tools, CLI reads).
    if (!(this.persistence as any).readOnly && typeof (this.persistence as any).getRawConnection === 'function') {
      const db = await (this.persistence as any).getRawConnection();
      const engine = new CoChangeEngine();
      cochangeFindings = await engine.discoverHiddenCoupling(this.graph.getGraph(), db);
    }
    return this.advisor.analyze(this.graph.getGraph(), cochangeFindings);
  }

  public async calculateEntropy(symbolId: string): Promise<{ entropy: number, risk: number, unavailable?: boolean }> {
    const graph = this.graph.getGraph();
    const node = graph.getNode(symbolId);
    if (!node || !node.properties.filePath) return { entropy: 0, risk: 0 };
    const distribution = await chronicle.getAuthorDistribution(node.properties.filePath);
    // Null is "git could not be read". Scoring it 0 risk put the least-known file at the safe end.
    if (distribution === null) return { entropy: 0, risk: 0, unavailable: true };
    const entropy = calculateShannonEntropy(distribution);
    const risk = normalizeEntropyRisk(entropy, Object.keys(distribution).length);
    return { entropy, risk };
  }

  public async calculateCompositeRisk(nodeId: string): Promise<any> {
    const graph = this.graph.getGraph();
    const node = graph.getNode(nodeId);
    if (!node) return null;

    // Leverage Conducks persistent signals
    // CHURN AND ENTROPY LIVE UNDER `kinetic`, and this read the flat names — which no writer sets.
    //
    // `reflector.ts` writes `n.metadata.kinetic = { resonance, entropy, ... }` from one `git log` per
    // file, and persistence keeps it (`kinetic` JSON column, plus `churn_count_90d`). Nothing ever
    // wrote `properties.resonance` or `properties.entropy`, so both terms were `|| 0` for every
    // symbol in every project — 10% of the composite score, and a `churn: 0.00` line printed in
    // `explain`'s breakdown as if it had been measured.
    //
    // MEASURED on the three subjects, all of which have deep git history: sofie 975 commits,
    // orchestrator 288, scraper 213. `registerIpcHandlers` carries `kinetic.resonance = 116`, which
    // is exactly `git log --oneline -- electron/main/index.ts | wc -l`. The number was in the vault
    // the whole time, one key deeper than the reader looked.
    const kinetic = (node.properties as any).kinetic ?? {};
    const entropyRisk = kinetic.entropy ?? node.properties.entropy ?? 0;
    const churnRisk = Math.min((kinetic.resonance ?? (node.properties as any).resonance ?? 0) / 100, 1.0);
    const complexityRisk = Math.min((node.properties.complexity || 1) / 20, 1.0);
    const outgoing = graph.getNeighbors(nodeId, 'downstream').length;
    const fanOutRisk = Math.min(outgoing / 10, 1.0);
    const gravity = node.properties.rank || 0;

    const weights = { gravity: 0.25, complexity: 0.35, entropy: 0.10, churn: 0.10, fanOut: 0.15 };

    const score = (gravity * weights.gravity) +
                 (complexityRisk * weights.complexity) +
                 (entropyRisk * weights.entropy) +
                 (churnRisk * weights.churn) +
                 (fanOutRisk * weights.fanOut);

    // WHY the score is what it is, in words.
    //
    // Both `explain` and `impact` have always printed `composite.factors` behind a truthiness
    // guard, and this — the implementation the registry actually wires — never returned the field.
    // So the guard never fired and the human-readable half of a risk report was silently absent for
    // every symbol, in every command, since the two implementations diverged. The DEAD one
    // (`MetricsService.calculateCompositeRisk`, zero callers) had the logic; deleting it without
    // moving this across would have destroyed the only copy (ADR 0112).
    const factors: string[] = [];
    if (gravity > 0.7) factors.push("High Structural Gravity (core system bridge)");
    if (entropyRisk > 0.6) factors.push("Unstable Ownership (high author entropy)");
    if (churnRisk > 0.5) factors.push("High Kinetic Churn (frequently modified)");
    if (outgoing > 8) factors.push(`God Object Candidate (fan-out ${outgoing})`);
    if ((node.properties.complexity || 0) > 50) factors.push("Critical Complexity (difficult to maintain)");

    return {
      score,
      factors,
      breakdown: {
        gravity,
        complexity: complexityRisk,
        entropy: entropyRisk,
        churn: churnRisk,
        fanOut: fanOutRisk
      }
    };
  }

  public async resonate(): Promise<void> {
    console.error("[Conducks] Pushing Structural Resonance Flow...");
    this.graph.resonate();
  }

  public async recalculateGravity(): Promise<void> {
    this.graph.resonate();
  }


  public getProcesses(): Record<string, string[]> { return this.flows.groupProcesses(); }

  public status(): any {
    const graph = this.graph.getGraph();
    const stats = graph.stats;
    const allMeta = graph.getAllMetadata();
    console.error(`[ConducksCore] Status metadata check:`, Array.from(allMeta.entries()));
    const lastCommit = chronicle.getLastPulsedCommit(graph) || "none";
    const currentHead = chronicle.getHeadHash();
    const isStale = currentHead && lastCommit !== "none" && currentHead !== lastCommit;
    const commitsBehind = isStale ? chronicle.getCommitsBehind(lastCommit) : 0;

    return {
      status: "ready",
      version: "2.0.0",
      framework: graph.getMetadata('framework') || "generic",
      staleness: {
        stale: isStale,
        lastAnalyzedCommit: lastCommit,
        currentHead: currentHead || "non-git",
        commitsBehind
      },
      stats: {
        nodeCount: stats.nodeCount,
        edgeCount: stats.edgeCount,
        density: (stats as any).density || 0
      }
    };
  }

  /**
   * Conducks — Active Staleness Verification
   */
  public checkStaleness(): { stale: boolean, commitsBehind: number, countUnavailable?: boolean } {
    const graph = this.graph.getGraph();
    const lastCommit = chronicle.getLastPulsedCommit(graph);
    if (!lastCommit) return { stale: false, commitsBehind: 0 };

    const currentHead = chronicle.getHeadHash();
    if (!currentHead) return { stale: false, commitsBehind: 0 };
    if (currentHead === lastCommit) return { stale: false, commitsBehind: 0 };

    // `null` from getCommitsBehind means git could not answer, which is NOT zero commits behind.
    // The index is still stale — HEAD differs from the last pulsed commit, which is how we got
    // here — so the staleness flag stands and only the count is unknown.
    const diff = chronicle.getCommitsBehind(lastCommit);
    return { stale: true, commitsBehind: diff ?? 0, countUnavailable: diff === null };
  }

  public audit(): any {
    const graph = this.graph.getGraph();
    const violations: string[] = [];
    // Reporting path: containment is not dependency (ADR 0010) and a type-only import is erased at
    // compile time (ADR 0016). This call site predates both and was still counting each as a cycle.
    const cycleDetectOptions = { ignoreTypes: IMPORT_CYCLE_IGNORED_EDGE_TYPES, ignoreTypeOnly: true };
    const cycles = graph.detectCycles(cycleDetectOptions);
    for (const cycle of cycles) {
      // F-03: same route-fabrication fix as governance's ARCH-3 violation (cycle-detector.ts).
      const report = CycleDetector.describeCluster(graph, cycle, cycleDetectOptions);
      violations.push(`ARCH-3: Circular (${cycle.length} node${cycle.length === 1 ? '' : 's'}): ${formatCycleCluster(report)}`);
    }
    return { success: violations.length === 0, violations };
  }
}

export const conducks = new Conducks();
