import { ConducksGraph } from "@/lib/core/graph/graph-engine.js";
import { SynapsePersistence } from "@/lib/core/persistence/persistence.js";
import { chronicle } from "@/lib/core/git/index.js";
import { AnalysisService, AnalyzeOrchestrator, Conducks } from "@/lib/domain/analysis/index.js";
import { MicroPulseService } from "@/lib/domain/analysis/micro-pulse.js";
import { KineticService } from "@/lib/domain/kinetic/index.js";
import { MetricsService, DeadCodeAnalyzer, ResonanceAnalyzer, TestAligner } from "@/lib/domain/metrics/index.js";
import { GovernanceService, ConducksAdvisor, ConducksSentinel, RegressionGuard } from "@/lib/domain/governance/index.js";
import { measure as measureArch, detectServiceRoots, subgraphUnder } from "@/lib/domain/governance/arch-detect.js";
import { decide as decideArch } from "@/lib/domain/governance/arch-verdict.js";

/**
 * Where a DOOR lives, by convention. `interfaces/` is this repository's own; the rest are the
 * common spellings. A repo matching none of them gets "0 driving adapters" and the decision table
 * answers "no pattern detected, here is the shape" — which is the honest verdict, not a failure.
 */
const DEFAULT_INTERFACE_FRAGMENTS = ['/interfaces/', '/adapters/', '/apps/', '/cli/', '/api/', '/web/'];
import { IntelligenceService, ConducksSearch, FederatedLinker } from "@/lib/domain/intelligence/index.js";
import { EvolutionService, GVREngine } from "@/lib/domain/evolution/index.js";
import { buildBoard, agentView, governedCount, buildTrees } from "@/lib/domain/analysis/docs-board.js";
import { collectChanges, impactedSymbolIds } from "@/lib/domain/analysis/change-set.js";
import { lintVisuals, collectVisualPages, buildStamps, staleStamps, type VisualsViolation, type ReviewStamps } from "@/lib/domain/analysis/visuals-lint.js";
import { checkVisualsDrift, generatorCommandOf, type DriftResult } from "@/lib/domain/analysis/visuals-drift.js";
// Composition owns the domain/core surface the interfaces need (ADR 0005). Every import below
// exists because a CLI command or an MCP tool used to reach past this layer for it.
import { assessRoot, explainScope } from "@/lib/core/utils/index.js";
import { grammars } from "@/lib/core/parsing/grammar-registry.js";
import { UpdateCheck } from "@/lib/domain/federation/update-check.js";
import { ProjectRegistry } from "@/lib/domain/federation/project-registry.js";
import { ProjectMonitor } from "@/lib/domain/analysis/project-monitor.js";
import { buildFilterQuery, type QueryFilter } from "@/lib/domain/analysis/filter-builder.js";
import { DocsWatcher } from "@/lib/domain/analysis/docs-watcher.js";
import { parseIstanbul, bindCoverage, weightedPct, type CovNode } from "@/lib/domain/analysis/coverage-bind.js";
import { SourceLineReader } from "@/lib/core/utils/index.js";
import { firstLineOf } from "@/lib/core/parsing/doc-comments.js";
import { FallbackDetector } from "@/lib/domain/analysis/fallback-detector.js";
import { GatewayService } from "@/lib/domain/analysis/gateway-service.js";
import { ConducksInstaller } from "@/lib/domain/federation/conducks-installer.js";
import { installHook, type HookInstallResult } from "@/lib/domain/federation/hook-installer.js";
import { MCPConfigurator } from "@/lib/domain/federation/mcp-configurator.js";
import {
  defaultBaselinePath,
  saveBaseline,
  loadBaseline,
  diffAgainstBaseline,
  type CoverageResult,
  type CoverageSnapshot,
} from "@/lib/domain/analysis/coverage-baseline.js";
import { ManifestService, ManifestEngine, type TreeKind } from "@/lib/domain/manifest/index.js";
import { SynapseRegistry } from "@/lib/core/registry/synapse-registry.js";
import { ConducksDiffEngine } from "@/lib/core/graph/diff-engine.js";
import { ConducksAdjacencyList } from "@/lib/core/graph/adjacency-list.js";
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
import { Logger, logger } from "@/lib/core/utils/index.js";
import { RegistryBootstrapper } from "@/lib/core/registry-bootstrapper.js";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

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
    bootstrap: (root: string, name: string, kind?: TreeKind) => manifest.bootstrap(root, name, kind),
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
    // "What IS this codebase" — measurements first, then the decision table (ADR 0134, todo41#P3).
    // Composed HERE so the CLI names no domain module (ADR 0005).
    arch: (interfaceFragments?: string[]) => {
      const fragments = interfaceFragments ?? DEFAULT_INTERFACE_FRAGMENTS;
      const g = graph.getGraph();
      const m = measureArch(g, fragments);
      // A monorepo reports PER SERVICE (todo41#P4) — one verdict over seven apps is wrong by
      // construction. The whole-tree measurement still rides along as the shape.
      const services = detectServiceRoots(g).map(root => {
        const sub = subgraphUnder(g, root);
        const sm = measureArch(sub, fragments);
        return { root, measurements: sm, report: decideArch(sm) };
      });
      // With services detected, the whole-tree verdict stands down — its own caveat says one
      // verdict over N applications is wrong by construction. The shape still prints.
      const report = services.length >= 2 ? { verdicts: [], shape: decideArch(m).shape } : decideArch(m);
      return { measurements: m, report, services };
    },
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
    createFallbackDetector: () => new FallbackDetector()
  },
  docs: {
    board: (root?: string) => buildBoard(root || chronicle.getProjectDir() || process.cwd()),
    // Every tree — root plus each service (§7). `docs-lint`, `docs-status` and the MCP docs tool
    // all read the monorepo through this one call.
    trees: (root?: string, options?: { rootOnly?: boolean; only?: string }) =>
      buildTrees(root || chronicle.getProjectDir() || process.cwd(), options),
    // The agent projection: open threads + (optionally) the read-once constraint set.
    view: (root?: string, layer: "all" | "board" = "all", recent = 4) =>
      agentView(buildBoard(root || chronicle.getProjectDir() || process.cwd()), layer, recent),
    // Same projection over a board the caller already built — `trees()` returns one board per
    // tree, and re-deriving each from disk would parse the whole monorepo a second time.
    viewOf: (board: Parameters<typeof agentView>[0], layer: "all" | "board" = "all", recent = 4) =>
      agentView(board, layer, recent),
    // The denominator behind every claim a board makes. Exposed here rather than imported by the CLI
    // directly, because `cli -> domain` is a forbidden static edge and the boundary test enforces it.
    governedCount: (board: Parameters<typeof governedCount>[0]) => governedCount(board),
    // One watcher per process: `mirror` and `watch` both ask for it, neither owns it.
    get watcher() {
      docsWatcher ??= new DocsWatcher(chronicle.getProjectDir() || process.cwd());
      return docsWatcher;
    }
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
  /**
   * The visuals gate (ADR 0138). Separate from `docs` because it answers a different question with a
   * different source of truth: `docs` parses AUTHORED grammar, this checks DERIVED anchors against
   * the working tree. Discovery lives here — the lint itself takes its file list as an argument so it
   * stays pure, and so it can never be pointed at a stale graph by accident.
   */
  visuals: {
    lint: async (root?: string) => {
      const dir = root || chronicle.getProjectDir() || process.cwd();
      const pages = collectVisualPages(dir);
      if (pages.length === 0) return { violations: [] as VisualsViolation[], checked: 0, pagesWithAnchors: 0, pages: 0 };
      // The FILESYSTEM is ground truth, never the vault — a graph keyed to the last pulse describes a
      // tree that may no longer exist (ADR 0035), and a stale input makes this gate a false green.
      const abs = await chronicle.discoverFiles();
      const rel = abs
        .map(f => path.relative(dir, f))
        .filter(f => f.length > 0 && !f.startsWith('..'));
      const read = (p: string): string | null => {
        try { return fs.readFileSync(path.join(dir, p), 'utf8'); } catch { return null; }
      };
      return { ...lintVisuals(pages, rel, read), pages: pages.length };
    },
    /**
     * Review stamps (ADR 0141): stale = the cited span changed since the recorded stamp; stamp =
     * record every resolving anchor's span hash as reviewed-now. The store is `.conducks/
     * note-reviews.json` — beside `doc-reviews.json`, its module-level ancestor.
     */
    review: async (root?: string): Promise<{ flags: VisualsViolation[]; orphans: Array<{ page: string; key: string }>; stamped: number }> => {
      const dir = root || chronicle.getProjectDir() || process.cwd();
      const pages = collectVisualPages(dir);
      let stamps: ReviewStamps = {};
      try { stamps = JSON.parse(fs.readFileSync(path.join(dir, ".conducks", "note-reviews.json"), "utf8")); } catch { /* never stamped */ }
      const stamped = Object.values(stamps).reduce((n, a) => n + Object.keys(a).length, 0);
      if (stamped === 0) return { flags: [], orphans: [], stamped };
      const abs = await chronicle.discoverFiles();
      const rel = abs.map(f => path.relative(dir, f)).filter(f => f.length > 0 && !f.startsWith('..'));
      const read = (p: string): string | null => {
        try { return fs.readFileSync(path.join(dir, p), 'utf8'); } catch { return null; }
      };
      return { ...staleStamps(pages, rel, read, stamps), stamped };
    },
    /**
     * `only` (a page path) stamps ONE page's anchors, merged over the store — reviewing one note
     * must not assert a review of every other (ADR 0142). No `only` re-stamps everything, which is
     * an assertion the caller has to mean.
     */
    stamp: async (root?: string, only?: string): Promise<number> => {
      const dir = root || chronicle.getProjectDir() || process.cwd();
      const pages = collectVisualPages(dir);
      const abs = await chronicle.discoverFiles();
      const rel = abs.map(f => path.relative(dir, f)).filter(f => f.length > 0 && !f.startsWith('..'));
      const read = (p: string): string | null => {
        try { return fs.readFileSync(path.join(dir, p), 'utf8'); } catch { return null; }
      };
      const fresh = buildStamps(pages, rel, read, only);
      let stamps: ReviewStamps = fresh;
      if (only !== undefined) {
        try { stamps = JSON.parse(fs.readFileSync(path.join(dir, ".conducks", "note-reviews.json"), "utf8")); } catch { stamps = {}; }
        if (fresh[only]) stamps[only] = fresh[only]; else delete stamps[only];
      }
      fs.mkdirSync(path.join(dir, ".conducks"), { recursive: true });
      fs.writeFileSync(path.join(dir, ".conducks", "note-reviews.json"), JSON.stringify(stamps, null, 2) + "\n");
      return Object.values(fresh).reduce((n, a) => n + Object.keys(a).length, 0);
    },
    /**
     * The generator-drift half of the gate (ADR 0139): re-run the repo's DECLARED generator and diff
     * `docs/visuals/` byte-for-byte. `skipped` when the repo declares none — most repos never will,
     * and the CLI says so rather than passing silently.
     */
    drift: async (root?: string): Promise<DriftResult & { command: string | null; derivedHeaderMissing?: string[] }> => {
      const dir = root || chronicle.getProjectDir() || process.cwd();
      let confText: string | null = null;
      try { confText = fs.readFileSync(path.join(dir, "conducks.json"), "utf8"); } catch { /* no declaration */ }
      const command = generatorCommandOf(confText);
      if (!command) return { status: "skipped", reason: "no visuals.generate declared in conducks.json", command: null };

      const { execSync } = await import("node:child_process");
      const io = {
        listFiles: (base: string): string[] => {
          const out: string[] = [];
          const walk = (d: string, rel: string): void => {
            let entries: string[] = [];
            try { entries = fs.readdirSync(d); } catch { return; }
            for (const name of entries.sort()) {
              const abs = path.join(d, name);
              let isDir = false;
              try { isDir = fs.statSync(abs).isDirectory(); } catch { continue; }
              if (isDir) walk(abs, path.join(rel, name));
              else out.push(path.join(rel, name));
            }
          };
          walk(base, "");
          return out;
        },
        read: (abs: string): Buffer | null => { try { return fs.readFileSync(abs); } catch { return null; } },
        write: (abs: string, data: Buffer): void => { fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, data); },
        remove: (abs: string): void => { try { fs.rmSync(abs); } catch { /* already gone */ } },
        run: (cmd: string, cwd: string): { ok: true } | { ok: false; output: string } => {
          try { execSync(cmd, { cwd, stdio: "pipe" }); return { ok: true }; }
          catch (e: any) {
            const output = [e?.stdout?.toString(), e?.stderr?.toString()].filter(Boolean).join("") || String(e?.message ?? e);
            return { ok: false, output };
          }
        },
      };
      const result = { ...checkVisualsDrift(dir, command, io), command };
      // A repo that declares a generator has DERIVED pages, and every one must say so in its own
      // text — ADR 0011's failure mode (edit the render, the next render discards the edit) returns
      // the moment renders exist. Warn-only until the reference project's templates carry the
      // header (todo47); the drift check itself already guards the content.
      // A page may instead declare itself hand-written (`Provenance: hand-written` / `authored`) —
      // not everything in a generated tree is generated, and warning the five hand-maintained pages
      // teaches everyone to ignore the warning.
      const derivedHeaderMissing = collectVisualPages(dir)
        .filter(p => !/\.md$/i.test(p.path)
          && !/\bDERIVED\b/.test(p.text)
          && !/provenance\b\W{0,4}(?:<\/?\w+>)?\W{0,4}(?:authored|hand-written)\b/i.test(p.text))
        .map(p => p.path);
      return { ...result, derivedHeaderMissing };
    },
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
    // The pre-commit gates, installed by the tool that owns them (todo46). `cliPath` is this very
    // process's entry script, so the hook always points at the build that installed it.
    installHook: (root: string, force = false): HookInstallResult =>
      installHook(root, process.argv[1], force),
    createMCPConfigurator: () => new MCPConfigurator(),
    createLinker: (root: string) => new FederatedLinker(root),
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
      // flows, symbol-not-found — with no error anywhere. That is CONDUCKS-13 at full size, and it
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
    get registry() { return synapseRegistry; },
    get logger() { return logger; },
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
