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
import { canonicalize, getProjectRelativePath } from "@/lib/core/utils/path-utils.js";
import { Worker } from "node:worker_threads";
import { fork } from "node:child_process";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isTs = __filename.endsWith('.ts');
const workerPath = path.resolve(__dirname, `../../core/parsing/pulse-worker.${isTs ? 'ts' : 'js'}`);
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
   * Conducks Re-Anchoring 🛡️
   * Re-wires the orchestrator to a new structural vault handle.
   */
  public setPersistence(persistence: SynapsePersistence) {
    this.persistence = persistence;
  }

   /**
   * Orchestrates a high-fidelity structural analysis on the provided files.
   * Universal Two-Pass Resolution Architecture (Discovery -> Induction)
   */
  public async analyze(
    files: Array<{ path: string, source: string }>, 
    options: { workspaceRoot?: string, projectRoots?: string[] } = {}
  ): Promise<{ pulseId: string, nodeCount: number, edgeCount: number }> {
    this.context.reset();
    const context = this.context;
    const pulseId = `pulse_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.graph.getGraph().setMetadata('targetPulseId', pulseId);

    // Structural Exclusion Guard
    const activeFiles = this.ignoreManager ? 
      files.filter(f => !this.ignoreManager!.isIgnored(f.path)) : 
      files;

    const normalizedFiles = activeFiles.map(f => ({ path: path.resolve(f.path), source: f.source }));
    const allPaths = normalizedFiles.map(f => f.path);
    const spectra = new Map<string, any>();

    // Phase 0: Multi-Project Hierarchy Mapping 🛡️ 🧬
    const cliProjectRoots = options.projectRoots || [];
    const workspaceRoot: string = options.workspaceRoot || path.resolve(process.cwd());
    const projectRoots: string[] = cliProjectRoots.length > 0 ? cliProjectRoots.map((r: string) => path.resolve(r)) : [workspaceRoot];

    // 1. Create the Unified ecosystem Node (Rank 0)
    const ecosystemId = "ecosystem::global";
    this.graph.getGraph().addNode({
      id: ecosystemId,
      label: "Ecosystem",
      properties: {
        name: path.basename(workspaceRoot),
        filePath: workspaceRoot,
        canonicalKind: 'ECOSYSTEM',
        canonicalRank: 0
      } as any
    });

    // 2. Create repository Nodes (Rank 1)
    const projectMap = new Map<string, string>(); // filePath -> projectRoot
    for (const root of projectRoots) {
      const rootId = path.basename(root).toLowerCase();
      const repoId = `repository::${rootId}`;
      this.graph.getGraph().addNode({
        id: repoId,
        label: "Repository",
        properties: {
          name: path.basename(root),
          filePath: root,
          canonicalKind: 'REPOSITORY',
          canonicalRank: 1,
          parentId: ecosystemId // Oracle DNA: Hierarchical Link
        } as any
      });

      // Materialize Ecosystem -> Repository Link
      this.graph.getGraph().addEdge({
        id: `member::${repoId}->${ecosystemId}`,
        sourceId: repoId,
        targetId: ecosystemId,
        type: 'MEMBER_OF',
        confidence: 1.0,
        properties: {}
      });

      // Populate Project Map for Unit assignment
      for (const file of normalizedFiles) {
        if (file.path.startsWith(root) || file.path === root) {
          const existing = projectMap.get(file.path);
          if (!existing || root.length > existing.length) {
            projectMap.set(file.path, root);
          }
        }
      }
    }
 
    // === Phase 0.1: Recursive Directory Population 🏺 ===
    const directoryIds = new Set<string>();
    for (const file of normalizedFiles) {
      let currentDir = path.dirname(file.path);
      const root = projectMap.get(file.path) || workspaceRoot;
      const rootId = path.basename(root).toLowerCase();
      
      while (currentDir.startsWith(root) && currentDir !== root) {
        const canonicalDir = canonicalize(currentDir);
        if (directoryIds.has(canonicalDir)) break;
        
        const dirId = `directory::${canonicalDir}`;
        const parentDir = path.dirname(currentDir);
        const parentId = parentDir.startsWith(root) && parentDir !== root ? 
          `directory::${canonicalize(parentDir)}` : 
          `repository::${rootId}`;

        this.graph.getGraph().addNode({
          id: dirId,
          label: "Directory",
          properties: {
            name: path.basename(currentDir),
            filePath: canonicalDir,
            canonicalKind: 'DIRECTORY',
            canonicalRank: 2,
            parentId
          } as any
        });

        // Materialize Directory -> Parent Link
        this.graph.getGraph().addEdge({
          id: `member::${dirId}->${parentId}`,
          sourceId: dirId,
          targetId: parentId,
          type: 'MEMBER_OF',
          confidence: 1.0,
          properties: {}
        });
        
        directoryIds.add(canonicalDir);
        currentDir = parentDir;
      }
    }

    // Phase 0.2: Legendary Anchor (Taxonomy Guide) 🏺
    const layers = [
      { id: 'L0', name: 'ECOSYSTEM', rank: 0 },
      { id: 'L1', name: 'REPOSITORY', rank: 1 },
      { id: 'L2', name: 'DIRECTORY', rank: 2 },
      { id: 'L3', name: 'UNIT', rank: 3 },
      { id: 'L4', name: 'INFRA', rank: 4 },
      { id: 'L5', name: 'STRUCTURE', rank: 5 },
      { id: 'L6', name: 'BEHAVIOR', rank: 6 },
      { id: 'L7', name: 'ATOM', rank: 7 },
      { id: 'L8', name: 'DATA', rank: 8 }
    ];

    for (const layer of layers) {
      this.graph.getGraph().addNode({
        id: `taxonomy::${layer.id.toLowerCase()}`,
        label: 'Taxonomy',
        properties: {
          name: layer.name,
          canonicalKind: layer.name,
          canonicalRank: layer.rank,
          parentId: 'ecosystem::legend'
        } as any
      });
      this.graph.getGraph().addEdge({
        id: `member::taxonomy::${layer.id.toLowerCase()}->legend`,
        sourceId: `taxonomy::${layer.id.toLowerCase()}`,
        targetId: 'ecosystem::legend',
        type: 'MEMBER_OF',
        confidence: 1.0,
        properties: {}
      });
    }

    this.graph.getGraph().addNode({
      id: 'ecosystem::legend',
      label: 'Legend',
      properties: {
        name: 'Structural Legend',
        canonicalKind: 'ECOSYSTEM',
        canonicalRank: -1,
        parentId: 'ecosystem::global'
      } as any
    });
    this.graph.getGraph().addEdge({
      id: 'member::legend->global',
      sourceId: 'ecosystem::legend',
      targetId: 'ecosystem::global',
      type: 'MEMBER_OF',
      confidence: 1.0,
      properties: {}
    });

    // Adaptive Memory Pressure Calculation
    const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
    const isLargeProject = normalizedFiles.length > 100;
    const useShallowMode = memoryUsage > 1000 || isLargeProject;

    // === Pass 1: Global Identity Discovery 🏺 ===
    // We build the entire containment graph before induction.
    logger.info(`🛡️ [Conducks] [Pass 1] Structural Discovery: Mapping ${normalizedFiles.length} units (Parallel)...`);
      
    for (const file of normalizedFiles) {
        const filePath = canonicalize(file.path);
        const unitId = `${filePath}::unit`;
        const projectRoot = projectMap.get(file.path) || workspaceRoot;
        const rootName = path.basename(projectRoot).toLowerCase();
        
        // File -> Parent Directory link
        const fileDir = path.dirname(file.path);
        const relativeDir = path.relative(projectRoot, fileDir);
        const parentId = relativeDir === '' || relativeDir === '.' ? 
           `repository::${rootName}` : 
           `directory::${canonicalize(fileDir)}`;

       this.graph.getGraph().addNode({
         id: unitId,
         label: "File",
         properties: {
           name: path.basename(file.path),
           filePath: filePath,
           rawPath: file.path, 
           projectRelativePath: getProjectRelativePath(file.path, workspaceRoot),
           canonicalKind: 'UNIT',
           canonicalRank: 3,
           parentId,
           rootId: `repository::${rootName}`
         } as any
       });

        // Materialize Unit -> Directory/Repository Link
        this.graph.getGraph().addEdge({
          id: `member::${unitId}->${parentId}`,
          sourceId: unitId,
          targetId: parentId,
          type: 'MEMBER_OF',
          confidence: 1.0,
          properties: {}
        });
    }

    let totalNodes = 0;
    let totalEdges = 0;

    // Flush Discovery Pass to clear RAM for Induction
    if (this.persistence) {
      logger.info(`🛡️ [Conducks] [Pass 1.5] Flushing structural hierarchy to vault...`);
      const { nodeCount, edgeCount } = await (this.graph as any).flushAndClear(this.persistence, pulseId);
      totalNodes += nodeCount;
      totalEdges += edgeCount;
    }

    // === Pass 2 & 3: Conducks Streaming Induction & Binding 🛡️ ===
    logger.info(`🛡️ [Conducks] [Pass 2/3] Streaming Resonance: Reflecting ${normalizedFiles.length} units in throttled waves...`);
    
    const CHUNK_SIZE = 500;
    const totalBatches = Math.ceil(normalizedFiles.length / CHUNK_SIZE);

    for (let i = 0; i < normalizedFiles.length; i += CHUNK_SIZE) {
      const chunk = normalizedFiles.slice(i, i + CHUNK_SIZE);
      const batchNum = Math.floor(i / CHUNK_SIZE) + 1;
      
      logger.info(`🛡️ [Conducks] Wave ${batchNum}/${totalBatches}: Inducing ${chunk.length} units...`);
      const inductionResults = await this.runParallelPulse(
        chunk, 
        false, 
        allPaths, 
        context.exportState().registry,
        resourceDir
      );

      for (const res of inductionResults) {
        if (!res.success || !res.spectrum) continue;
        
        const filePath = canonicalize(res.path);
        const unitId = `${filePath}::unit`;
        const projectRoot = projectMap.get(res.path) || workspaceRoot;
        const rootId = `repository::${path.basename(projectRoot).toLowerCase()}`;

        // 3.1 Local Induction (Symbols)
        this.graph.ingestSpectrum(res.path, res.spectrum, useShallowMode, unitId, rootId);

        // 3.2 Global Neural Binding (Imports -> Units)
        for (const rel of res.spectrum.relationships) {
          if (rel.type === 'IMPORTS' && (rel.metadata as any)?.isRaw) {
            const specifier = (rel.metadata as any).specifier;
            const linkage = this.reflector.imports.link(specifier, res.path, allPaths, undefined, context);
            if (linkage) {
              this.graph.getGraph().addEdge({
                id: `NEURAL::${unitId}->${linkage.targetId}`,
                sourceId: unitId,
                targetId: linkage.targetId.includes('::') ? linkage.targetId : `${linkage.targetId}::unit`,
                type: linkage.type,
                confidence: 1.0,
                properties: { specifier }
              });
            }
          }
        }
      }

      // Flush Chunk to Vault & Clear RAM
      if (this.persistence) {
        logger.info(`🛡️ [Conducks] [Wave ${batchNum}] Flushing structural delta to vault...`);
        const { nodeCount, edgeCount } = await (this.graph as any).flushAndClear(this.persistence, pulseId);
        totalNodes += nodeCount;
        totalEdges += edgeCount;
        
        // Recover Heap
        if (global.gc) {
          global.gc();
        }
      }
    }

    // Phase 4: Final Metadata Sync
    if (this.persistence) {
      await this.persistence.run("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)", ['head', pulseId]);
      
      // Conducks Pulse Hardening: Ensure pulse record knows total count.
      await this.persistence.run(
        "INSERT OR REPLACE INTO pulses (id, timestamp, nodeCount, edgeCount, metadata) VALUES (?, ?, ?, ?, ?)",
        [pulseId, Date.now(), totalNodes, totalEdges, JSON.stringify({ totalUnits: normalizedFiles.length })]
      );
    }

    logger.info(`🛡️ [Conducks] Structural Resonance Complete. Pulse ${pulseId} is now frozen in the vault.`);
    logger.info(`🛡️ [Conducks] Synapse Reflection: ${totalNodes} Nodes, ${totalEdges} Edges across ${totalBatches} induction waves.`);
    return { pulseId, nodeCount: totalNodes, edgeCount: totalEdges };
  }

  /**
   * Runs a parallel pulse across workers.
   * Optimized for Native Structural Induction. 🛡️ 🔨 🏎️
   */
  private async runParallelPulse(
    files: Array<{ path: string, source: string }>,
    discoveryMode: boolean,
    allPaths: string[],
    globalSymbols?: Record<string, any>,
    requestedGrammarDir?: string
  ): Promise<any[]> {
    const unitCount = files.length;
    if (unitCount === 0) return [];

    const isTs = __filename.endsWith('.ts');
    const workerScript = path.resolve(__dirname, `../../core/parsing/pulse-worker.${isTs ? 'ts' : 'js'}`);
    const finalResourceDir = requestedGrammarDir || resourceDir;

    const skipWorker = process.env.CONDUCKS_DEBUG === '1' || unitCount < 5;
    if (!skipWorker) {
      const coreCount = Math.max(1, os.cpus().length - 1);
      const chunkSize = Math.ceil(unitCount / coreCount);
      const workerPromises = [];

      for (let i = 0; i < unitCount; i += chunkSize) {
        const chunk = files.slice(i, i + chunkSize);

        const p = new Promise<any[]>((resolve) => {
          const worker = new Worker(workerScript, {
            workerData: { units: chunk, resourceDir: finalResourceDir, allPaths, discoveryMode, globalSymbols },
            execArgv: isTs ? ["--import", "tsx"] : []
          });
          worker.on('message', resolve);
          worker.on('error', (err) => {
            console.error(`🛡️ [Worker Error]`, err);
            resolve([]);
          });
        });
        workerPromises.push(p);
      }

      const results = await Promise.all(workerPromises);
      return results.flat();
    }

    // Main thread fallback for debug or small batches
    const reflector = new ConducksReflector();
    const results = [];
    const providerMap = new Map<string, any>();
    
    for (const file of files) {
      try {
        const ext = path.extname(file.path);
        let provider = providerMap.get(ext);
        if (!provider) {
          provider = this.registry.getProvider(file.path);
          if (provider) providerMap.set(ext, provider);
        }

        if (!provider) {
          results.push({ success: false, path: file.path });
          continue;
        }

        const context = new AnalyzeContext();
        if (discoveryMode) context.setDiscoveryMode(true);
        if (globalSymbols) {
          for (const [id, sym] of Object.entries(globalSymbols)) {
            context.registerGlobalSymbol(id, sym as any);
          }
        }

        const res = await reflector.reflect(file, provider, context, allPaths);
        results.push({ path: file.path, spectrum: res, state: context.exportState(), success: true });
      } catch (err) {
        console.error(`🛡️ [MainThread Error] ${file.path}:`, err);
        results.push({ success: false, path: file.path });
      }
    }
    return results;
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

