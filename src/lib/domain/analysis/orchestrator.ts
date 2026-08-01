import { grammars } from '@/lib/core/parsing/grammar-registry.js';
import { ConducksPipeline } from "@/lib/core/parsing/pipeline.js";
import { GraphSkeletonBuilder } from "@/lib/domain/analysis/graph-skeleton-builder.js";
import { WorkerPool } from "@/lib/domain/analysis/worker-pool.js";
import { ReflectionPipeline } from "@/lib/domain/analysis/reflection-pipeline.js";
import { ConducksReflector } from "@/lib/core/parsing/reflector.js";
import { AnalyzeContext } from "@/lib/core/parsing/context.js";
import { essenceLens } from "@/lib/core/parsing/essence-lens.js";
import { SynapseRegistry } from "@/lib/core/registry/synapse-registry.js";
import { ConducksGraph } from "@/lib/core/graph/graph-engine.js";
import { TestAligner } from "@/lib/domain/metrics/test-aligner.js";
import { SynapsePersistence } from "@/lib/core/persistence/persistence.js";
import { FileHashGate } from "@/lib/core/persistence/file-hash-gate.js";
import { IgnoreManager } from "@/lib/core/parsing/ignore-manager.js";
import path from "node:path";

import { ConducksComponent } from "@/contracts/types.js";
import { logger } from "@/lib/core/utils/logger.js";
import { traceMemory } from "@/lib/core/utils/mem-trace.js";
import { Worker } from "node:worker_threads";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isTs = __filename.endsWith('.ts');
const workerPath = path.resolve(__dirname, `../../core/parsing/pulse-worker.${isTs ? 'ts' : 'js'}`);

/**
 * Conducks — Analyze Orchestrator
 * 
 * The central orchestration engine for structural analysis.
 * Manages the batch-parallel topological pulse and structural resonance.
 */
export class AnalyzeOrchestrator {

  public context = new AnalyzeContext();
  private skeletonBuilder = new GraphSkeletonBuilder();
  private workerPool: WorkerPool;
  private reflectionPipeline: ReflectionPipeline;

  constructor(
    private registry: SynapseRegistry<ConducksComponent>,
    private graph: ConducksGraph,
    private aligner?: TestAligner,
    private persistence?: SynapsePersistence,
    private reflector: ConducksReflector = new ConducksReflector(),
    private ignoreManager?: IgnoreManager
  ) {
    // Parameter properties (this.registry) are only bound once the constructor body runs, so this
    // can't be a field initializer above — it would read `this.registry` before assignment.
    this.workerPool = new WorkerPool(this.registry);
    this.reflectionPipeline = new ReflectionPipeline(this.registry, this.reflector);
  }

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
    // PREFLIGHT. Native tree-sitter is the only parse path, and it is an OPTIONAL dependency that
    // compiles from source — on a machine with no C++ toolchain it is simply absent. Since the regex
    // fallback was removed (ADR 0089), that state would otherwise throw once PER FILE and bury the
    // one fact that matters in thousands of identical errors. Fail once, and say what to do.
    if (files.length > 0 && !grammars.isNativeAvailable()) {
      throw new Error(
        '[Conducks] native tree-sitter is not available, so no file can be read structurally.\n' +
        '  It is an optional dependency that compiles from source and needs a C++ toolchain.\n' +
        '  On Node 23+: CXXFLAGS="-std=c++20" npm install\n' +
        '  Run `conducks doctor` for the full environment check.\n' +
        '  Refusing to write a graph rather than writing an empty one that looks real.'
      );
    }

    traceMemory(`orchestrator entry (${files.length} units)`);
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

    // Every package this workspace DECLARES, read before anything is parsed.
    //
    // Manifests were read in step 3 of the pulse, after the wave that resolves imports, so
    // `isExternalPackage()` was answering from an empty set at the only moment it is asked. Reading
    // them here costs one JSON.parse per manifest and is what makes step 2 of the resolver exist at
    // all. EVERY manifest in the tree counts, not the root one: on a monorepo `next` is declared in
    // `app/package.json` and the workspace root declares nothing, so a per-service dependency was
    // invisible to the service that uses it.
    for (const f of normalizedFiles) {
      const base = path.basename(f.path);
      if (base !== 'package.json' && base !== 'requirements.txt') continue;
      for (const dep of essenceLens.declaredDependencies(f.path, f.source)) {
        context.registerExternalPackage(dep.toLowerCase());
      }
    }

