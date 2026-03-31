import { ConducksGraph } from "@/lib/core/graph/graph-engine.js";
import { GraphPersistence } from "@/lib/core/persistence/persistence.js";
import { chronicle } from "@/lib/core/git/chronicle-interface.js";
import { PulseOrchestrator } from "@/lib/domain/analysis/orchestrator.js";
import { ConducksSearch } from "@/lib/domain/intelligence/search-engine.js";
import { ConducksAdvisor } from "@/lib/domain/governance/advisor.js";
import { ConducksFlowEngine } from "@/lib/domain/kinetic/flow-engine.js";
import { GVREngine } from "@/lib/domain/evolution/gvr-engine.js";
import { GQLParser } from "@/lib/domain/intelligence/gql-parser.js";
import { SynapseRegistry } from "@/registry/synapse-registry.js";
import { DeadCodeAnalyzer } from "@/lib/domain/evolution/dead-code.js";
import { ResonanceAnalyzer } from "@/lib/domain/metrics/resonance.js";
import { TestAligner } from "@/lib/domain/metrics/test-aligner.js";
import { ConducksDiffEngine } from "@/lib/core/graph/diff-engine.js";
import { BlastRadiusAnalyzer } from "@/lib/domain/kinetic/impact.js";
import { ConducksWatcher } from "@/lib/domain/evolution/watcher.js";
import { ContextGenerator } from "@/lib/domain/governance/context-generator.js";
import { essenceLens } from "@/lib/core/parsing/essence-lens.js";
import { PYTHON_SUITE } from "@/lib/core/parsing/languages/python/index.js";
import { TYPESCRIPT_SUITE } from "@/lib/core/parsing/languages/typescript/index.js";
import { grammars } from "@/lib/core/parsing/grammar-registry.js";
import { ManifestEngine } from "@/lib/domain/manifest/manifest-engine.js";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import { FederatedLinker } from "@/lib/core/graph/linker-federated.js";
import { Logger } from "@/lib/core/utils/logger.js";
import { calculateShannonEntropy, normalizeEntropyRisk } from "@/lib/core/algorithms/entropy.js";
import { MirrorEngine } from "@/lib/domain/mirror/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const resourcesDir = path.resolve(__dirname, "../resources/grammars");

/**
 * Conducks — Master Registry (The Bridge Layer)
 * 
 * Consistent with GUIDELINES SECTION 6 & 13.
 * Assembles core capabilities and domain services through explicit 
 * dependency injection.
 */

// 1. Instantiate Core Capability Layer
const workspaceRoot = process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
const graph = new ConducksGraph();
let persistence = new GraphPersistence(workspaceRoot);
const search = new ConducksSearch(graph.getGraph());
const flows = new ConducksFlowEngine(graph.getGraph());
const gvr = new GVREngine();
const gql = new GQLParser();
const advisor = new ConducksAdvisor();
const deadCode = new DeadCodeAnalyzer();
const resonance = new ResonanceAnalyzer();
const aligner = new TestAligner();
const diffEngine = new ConducksDiffEngine();
const impactAnalyzer = new BlastRadiusAnalyzer();
const contextGenerator = new ContextGenerator();
const manifest = new ManifestEngine();
const mirror = new MirrorEngine(graph.getGraph());

// 2. Instantiate Bridge Layer Registry (for dynamic plugins)
const synapseRegistry = new SynapseRegistry();
synapseRegistry.registerProvider('.py', PYTHON_SUITE.provider);
synapseRegistry.registerProvider('.ts', TYPESCRIPT_SUITE.provider);
synapseRegistry.registerProvider('.tsx', TYPESCRIPT_SUITE.provider);
synapseRegistry.registerProvider('.js', TYPESCRIPT_SUITE.provider);
synapseRegistry.registerProvider('.jsx', TYPESCRIPT_SUITE.provider);

// Conducks: Lazy Structural Reflection (Load Python Wasm)
let isGrammarInitialized = false;
const logger = new Logger("Registry");

/**
 * Initializes the Structural Intelligence Layer.
 * Must be called by entry points (CLI, Tools) before execution.
 * 
 * @param readOnly Whether to open the database in read-only mode.
 * @param root Optional workspace root to override the default process.cwd().
 */
