import { ConducksPipeline } from "@/lib/core/parsing/pipeline.js";
import { ConducksReflector } from "@/lib/domain/analysis/reflector.js";
import { PulseContext } from "@/lib/core/parsing/context.js";
import { SynapseRegistry } from "@/registry/synapse-registry.js";
import { ConducksGraph } from "@/lib/core/graph/graph-engine.js";
import { TestAligner } from "@/lib/domain/metrics/test-aligner.js";
import { SynapsePersistence } from "@/lib/core/persistence/persistence.js";
import { IgnoreManager } from "@/lib/core/parsing/ignore-manager.js";
import path from "node:path";

import { ConducksComponent } from "@/registry/types.js";
import { logger } from "@/lib/core/utils/logger.js";

/**
 * Conducks — Pulse Orchestrator
 * 
 * The central orchestration engine for structural analysis.
 * Manages the batch-parallel topological pulse and structural resonance.
 */
export class PulseOrchestrator implements ConducksComponent {
  public readonly id = "pulse-orchestrator";
  public readonly type = "analyzer";

  public context = new PulseContext();

  constructor(
    private registry: SynapseRegistry<any>,
    private graph: ConducksGraph,
    private aligner?: TestAligner,
    private persistence?: SynapsePersistence,
    private reflector: ConducksReflector = new ConducksReflector(),
    private ignoreManager?: IgnoreManager
  ) { }

  /**
   * Orchestrates a high-fidelity pulse on the provided files.
   * Standardized naming: pulse()
   */
  public async pulse(files: Array<{ path: string, source: string }>): Promise<string> {
    this.context.reset();
    const context = this.context;

    // Structural Exclusion Guard
    const activeFiles = this.ignoreManager ? 
      files.filter(f => !this.ignoreManager!.isIgnored(f.path)) : 
      files;

    if (this.ignoreManager && activeFiles.length < files.length) {
      logger.info(`Structural Ignore: Excluding ${files.length - activeFiles.length} units from the structural wave.`);
    }

    // Path Normalization & Canonical Identity
    // We preserve casing for Linux compatibility while resolving relative paths
    const normalizedFiles = activeFiles.map(f => {
      if (!f || !f.path) {
        throw new Error(`[Conducks] Structural integrity failure: Received null or undefined file path during pulse.`);
      }
      return { path: path.resolve(f.path), source: f.source };
    });
    
    const allPaths = normalizedFiles.map(f => f.path);
    const spectra = new Map<string, any>();
    const pulseErrors: string[] = [];

    // Adaptive Memory Pressure Calculation
    const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
    const isLargeProject = normalizedFiles.length > 100;
    const useShallowMode = memoryUsage > 1000 || isLargeProject;

    if (useShallowMode) {
      logger.info(`Adaptive Scaling: Engaging Shallow Internalization (RAM: ${Math.round(memoryUsage)}MB, Files: ${normalizedFiles.length})`);
    }

    // Step 1: Pre-Pulse Discovery & Single-Pass Reflection
    let indexCount = 0;
    for (const file of normalizedFiles) {
      try {
        indexCount++;
        // Periodic Milestone Log: Providing structural visibility for large projects.
        if (indexCount % 100 === 0 || indexCount === normalizedFiles.length) {
          logger.info(`Structural Pulse: Reflecting unit ${indexCount}/${normalizedFiles.length} (${Math.round((indexCount / normalizedFiles.length) * 100)}%)...`);
        }

        // Filename-Aware Provider Mapping
        const provider = this.registry.getProvider(file.path);
        if (!provider) continue;

        const spectrum = await this.reflector.reflect(file, provider, context, allPaths);
        
        // Streaming Persistence
        // We write the 'Meat' to disk immediately to free up RAM if needed
        if (this.persistence && useShallowMode) {
          await this.persistence.saveSpectrum(file.path, spectrum);
        }

        spectra.set(file.path, spectrum);
      } catch (err: any) {
        pulseErrors.push(`${file.path}: ${err.message}`);
        logger.warn(`Pulse Warning: Failed to reflect ${file.path}. Structural unit may be missing from this wave.`, err);
        
        // Materialize a "Broken Unit" node to prevent total structural collapse
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

    // Step 2: Topological Leveling
    const levels = ConducksPipeline.topologicalSort(context.getImportMap(), allPaths);

    // Step 3: Batch-Parallel Ingestion
    for (const level of levels) {
      const tasks = level.map(async (filePath) => {
        const spectrum = spectra.get(filePath);
        if (!spectrum) return;
        this.graph.ingestSpectrum(filePath, spectrum, useShallowMode);
      });
      await Promise.all(tasks);
    }

    // Step 4: Final Resonance
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

