import { ConducksGraph } from "@/lib/core/graph/graph-engine.js";
import { GraphPersistence } from "@/lib/core/persistence/persistence.js";
import { chronicle } from "@/lib/core/git/chronicle-interface.js";
import { AnalysisService, PulseOrchestrator } from "@/lib/domain/analysis/index.js";
import { KineticService } from "@/lib/domain/kinetic/index.js";
import { MetricsService, DeadCodeAnalyzer, ResonanceAnalyzer, TestAligner } from "@/lib/domain/metrics/index.js";
import { GovernanceService, ConducksAdvisor, ConducksSentinel, ContextGenerator, BlueprintGenerator } from "@/lib/domain/governance/index.js";
import { IntelligenceService, ConducksSearch, GQLParser, FederatedLinker } from "@/lib/domain/intelligence/index.js";
import { EvolutionService, GVREngine } from "@/lib/domain/evolution/index.js";
import { ManifestService, ManifestEngine } from "@/lib/domain/manifest/index.js";
import { MirrorEngine } from "@/lib/domain/visual/index.js";
import { SynapseRegistry } from "@/registry/synapse-registry.js";
import { ConducksDiffEngine } from "@/lib/core/graph/diff-engine.js";
import { PYTHON_SUITE } from "@/lib/core/parsing/languages/python/index.js";
import { TYPESCRIPT_SUITE } from "@/lib/core/parsing/languages/typescript/index.js";
import { grammars } from "@/lib/core/parsing/grammar-registry.js";
import { IgnoreManager } from "@/lib/core/parsing/ignore-manager.js";
import { Logger, logger } from "@/lib/core/utils/logger.js";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const resourcesDir = path.resolve(__dirname, "../resources/grammars");

/**
 * Conducks — Master Registry (The v1.9.0 Bridge Layer) 🛡️ 🧠 💎
 *
 * Final structural realignment. The Registry is now a 100% logic-free
 * composition point that wires 8 domain facades into a unified bridge.
 */

// 1. Core Capability Layer (Infrastructure)
const workspaceRoot = process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
const graph = new ConducksGraph();
let persistence = new GraphPersistence(workspaceRoot);
let ignoreManager = new IgnoreManager(workspaceRoot);

// 2. Bridge Layer (Registry Infrastructure)
const synapseRegistry = new SynapseRegistry();
synapseRegistry.registerProvider('.py', PYTHON_SUITE.provider);
synapseRegistry.registerProvider('.ts', TYPESCRIPT_SUITE.provider);
synapseRegistry.registerProvider('.tsx', TYPESCRIPT_SUITE.provider);
synapseRegistry.registerProvider('.js', TYPESCRIPT_SUITE.provider);
synapseRegistry.registerProvider('.jsx', TYPESCRIPT_SUITE.provider);

// 3. Domain Component Instantiation
const search = new ConducksSearch(graph.getGraph());
const gql = new GQLParser();
const federation = new FederatedLinker(workspaceRoot);
const advisor = new ConducksAdvisor();
const sentinel = new ConducksSentinel();
const deadCode = new DeadCodeAnalyzer();
const resonance = new ResonanceAnalyzer();
const aligner = new TestAligner();
const diffEngine = new ConducksDiffEngine();
const manifestEngine = new ManifestEngine();
const contextGenerator = new ContextGenerator();
const blueprint = new BlueprintGenerator();
const mirrorEngine = new MirrorEngine(graph.getGraph());

// 4. Domain Facade Consolidation (Service Layer)
const analysisOrchestrator = new PulseOrchestrator(synapseRegistry, graph, aligner, persistence, undefined, ignoreManager);
const analysis = new AnalysisService(analysisOrchestrator, graph, persistence, contextGenerator);
const kinetic = new KineticService(graph.getGraph());
const metrics = new MetricsService(graph, deadCode, resonance, aligner);
const governance = new GovernanceService(graph.getGraph(), advisor, sentinel, contextGenerator, blueprint);
const intelligence = new IntelligenceService(graph, search, gql, federation);
const evolution = new EvolutionService(graph, persistence);
const manifest = new ManifestService(manifestEngine);

// 5. Lifecycle Management
let isGrammarInitialized = false;

