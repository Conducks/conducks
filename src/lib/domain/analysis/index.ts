import { AnalyzeOrchestrator } from "./orchestrator.js";
import { ConducksGraph } from "@/lib/core/graph/graph-engine.js";
import { SynapsePersistence } from "@/lib/core/persistence/persistence.js";
import { chronicle } from "@/lib/core/git/chronicle-interface.js";
import { essenceLens } from "@/lib/core/parsing/essence-lens.js";
import { ContextGenerator } from "@/lib/domain/governance/context-generator.js";
import { Logger } from "@/lib/core/utils/logger.js";
import { registry } from "@/registry/index.js";
import path from "node:path";
import fs from "node:fs/promises";
import { FederatedLinker } from "@/lib/core/graph/linker-federated.js";
import { ConducksComponent } from "@/registry/types.js";

import { QueryService } from "./query-service.js";

const logger = new Logger("AnalysisDomain");

/**
 * Conducks — Analysis Domain Service
 * 
 * High-level product logic for structural analysis, discovery, 
 * and neural context regeneration.
 */
export class AnalysisService implements ConducksComponent {
  public readonly id = 'analysis-service';
  public readonly type = 'analyzer';
  public readonly description = 'Orchestrates structural reflection and synapse discovery.';
  public readonly query: QueryService;

  constructor(
    private orchestrator: AnalyzeOrchestrator,
    private graph: ConducksGraph,
    private persistence: SynapsePersistence,
    private contextGenerator: ContextGenerator
  ) {
    this.query = new QueryService(this.persistence);
  }

  /**
   * Apostolic Re-Anchoring 🏺
   * Re-wires the service to a new structural vault handle.
   */
  public setPersistence(persistence: SynapsePersistence) {
    this.persistence = persistence;
    this.query.setPersistence(persistence);
    (this.orchestrator as any).persistence = persistence;
    (this.graph as any).persistence = persistence;
  }

  /**
   * Performs a high-fidelity structural analysis on the project (or a scoped subdirectory).
   * Consolidates discovery, batch reflection, gravity resonance, and persistence.
   */
  public async analyze(options: { root?: string, staged?: boolean, verbose?: boolean } = {}): Promise<{ success: boolean, files: number }> {
    const projectRoot = chronicle.getProjectDir();
    const targetRoot = options.root ? path.resolve(options.root) : projectRoot;

    // Safeguard against indexing the root of the filesystem
    if (targetRoot === '/' || targetRoot === '\\') {
      logger.warn(`Analysis root resolved to system root (/). Re-resolving to process.cwd()`);
      return this.analyze({ ...options, root: process.cwd() });
    }

    logger.info(`Analyzing Project Structure: ${projectRoot}`);
    if (targetRoot !== projectRoot) {
      logger.info(`🛡️ [Scoped Analysis] Targeted Pulse: ${targetRoot}`);
    }

    // 1. Digital Reflection via Chronicle Interface (Discovery)
    const voyager = chronicle;
    let files = await voyager.discoverFiles(options.staged);

    // [Apostolic State-Sync] Change Detection & Incremental Targeting 🏺
    // We filter the discovery set to only include "Dirty Units" (changed since last synapse)
    const lastPulse = await this.persistence.query("SELECT timestamp FROM pulses ORDER BY timestamp DESC LIMIT 1");
    const lastSyncTime = lastPulse.length > 0 ? Number(lastPulse[0].timestamp) : 0;
    
    let dirtyFiles = files;
    if (!options.staged && lastSyncTime > 0) {
      const statsPromises = files.map(async f => {
        try {
          const s = await fs.stat(f);
          return s.mtimeMs > lastSyncTime ? f : null;
        } catch { return null; }
      });
      dirtyFiles = (await Promise.all(statsPromises)).filter(f => f !== null) as string[];
      logger.info(`🛡️ [Sovereiorn Discovery] Found ${dirtyFiles.length} dirty units since last pulse.`);
    }

    // Apostolic Filter: Scoped Discovery 🏺
    if (targetRoot !== projectRoot) {
      dirtyFiles = dirtyFiles.filter(f => f.startsWith(targetRoot));
    }

    if (dirtyFiles.length === 0) {
      logger.warn("No changes detected. Structural Synapse is already at 100% resonance.");
      return { success: true, files: 0 };
    }

    logger.info(`Analyzing ${dirtyFiles.length} units...`);

    // 2. Reflecting structural stream
    const allUnits = [];
    for await (const batch of voyager.streamBatches(dirtyFiles, 500, options.staged)) {
      allUnits.push(...batch);
    }

    // 2.2 Apostolic Purge: Remove old structural DNA for these units
    logger.info(`🛡️ [Persistence] Purging structural DNA for ${dirtyFiles.length} units...`);
    const unitIds = dirtyFiles.map(f => `${f.toLowerCase()}::unit`);
    await this.persistence.purgeUnits(unitIds);

    // 2.5 Discover Sub-Repositories for Multi-Project Resonance
    const bootstrapper = (this as any).registry?.bootstrapper || (this.orchestrator as any).registry?.bootstrapper;
    const projectRoots = bootstrapper ? bootstrapper.discoverProjects(projectRoot) : [projectRoot];

    // Execute the core analysis wave with project context
    const pulseStats = await (this.orchestrator as any).analyze(allUnits, { projectRoots, workspaceRoot: projectRoot });
    const { pulseId, nodeCount, edgeCount } = pulseStats;

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
      this.graph.getGraph().setMetadata('lastAnalyzedCommit', headHash);
    }

