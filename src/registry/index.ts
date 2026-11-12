import { ConducksGraph } from "@/lib/core/graph/index.js";
import { SynapsePersistence } from "@/lib/core/persistence/index.js";
import { chronicle, anchorChronicle } from "@/lib/core/git/index.js";
import { AnalysisService, AnalyzeOrchestrator, Conducks, induceVirtualTargets } from "@/lib/domain/analysis/index.js";
import { MicroPulseService } from "@/lib/domain/analysis/index.js";
import { KineticService } from "@/lib/domain/kinetic/index.js";
import { MetricsService } from "@/lib/domain/metrics/index.js";
import { GovernanceService, ConducksAdvisor, ConducksSentinel } from "@/lib/domain/governance/index.js";

import { IntelligenceService, ConducksSearch } from "@/lib/domain/intelligence/index.js";
import { FederatedLinker } from "@/lib/core/graph/index.js";
import { EvolutionService, DeadCodeAnalyzer } from "@/lib/domain/evolution/index.js";
import { collectChanges, impactedSymbolIds } from "@/lib/domain/analysis/index.js";
// Composition owns the domain/core surface the interfaces need (ADR 0005). Every import below
// exists because a CLI command or an MCP tool used to reach past this layer for it.
import { assessRoot, explainScope } from "@/lib/core/utils/index.js";
import { grammars } from "@/lib/core/parsing/index.js";
import { UpdateCheck } from "@/lib/domain/federation/index.js";
import { ProjectRegistry } from "@/lib/domain/federation/index.js";
import { ProjectMonitor } from "@/lib/domain/analysis/index.js";
import { buildFilterQuery, type QueryFilter } from "@/lib/domain/analysis/index.js";
import { parseIstanbul, bindCoverage, weightedPct, type CovNode } from "@/lib/domain/coverage/index.js";
import { SourceLineReader } from "@/lib/core/utils/index.js";
import { firstLineOf } from "@/lib/core/parsing/index.js";
import { GatewayService } from "@/lib/domain/mirror/index.js";
import { ConducksInstaller } from "@/lib/domain/federation/index.js";
import { MCPConfigurator } from "@/lib/domain/federation/index.js";
import {
  defaultBaselinePath,
  saveBaseline,
  loadBaseline,
  diffAgainstBaseline,
  type CoverageResult,
  type CoverageSnapshot,
} from "@/lib/domain/coverage/index.js";
import { SynapseRegistry } from "@/lib/core/registry/index.js";
import { ConducksDiffEngine } from "@/lib/core/graph/index.js";
import { ConducksAdjacencyList } from "@/lib/core/graph/index.js";
import { PYTHON_SUITE } from "@/lib/core/parsing/index.js";
import { TYPESCRIPT_SUITE } from "@/lib/core/parsing/index.js";
import { TSXProvider } from "@/lib/core/parsing/index.js";
import { JavaScriptProvider } from "@/lib/core/parsing/index.js";
import { GoProvider } from "@/lib/core/parsing/index.js";
import { IgnoreManager } from "@/lib/core/parsing/index.js";
import { RustProvider } from "@/lib/core/parsing/index.js";
import { JavaProvider } from "@/lib/core/parsing/index.js";
import { CSharpProvider } from "@/lib/core/parsing/index.js";
import { CPPProvider } from "@/lib/core/parsing/index.js";
import { PHPProvider } from "@/lib/core/parsing/index.js";
import { RubyProvider } from "@/lib/core/parsing/index.js";
import { SwiftProvider } from "@/lib/core/parsing/index.js";
import { CProvider } from "@/lib/core/parsing/index.js";
import { Logger, logger, setProcessQuiet } from "@/lib/core/utils/index.js";
import { RegistryBootstrapper } from "@/lib/core/bootstrap/index.js";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

/** Tool calls holding the shared vault open. Closing under a non-zero count kills live queries. */
let vaultHolders = 0;
let ignoreManager = new IgnoreManager(process.cwd());

