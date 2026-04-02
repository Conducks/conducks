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
      logger.info(`Structural Ignore: Excluding ${files.length - activeFiles.length} units from the structural wave.`);
    }

    const normalizedFiles = activeFiles.map(f => ({ path: path.resolve(f.path), source: f.source }));
    const allPaths = normalizedFiles.map(f => f.path);
    const spectra = new Map<string, any>();

    // Adaptive Memory Pressure Calculation
    const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
    const isLargeProject = normalizedFiles.length > 100;
    const useShallowMode = memoryUsage > 1000 || isLargeProject;

    // === Pass 1: Global Discovery Pulse ===
    // We traverse all units to identify Definitions and populate the Symbol Registry.
    logger.info(`[Phase 1] Structural Discovery: Mapping ${normalizedFiles.length} units...`);
    context.setDiscoveryMode(true);
    let discoveryCount = 0;
    for (const file of normalizedFiles) {
      try {
        discoveryCount++;
        const provider = this.registry.getProvider(file.path);
        if (!provider) continue;
        await this.reflector.reflect(file, provider, context, allPaths);
        if (discoveryCount % 100 === 0) logger.info(`Discovery Pulse: ${discoveryCount}/${normalizedFiles.length}...`);
      } catch (err) {
        logger.warn(`Discovery Warning: Failed to discover ${file.path}. Symbol table may be incomplete for this unit.`);
      }
    }

    // === Pass 2: Structural Induction (Resolution) ===
    // We re-traverse units toEstablish relationships against the Global Registry.
    logger.info(`[Phase 2] Structural Induction: Establishing referential integrity...`);
    context.setDiscoveryMode(false);
    let inductionCount = 0;
    for (const file of normalizedFiles) {
      try {
        inductionCount++;
        const provider = this.registry.getProvider(file.path);
        if (!provider) continue;

        const spectrum = await this.reflector.reflect(file, provider, context, allPaths);
        
        if (this.persistence && useShallowMode) {
          await this.persistence.saveSpectrum(file.path, spectrum);
        }

        spectra.set(file.path, spectrum);
        if (inductionCount % 100 === 0) logger.info(`Induction Pulse: ${inductionCount}/${normalizedFiles.length}...`);
      } catch (err: any) {
        logger.warn(`Induction Warning: Failed to induce ${file.path}. Structural unit may be missing.`, err);
        this.graph.ingestSpectrum(file.path, {
          nodes: [{
            name: 'CORRUPT_UNIT',
            kind: 'file' as any,
            canonicalKind: 'UNIT',
            canonicalRank: 2,
            range: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
            metadata: { isError: true, error: err.message, displayName: path.basename(file.path) }
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
        this.graph.ingestSpectrum(filePath, spectrum, useShallowMode);
      });
      await Promise.all(tasks);
    }

    // Step 4: Final Resonance (Pruning and Resonance Gravity)
    this.resonate();

    const head = (this.graph.getGraph() as any).getMetadata('head') || Date.now().toString();
    return head;
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