    this.graph.getGraph().setMetadata('targetPulseId', pulseId);

    // 4.5 [Apostolic Virtual Induction] 🏺
    // We induce missing library nodes to ensure the synapse reflects the complete ecosystem.
    await this.induceVirtualLibraries(this.graph.getGraph());

    await this.persistence.save(this.graph.getGraph(), { 
      append: true, 
      nodeCount,
      edgeCount
    });

    // 5. Neural Context Regeneration
    try {
      const contextMd = await this.contextGenerator.generateFileSummary(this.persistence);
      const archPath = path.join(projectRoot, 'ARCHITECTURE.md');
      await fs.writeFile(archPath, contextMd, 'utf-8');
    } catch (err) {
      logger.error("Failed to regenerate ARCHITECTURE.md", err);
    }

    logger.info(`Pulse Complete. Indexed ${this.graph.getGraph().stats.nodeCount} nodes.`);
    registry.events.emit('SYNAPSE_PULSED', { pulseId, nodes: nodeCount, edges: edgeCount });

    return { success: true, files: files.length };
  }

  /**
   * Conducks — Virtual Ecosystem Induction 🏺
   * 
   * Scans for dangling external references and induces virtual nodes to group them 
   * by library/namespace. This transforms "Orphans" into "Ecosystem Members".
   */
  private async induceVirtualLibraries(graph: ConducksGraph | any): Promise<void> {
    const allEdges = (graph as any).getAllEdges();
    const externalPrefixes = ['global', 'npm', 'std', 'pip', 'gem', 'mvn', 'go', 'crates'];
    
    let inducedCount = 0;
    const projectRoot = chronicle.getProjectDir().toLowerCase();

    for (const edge of allEdges) {
      const targetId = edge.targetId.toLowerCase();
      
      // If the target already exists, skip it.
      if (graph.hasNode(targetId)) continue;

      // Identify External Ecosystem patterns: "namespace::symbol" or "naked_symbol"
      const parts = targetId.split('::');
      
      let namespace = 'unresolved';
      let symbol = targetId;
      let isCandidate = false;

      if (parts.length >= 2) {
        namespace = parts[0];
        symbol = parts[1];
        if (externalPrefixes.includes(namespace)) isCandidate = true;
      } else {
        // Special Case: Naked symbols that are not absolute paths
        if (!targetId.startsWith('/') && !targetId.startsWith('c:\\')) {
          isCandidate = true;
        }
      }

      if (isCandidate) {
        const libId = `lib::${namespace}`;
        
        // 1. Induce Library Node (e.g. lib::unresolved or lib::npm)
        if (!graph.hasNode(libId)) {
          graph.addNode({
            id: libId,
            label: 'LIBRARY',
            properties: { 
              name: namespace, 
              filePath: `external://${namespace}`, 
              canonicalKind: 'STRUCTURE', 
              canonicalRank: 1, // Ecosystem Layer
              isShallow: true
            }
          });
        }

        // 2. Induce Symbol Node
        graph.addNode({
          id: targetId,
          label: 'LIBRARY_SYMBOL',
          properties: {
            name: symbol,
            filePath: `external://${namespace}/${symbol}`,
            canonicalKind: 'BEHAVIOR',
            canonicalRank: 7, // Leaf Level
            parentId: libId,
            isShallow: true
          }
        });

        // 3. Bind to Library (Apostolic Rule: Columnar Hierarchy Only) 🏺
        // We no longer persist MEMBER_OF edges; containment is in node.properties.parentId
        inducedCount++;
      }
    }

    if (inducedCount > 0) {
      logger.info(`🛡️ [Apostolic Induction] Resonated with ${inducedCount} virtual ecosystem symbols.`);
    }
  }
}

export { AnalyzeOrchestrator } from "./orchestrator.js";
export { ConducksReflector } from "./reflector.js";