// 2. Bridge Layer (Registry Infrastructure)
const synapseRegistry = new SynapseRegistry();

// Dispatch is DERIVED from each provider's own `extensions` array (docs/visuals/modules/core/parsing.md guarantees the field).
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
let federation = new FederatedLinker(process.cwd(), undefined, (path: string) => new SynapsePersistence(path, true));
const advisor = new ConducksAdvisor();
const sentinel = new ConducksSentinel();
const deadCode = new DeadCodeAnalyzer();
const diffEngine = new ConducksDiffEngine();

// 4. Domain Facade Consolidation (Service Layer)
let orchestrator = new AnalyzeOrchestrator(synapseRegistry, graph, persistence, undefined, ignoreManager);
let microPulse = new MicroPulseService(synapseRegistry, persistence);
let analysis = new AnalysisService(orchestrator, graph, persistence);
let kinetic = new KineticService(graph.getGraph());
let metrics = new MetricsService(graph, deadCode);
let conducksCore = new Conducks();
(conducksCore as any).orchestrator = orchestrator;
(conducksCore as any).graph = graph;
(conducksCore as any).persistence = persistence;
let governance = new GovernanceService(graph.getGraph(), advisor, sentinel, persistence);
let intelligence = new IntelligenceService(search, federation);
// The watcher re-states a saved file through the SAME pipeline a pulse uses, so its unit keeps its
// IMPORTS, DEPENDS_ON and directory link. Through the `orchestrator` binding, which a re-anchor replaces.
let evolution = new EvolutionService(graph, persistence,
  (g, res, allPaths, root, source) => orchestrator.restateUnit(g, res, allPaths, root, source),
  induceVirtualTargets);

/**
 * The one definition of the coverage overlay's node set: every BEHAVIOR node carrying a real line
 * span. `coverage` and `coverage-view` both need it, and `coverage-view` used to carry its own
 * identical copy of the SELECT so it could query once and re-bind on each file change. Two copies of
 * one rule is the condition under which the next fix reaches only one of them (ADR 0116).
 */
const coverageNodes = () => persistence.query<CovNode>(
  `SELECT name, file, lineStart, lineEnd FROM nodes
   WHERE canonicalKind = 'BEHAVIOR' AND lineEnd > lineStart ORDER BY file, lineStart`
);

