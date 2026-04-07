import { ConducksGraph } from "@/lib/core/graph/graph-engine.js";
import { DuckDbPersistence, SynapsePersistence } from "@/lib/core/persistence/persistence.js";
import { chronicle } from "@/lib/core/git/chronicle-interface.js";
import { AnalysisService, AnalyzeOrchestrator } from "@/lib/domain/analysis/index.js";
import { MicroPulseService } from "@/lib/domain/analysis/micro-pulse.js";
import { KineticService } from "@/lib/domain/kinetic/index.js";
import { MetricsService, DeadCodeAnalyzer, ResonanceAnalyzer, TestAligner } from "@/lib/domain/metrics/index.js";
import { GovernanceService, ConducksAdvisor, ConducksSentinel, ContextGenerator, BlueprintGenerator, GuidanceOracle, RegressionGuard } from "@/lib/domain/governance/index.js";
import { IntelligenceService, ConducksSearch, GQLParser, FederatedLinker } from "@/lib/domain/intelligence/index.js";
import { EvolutionService, GVREngine } from "@/lib/domain/evolution/index.js";
import { ManifestService, ManifestEngine } from "@/lib/domain/manifest/index.js";
import { MirrorEngine } from "@/lib/domain/visual/index.js";
import { SynapseRegistry } from "@/registry/synapse-registry.js";
import { ConducksDiffEngine } from "@/lib/core/graph/diff-engine.js";
import { PYTHON_SUITE } from "@/lib/core/parsing/languages/python/index.js";
import { TYPESCRIPT_SUITE } from "@/lib/core/parsing/languages/typescript/index.js";
import { GoProvider } from "@/lib/core/parsing/languages/go/index.js";
import { IgnoreManager } from "@/lib/core/parsing/ignore-manager.js";
import { RustProvider } from "@/lib/core/parsing/languages/rust/index.js";
import { JavaProvider } from "@/lib/core/parsing/languages/java/index.js";
import { CSharpProvider } from "@/lib/core/parsing/languages/csharp/index.js";
import { CPPProvider } from "@/lib/core/parsing/languages/cpp/index.js";
import { PHPProvider } from "@/lib/core/parsing/languages/php/index.js";
import { RubyProvider } from "@/lib/core/parsing/languages/ruby/index.js";
import { SwiftProvider } from "@/lib/core/parsing/languages/swift/index.js";
import { CProvider } from "@/lib/core/parsing/languages/c/index.js";
import { Logger } from "@/lib/core/utils/logger.js";
import { RegistryBootstrapper } from "@/lib/core/registry-bootstrapper.js";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const resourcesDir = path.resolve(__dirname, "../resources/grammars");

// No logic allowed here as per Rule 11.

/**
 * Conducks — Master Registry (The v1.9.0 Bridge Layer) 🛡️ 🧠 💎
 *
 * Final structural realignment. The Registry is now a 100% logic-free
 * composition point that wires 8 domain facades into a unified bridge.
 */

const events = new EventEmitter();
events.setMaxListeners(50); // High-fidelity resonance support

// 1. Core Capability Layer (Infrastructure - Lazy Anchor)
const bootstrapper = new RegistryBootstrapper();
const graph = new ConducksGraph();

// These will be firmed up during initializeRegistry() call.
let persistence: SynapsePersistence = new DuckDbPersistence(":memory:", true);
let ignoreManager = new IgnoreManager(process.cwd());

// 2. Bridge Layer (Registry Infrastructure)
const synapseRegistry = new SynapseRegistry();
synapseRegistry.registerProvider('.py', PYTHON_SUITE.provider);
synapseRegistry.registerProvider('.ts', TYPESCRIPT_SUITE.provider);
synapseRegistry.registerProvider('.tsx', TYPESCRIPT_SUITE.provider);
synapseRegistry.registerProvider('.js', TYPESCRIPT_SUITE.provider);
synapseRegistry.registerProvider('.jsx', TYPESCRIPT_SUITE.provider);
synapseRegistry.registerProvider('.go', new GoProvider());
synapseRegistry.registerProvider('.rs', new RustProvider());
synapseRegistry.registerProvider('.java', new JavaProvider());
synapseRegistry.registerProvider('.cs', new CSharpProvider());
synapseRegistry.registerProvider('.cpp', new CPPProvider());
synapseRegistry.registerProvider('.h', new CPPProvider());
synapseRegistry.registerProvider('.hpp', new CPPProvider());
synapseRegistry.registerProvider('.cc', new CPPProvider());
synapseRegistry.registerProvider('.php', new PHPProvider());
synapseRegistry.registerProvider('.rb', new RubyProvider());
synapseRegistry.registerProvider('.rake', new RubyProvider());
synapseRegistry.registerProvider('.swift', new SwiftProvider());
synapseRegistry.registerProvider('.c', new CProvider());

// 3. Domain Component Instantiation (Lazy/Updatable)
let search = new ConducksSearch(graph.getGraph());
const gql = new GQLParser();
let federation = new FederatedLinker(process.cwd());
const advisor = new ConducksAdvisor();
const sentinel = new ConducksSentinel();
const deadCode = new DeadCodeAnalyzer();
const resonance = new ResonanceAnalyzer();
const aligner = new TestAligner();
const diffEngine = new ConducksDiffEngine();
const manifestEngine = new ManifestEngine();
const contextGenerator = new ContextGenerator();
const blueprint = new BlueprintGenerator();
const oracle = new GuidanceOracle();
let mirrorEngine = new MirrorEngine(graph.getGraph());

