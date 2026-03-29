import { BlastRadiusAnalyzer } from "../lib/product/analysis/impact.js";
import { ConducksComponent } from "../lib/core/registry/types.js";
import { SynapseRegistry } from "../lib/core/registry/synapse-registry.js";
import { PulseOrchestrator } from "../lib/core/orchestrator.js";
import { PythonProvider } from "../lib/product/indexing/languages/python/index.js";
import { grammars } from "../lib/core/parser/grammar-registry.js";
import { GlobalSymbolLinker } from "../lib/core/graph/linker.js";
import { ConducksGraph } from "../lib/product/indexing/graph-engine.js";
import { ConducksSearch } from "../lib/product/indexing/search-engine.js";
import { ConducksFlowEngine } from "../lib/product/indexing/flow-engine.js";
import { GraphPersistence, SynapsePersistence } from "../lib/core/graph/persistence.js";
import { ConducksDiffEngine } from "../lib/core/graph/diff-engine.js";
import { GVREngine } from "../lib/core/algorithms/refactor/gvr-engine.js";
import { GQLParser } from "../lib/core/parser/gql-parser.js";
import { ResonanceAnalyzer } from "../lib/product/analysis/resonance.js";
import { DeadCodeAnalyzer } from "../lib/product/analysis/dead-code.js";
import { ApostleAdvisor } from "../lib/product/analysis/advisor.js";
import { CoChangeEngine } from "../lib/core/algorithms/cochange-engine.js";
import { calculateShannonEntropy, normalizeEntropyRisk } from "../lib/core/algorithms/entropy.js";
import { chronicle } from "../lib/core/git/chronicle-interface.js";
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
  private advisor = new ApostleAdvisor();
  
  private orchestrator: PulseOrchestrator;
  private registry = new SynapseRegistry<ConducksComponent>();
  private persistence: SynapsePersistence = new GraphPersistence();
  private linker = new GlobalSymbolLinker();
  
  constructor() {
    this.orchestrator = new PulseOrchestrator(this.registry, this.graph);
    this.setupDefaults();
  }

  private setupDefaults(): void {
    const impactAnalyzer = new BlastRadiusAnalyzer();
    this.registry.registerComponent(impactAnalyzer);

    // Apostle v6: The Gospel Core (Python Suite Only 💎)
    this.registry.registerProvider(".py", new PythonProvider());
  }

  /**
   * Orchestrates the Topological Structural Pulse (Apostle v6).
   * 
   * Parallelizes reflection by independent dependency batches to maximize 
   * structural throughput.
   */
  public async pulse(files: Array<{ path: string, source: string }>): Promise<void> {
    console.log("[Conducks] Initiating Apostle v6 'Structural Resonance' Pulse...");
    
    await this.persistence.load(this.graph.getGraph());
    await grammars.init(); 
    
    // Support both build/ (../../grammars) and src/ (../grammars)
    let grammarDir = path.resolve(__dirname, "../grammars");
    if (!fs.existsSync(grammarDir)) {
      grammarDir = path.resolve(__dirname, "../../grammars");
    }
    
    await grammars.loadLanguage("python", path.join(grammarDir, "tree-sitter-python.wasm"));

    // Delegate to the Orchestrator
    await this.orchestrator.executePulse(files);

    await this.persistence.save(this.graph.getGraph());
  }

  public query(query: string, options: { gql?: boolean } = {}) {
    if (options.gql) return this.gql.query(this.graph.getGraph(), query);
    return this.search.search(query);
  }

  public trace(startId: string) { return this.flows.trace(startId); }

  public getImpact(symbolId: string, depth: number = 3) {
    const analyzer = this.registry.getComponent("blast-radius-analyzer") as BlastRadiusAnalyzer;
    if (!analyzer) throw new Error("Conducks Error: Blast Radius Analyzer not found.");
    return analyzer.analyzeImpact(this.graph.getGraph(), symbolId, depth);
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
    const { risk: entropyRisk } = await this.calculateEntropy(nodeId);
    const resonance = await chronicle.getCommitResonance(node.properties.filePath);
    const churnRisk = Math.min(resonance.count / 100, 1.0);
    const outgoing = graph.getNeighbors(nodeId, 'downstream').length;
    const fanOutRisk = Math.min(outgoing / 10, 1.0);
    const gravity = node.properties.rank || 0;
    const score = (gravity * 0.3) + (entropyRisk * 0.3) + (churnRisk * 0.2) + (fanOutRisk * 0.2);
    return { score, breakdown: { gravity, entropy: entropyRisk, churn: churnRisk, fanOut: fanOutRisk } };
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
    return { status: "ready", version: "2.0.0", stats: { nodeCount: graph.stats.nodeCount, edgeCount: graph.stats.edgeCount } };
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