    // Phase 0 + Pass 1: L0-L3 containment skeleton (ecosystem/repository/directory/unit) and the
    // taxonomy legend — must exist before a single file is parsed (see graph-skeleton-builder.ts).
    const projectMap = this.skeletonBuilder.build(this.graph, normalizedFiles, workspaceRoot, projectRoots);
    traceMemory('after skeleton build');

    // Adaptive Memory Pressure Calculation
    const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
    const isLargeProject = normalizedFiles.length > 100;
    const useShallowMode = memoryUsage > 1000 || isLargeProject;

    let totalNodes = 0;
    let totalEdges = 0;

    // Flush Discovery Pass to clear RAM for Induction
    if (this.persistence) {
      logger.info(`🛡️ [Conducks] [Pass 1.5] Flushing structural hierarchy to vault...`);
      // A flush failure inside the pulse is NOT recoverable, so it is not swallowed. The whole
      // analyze is one transaction; the moment a statement in it fails, DuckDB aborts the
      // transaction and every later statement fails with "Current transaction is aborted". Carrying
      // on produced exactly one useful line — the real error — followed by a wave of misleading
      // ones, and the CLI then printed the LAST of them as fatal. That is why an out-of-memory
      // failure was debugged as a transaction problem for two days.
      const { nodeCount, edgeCount } = await this.graph.flushAndClear(this.persistence, pulseId);
      totalNodes += nodeCount;
      totalEdges += edgeCount;
      traceMemory('after discovery flush');
    }

    // === Pass 2 & 3: Conducks Streaming Induction & Binding 🛡️ ===
    logger.info(`🛡️ [Conducks] [Pass 2/3] Streaming Resonance: Reflecting ${normalizedFiles.length} units in throttled waves...`);
    
    // Wave size. Overridable ONLY so the wave boundary can be varied under measurement — a pulse
    // must produce the same graph at any wave size, and the only way to check that is to run the
    // same tree at two of them and diff the node ids. A bad value falls back to the default rather
    // than producing zero-length or NaN-length waves.
    const chunkOverride = Number.parseInt(process.env.CONDUCKS_CHUNK_SIZE ?? '', 10);
    const CHUNK_SIZE = Number.isFinite(chunkOverride) && chunkOverride > 0 ? chunkOverride : 500;
    const totalBatches = Math.ceil(normalizedFiles.length / CHUNK_SIZE);