export async function initializeRegistry(readOnly: boolean = true, root?: string) {
  // 1. One-time Grammar Initialization (Phase 3.1)
  if (!isGrammarInitialized) {
    await grammars.init();
    await grammars.loadLanguage('python', path.join(resourcesDir, 'tree-sitter-python.wasm'));
    await grammars.loadLanguage('typescript', path.join(resourcesDir, 'tree-sitter-typescript.wasm'));
    isGrammarInitialized = true;
  }

  // 2. Structural Persistence Lifecycle (Lazy Resilience)
  const effectiveRoot = root || process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
  
  // Re-initialization Check: Mode/Root change (Consistency Fix)
  const isCurrentlyConnected = persistence.isConnected();
  const rootChanged = chronicle.getProjectDir() !== effectiveRoot;
  const modeChanged = (persistence as any).readOnly !== readOnly;

  if (isCurrentlyConnected && !rootChanged && !modeChanged) {
    return; // Already anchored and correctly connected
  }

  if (rootChanged || modeChanged || !isCurrentlyConnected) {
    if (isCurrentlyConnected) {
      await persistence.close();
    }
    
    logger.info(`${modeChanged ? 'Switching to' : 'Initializing'} ${readOnly ? 'READ_ONLY' : 'WRITER'} mode at: ${effectiveRoot}`);
    (persistence as any) = new GraphPersistence(effectiveRoot, readOnly);
    chronicle.setProjectDir(effectiveRoot);
  }
  
  try {
    await persistence.load(graph.getGraph());
    logger.info(`Structural graph loaded from persistence (${graph.getGraph().stats.nodeCount} nodes).`);
    const linker = new FederatedLinker(effectiveRoot);
    await linker.hydrate(graph.getGraph());
  } catch (err: any) {
    const errorStr = (err.message || String(err) || '').toString();
    
    if (!readOnly && (errorStr.includes('locked') || errorStr.includes('busy') || errorStr.includes('Conflicting lock'))) {
      // THE POLITE WRITER (GUIDELINES Section 13.5)
      // High-Fidelity PID Extraction: Supports both native objects and stringified reports.
      const pidMatch = errorStr.match(/PID (\d+)/);
      if (pidMatch && pidMatch[1]) {
        const blockerPid = parseInt(pidMatch[1], 10);
        logger.warn(`[Registry] Synapse lock held by PID ${blockerPid}. Sending Yield Signal (SIGUSR2)...`);
        try {
          // Verify process exists before signaling
          process.kill(blockerPid, 'SIGUSR2');
          // Wait a beat for the OS handle to release
          await new Promise(res => setTimeout(res, 500));
        } catch (killErr) {
          logger.debug(`Could not signal PID ${blockerPid} (stale lock or lack of permissions)`);
        }
      }
      // Re-attempt load (automatic retry logic inside persistence.ts will now handle the wait)
      const success = await persistence.load(graph.getGraph());
      if (success) {
        logger.info(`Structural graph loaded after lock yield.`);
        const linker = new FederatedLinker(effectiveRoot);
        await linker.hydrate(graph.getGraph());
        return;
      }
    }
    logger.warn(`No persisted graph found at ${effectiveRoot}. Run "conducks analyze" to index the project.`);
  }
}

// 3. Domain Orchestration Logic (The Conducks's Brain)
const analysisOrchestrator = new PulseOrchestrator(synapseRegistry, graph, aligner);

// Singleton watcher instance — prevents GC and ensures event loop stays alive
let _watcherInstance: any = null;

function getWatcher() {
  const rawRoot = chronicle.getProjectDir();
  const projectRoot = path.resolve(rawRoot);
  
  if (projectRoot && projectRoot !== "/" && projectRoot !== "C:\\") {
    if (!_watcherInstance) {
      logger.info(`Initializing Structural Watcher at: ${projectRoot}`);
      _watcherInstance = new ConducksWatcher(projectRoot, graph, { persistence });
    }
    return _watcherInstance;
  }
  logger.warn(`Watcher could not initialize — invalid project root: ${projectRoot}`);
  return null;
}

