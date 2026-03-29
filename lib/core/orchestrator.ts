import { ApostlePipeline } from "../product/indexing/pipeline.js";
import { ApostleReflector } from "../product/indexing/reflector.js";
import { PulseContext } from "../product/indexing/context.js";
import { SynapseRegistry } from "./registry/synapse-registry.js";
import { ConducksGraph } from "../product/indexing/graph-engine.js";
import path from "node:path";

/**
 * Apostle — Pulse Orchestrator
 * 
 * The central orchestration engine for the Gospel of Technology.
 * Manages the batch-parallel topological pulse and structural resonance.
 */
export class PulseOrchestrator {
  private reflector = new ApostleReflector();
  
  constructor(
    private registry: SynapseRegistry<any>,
    private graph: ConducksGraph
  ) {}

  /**
   * Orchestrates a high-fidelity pulse on the provided files.
   * 
   * 1. Discovery & Single-Pass Reflection (Cache Spectra)
   * 2. Topological Sorting
   * 3. Batch-Parallel Ingestion
   * 4. Resonance (Gravity/PageRank)
   */
  public async executePulse(files: Array<{ path: string, source: string }>): Promise<void> {
    console.log(`[Pulse Orchestrator] Starting Structural Pulse on ${files.length} units...`);
    
    const context = new PulseContext();
    const allPaths = files.map(f => f.path);
    const spectra = new Map<string, any>();

    // Step 1: Initial Discovery & Caching (Single-Pass Reflection)
    for (const file of files) {
      const ext = path.extname(file.path);
      const provider = this.registry.getProvider(ext);
      if (provider) {
        // Build initial import map and cache the structural spectrum
        const spectrum = await this.reflector.reflect(file, provider, context, allPaths);
        spectra.set(file.path, spectrum);
      }
    }

    // Step 2: Topological Sorting into Parallel Batches
    const levels = ApostlePipeline.topologicalSort(context.getImportMap(), allPaths);
    console.log(`[Pulse Orchestrator] Structural Topology detected: ${levels.length} levels.`);

    // Step 3: Progressive Batch-Parallel Ingestion
    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];
      console.log(`[Pulse Orchestrator] Ingesting Level ${i} (${level.length} units)...`);
      
      // We can ingest level by level because we have the spectra cached
      for (const filePath of level) {
        const spectrum = spectra.get(filePath);
        if (spectrum) {
          this.graph.ingestSpectrum(filePath, spectrum);
        }
      }
    }

    // Step 4: Final Resonance
    this.resonate();
  }

  /**
   * Performs structural resonance (Gravity recalculation and global linking).
   */
  private resonate(): void {
    this.graph.resonate();
  }
}
