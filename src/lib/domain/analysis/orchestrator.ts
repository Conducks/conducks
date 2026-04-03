import { ConducksPipeline } from "@/lib/core/parsing/pipeline.js";
import { ConducksReflector } from "@/lib/domain/analysis/reflector.js";
import { AnalyzeContext } from "@/lib/core/parsing/context.js";
import { SynapseRegistry } from "@/registry/synapse-registry.js";
import { ConducksGraph } from "@/lib/core/graph/graph-engine.js";
import { TestAligner } from "@/lib/domain/metrics/test-aligner.js";
import { SynapsePersistence } from "@/lib/core/persistence/persistence.js";
import { IgnoreManager } from "@/lib/core/parsing/ignore-manager.js";
import path from "node:path";

import { ConducksComponent } from "@/registry/types.js";
import { logger } from "@/lib/core/utils/logger.js";
import { Worker } from "node:worker_threads";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workerPath = path.resolve(__dirname, "../../core/parsing/pulse-worker.js");
const resourceDir = path.resolve(__dirname, "../../../resources/grammars");

/**
 * Conducks — Analyze Orchestrator
 * 
 * The central orchestration engine for structural analysis.
 * Manages the batch-parallel topological pulse and structural resonance.
 */
export class AnalyzeOrchestrator implements ConducksComponent {
  public readonly id = "analyze-orchestrator";
  public readonly type = "analyzer";

  public context = new AnalyzeContext();

  constructor(
    private registry: SynapseRegistry<any>,
    private graph: ConducksGraph,
    private aligner?: TestAligner,
    private persistence?: SynapsePersistence,
    private reflector: ConducksReflector = new ConducksReflector(),
    private ignoreManager?: IgnoreManager
  ) { }