/**
 * The Unified Registry Singleton
 * 
 * Delivery layers (CLI, Tools) MUST import from here.
 * NEVER import from lib/domain or lib/core directly.
 */
export const registry = {
  manifest: {
    bootstrap: (projectRoot: string, projectName: string) => manifest.bootstrap(projectRoot, projectName),
    record: (projectRoot: string, projectName: string, type: string, content: string) => manifest.record(projectRoot, projectName, type, content)
  },
  analysis: {
    orchestrator: analysisOrchestrator,
    pulse: (files: any[]) => analysisOrchestrator.executePulse(files),
    getImpact: (symbolId: string, direction: 'upstream' | 'downstream' = 'upstream', depth: number = 5) =>
      impactAnalyzer.analyzeImpact(graph.getGraph(), symbolId, direction, depth),

    /**
     * Conducks — Project-Wide Structural Pulse
     * 
     * Encapsulates full discovery, batch-parallel reflection, gravity resonance,
     * and automatic persistence.
     */
    fullPulse: async (options: { staged?: boolean, verbose?: boolean } = {}) => {
      let targetPath = chronicle.getProjectDir();

      // Safeguard against indexing the root of the filesystem
      if (targetPath === '/' || targetPath === '\\') {
        logger.warn(`Project root resolved to system root (/). Re-resolving to process.cwd()`);
        targetPath = process.cwd();
      }

      logger.info(`Analyzing Project Structure: ${targetPath}`);

      // 1. Digital Reflection via Chronicle Interface (Discovery)
      const voyager = chronicle;
      const files = await voyager.discoverFiles(options.staged);

      if (files.length === 0) {
        logger.warn("No units found for analysis.");
        return { success: true, files: 0 };
      }

      logger.info(`Analyzing ${files.length} units...`);

      // 2. Reflecting structural stream
      const allUnits = [];
      for await (const batch of voyager.streamBatches(files, 500, options.staged)) {
        allUnits.push(...batch);
      }

      await analysisOrchestrator.executePulse(allUnits);

      // 2.5 Conducks Essence: Framework & Dependencies (Phase 5.2/5.3)
      for (const unit of allUnits) {
        const fw = essenceLens.detectFramework(path.basename(unit.path), unit.source);
        if (fw) graph.getGraph().setMetadata('framework', fw);

        if (path.basename(unit.path) === 'package.json' || path.basename(unit.path) === 'requirements.txt') {
          const spectrum = essenceLens.refract(unit.path, unit.source);
          graph.ingestSpectrum(unit.path, spectrum);
        }
      }

      // 3. Significance Analysis & Federated Linkage
      graph.resonate();
      const linker = new FederatedLinker();
      await linker.hydrate(graph.getGraph());

      // 4. Persistence & Sync Metadata
      const headHash = voyager.getHeadHash();
      if (headHash) {
        graph.getGraph().setMetadata('lastPulsedCommit', headHash);
      }

      await persistence.save(graph.getGraph());

      // 5. Neural Context Regeneration
      try {
        const contextMd = await contextGenerator.generateFileSummary(persistence);
        const archPath = path.join(targetPath, 'ARCHITECTURE.md');
        await fs.writeFile(archPath, contextMd, 'utf-8');
      } catch (err) {
        logger.error("Failed to regenerate ARCHITECTURE.md", err);
      }

      logger.success(`Pulse Complete. Indexed ${graph.getGraph().stats.nodeCount} nodes.`);
      return { success: true, files: files.length };
    }
  },
  intelligence: {
    search,
    gql,
    graph,
    diff: diffEngine,
    federation: new FederatedLinker(workspaceRoot),
    compare: async (otherPath: string) => {
      const otherGraph = new ConducksGraph();
      // Enforce READ_ONLY for comparison to avoid locking neighbor projects
      const otherPersistence = new GraphPersistence(otherPath, true);
      const success = await otherPersistence.load(otherGraph.getGraph());
      if (!success) throw new Error(`[Conducks] Failed to load structural signature for: ${otherPath}`);
      return resonance.analyzeResonance(graph.getGraph(), otherGraph.getGraph()) as any;
    },
    resonate: () => graph.resonate(),
    getCohesionVector: (sourceId: string, targetId: string): number => {
      const g = graph.getGraph();
      const sN = new Set(g.getNeighbors(sourceId, 'downstream').map(n => n.targetId));
      const tN = g.getNeighbors(targetId, 'downstream').map(n => n.targetId);
      if (sN.size === 0 && tN.length === 0) return 0;
      const intersection = tN.filter(n => sN.has(n));
      const union = new Set([...sN, ...tN]);
      return intersection.length / union.size;
    }
  },
  evolution: {
    gvr,
    get watcher() { return getWatcher(); }
  },
  kinetic: {
    flows,
    getProcesses: () => flows.groupProcesses()
  },
  metrics: {
    deadCode,
    resonance,
    testAligner: aligner,
    prune: (): any => deadCode.analyze(graph.getGraph()),
    calculateEntropy: async (symbolId: string) => {
      const g = graph.getGraph();
      const node = g.getNode(symbolId);
      if (!node || !node.properties.filePath) return { entropy: 0, risk: 0 };

      const distribution = await chronicle.getAuthorDistribution(node.properties.filePath);
      const authors = Object.keys(distribution);
      const entropy = calculateShannonEntropy(distribution);
      const risk = normalizeEntropyRisk(entropy, authors.length);

      return { entropy, risk, authorCount: authors.length };
    },
    calculateCompositeRisk: (nodeId: string) => {
      const g = graph.getGraph();
      const node = g.getNode(nodeId);
      if (!node) return null;

      const rank = node.properties.rank || 0;
      const entropy = node.properties.entropy || 0;
      const res = node.properties.resonance || 0;
      const outgoing = g.getNeighbors(nodeId, 'downstream').length;

      return {
        score: (rank * 0.4) + (entropy * 0.3) + (Math.min(res / 100, 1.0) * 0.2) + (Math.min(outgoing / 10, 1.0) * 0.1),
        breakdown: {
          gravity: { value: rank, weight: 0.4 },
          entropy: { value: entropy, weight: 0.3 },
          churn: { value: Math.min(res / 100, 1.0), weight: 0.2 },
          fanOut: { value: Math.min(outgoing / 10, 1.0), weight: 0.1 }
        }
      };
    }
  },
  infrastructure: {
    graphEngine: graph,
    persistence,
    chronicle,
    registry: synapseRegistry
  },
  governance: {
    advisor,
    status: () => {
      const g = graph.getGraph();
      const lastCommit = chronicle.getLastPulsedCommit(g) || "none";
      const currentHead = chronicle.getHeadHash();
      const isStale = currentHead && lastCommit !== "none" && currentHead !== lastCommit;

      return {
        status: "ready",
        "version": "0.7.1",
        projectName: path.basename(chronicle.getProjectDir() || "unknown"),
        framework: g.getMetadata('framework') || "generic",
        staleness: {
          stale: isStale,
          lastPulsedCommit: lastCommit,
          currentHead: currentHead || "non-git",
          commitsBehind: isStale ? chronicle.getCommitsBehind(lastCommit) : 0,
        },
        stats: {
          nodeCount: g.stats.nodeCount,
          edgeCount: g.stats.edgeCount,
          density: (g.stats as any).density || 0
        },
        pulses: [] // Conducks historical pulse tracking
      };
    },
    audit: () => {
      const g = graph.getGraph();
      const violations: string[] = [];
      const cycles = g.detectCycles();
      for (const cycle of cycles) violations.push(`ARCH-3: Circular: ${cycle.join(" -> ")}`);
      return { success: violations.length === 0, violations };
    },
    advise: async (): Promise<any> => {
      return advisor.analyze(graph.getGraph());
    },
    context: async () => {
      const p = (registry.infrastructure as any).persistence;
      return contextGenerator.generateTop10Context(p);
    },
    contextFile: async () => {
      const p = (registry.infrastructure as any).persistence;
      return contextGenerator.generateFileSummary(p);
    }
  },
  mirror: {
    getWave: () => mirror.getVisualWave()
  },
  initialize: initializeRegistry
};

export type Registry = typeof registry;