// 5. Lifecycle Management
export async function initializeRegistry(readOnly: boolean = true, root?: string, lazy: boolean = readOnly) {
  await bootstrapper.initialize(
    { readOnly, root, lazy },
    {
      graph,
      persistence,
      ignoreManager,
      federationFor: (root: string) => {
        federation = new FederatedLinker(root, undefined, (path: string) => new SynapsePersistence(path, true));
        return federation;
      },
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

  // Search after the bootstrapper update. Federation is no longer rebuilt here: the bootstrapper
  // builds it for the anchored root BEFORE the first load hydrates from it (P-01-5).
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
    // The working-tree change set and the symbols it lands on — one implementation, reached by both
    // the `diff` CLI command and `conducks_diff`, which previously held drifting copies (todo53#P1).
    // Exposed here because `cli -> domain` is a forbidden static import.
    changeSet: (cwd: string) => collectChanges(cwd),
    impactedSymbols: (nodes: Parameters<typeof impactedSymbolIds>[0], changes: Parameters<typeof impactedSymbolIds>[1]) =>
      impactedSymbolIds(nodes, changes),
    get query() { return analysis.query; }
  },
  kinetic: {
    trace: (symbolId: string, depth?: number) => kinetic.trace(symbolId, depth),
    // Read straight after `trace`: it says whether that answer was the whole answer.
    lastTraceWasDepthBounded: () => kinetic.lastTraceWasDepthBounded(),
    findPath: (startId: string, targetId: string) => kinetic.findPath(startId, targetId),
    getImpact: (symbolId: string, direction: 'upstream'|'downstream' = 'upstream', depth: number = 5) =>
      kinetic.getImpact(symbolId, direction, depth),
    flow: (symbolId: string) => kinetic.flow(symbolId),
    // todo57: ONE context implementation. The CLI renders it with source lines, the tool spends a
    // token budget on it — both reach it here, which is what `paired-surfaces` requires.
    context: (symbolId: string, options?: { radius?: number; includeAtoms?: boolean }) =>
      kinetic.context(symbolId, options),
    getProcesses: () => kinetic.getProcesses()
  },
  query: {
    query: (q: string, limit?: number) => intelligence.query(q, limit),
    link: (projectPath: string) => intelligence.link(projectPath),
    resonate: () => graph.resonate(),
    get graph() { return graph; },
    get diff() { return diffEngine; },
    // Typed-filter compilation — the LOGIC routes through composition. Its vocabulary (the
    // error class, the limit constants) does not: it lives in `contracts`, which every layer may
    // import, because both sides need to name it. See contracts/types.ts.
    buildFilter: (filter: QueryFilter) => buildFilterQuery(filter),
  },
  explain: {
    prune: () => metrics.prune(),
    calculateEntropy: (symbolId: string) => metrics.calculateEntropy(symbolId),
    calculateCompositeRisk: (nodeId: string) => conducksCore.calculateCompositeRisk(nodeId)
  },
  audit: {
    audit: () => governance.audit(),
    advise: () => governance.advise(),
    status: () => governance.status(),
    // The same answer without materialising the graph — counts and metadata rows. Read paths use
    // this; `status()` stays for callers already holding a graph (todo21#P5).
    statusFromVault: () => governance.statusFromVault(),
    // Files-changed, which is a different question from commits-behind — see `checkWorkingTree`.
    checkWorkingTree: () => governance.checkWorkingTree(),
    guard: (threshold?: number) => governance.shouldBlock(threshold),
    rules: (root?: string) => governance.auditWithRules(root),
    // Composition-owned factories (ADR 0005): interfaces must not import domain directly.
    createSentinel: () => new ConducksSentinel(),
  },
  // Reading a stored `(file, line)` back into the LINE OF CODE, at answer time (ADR 0132). A fresh
  // reader per call so its cache — and its read count — is scoped to one answer rather than living
  // for the process; the whole point of the cache is "one read per file IN THIS ANSWER".
  source: {
    lineReader: () => new SourceLineReader(),
    // One line of a harvested doc, for a header (ADR 0133). Through composition because the CLI
    // may name no core module (ADR 0005), and because a vault-loaded node carries `doc` but not
    // the derived first line — that is computed, not stored.
    firstLineOf: (doc: string) => firstLineOf(doc),
  },
  coverage: {
    nodes: coverageNodes,
    weightedPct: (results: Parameters<typeof weightedPct>[0]) => weightedPct(results),
    // Query BEHAVIOR node spans, then range-join the istanbul report onto them (domain logic).
    bind: async (covPath: string) => bindCoverage(await coverageNodes(), parseIstanbul(covPath)),
    // The two halves, for a caller that queries its node set ONCE and re-binds a changing coverage
    // file against it — `coverage-view --watch`. It carried its own copy of both for that reason;
    // routing them through composition keeps one implementation without giving `cli` a domain
    // import, which the boundary gate refuses (ADR 0005, ADR 0048).
    parse: (covPath: string) => parseIstanbul(covPath),
    bindNodes: (nodes: CovNode[], parsed: ReturnType<typeof parseIstanbul>) => bindCoverage(nodes, parsed),
    defaultBaselinePath: (projectRoot?: string) => defaultBaselinePath(projectRoot),
    saveBaseline: (results: CoverageResult[], baselinePath?: string) => saveBaseline(results, baselinePath),
    loadBaseline: (baselinePath?: string) => loadBaseline(baselinePath),
    diffAgainstBaseline: (results: CoverageResult[], baseline: CoverageSnapshot) => diffAgainstBaseline(results, baseline)
  },
  federation: {
    createInstaller: (root: string) => new ConducksInstaller(root),
    createMCPConfigurator: () => new MCPConfigurator(),
    createLinker: (root: string) => new FederatedLinker(root, undefined, (path: string) => new SynapsePersistence(path, true)),
    createProjectRegistry: () => new ProjectRegistry(),
    createProjectMonitor: (projects: ProjectRegistry) => new ProjectMonitor(projects),
    createUpdateCheck: () => new UpdateCheck(),
  },
  infrastructure: {
    /**
     * Take a hold on the shared vault. It is closed only when the last holder releases it.
     *
     * The count lives HERE, with the object it protects, because there were three independent
     * closers in a single tool call — `hypertoon`'s wrapper, the handler's own `ensureAnchor` pair,
     * and `tool-registry`'s `finally`, which closed unconditionally and ignored the count entirely.
     * Whichever call finished first hung up the handle and the others returned
     * `Database was already closed` (ADR 0146, todo52#P2).
     *
     * It cannot live in `interfaces/tools/shared/anchor.ts`: the registry is composition and would
     * have to import the MCP layer to reach it, which `boundaries.test.ts` refuses — correctly, since
     * a vault hold is an infrastructure concern and MCP is merely one of its callers.
     */
    acquireVault: () => { vaultHolders++; },

    /** Release this holder's claim, closing the vault only when nothing else is reading. */
    releaseVault: async () => {
      vaultHolders = Math.max(0, vaultHolders - 1);
      if (vaultHolders > 0) return;
      await persistence?.close();
    },

    /** How many holders the vault currently has — for tests and diagnostics. */
    get vaultHolders() { return vaultHolders; },

    get graphEngine() {
      // A deferred graph reads as an EMPTY one, and every caller then reports zero nodes, zero
      // flows, symbol-not-found — with no error anywhere. That is the failure docs/visuals/modules/domain/governance.md warns against, at full size, and it
      // was measured: four of six MCP tools broke this way and three broke silently. Anything that
      // WALKS the graph must `await registry.infrastructure.ensureGraphLoaded()` first; this makes
      // forgetting a loud failure at the call site instead of a wrong answer downstream.
      if (bootstrapper.graphIsDeferred) {
        throw new Error(
          '🛡️ [Registry] The structural graph is not materialised. This path walks the graph, so it ' +
          'must `await registry.infrastructure.ensureGraphLoaded()` first — or answer from SQL, ' +
          'which is why the load is deferred (todo21#P5).');
      }
      return graph;
    },
    /**
     * Materialise the graph if `initialize({lazy})` deferred it.
     *
     * Anything that walks the graph calls this first. Anything that answers from SQL must not —
     * that is the entire point, and it is what keeps a read-only server off a 165 MB load it never
     * uses. The CURRENT persistence is passed in, because the connection the deferral was recorded
     * on may already be closed.
     */
    ensureGraphLoaded: () => bootstrapper.ensureGraphLoaded(persistence),
    /** Whether `initialize(readOnly, root)` would re-anchor — asked before taking the handle away (P-10-1). */
    wouldReanchor: (readOnly: boolean, root?: string) => {
      const d = bootstrapper.anchorDecision(persistence, readOnly, root);
      return d.rootChanged || d.modeChanged;
    },
    /** Whether the vault holds a newer pulse than the in-memory graph was loaded from (P-10-3). */
    graphIsStale: () => bootstrapper.graphIsStale(persistence),
    /** Drop the in-memory graph and defer a fresh load of the current root (P-10-3). */
    reloadGraph: () => bootstrapper.reloadGraph(graph),
    // The project root the bootstrapper WILL choose, available before persistence is created. The
    // CLI anchored the vault at `cwd` verbatim and the bootstrapper walked up independently, so one
    // directory inside a project the two disagreed: the vault was opened at `src/.conducks` — which
    // it created on the way — while the engine anchored at the repository (ADR 0116).
    discoverRoot: (startPath: string) => bootstrapper.discoverRoot(startPath),
    get persistence() { return persistence; },
    /**
     * Reclaim the vault if it has decayed enough to be worth the rewrite.
     *
     * DuckDB never reclaims deleted row versions, so a vault grows without bound as pulses purge
     * and re-insert. The check is one query (11 ms on a 246 MB vault) and the rewrite only runs
     * when it will actually pay — so a watcher can call this after every pulse and a healthy vault
     * costs almost nothing. Returns null when nothing was done.
     */
    reclaimVault: (minRatio = 3) => persistence.reclaimIfBloated(minRatio),
    get chronicle() { return chronicle; },
    /**
     * Point the process anchor at a root.
     *
     * `chronicle` above is handed out as `ReadOnlyChronicle` — the class minus its one mutator — so
     * none of the files holding it can move the anchor by accident (ADR 0150 rule 4). Moving it is
     * this, deliberately named and deliberately here: the CLI resolves a target directory and must
     * anchor to it, and `cli -> core` is not a legal edge (ADR 0005), so composition carries it.
     */
    anchorTo: (root: string) => anchorChronicle(root),
    get registry() { return synapseRegistry; },
    get logger() { return logger; },
    /**
     * Silence the process, or stop silencing it.
     *
     * Named here rather than reached through `logger`, because it is a decision about the PROCESS
     * and not about one sink (ADR 0150 rule 4). One caller: the CLI, per command.
     */
    setQuiet: (quiet: boolean) => setProcessQuiet(quiet),
    createLogger: (scope?: string) => new Logger(scope),
    createPersistence: (dbPath: string, readOnly?: boolean) => new SynapsePersistence(dbPath, readOnly),
    // An empty graph, for callers that need to reconstitute one (the chronoscopic diff loads two
    // historical pulses side by side). Exposed here because `cli -> core` is not a legal edge, and
    // the diff command was reaching around the contract with a dynamic import to get it — invisible
    // to the graph-based gate, which is precisely what ADR 0048 is about.
    createGraph: () => new ConducksAdjacencyList(),
    // `doctor` reports which parse path is live; `analyze` reports what it is about to walk.
    // Both are questions about the engine, asked before any engine work happens.
    isNativeGrammarAvailable: () => grammars.isNativeAvailable(),
    loadGrammar: (id: string) => grammars.loadLanguage(id),
    isGrammarUnavailable: (id: string) => grammars.isLanguageUnavailable(id),
    assessScope: (root: string) => assessRoot(root),
    explainScope: (scope: ReturnType<typeof assessRoot>) => explainScope(scope),
  },
  mirror: {
    // `getVisualWave` used to be exposed here from MirrorEngine, which walked the in-memory graph.
    // The wave is answered from SQL now (ADR 0054) and nothing called this facade member, so it is
    // gone with the engine rather than left as a second way to ask the same question.
    // Gateway is wired against the composition-owned graph + persistence singletons.
    createGateway: (projectRoot: string) => new GatewayService(graph, persistence, projectRoot, () => bootstrapper.reloadGraph(graph))
  },
  evolution: {
    compare: (prevPulseId?: string) => evolution.compare(prevPulseId),
    audit: (window?: number) => evolution.audit(window),
    get watcher() { return evolution.getWatcher(chronicle.getProjectDir()); },
    /** Stops every watcher this session started, which removes their liveness markers (ADR 0036). */
    stopWatchers: () => evolution.stopWatchers(),
  },
  initialize: initializeRegistry
};

export type Registry = typeof registry;

/** The span hash of a line range, for the graph command (the CLI reaches core only through the registry). */
export { spanHashOf } from "@/lib/core/utils/index.js";
