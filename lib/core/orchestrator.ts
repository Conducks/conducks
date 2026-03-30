import { ApostlePipeline } from "../product/indexing/pipeline.js";
import { ApostleReflector } from "../product/indexing/reflector.js";
import { PulseContext } from "../product/indexing/context.js";
import { SynapseRegistry } from "./registry/synapse-registry.js";
import { ConducksGraph } from "../product/indexing/graph-engine.js";
import { essenceLens } from "../product/indexing/lenses/essence-lens.js";
import path from "node:path";

/**
 * Apostle — Pulse Orchestrator
 * 
 * The central orchestration engine for the Gospel of Technology.
 * Manages the batch-parallel topological pulse and structural resonance.
 */
export class PulseOrchestrator {
  private reflector = new ApostleReflector();
  public context = new PulseContext();
  
  constructor(
    private registry: SynapseRegistry<any>,
    private graph: ConducksGraph
  ) {
    console.error("[PulseOrchestrator] Constructed.");
  }

  /**
   * Orchestrates a high-fidelity pulse on the provided files.
   * 
   * 1. Discovery & Single-Pass Reflection (Cache Spectra)
   * 2. Topological Sorting
   * 3. Batch-Parallel Ingestion
   * 4. Resonance (Gravity/PageRank)
   */
  public async executePulse(files: Array<{ path: string, source: string }>): Promise<void> {
    console.error(`[Pulse Orchestrator] Starting Structural Pulse on ${files.length} units...`);
    
    this.context.reset();
    const context = this.context;
    const allPaths = files.map(f => f.path);
    console.error(`[Pulse Orchestrator] Discovered Paths: ${allPaths.map(p => path.basename(p)).join(', ')}`);
    const spectra = new Map<string, any>();

    // Step 0: Pre-Discovery (Manifest Extraction for Phase 5.2)
    for (const file of files) {
      const fileName = path.basename(file.path);
      if (fileName === 'package.json' || fileName === 'requirements.txt') {
        console.error(`[Pulse Orchestrator] Refracting Essence from manifest: ${fileName}...`);
        const spectrum = essenceLens.refract(file.path, file.source);
        
        // Phase 5.3: Detect and register framework context
        const framework = essenceLens.detectFramework(fileName, file.source);
        if (framework) {
          console.error(`[Pulse Orchestrator]   -> Framework Detected: ${framework}`);
          context.setFramework(framework);
        }

        // Phase 5.2: Register external packages for resolver awareness
        const deps = spectrum.nodes.filter(n => (n as any).kind === 'external_dependency');
        console.error(`[Pulse Orchestrator]   -> Found ${deps.length} external dependencies.`);
        deps.forEach(n => {
          context.registerExternalPackage(n.name);
        });

        spectra.set(file.path, spectrum);
      }
    }

    // Step 1: Structural Reflection (Single-Pass Dispatch)
    for (const file of files) {
      if (spectra.has(file.path)) continue; // Already processed manifest

      // Phase 5.3: Detect framework from source code if not yet found
      if (!context.getFramework()) {
        const framework = essenceLens.detectFramework(path.basename(file.path), file.source);
        if (framework) {
          console.error(`[Pulse Orchestrator]   -> Framework Detected in ${path.basename(file.path)}: ${framework}`);
          context.setFramework(framework);
        }
      }

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
    console.error(`[Pulse Orchestrator] Structural Topology detected: ${levels.length} levels.`);

    // Step 3: Progressive Batch-Parallel Ingestion
    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];
      console.error(`[Pulse Orchestrator] Ingesting Level ${i} (${level.length} units)...`);
      
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
