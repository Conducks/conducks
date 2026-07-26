import { ConducksGraph } from "@/lib/core/graph/graph-engine.js";
import { SynapsePersistence } from "@/lib/core/persistence/persistence.js";
import { chronicle } from "@/lib/core/git/chronicle-interface.js";
import { AnalysisService, AnalyzeOrchestrator, Conducks } from "@/lib/domain/analysis/index.js";
import { MicroPulseService } from "@/lib/domain/analysis/micro-pulse.js";
import { KineticService } from "@/lib/domain/kinetic/index.js";
import { MetricsService, DeadCodeAnalyzer, ResonanceAnalyzer, TestAligner } from "@/lib/domain/metrics/index.js";
import { GovernanceService, ConducksAdvisor, ConducksSentinel, RegressionGuard } from "@/lib/domain/governance/index.js";
import { IntelligenceService, ConducksSearch, FederatedLinker } from "@/lib/domain/intelligence/index.js";
import { EvolutionService, GVREngine } from "@/lib/domain/evolution/index.js";
import { buildBoard, agentView } from "@/lib/domain/analysis/docs-board.js";
import { DocsWatcher } from "@/lib/domain/analysis/docs-watcher.js";
import { parseIstanbul, bindCoverage, type CovNode } from "@/lib/domain/analysis/coverage-bind.js";
import { FallbackDetector } from "@/lib/domain/analysis/fallback-detector.js";
import { GatewayService } from "@/lib/domain/analysis/gateway-service.js";
import { ConducksInstaller } from "@/lib/domain/federation/conducks-installer.js";
import { MCPConfigurator } from "@/lib/domain/federation/mcp-configurator.js";
import {
  defaultBaselinePath,
  saveBaseline,
  loadBaseline,
  diffAgainstBaseline,
  type CoverageResult,
  type CoverageSnapshot,
} from "@/lib/domain/analysis/coverage-baseline.js";
import { ManifestService, ManifestEngine } from "@/lib/domain/manifest/index.js";
import { MirrorEngine } from "@/lib/domain/visual/index.js";
import { SynapseRegistry } from "@/lib/core/registry/synapse-registry.js";
import { ConducksDiffEngine } from "@/lib/core/graph/diff-engine.js";
import { PYTHON_SUITE } from "@/lib/core/parsing/languages/python/index.js";
import { TYPESCRIPT_SUITE } from "@/lib/core/parsing/languages/typescript/index.js";
import { TSXProvider } from "@/lib/core/parsing/languages/tsx/index.js";
import { JavaScriptProvider } from "@/lib/core/parsing/languages/javascript/index.js";
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
import { Logger, logger } from "@/lib/core/utils/logger.js";
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
let persistence: SynapsePersistence = new SynapsePersistence(":memory:", true);
let ignoreManager = new IgnoreManager(process.cwd());

// 2. Bridge Layer (Registry Infrastructure)
const synapseRegistry = new SynapseRegistry();

// Dispatch is DERIVED from each provider's own `extensions` array (CONDUCKS-2 guarantees the field).
// The hand-written list this replaces had drifted from the providers: CPPProvider declares
// .cxx/.hxx but neither was registered, so once FS discovery started finding those files they were
// dispatched to nothing and silently dropped.
// List order = precedence: the FIRST provider to claim a pattern keeps it, which is why CPPProvider
// stays ahead of CProvider — both declare .h, and .h belonged to C++ in the hand-written list.
const tsxProvider = new TSXProvider();
const providerPrecedence = [
  PYTHON_SUITE.provider,
  TYPESCRIPT_SUITE.provider,
  tsxProvider,
  new JavaScriptProvider(),   // sole claimant of .js/.jsx — was never in this list; .js used to ride on the TS provider's claim
  new GoProvider(),
  new RustProvider(),
  new JavaProvider(),
  new CSharpProvider(),
  new CPPProvider(),
  new PHPProvider(),
  new RubyProvider(),
  new SwiftProvider(),
  new CProvider(),
];
const claimedPatterns = new Set<string>();
for (const provider of providerPrecedence) {
  for (const pattern of (provider as any).extensions ?? []) {
    if (claimedPatterns.has(pattern)) continue;
    claimedPatterns.add(pattern);
    synapseRegistry.registerProvider(pattern, provider);
  }
}
// No exceptions to the derivation: .js/.jsx resolve to JavaScriptProvider (their only claimant),
// matching what the worker path always did — both maps now agree by construction.

// 3. Domain Component Instantiation (Lazy/Updatable)
let search = new ConducksSearch(graph.getGraph());
let federation = new FederatedLinker(process.cwd());
const advisor = new ConducksAdvisor();
const sentinel = new ConducksSentinel();
const deadCode = new DeadCodeAnalyzer();
const resonance = new ResonanceAnalyzer();
const aligner = new TestAligner();
const diffEngine = new ConducksDiffEngine();
const manifestEngine = new ManifestEngine();
let mirrorEngine = new MirrorEngine(graph.getGraph());