// 4. Domain Facade Consolidation (Service Layer)
let orchestrator = new AnalyzeOrchestrator(synapseRegistry, graph, aligner, persistence, undefined, ignoreManager);
let microPulse = new MicroPulseService(synapseRegistry, persistence);
let analysis = new AnalysisService(orchestrator, graph, persistence, contextGenerator);
let kinetic = new KineticService(graph.getGraph());
let metrics = new MetricsService(graph, deadCode, resonance, aligner);
let governance = new GovernanceService(graph.getGraph(), advisor, sentinel, contextGenerator, blueprint, persistence);
let intelligence = new IntelligenceService(graph, search, gql, federation);
let evolution = new EvolutionService(graph, persistence);
const manifest = new ManifestService(manifestEngine);

// 5. Lifecycle Management
export async function initializeRegistry(readOnly: boolean = true, root?: string, lazy: boolean = readOnly) {
  await bootstrapper.initialize(
    { readOnly, root, lazy },
    {
      graph,
      persistence,
      ignoreManager,
      federation,
      updatePersistence: (p: SynapsePersistence) => { 
        persistence = p; 
        // Apostolic Re-Anchoring 🏺 (Rule 11: Standardized Injection)
        orchestrator.setPersistence(p);
        microPulse.setPersistence(p);
        analysis.setPersistence(p);
        evolution.setPersistence(p);
        governance.setPersistence(p);
      },
      updateIgnoreManager: (i) => { 
        ignoreManager = i;
        (orchestrator as any).ignoreManager = i;
      }
    }
  );

  // Sync Federation and Search after bootstrapper update
  const effectiveRoot = chronicle.getProjectDir();
  federation = new FederatedLinker(effectiveRoot);
  search = new ConducksSearch(graph.getGraph());
  intelligence = new IntelligenceService(graph, search, gql, federation);
}

/**
 * The Unified Registry Singleton (The v1.9.0 Bridge)
 */
/**
 * The Unified Registry Singleton (Conducks Production Standard)
 */
export const registry = {
  events: events,
  status: {
    bootstrap: (root: string, name: string) => manifest.bootstrap(root, name),
    record: (root: string, name: string, type: string, content: string) => manifest.record(root, name, type, content),
    health: () => governance.status()
  },
  analyze: {
    analyze: (files: any[]) => {
      (orchestrator as any).persistence = persistence;
      (orchestrator as any).ignoreManager = ignoreManager;
      return orchestrator.analyze(files);
    },
    full: (options: any = {}) => {
      (orchestrator as any).persistence = persistence;
      (orchestrator as any).ignoreManager = ignoreManager;
      return analysis.analyze(options);
    },
    resonate: (filePath: string) => microPulse.resonate(filePath),
    get query() { return analysis.query; }
  },
  kinetic: {
    trace: (symbolId: string, depth?: number) => kinetic.trace(symbolId, depth),
    findPath: (startId: string, targetId: string) => kinetic.findPath(startId, targetId),
    getImpact: (symbolId: string, direction: 'upstream'|'downstream' = 'upstream', depth: number = 5) =>
      kinetic.getImpact(symbolId, direction, depth),
    flow: (symbolId: string) => kinetic.flow(symbolId),
    getProcesses: () => kinetic.getProcesses()
  },
  query: {
    query: (q: string, limit?: number) => intelligence.query(q, limit),
    parseGQL: (query: string) => intelligence.parseGQL(query),
    link: (projectPath: string) => intelligence.link(projectPath),
    resonate: () => graph.resonate(),
    get graph() { return graph; },
    get diff() { return diffEngine; }
  },
  rename: {
    rename: (symbolId: string, newName: string, dryRun?: boolean) => evolution.rename(symbolId, newName, dryRun),
    get watcher() { return evolution.getWatcher(chronicle.getProjectDir()); }
  },
  explain: {
    prune: () => metrics.prune(),
    calculateEntropy: (symbolId: string) => metrics.calculateEntropy(symbolId),
    calculateCompositeRisk: (nodeId: string) => metrics.calculateCompositeRisk(nodeId),
    getCohesionVector: (sourceId: string, targetId: string) => metrics.getLevelSimilarity(sourceId, targetId),
    compare: (otherPath: string) => metrics.compare(otherPath)
  },
  audit: {
    audit: () => governance.audit(),
    advise: () => governance.advise(),
    context: () => governance.generateContext(persistence),
    contextFile: () => governance.generateManifest(persistence),
    blueprint: () => governance.generateBlueprint(),
    status: () => governance.status(),
    guard: (threshold?: number) => governance.shouldBlock(threshold)
  },
  oracle: {
    bootstrap: () => oracle.bootstrap(),
    list: () => oracle.listSkills(),
    get: (id: string) => oracle.getSkill(id)
  },
  infrastructure: {
    get graphEngine() { return graph; },
    get persistence() { return persistence; },
    get chronicle() { return chronicle; },
    get registry() { return synapseRegistry; }
  },
  mirror: {
    getVisualWave: (layers?: number[], clusters?: string[], spread?: number) => (mirrorEngine as any).getVisualWave(layers, clusters, spread)
  },
  evolution: {
    rename: (symbolId: string, newName: string, dryRun?: boolean) => evolution.rename(symbolId, newName, dryRun),
    compare: (prevPulseId?: string) => evolution.compare(prevPulseId),
    audit: (window?: number) => evolution.audit(window),
    get watcher() { return evolution.getWatcher(chronicle.getProjectDir()); }
  },
  initialize: initializeRegistry
};

export type Registry = typeof registry;
