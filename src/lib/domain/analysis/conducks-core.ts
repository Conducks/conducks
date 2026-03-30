import { BlastRadiusAnalyzer } from "@/lib/domain/kinetic/impact.js";
import { ConducksComponent } from "@/registry/types.js";
import { SynapseRegistry } from "@/registry/synapse-registry.js";
import { PulseOrchestrator } from "@/lib/domain/analysis/orchestrator.js";
import { PythonProvider } from "@/lib/core/parsing/languages/python/index.js";
import { grammars } from "@/lib/core/parsing/grammar-registry.js";
import { GlobalSymbolLinker } from "@/lib/core/graph/linker.js";
import { ConducksGraph } from "@/lib/core/graph/graph-engine.js";
import { ConducksSearch } from "@/lib/domain/intelligence/search-engine.js";
import { ConducksFlowEngine } from "@/lib/domain/kinetic/flow-engine.js";
import { GraphPersistence, SynapsePersistence } from "@/lib/core/persistence/persistence.js";
import { ConducksDiffEngine } from "@/lib/core/graph/diff-engine.js";
import { GVREngine } from "@/lib/domain/evolution/gvr-engine.js";
import { GQLParser } from "@/lib/domain/intelligence/gql-parser.js";
import { ResonanceAnalyzer } from "@/lib/domain/metrics/resonance.js";
import { DeadCodeAnalyzer } from "@/lib/domain/evolution/dead-code.js";
import { ConducksAdvisor } from "@/lib/domain/governance/advisor.js";
import { CoChangeEngine } from "@/lib/core/algorithms/cochange-engine.js";
import { TestAligner } from "@/lib/domain/metrics/test-aligner.js";
import { calculateShannonEntropy, normalizeEntropyRisk } from "@/lib/core/algorithms/entropy.js";
import { chronicle } from "@/lib/core/git/chronicle-interface.js";
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
  private gql = new GQLParser();
  private resonance = new ResonanceAnalyzer();
  private death = new DeadCodeAnalyzer();
  private advisor = new ConducksAdvisor();
  private aligner = new TestAligner();

  private orchestrator: PulseOrchestrator;
  private registry = new SynapseRegistry<ConducksComponent>();
  private persistence: SynapsePersistence = new GraphPersistence();
  private linker = new GlobalSymbolLinker();

  constructor(options?: { baseDir?: string }) {
    if (options?.baseDir) {
      this.persistence = new GraphPersistence(options.baseDir);
    }
    this.orchestrator = new PulseOrchestrator(this.registry, this.graph);
    this.setupDefaults();
  }

  private setupDefaults(): void {
    const impactAnalyzer = new BlastRadiusAnalyzer();
    this.registry.registerComponent(impactAnalyzer);

    // Conducks: The Gospel Core (Python Suite Only 💎)
    this.registry.registerProvider(".py", new PythonProvider());
  }

  /**
   * Orchestrates the Topological Structural Pulse (Conducks).
   * 
   * Parallelizes reflection by independent dependency batches to maximize 
   * structural throughput.
   */
  public async pulse(files: Array<{ path: string, source: string }>): Promise<string> {
    console.log("[Conducks] Initiating Conducks 'Structural Resonance' Pulse...");

    console.error("[ConducksCore] Loading persistence...");
    await this.persistence.load(this.graph.getGraph());
    console.error("[ConducksCore] Persistence loaded.");

    console.error("[ConducksCore] Initializing grammars...");
    await grammars.init();
    console.error("[ConducksCore] Grammars initialized.");
    // Conducks: High-Fidelity Resource Discovery
    const grammarDir = path.resolve(__dirname, "../../resources/grammars");

    const wasmPath = path.join(grammarDir, "tree-sitter-python.wasm");
    if (!fs.existsSync(wasmPath)) {
      throw new Error(`Critical dependency missing: ${wasmPath}`);
    }

    console.error(`[ConducksCore] Loading grammar: ${wasmPath}`);
    await grammars.loadLanguage("python", wasmPath);
    console.error(`[ConducksCore] Grammar loaded.`);

    // Conducks: Kinetic Root Alignment
    if (files.length > 0) {
      const firstFile = files[0].path;
      // Heuristic: find the last 'stress_test' or 'stress_test_git' or use the directory
      const projectRoot = firstFile.includes('stress_test_git') ?
        firstFile.split('stress_test_git')[0] + 'stress_test_git' :
        firstFile.includes('stress_test') ?
          firstFile.split('stress_test')[0] + 'stress_test' :
          path.dirname(firstFile);

      chronicle.setProjectDir(projectRoot);
    }

    console.error(`[ConducksCore] Calling Orchestrator with ${files.length} units.`);
    try {
      await this.orchestrator.executePulse(files);
      const framework = (this.orchestrator as any).context.getFramework();
      if (framework) {
        this.graph.getGraph().setMetadata('framework', framework);
      }
      console.error(`[ConducksCore] Orchestrator call complete.`);
    } catch (e) {
      console.error(`[ConducksCore] Orchestrator FAILED: ${e}`);
      throw e;
    }

    // Conducks: Align Test Coverage
    this.aligner.align(this.graph.getGraph());

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

    return await this.persistence.save(this.graph.getGraph());
  }

  public query(query: string, options: { gql?: boolean } = {}) {
    if (options.gql) return this.gql.query(this.graph.getGraph(), query);
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

  public async compare(otherPath: string): Promise<any> {
    const otherGraph = new ConducksGraph();
    const otherPersistence = new GraphPersistence(otherPath);
    const success = await otherPersistence.load(otherGraph.getGraph());
    if (!success) throw new Error(`[Conducks] Failed to load structural signature for: ${otherPath}`);
    return this.resonance.analyzeResonance(this.graph.getGraph(), otherGraph.getGraph());
  }

  public prune(): any[] { return this.death.analyze(this.graph.getGraph()); }

  public async advise(): Promise<any[]> {
    let cochangeFindings: any[] = [];
    if (typeof (this.persistence as any).getRawConnection === 'function') {
      const db = await (this.persistence as any).getRawConnection();
      const engine = new CoChangeEngine();
      cochangeFindings = await engine.discoverHiddenCoupling(this.graph.getGraph(), db);
    }
    return this.advisor.analyze(this.graph.getGraph(), cochangeFindings);
  }

  public async calculateEntropy(symbolId: string): Promise<{ entropy: number, risk: number }> {
    const graph = this.graph.getGraph();
    const node = graph.getNode(symbolId);
    if (!node || !node.properties.filePath) return { entropy: 0, risk: 0 };
    const distribution = await chronicle.getAuthorDistribution(node.properties.filePath);
    const entropy = calculateShannonEntropy(distribution);
    const risk = normalizeEntropyRisk(entropy, Object.keys(distribution).length);
    return { entropy, risk };
  }

  public async calculateCompositeRisk(nodeId: string): Promise<any> {
    const graph = this.graph.getGraph();
    const node = graph.getNode(nodeId);
    if (!node) return null;

    // Leverage Conducks persistent signals
    const entropyRisk = node.properties.entropy || 0;
    const churnRisk = Math.min((node.properties.resonance || 0) / 100, 1.0);
    const complexityRisk = Math.min((node.properties.complexity || 1) / 20, 1.0);
    const outgoing = graph.getNeighbors(nodeId, 'downstream').length;
    const fanOutRisk = Math.min(outgoing / 10, 1.0);
    const gravity = node.properties.rank || 0;

    const score = (gravity * 0.25) + (complexityRisk * 0.35) + (entropyRisk * 0.1) + (churnRisk * 0.1) + (fanOutRisk * 0.15);
    return { score, breakdown: { gravity, complexity: complexityRisk, entropy: entropyRisk, churn: churnRisk, fanOut: fanOutRisk } };
  }

  public async resonate(): Promise<void> {
    console.log("[Conducks] Pushing Structural Resonance Flow...");
    this.graph.resonate();
    await this.persistence.save(this.graph.getGraph());
  }

  public async recalculateGravity(): Promise<void> {
    await this.resonate();
  }


  public getProcesses(): Record<string, string[]> { return this.flows.groupProcesses(); }

  public getCohesionVector(sourceId: string, targetId: string): number {
    const graph = this.graph.getGraph();
    const sN = new Set(graph.getNeighbors(sourceId, 'downstream').map(n => n.targetId));
    const tN = graph.getNeighbors(targetId, 'downstream').map(n => n.targetId);
    const intersection = tN.filter(n => sN.has(n));
    const union = new Set([...sN, ...tN]);
    return union.size === 0 ? 0 : (intersection.length / union.size);
  }

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
        lastPulsedCommit: lastCommit,
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
  public checkStaleness(): { stale: boolean, commitsBehind: number } {
    const graph = this.graph.getGraph();
    const lastCommit = chronicle.getLastPulsedCommit(graph);
    if (!lastCommit) return { stale: false, commitsBehind: 0 };

    const currentHead = chronicle.getHeadHash();
    if (!currentHead) return { stale: false, commitsBehind: 0 };
    if (currentHead === lastCommit) return { stale: false, commitsBehind: 0 };

    const diff = chronicle.getCommitsBehind(lastCommit);
    return { stale: true, commitsBehind: diff };
  }

  public audit(): any {
    const graph = this.graph.getGraph();
    const violations: string[] = [];
    const cycles = graph.detectCycles();
    for (const cycle of cycles) violations.push(`ARCH-3: Circular: ${cycle.join(" -> ")}`);
    return { success: violations.length === 0, violations };
  }

  public generateBlueprint(): string {
    const graph = this.graph.getGraph();
    let bp = `# CONDUCKS: BLUEPRINT 💎\n\n`;
    bp += `> Neurons: ${graph.stats.nodeCount}\n\n`;
    return bp;
  }
}

export const conducks = new Conducks();