    for (let i = 0; i < normalizedFiles.length; i += CHUNK_SIZE) {
      const chunk = normalizedFiles.slice(i, i + CHUNK_SIZE);
      const batchNum = Math.floor(i / CHUNK_SIZE) + 1;
      
      logger.info(`🛡️ [Conducks] Wave ${batchNum}/${totalBatches}: Inducing ${chunk.length} units...`);
      traceMemory(`wave ${batchNum} before parse`);
      const inductionResults = await this.workerPool.run(
        chunk,
        false,
        allPaths,
        context.exportState().registry,
        // A worker builds its OWN context, so anything the main thread knows and does not send is
        // knowledge the worker does not have. The declared packages have to travel the same way the
        // global symbols do, or step 2 of the resolver stays dead inside every subprocess while
        // looking alive on the main thread.
        context.exportState().externalPackages
      );
      traceMemory(`wave ${batchNum} after parse`);

      // Count what came back (ADR 0049). The worker pool now fails loudly on a crashed subprocess,
      // and this is the second line of defence: the pool knows what it spawned, the orchestrator
      // knows what it asked for, and the failure being guarded against is the pool's own
      // accounting. A checker living inside the thing it checks shares its blind spot.
      if (inductionResults.length !== chunk.length) {
        const returned = new Set(inductionResults.map((r: any) => r.path));
        const missing = chunk.filter(f => !returned.has(f.path)).map(f => f.path);
        throw new Error(
          `🛡️ [Conducks] Wave ${batchNum} sent ${chunk.length} unit(s) and received ${inductionResults.length}. ` +
          `${missing.length} file(s) were never accounted for, starting with ${missing.slice(0, 5).join(', ')}. ` +
          `A short wave is silent data loss, so the pulse aborts rather than committing a partial graph.`
        );
      }

      for (const res of inductionResults) {
        this.reflectionPipeline.apply(res, {
          graph: this.graph,
          context,
          allPaths,
          projectMap,
          workspaceRoot,
          useShallowMode,
        });
      }
      traceMemory(`wave ${batchNum} after reflect`);

      // Flush Chunk to Vault & Clear RAM
      if (this.persistence) {
        logger.info(`🛡️ [Conducks] [Wave ${batchNum}] Flushing structural delta to vault...`);
        // Same reasoning as the discovery flush above: the transaction is already aborted, so the
        // remaining waves cannot succeed and the errors they produce hide the one that matters.
        // `flushAndClear` also only clears AFTER a successful write, so continuing kept re-flushing
        // an ever-growing graph — waves 3, 4 and 5 of a failed run each reported ~6,600 nodes.
        const { nodeCount, edgeCount } = await this.graph.flushAndClear(this.persistence, pulseId);
        totalNodes += nodeCount;
        totalEdges += edgeCount;
        traceMemory(`wave ${batchNum}/${totalBatches}`);

        // DF1: Write per-symbol kinetic columns from spectrum kinetic blobs.
        //
        // Collected and written in ONE call, not one statement per symbol. Inside the pulse
        // transaction DuckDB charges per statement, so the per-symbol loop this replaced grew from
        // 1,243 ms in wave 1 to 1,665 ms by wave 8 on a 4,000-file project while the rows per wave
        // stayed flat — and from 11 s to 97 s on a 9,310-unit one. Same trap ADR 0041 batched the
        // node and edge writes to escape; this call site was missed.
        //
        // NOT wrapped in a catch. It runs inside the pulse transaction, so the first failure aborts
        // it and every later statement reports `Current transaction is aborted` — exactly the
        // circuit-breaker mistake removed from the flush above. A silent catch here hid a real
        // constraint violation behind a transaction error for two debugging rounds.
        // A file that could not be read is REPORTED, never silently skipped (ADR 0089). This loop
        // used to `continue` past a failure with no count anywhere, which is how a broken grammar or
        // a malformed query could cost a whole language and still print a healthy-looking pulse.
        const failures = inductionResults.filter((r: any) => !r.success && !r.skipped);
        if (failures.length > 0) {
          logger.error(`🛡️ [Conducks] ${failures.length} file(s) could NOT be read structurally — their symbols and edges are MISSING from this graph:`);
          for (const f of failures.slice(0, 10)) {
            logger.error(`   ${(f as any).path}: ${(f as any).error ?? 'no reason recorded'}`);
          }
          if (failures.length > 10) logger.error(`   ...and ${failures.length - 10} more`);
        }

        const kineticRows: Array<{ nodeId: string; blame_age_days?: number; churn_count_90d?: number; entropy_score?: number; last_author?: string }> = [];
        for (const res of inductionResults) {
          if (!res.success || !res.spectrum) continue;
          for (const n of (res.spectrum.nodes || [])) {
            const kinetic = n.metadata?.kinetic;
            const nodeId = n.metadata?.id;
            if (!nodeId || !kinetic) continue;
            kineticRows.push({
              nodeId,
              blame_age_days: kinetic.tenureDays ?? undefined,
              churn_count_90d: kinetic.resonance ?? undefined,
              entropy_score: kinetic.entropy ?? undefined,
              last_author: kinetic.primaryAuthor || undefined,
            });
          }
        }
        await this.persistence!.updateKineticBatch(kineticRows);

        // Recover Heap
        if (global.gc) {
          global.gc();
        }
      }
    }

    // Phase 4: Final Metadata Sync
    if (this.persistence) {
      // Seed the hash gate for every file this pulse analyzed (todo17 Phase 1). Without this the
      // watcher has nothing to compare against after a fresh `analyze`, so the first save of every
      // file re-parses it — the gate would only start paying off on the second edit.
      // Reaching here means every flush succeeded — a failed one now throws and the pulse rolls
      // back — so there is no longer a committed-but-incomplete state for the hash gate to guard
      // against. The `incomplete` flag this used to carry was always false once that became true,
      // and a flag that cannot be set is worse than none: it reads as a check that ran.
      await this.persistence.setFileHashBatch(normalizedFiles.map(file => ({
        file: file.path,
        hash: FileHashGate.hash(file.source),
        sizeBytes: Buffer.byteLength(file.source),
      })));

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
   * Performs structural resonance (Gravity recalculation and global linking).
   */
  public resonate(): void {
    this.graph.resonate();
    if (this.aligner) {
      this.aligner.align(this.graph.getGraph());
    }
  }
}

