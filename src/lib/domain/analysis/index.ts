import { PulseOrchestrator } from "./orchestrator.js";
import { ConducksGraph } from "@/lib/core/graph/graph-engine.js";
import { SynapsePersistence } from "@/lib/core/persistence/persistence.js";
import { chronicle } from "@/lib/core/git/chronicle-interface.js";
import { essenceLens } from "@/lib/core/parsing/essence-lens.js";
import { ContextGenerator } from "@/lib/domain/governance/context-generator.js";
import { Logger } from "@/lib/core/utils/logger.js";
import path from "node:path";
import fs from "node:fs/promises";
import { FederatedLinker } from "@/lib/core/graph/linker-federated.js";

const logger = new Logger("AnalysisDomain");

/**
 * Conducks — Analysis Domain Service
 * 
 * High-level product logic for structural analysis, discovery, 
 * and neural context regeneration.
 */
export class AnalysisService {
  constructor(
    private orchestrator: PulseOrchestrator,
    private graph: ConducksGraph,
    private persistence: SynapsePersistence,
    private contextGenerator: ContextGenerator
  ) {}

  /**
   * Performs a high-fidelity structural pulse on the entire project.
   * Consolidates discovery, batch reflection, gravity resonance, and persistence.
   * 
   * Standardized naming: pulse()
   */
  public async pulse(options: { staged?: boolean, verbose?: boolean } = {}): Promise<{ success: boolean, files: number }> {
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

    // Execute the core pulse
    await this.orchestrator.pulse(allUnits);

    // 3. Significance Analysis & Federated Linkage
    // We delegate the metadata enrichment to the domain service
    for (const unit of allUnits) {
      const fw = essenceLens.detectFramework(path.basename(unit.path), unit.source);
      if (fw) this.graph.getGraph().setMetadata('framework', fw);

      if (path.basename(unit.path) === 'package.json' || path.basename(unit.path) === 'requirements.txt') {
        const spectrum = essenceLens.refract(unit.path, unit.source);
        this.graph.ingestSpectrum(unit.path, spectrum);
      }
    }

    this.graph.resonate();
    const linker = new FederatedLinker();
    await linker.hydrate(this.graph.getGraph());

    // 4. Persistence & Sync Metadata
    const headHash = voyager.getHeadHash();
    if (headHash) {
      this.graph.getGraph().setMetadata('lastPulsedCommit', headHash);
    }

    await this.persistence.save(this.graph.getGraph());

    // 5. Neural Context Regeneration
    try {
      const contextMd = await this.contextGenerator.generateFileSummary(this.persistence);
      const archPath = path.join(targetPath, 'ARCHITECTURE.md');
      await fs.writeFile(archPath, contextMd, 'utf-8');
    } catch (err) {
      logger.error("Failed to regenerate ARCHITECTURE.md", err);
    }

    logger.info(`Pulse Complete. Indexed ${this.graph.getGraph().stats.nodeCount} nodes.`);
    return { success: true, files: files.length };
  }
}

export { PulseOrchestrator } from "./orchestrator.js";
export { ConducksReflector } from "./reflector.js";
