import { BlastRadiusAnalyzer } from "@/lib/domain/kinetic/impact.js";
import { ConducksComponent } from "@/registry/types.js";
import { SynapseRegistry } from "@/registry/synapse-registry.js";
import { AnalyzeOrchestrator } from "@/lib/domain/analysis/orchestrator.js";
import { PythonProvider } from "@/lib/core/parsing/languages/python/index.js";
import { TypeScriptProvider } from "@/lib/core/parsing/languages/typescript/index.js";
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
import { FallbackDetector } from "./fallback-detector.js";
import { ConducksNode } from "@/lib/core/graph/adjacency-list.js";
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
export class Conducks implements ConducksComponent {
  public readonly id = "conducks-core";
  public readonly type = "analyzer";
  public readonly version = "2.0.0";
  public readonly description = "The central structural intelligence engine of Conducks.";

  public graph = new ConducksGraph();
  public search = new ConducksSearch(this.graph.getGraph());
  public flows = new ConducksFlowEngine(this.graph.getGraph());
  private diffEngine = new ConducksDiffEngine();
  private gvr = new GVREngine();
  private gql = new GQLParser();
  private resonance = new ResonanceAnalyzer();
  private fallbackDetector = new FallbackDetector();
  private death = new DeadCodeAnalyzer();
  private advisor = new ConducksAdvisor();
  private aligner = new TestAligner();

  private orchestrator: AnalyzeOrchestrator;
  private registry = new SynapseRegistry<ConducksComponent>();
  private persistence: SynapsePersistence = new GraphPersistence();
  private linker = new GlobalSymbolLinker();

  constructor(options?: { baseDir?: string }) {
    if (options?.baseDir) {
      this.persistence = new GraphPersistence(options.baseDir);
    }
    this.orchestrator = new AnalyzeOrchestrator(this.registry, this.graph, this.aligner, this.persistence);
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
    // Conducks: High-Fidelity Resource Discovery
    const grammarDir = path.resolve(__dirname, "../../../resources/grammars");

    const wasmPath = path.join(grammarDir, "tree-sitter-python.wasm");
    if (!fs.existsSync(wasmPath)) {
      throw new Error(`Critical dependency missing: ${wasmPath}`);
    }

    console.error(`[ConducksCore] Loading grammar: ${wasmPath}`);
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

      chronicle.setProjectDir(projectRoot);
    }

    console.error(`[ConducksCore] Calling Orchestrator with ${files.length} units.`);
    try {
      await this.orchestrator.analyze(files);
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
    // CoChangeEngine creates TEMP tables — requires a read-write connection.
    // Only run during analyze (write mode); skip in all read-only contexts (MCP tools, CLI reads).
    if (!(this.persistence as any).readOnly && typeof (this.persistence as any).getRawConnection === 'function') {
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

    // Fallback pattern analysis
    const fallbackAnalysis = this.fallbackDetector.detectFallbackPatterns(node, graph);
    const fallbackRisk = this.calculateFallbackRisk(fallbackAnalysis, node);

    // Adjust weights when fallback is detected
    const isFallback = fallbackAnalysis.isFallback;
    const weights = isFallback ?
      { gravity: 0.15, complexity: 0.30, entropy: 0.10, churn: 0.10, fanOut: 0.10, fallback: 0.25 } :
      { gravity: 0.25, complexity: 0.35, entropy: 0.10, churn: 0.10, fanOut: 0.15, fallback: 0.05 };

    const score = (gravity * weights.gravity) +
                 (complexityRisk * weights.complexity) +
                 (entropyRisk * weights.entropy) +
                 (churnRisk * weights.churn) +
                 (fanOutRisk * weights.fanOut) +
                 (fallbackRisk * weights.fallback);

    return {
      score,
      breakdown: {
        gravity,
        complexity: complexityRisk,
        entropy: entropyRisk,
        churn: churnRisk,
        fanOut: fanOutRisk,
        fallback: fallbackRisk
      },
      fallbackAnalysis
    };
  }

  /**
   * Calculates fallback-specific risk factors
   */
  private calculateFallbackRisk(analysis: any, node: ConducksNode): number {
    if (!analysis.isFallback) return 0;

    let risk = 0;

    // High confidence fallback with low usage = high risk
    if (analysis.confidence > 0.7) {
      const usageRatio = analysis.patterns.usageRatio.ratio;
      risk += (1 - usageRatio) * 0.4; // Low usage increases risk
    }

    // Complex fallbacks are riskier to maintain
    const complexity = node.properties.complexity || 1;
    if (complexity > 10) {
      risk += Math.min((complexity - 10) / 20, 0.3);
    }

    // Long-tenured fallbacks with legacy naming
    const tenureDays = node.properties.tenureDays || 0;
    const hasLegacyNaming = analysis.patterns.namingPatterns.score > 0.5;
    if (tenureDays > 365 && hasLegacyNaming) {
      risk += 0.3;
    }

    return Math.min(risk, 1.0);
  }

  public async resonate(): Promise<void> {
    console.error("[Conducks] Pushing Structural Resonance Flow...");
    this.graph.resonate();
  }

  public async recalculateGravity(): Promise<void> {
    this.graph.resonate();
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