  /**
   * Orchestrates a high-fidelity structural analysis on the provided files.
   * Universal Two-Pass Resolution Architecture (Discovery -> Induction)
   */
  public async analyze(files: Array<{ path: string, source: string }>): Promise<string> {
    this.context.reset();
    const context = this.context;

    // Structural Exclusion Guard
    const activeFiles = this.ignoreManager ? 
      files.filter(f => !this.ignoreManager!.isIgnored(f.path)) : 
      files;

    if (this.ignoreManager && activeFiles.length < files.length) {
      logger.info(`🛡️ [Conducks] Structural Ignore: Excluding ${files.length - activeFiles.length} units from the structural wave.`);
    }

    const normalizedFiles = activeFiles.map(f => ({ path: path.resolve(f.path), source: f.source }));
    const allPaths = normalizedFiles.map(f => f.path);
    const spectra = new Map<string, any>();

    // Phase 0: Multi-Project Hierarchy Mapping 🏺 🧬
    const projectRoots: string[] = (arguments[1] as any)?.projectRoots || [path.resolve(process.cwd())];
    const workspaceRoot: string = (arguments[1] as any)?.workspaceRoot || path.resolve(process.cwd());

    // 1. Create the Unified ECOSYSTEM Node (Rank 0)
    this.graph.getGraph().addNode({
      id: "ECOSYSTEM::GLOBAL",
      label: "Ecosystem",
      properties: {
        name: path.basename(workspaceRoot),
        filePath: workspaceRoot,
        canonicalKind: 'ECOSYSTEM',
        canonicalRank: 0
      } as any
    });

    // 2. Create REPOSITORY Nodes (Rank 1)
    const projectMap = new Map<string, string>(); // filePath -> projectRoot
    for (const root of projectRoots) {
      const repoId = `REPOSITORY::${root.toLowerCase()}`;
      this.graph.getGraph().addNode({
        id: repoId,
        label: "Repository",
        properties: {
          name: path.basename(root),
          filePath: root,
          canonicalKind: 'REPOSITORY',
          canonicalRank: 1
        } as any
      });

      // Link Repo to Ecosystem
      this.graph.getGraph().addEdge({
        id: `ECOSYSTEM::GLOBAL::${repoId}::CONTAINS`,
        sourceId: "ECOSYSTEM::GLOBAL",
        targetId: repoId,
        type: 'CONTAINS',
        confidence: 1.0,
        properties: {}
      });

      // Populate Project Map for Unit assignment
      for (const file of normalizedFiles) {
        if (file.path.startsWith(root + path.sep) || file.path === root) {
          // If a file belongs to multiple roots (e.g. monorepo root vs submodule), 
          // we pick the deepest (longest) path as the primary project.
          const existing = projectMap.get(file.path);
          if (!existing || root.length > existing.length) {
            projectMap.set(file.path, root);
          }
        }
      }
    }

    // Adaptive Memory Pressure Calculation
    const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
    const isLargeProject = normalizedFiles.length > 100;
    const useShallowMode = memoryUsage > 1000 || isLargeProject;

    // === Pass 1: Global Discovery Pulse (PARALLEL) ===
    logger.info(`🛡️ [Conducks] [Phase 1] Structural Discovery: Mapping ${normalizedFiles.length} units (Parallel)...`);
    const discoveryResults = await this.runParallelPulse(normalizedFiles, true, allPaths);
    
    // Merge Discoveries into Global Context
    for (const res of discoveryResults) {
      if (res.state) {
        context.mergeState(res.state);
      }
    }

    // === Pass 2: Structural Induction (Resolution) (PARALLEL) ===
    logger.info(`🛡️ [Conducks] [Phase 2] Structural Induction: Establishing referential integrity (Parallel)...`);
    const inductionResults = await this.runParallelPulse(normalizedFiles, false, allPaths, context.exportState().registry);

    // Batch Save Spectra to Disk
    if (this.persistence && useShallowMode) {
      const batchEntries = inductionResults
        .filter(r => r.success && r.spectrum)
        .map(r => ({ filePath: r.path, spectrum: r.spectrum }));
      
      await this.persistence.saveBatchSpectrum(batchEntries);
    }

    // Populate memory spectra for final ingestion
    for (const res of inductionResults) {
      if (res.success && res.spectrum) {
        spectra.set(res.path, res.spectrum);
      } else if (!res.success) {
        logger.warn(`Induction Failure: ${res.path} -> ${res.error}`);
        // Ingest dummy error node
        this.graph.ingestSpectrum(res.path, {
          nodes: [{
            name: 'CORRUPT_UNIT',
            kind: 'file' as any,
            canonicalKind: 'UNIT',
            canonicalRank: 2,
            range: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
            metadata: { isError: true, error: res.error, displayName: path.basename(res.path) }
          }],
          relationships: []
        });
      }
    }

    // Step 3: Topological Leveling & Batch Ingestion
    const levels = ConducksPipeline.topologicalSort(context.getImportMap(), allPaths);
    for (const level of levels) {
      const tasks = level.map(async (filePath) => {
        const spectrum = spectra.get(filePath);
        if (!spectrum) return;
        const projectRoot = projectMap.get(filePath);
        this.graph.ingestSpectrum(filePath, spectrum, useShallowMode, projectRoot);
      });
      await Promise.all(tasks);
    }

    // Step 4: Final Resonance (Pruning and Resonance Gravity)
    this.resonate();

    const head = (this.graph.getGraph() as any).getMetadata('head') || Date.now().toString();
    return head;
  }

  /**
   * Runs a parallel pulse across workers.
   */
  private async runParallelPulse(
    files: Array<{ path: string, source: string }>,
    discoveryMode: boolean,
    allPaths: string[],
    globalSymbols?: Record<string, any>
  ): Promise<any[]> {
    const threadCount = Math.max(1, os.cpus().length - 1);
    const chunkSize = Math.ceil(files.length / threadCount);
    const workers: Promise<any[]>[] = [];

    for (let i = 0; i < threadCount; i++) {
      const chunk = files.slice(i * chunkSize, (i + 1) * chunkSize);
      if (chunk.length === 0) continue;

      workers.push(new Promise((resolve, reject) => {
        const worker = new Worker(workerPath, {
          workerData: {
            units: chunk,
            allPaths,
            discoveryMode,
            globalSymbols,
            resourceDir
          }
        });

        worker.on('message', resolve);
        worker.on('error', reject);
        worker.on('exit', (code) => {
          if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
        });
      }));
    }

    const chunks = await Promise.all(workers);
    return chunks.flat();
  }

  /**
   * Performs structural resonance (Gravity recalculation and global linking).
   */
  public resonate(): void {
    this.graph.resonate();
    if (this.aligner) {
      this.aligner.align(this.graph.getGraph());
    }
  }
}