export async function initializeRegistry(readOnly: boolean = true, root?: string) {
  if (!isGrammarInitialized) {
    console.error(`🛡️ [Conducks Registry] Initializing Grammar Engine...`);
    await grammars.init();
    await grammars.loadLanguage('python', path.join(resourcesDir, 'tree-sitter-python.wasm'));
    await grammars.loadLanguage('typescript', path.join(resourcesDir, 'tree-sitter-typescript.wasm'));
    isGrammarInitialized = true;
    console.error(`🛡️ [Conducks Registry] Grammar Engine Ready (Python, TypeScript indexed).`);
  }

  const effectiveRoot = root || process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
  
  // 🏺 💎 Anchor Structural Diagnostic Sink (v1.12.0)
  if (effectiveRoot !== ":memory:") {
    const logPath = path.join(effectiveRoot, '.conducks', 'mcp.log');
    logger.setLogFile(logPath);
  }

  console.error(`🛡️ [Conducks Registry] Anchoring structural synapse at: ${effectiveRoot}`);
  const isCurrentlyConnected = persistence.isConnected();
  const rootChanged = chronicle.getProjectDir() !== effectiveRoot;
  const modeChanged = (persistence as any).readOnly !== readOnly;

  if (isCurrentlyConnected && !rootChanged && !modeChanged) return;

  if (rootChanged || modeChanged || !isCurrentlyConnected) {
    if (isCurrentlyConnected) await persistence.close();
    
    // Conducks Purity: 🏺 💎 Explicitly clear the graph singleton 
    // when switching project roots to prevent structural ghost leaks.
    if (rootChanged) {
      graph.getGraph().clear();
    }

    persistence = new GraphPersistence(effectiveRoot, readOnly);
    chronicle.setProjectDir(effectiveRoot);
    ignoreManager = new IgnoreManager(effectiveRoot);
    (analysisOrchestrator as any).ignoreManager = ignoreManager;
  }
  
  try {
    const loaded = await persistence.load(graph.getGraph());
    if (loaded) {
      console.error(`🛡️ [Conducks Registry] Structural graph loaded (${graph.getGraph().stats.nodeCount} nodes).`);
      await federation.hydrate(graph.getGraph());
    } else {
      console.error(`🛡️ [Conducks Registry] No persisted structural wave detected.`);
    }
  } catch (err: any) {
    console.error(`🛡️ [Conducks Registry] Structural load failed: ${err.message}`);
  }
}

/**
 * The Unified Registry Singleton (The v1.9.0 Bridge)
 */
export const registry = {
  manifest: {
    bootstrap: (projectRoot: string, projectName: string) => new ManifestService(manifestEngine).bootstrap(projectRoot, projectName),
    record: (projectRoot: string, projectName: string, type: string, content: string) => new ManifestService(manifestEngine).record(projectRoot, projectName, type, content)
  },
  analysis: {
    pulse: (files: any[]) => {
      (analysisOrchestrator as any).persistence = persistence;
      (analysisOrchestrator as any).ignoreManager = ignoreManager;
      return analysisOrchestrator.pulse(files);
    },
    full: (options: any = {}) => {
      (analysisOrchestrator as any).persistence = persistence;
      (analysisOrchestrator as any).ignoreManager = ignoreManager;
      return new AnalysisService(analysisOrchestrator, graph, persistence, contextGenerator).pulse(options);
    }
  },
  kinetic: {
    trace: (symbolId: string, depth?: number) => new KineticService(graph.getGraph()).trace(symbolId, depth),
    findPath: (startId: string, targetId: string) => new KineticService(graph.getGraph()).findPath(startId, targetId),
    getImpact: (symbolId: string, direction: 'upstream'|'downstream' = 'upstream', depth: number = 5) =>
      new KineticService(graph.getGraph()).getImpact(symbolId, direction, depth),
    flow: (symbolId: string) => new KineticService(graph.getGraph()).flow(symbolId),
    getProcesses: () => new KineticService(graph.getGraph()).getProcesses()
  },
  intelligence: {
    query: (q: string, limit?: number) => new IntelligenceService(graph, search, gql, federation).query(q, limit),
    parseGQL: (query: string) => new IntelligenceService(graph, search, gql, federation).parseGQL(query),
    link: (projectPath: string) => new IntelligenceService(graph, search, gql, federation).link(projectPath),
    resonate: () => graph.resonate(),
    get graph() { return graph; },
    diff: diffEngine
  },
  evolution: {
    rename: (symbolId: string, newName: string, dryRun?: boolean) => new EvolutionService(graph, persistence).rename(symbolId, newName, dryRun),
    get watcher() { return new EvolutionService(graph, persistence).getWatcher(chronicle.getProjectDir()); }
  },
  metrics: {
    prune: () => new MetricsService(graph, deadCode, resonance, aligner).prune(),
    calculateEntropy: (symbolId: string) => new MetricsService(graph, deadCode, resonance, aligner).calculateEntropy(symbolId),
    calculateCompositeRisk: (nodeId: string) => new MetricsService(graph, deadCode, resonance, aligner).calculateCompositeRisk(nodeId),
    getCohesionVector: (sourceId: string, targetId: string) => new MetricsService(graph, deadCode, resonance, aligner).getLevelSimilarity(sourceId, targetId),
    compare: (otherPath: string) => new MetricsService(graph, deadCode, resonance, aligner).compare(otherPath)
  },
  infrastructure: {
    get graphEngine() { return graph; },
    get persistence() { return persistence; },
    get chronicle() { return chronicle; },
    get registry() { return synapseRegistry; }
  },
  governance: {
    audit: () => new GovernanceService(graph.getGraph(), advisor, sentinel, contextGenerator, blueprint).audit(),
    advise: () => new GovernanceService(graph.getGraph(), advisor, sentinel, contextGenerator, blueprint).advise(),
    context: () => new GovernanceService(graph.getGraph(), advisor, sentinel, contextGenerator, blueprint).generateContext(persistence),
    contextFile: () => new GovernanceService(graph.getGraph(), advisor, sentinel, contextGenerator, blueprint).generateManifest(persistence),
    blueprint: () => new GovernanceService(graph.getGraph(), advisor, sentinel, contextGenerator, blueprint).generateBlueprint(),
    status: () => new GovernanceService(graph.getGraph(), advisor, sentinel, contextGenerator, blueprint).status()
  },
  mirror: {
    getWave: (layers?: number[], clusters?: string[]) => (mirrorEngine as any).getVisualWave(layers, clusters)
  },
  initialize: initializeRegistry
};

export type Registry = typeof registry;
