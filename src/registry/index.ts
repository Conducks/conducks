import { ConducksGraph } from "@/lib/core/graph/graph-engine.js";
import { DuckDbPersistence, SynapsePersistence } from "@/lib/core/persistence/persistence.js";
import { chronicle } from "@/lib/core/git/chronicle-interface.js";
import { AnalysisService, AnalyzeOrchestrator } from "@/lib/domain/analysis/index.js";
import { KineticService } from "@/lib/domain/kinetic/index.js";
import { MetricsService, DeadCodeAnalyzer, ResonanceAnalyzer, TestAligner } from "@/lib/domain/metrics/index.js";
import { GovernanceService, ConducksAdvisor, ConducksSentinel, ContextGenerator, BlueprintGenerator, GuidanceOracle } from "@/lib/domain/governance/index.js";
import { IntelligenceService, ConducksSearch, GQLParser, FederatedLinker } from "@/lib/domain/intelligence/index.js";
import { EvolutionService, GVREngine } from "@/lib/domain/evolution/index.js";
import { ManifestService, ManifestEngine } from "@/lib/domain/manifest/index.js";
import { MirrorEngine } from "@/lib/domain/visual/index.js";
import { SynapseRegistry } from "@/registry/synapse-registry.js";
import { ConducksDiffEngine } from "@/lib/core/graph/diff-engine.js";
import { PYTHON_SUITE } from "@/lib/core/parsing/languages/python/index.js";
import { TYPESCRIPT_SUITE } from "@/lib/core/parsing/languages/typescript/index.js";
import { IgnoreManager } from "@/lib/core/parsing/ignore-manager.js";
import { Logger } from "@/lib/core/utils/logger.js";
import { RegistryBootstrapper } from "@/lib/core/registry-bootstrapper.js";
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

// 1. Core Capability Layer (Infrastructure)
const workspaceRoot = process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
const bootstrapper = new RegistryBootstrapper();
const graph = new ConducksGraph();
let persistence: SynapsePersistence = new DuckDbPersistence(workspaceRoot);
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
const oracle = new GuidanceOracle();
const mirrorEngine = new MirrorEngine(graph.getGraph());

// 4. Domain Facade Consolidation (Service Layer)
const orchestrator = new AnalyzeOrchestrator(synapseRegistry, graph, aligner, persistence, undefined, ignoreManager);
const analysis = new AnalysisService(orchestrator, graph, persistence, contextGenerator);
const kinetic = new KineticService(graph.getGraph());
const metrics = new MetricsService(graph, deadCode, resonance, aligner);
const governance = new GovernanceService(graph.getGraph(), advisor, sentinel, contextGenerator, blueprint);
const intelligence = new IntelligenceService(graph, search, gql, federation);
const evolution = new EvolutionService(graph, persistence);
const manifest = new ManifestService(manifestEngine);

// 5. Lifecycle Management
export async function initializeRegistry(readOnly: boolean = true, root?: string) {
  await bootstrapper.initialize(
    { readOnly, root },
    {
      graph,
      persistence,
      ignoreManager,
      federation,
      updatePersistence: (p) => { persistence = p; },
      updateIgnoreManager: (i) => { 
        ignoreManager = i;
        (orchestrator as any).ignoreManager = i;
      }
    }
  );
}

/**
 * The Unified Registry Singleton (The v1.9.0 Bridge)
 */
/**
 * The Unified Registry Singleton (Conducks Production Standard)
 */
export const registry = {
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
    }
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
    status: () => governance.status()
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
  initialize: initializeRegistry
};

export type Registry = typeof registry;
