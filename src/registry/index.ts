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
const persistence = new GraphPersistence(workspaceRoot);
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

// 2. Instantiate Bridge Layer Registry (for dynamic plugins)
const synapseRegistry = new SynapseRegistry();
synapseRegistry.registerProvider('.py', PYTHON_SUITE.provider);
synapseRegistry.registerProvider('.ts', TYPESCRIPT_SUITE.provider);
synapseRegistry.registerProvider('.tsx', TYPESCRIPT_SUITE.provider);
synapseRegistry.registerProvider('.js', TYPESCRIPT_SUITE.provider);
synapseRegistry.registerProvider('.jsx', TYPESCRIPT_SUITE.provider);

// Conducks: Lazy Structural Reflection (Load Python Wasm)
let isInitialized = false;
const logger = new Logger("Registry");

/**
 * Initializes the Structural Intelligence Layer.
 * Must be called by entry points (CLI, Tools) before execution.
 */
export async function initializeRegistry() {
  if (isInitialized) return;
  await grammars.init();
  await grammars.loadLanguage('python', path.join(resourcesDir, 'tree-sitter-python.wasm'));
  await grammars.loadLanguage('typescript', path.join(resourcesDir, 'tree-sitter-typescript.wasm'));

  // High-performance structural loading (Conducks)
  const success = await persistence.load(graph.getGraph());
  if (success) {
    logger.info(`Structural graph loaded from persistence (${graph.getGraph().stats.nodeCount} nodes).`);
  } else {
    logger.warn('No persisted graph found. Run "conducks analyze" to index the project.');
  }

  isInitialized = true;
}

// 3. Domain Orchestration Logic (The Conducks's Brain)
const analysisOrchestrator = new PulseOrchestrator(synapseRegistry, graph, aligner);

function getWatcher() {
  const projectRoot = chronicle.getProjectDir();
  if (projectRoot && projectRoot !== "/" && projectRoot !== "." && projectRoot !== "C:\\") {
    return new ConducksWatcher(projectRoot, graph.getGraph() as any, { persistence });
  }
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
    compare: async (otherPath: string) => {
      const otherGraph = new ConducksGraph();
      const otherPersistence = new GraphPersistence(otherPath);
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
      return { entropy: 0.5, risk: 0.5 }; // Formula handled in domain layer
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
        version: "2.0.0",
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
  initialize: initializeRegistry
};

export type Registry = typeof registry;