// 4. Domain Facade Consolidation (Service Layer)
let orchestrator = new AnalyzeOrchestrator(synapseRegistry, graph, aligner, persistence, undefined, ignoreManager);
let microPulse = new MicroPulseService(synapseRegistry, persistence);
let analysis = new AnalysisService(orchestrator, graph, persistence);
let kinetic = new KineticService(graph.getGraph());
let metrics = new MetricsService(graph, deadCode, resonance, aligner);
let conducksCore = new Conducks();
(conducksCore as any).orchestrator = orchestrator;
(conducksCore as any).graph = graph;
(conducksCore as any).persistence = persistence;
let governance = new GovernanceService(graph.getGraph(), advisor, sentinel, persistence);
let intelligence = new IntelligenceService(search, federation);
let evolution = new EvolutionService(graph, persistence);
const manifest = new ManifestService(manifestEngine);
let docsWatcher: DocsWatcher | null = null;

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
        // Conducks Re-Anchoring 🏺 (Rule 11: Standardized Injection)
        orchestrator.setPersistence(p);
        microPulse.setPersistence(p);
        analysis.setPersistence(p);
        evolution.setPersistence(p);
        governance.setPersistence(p);
        (conducksCore as any).persistence = p;
      },
      updateIgnoreManager: (i) => {
        ignoreManager = i;
        (orchestrator as any).ignoreManager = i;
        evolution.setIgnoreManager(i);
      }
    }
  );

  // Sync Federation and Search after bootstrapper update
  const effectiveRoot = chronicle.getProjectDir();
  federation = new FederatedLinker(effectiveRoot);
  search = new ConducksSearch(graph.getGraph());
  intelligence = new IntelligenceService(search, federation);
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
    calculateCompositeRisk: (nodeId: string) => conducksCore.calculateCompositeRisk(nodeId),
    getCohesionVector: (sourceId: string, targetId: string) => metrics.getLevelSimilarity(sourceId, targetId),
    compare: (otherPath: string) => metrics.compare(otherPath)
  },
  audit: {
    audit: () => governance.audit(),
    advise: () => governance.advise(),
    status: () => governance.status(),
    guard: (threshold?: number) => governance.shouldBlock(threshold),
    rules: (root?: string) => governance.auditWithRules(root),
    // Composition-owned factories (ADR 0005): interfaces must not import domain directly.
    createSentinel: () => new ConducksSentinel(),
    createFallbackDetector: () => new FallbackDetector()
  },
  docs: {
    board: (root?: string) => buildBoard(root || chronicle.getProjectDir() || process.cwd()),
    // The agent projection: open threads + (optionally) the read-once constraint set.
    view: (root?: string, layer: "all" | "board" = "all", recent = 4) =>
      agentView(buildBoard(root || chronicle.getProjectDir() || process.cwd()), layer, recent),
    // One watcher per process: `mirror` and `watch` both ask for it, neither owns it.
    get watcher() {
      docsWatcher ??= new DocsWatcher(chronicle.getProjectDir() || process.cwd());
      return docsWatcher;
    }
  },
  coverage: {
    // Query BEHAVIOR node spans, then range-join the istanbul report onto them (domain logic).
    bind: async (covPath: string) => {
      const nodes = await persistence.query<CovNode>(
        `SELECT name, file, lineStart, lineEnd FROM nodes
         WHERE canonicalKind = 'BEHAVIOR' AND lineEnd > lineStart ORDER BY file, lineStart`
      );
      return bindCoverage(nodes, parseIstanbul(covPath));
    },
    defaultBaselinePath: (projectRoot?: string) => defaultBaselinePath(projectRoot),
    saveBaseline: (results: CoverageResult[], baselinePath?: string) => saveBaseline(results, baselinePath),
    loadBaseline: (baselinePath?: string) => loadBaseline(baselinePath),
    diffAgainstBaseline: (results: CoverageResult[], baseline: CoverageSnapshot) => diffAgainstBaseline(results, baseline)
  },
  federation: {
    createInstaller: (root: string) => new ConducksInstaller(root),
    createMCPConfigurator: () => new MCPConfigurator(),
    createLinker: (root: string) => new FederatedLinker(root)
  },
  infrastructure: {
    get graphEngine() { return graph; },
    get persistence() { return persistence; },
    get chronicle() { return chronicle; },
    get registry() { return synapseRegistry; },
    get logger() { return logger; },
    createLogger: (scope?: string) => new Logger(scope),
    createPersistence: (dbPath: string, readOnly?: boolean) => new SynapsePersistence(dbPath, readOnly)
  },
  mirror: {
    getVisualWave: (layers?: number[], clusters?: string[], spread?: number) => (mirrorEngine as any).getVisualWave(layers, clusters, spread),
    // Gateway is wired against the composition-owned graph + persistence singletons.
    createGateway: (projectRoot: string) => new GatewayService(graph, persistence, projectRoot)
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
