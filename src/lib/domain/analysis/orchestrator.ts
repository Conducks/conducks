import { ConducksPipeline } from "@/lib/core/parsing/pipeline.js";
import { ConducksReflector } from "@/lib/domain/analysis/reflector.js";
import { PulseContext } from "@/lib/core/parsing/context.js";
import { SynapseRegistry } from "@/registry/synapse-registry.js";
import { ConducksGraph } from "@/lib/core/graph/graph-engine.js";
import { TestAligner } from "@/lib/domain/metrics/test-aligner.js";
import path from "node:path";

import { ConducksComponent } from "@/registry/types.js";

/**
 * Conducks — Pulse Orchestrator
 * 
 * The central orchestration engine for the Gospel of Technology.
 * Manages the batch-parallel topological pulse and structural resonance.
 */
export class PulseOrchestrator implements ConducksComponent {
  public readonly id = "pulse-orchestrator";
  public readonly type = "analyzer";
  public readonly version = "2.0.0";

  public context = new PulseContext();

  constructor(
    private registry: SynapseRegistry<any>,
    private graph: ConducksGraph,
    private aligner?: TestAligner,
    private reflector: ConducksReflector = new ConducksReflector()
  ) { }

  /**
   * Orchestrates a high-fidelity pulse on the provided files.
   */
  public async executePulse(files: Array<{ path: string, source: string }>): Promise<string> {
    this.context.reset();
    const context = this.context;
    
    // Conducks.6: Canonical Path Normalization (macOS APFS support)
    const normalizedFiles = files.map(f => ({ path: f.path.toLowerCase(), source: f.source }));
    const allPaths = normalizedFiles.map(f => f.path);
    const spectra = new Map<string, any>();

    // Step 1: Pre-Pulse Discovery & Single-Pass Reflection
    for (const file of normalizedFiles) {
      const ext = path.extname(file.path);
      const provider = this.registry.getProvider(ext);
      if (!provider) continue;

      const spectrum = await this.reflector.reflect(file, provider, context, allPaths);
      spectra.set(file.path, spectrum);
    }

    // Step 2: Topological Leveling
    const levels = ConducksPipeline.topologicalSort(context.getImportMap(), allPaths);

    // Step 3: Batch-Parallel Ingestion
    for (const level of levels) {
      const tasks = level.map(async (filePath) => {
        const spectrum = spectra.get(filePath);
        if (!spectrum) return;
        this.graph.ingestSpectrum(filePath, spectrum);
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
