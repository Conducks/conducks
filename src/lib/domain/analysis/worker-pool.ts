import { ConducksReflector } from "@/lib/domain/analysis/reflector.js";
import { AnalyzeContext } from "@/lib/core/parsing/context.js";
import { SynapseRegistry } from "@/lib/core/registry/synapse-registry.js";
import { grammars } from "@/lib/core/parsing/grammar-registry.js";
import { ConducksComponent } from "@/contracts/types.js";
import type { PrismSpectrum } from "@/types/prism-types.js";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isTs = __filename.endsWith('.ts');

/**
 * Conducks — Pulse Worker Pool
 *
 * todo03 Phase 5 A1: extracted out of AnalyzeOrchestrator, which mixed dispatch (spawn N node
 * processes, hand each a chunk of files over a temp-file protocol) with graph/edge logic in the same
 * class and method.
 *
 * Why files over stdin/pipes: tree-sitter's native addon is process-bound (one wrapper instance per
 * process — see the note in reflector tests), so real parallelism across files needs SEPARATE
 * processes, not just worker_threads. `spawnSync` + a temp-file in/out protocol is the simplest thing
 * that survives that constraint; a killed subprocess just leaves its chunk's results missing rather
 * than corrupting a shared native structure.
 *
 * `CONDUCKS_WORKERS=0` (or any non-positive value) disables spawning entirely and reflects on the
 * main thread instead — used by tests and small batches, where subprocess overhead would dominate.
 */
export class WorkerPool {
  constructor(private registry: SynapseRegistry<ConducksComponent>) {}

  public async run(
    files: Array<{ path: string, source: string }>,
    discoveryMode: boolean,
    allPaths: string[],
    globalSymbols?: Record<string, any>,
    /** Package names the workspace's manifests declare — see `essence-lens.declaredDependencies`. */
    externalPackages?: string[]
  ): Promise<any[]> {
    const unitCount = files.length;
    if (unitCount === 0) return [];

    const workerScript = isTs
      ? path.resolve(__dirname, `../../core/parsing/pulse-worker.ts`)
      : path.resolve(__dirname, `../../core/parsing/pulse-worker.js`);

    let tsxLoader: string | null = null;
    if (isTs) {
      try {
        const require = createRequire(import.meta.url);
        tsxLoader = require.resolve('tsx');
      } catch {
        tsxLoader = 'tsx'; // Fallback
      }
    }

    const workerCount = parseInt(process.env.CONDUCKS_WORKERS ?? String(Math.max(1, os.cpus().length - 1)), 10);
    // Only CONDUCKS_WORKERS<=0 opts out. The compiled binary used to be excluded here too
    // (`!isTs && tsxLoader === null`), which meant every shipped install parsed single-threaded —
    // todo21#P1. tsxLoader is only needed to run the .ts worker script under tsx; the compiled .js
    // worker runs under plain `node`, so its absence is no longer a reason to skip.
    const skipWorker = workerCount <= 0;
    if (!skipWorker) {
      const coreCount = workerCount;
      const chunkSize = Math.ceil(unitCount / coreCount);
      const chunks: Array<{ path: string, source: string }[]> = [];
      for (let i = 0; i < unitCount; i += chunkSize) {
        chunks.push(files.slice(i, i + chunkSize));
      }

      // Chunks run CONCURRENTLY, bounded by construction — there are at most `coreCount` of them,
      // one per chunk, so no separate semaphore is needed on top of the chunking above. This
      // replaces the previous `await spawnWorker(chunk)` sitting INSIDE the loop, which made the
      // whole pool sequential: it paid the cost of splitting into N chunks and then ran them one at
      // a time, buying zero parallelism (todo21#P1, ADR 0072).
      //
      // `spawn` (async, non-blocking) replaces `spawnSync` for the same reason. The outcome is still
      // INSPECTED (ADR 0049): a dead worker throws loudly naming how many files it lost, rather than
      // resolving to `[]`. On the first failure, every still-running sibling process is killed so a
      // crash does not leave orphaned node processes racing a pulse that has already been aborted.
      const liveProcs = new Set<ReturnType<typeof spawn>>();

      const spawnWorker = (chunk: Array<{ path: string, source: string }>): Promise<any[]> => {
        return new Promise<any[]>((resolve, reject) => {
          const tempInput = path.join(os.tmpdir(), `conducks_in_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
          const tempOutput = path.join(os.tmpdir(), `conducks_out_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);

          fs.writeFileSync(tempInput, JSON.stringify({ units: chunk, allPaths, discoveryMode, globalSymbols, externalPackages, isFork: true, tempOutputFile: tempOutput }));

          const nodeArgs = isTs
            ? ['--no-warnings', '--import', tsxLoader!, workerScript, tempInput]
            : ['--no-warnings', workerScript, tempInput];

          const proc = spawn('node', nodeArgs, {
            env: { ...process.env, CONDUCKS_WORKER_MODE: 'spawn' },
            stdio: 'inherit',
          });
          liveProcs.add(proc);

          let spawnError: Error | null = null;
          let timedOut = false;
          // Generous on purpose, and a guess until something real trips it — a value too low fails
          // legitimate large files, and one too high is indistinguishable from none.
          const timer = setTimeout(() => {
            timedOut = true;
            proc.kill('SIGTERM');
          }, 10 * 60 * 1000);

          const cleanup = () => {
            clearTimeout(timer);
            liveProcs.delete(proc);
            try { fs.unlinkSync(tempInput); } catch { /* best effort */ }
            try { fs.unlinkSync(tempOutput); } catch { /* best effort */ }
          };

          const failChunk = (message: string) => {
            cleanup();
            for (const other of liveProcs) other.kill('SIGTERM');
            reject(new Error(
              `[WorkerPool] Parse worker ${message}. ${chunk.length} file(s) in this chunk were NOT analysed, ` +
              `starting with ${chunk.slice(0, 3).map((u: any) => u.path).join(', ')}. ` +
              `This is a failure, not an empty result — the pulse is aborted rather than silently short.`
            ));
          };

          proc.on('error', (err) => { spawnError = err; });

          proc.on('exit', (code, signal) => {
            if (spawnError || signal || (code !== null && code !== 0)) {
              const how = timedOut && signal === 'SIGTERM' && !spawnError
                ? 'timed out after 10m'
                : signal ? `was killed by ${signal}`
                : spawnError ? `failed to start: ${(spawnError as Error).message}`
                : `exited with status ${code}`;
              failChunk(how);
              return;
            }

            if (fs.existsSync(tempOutput)) {
              try {
                const results = JSON.parse(fs.readFileSync(tempOutput, 'utf8'));
                cleanup();
                resolve(results);
              } catch (e: any) {
                cleanup();
                reject(new Error(`[WorkerPool] Worker output was unreadable (${e.message}). ${chunk.length} file(s) unaccounted for.`));
              }
            } else {
              cleanup();
              reject(new Error(
                `[WorkerPool] Worker exited cleanly but wrote no output file. ${chunk.length} file(s) unaccounted for. ` +
                `An absent result is not an empty one.`
              ));
            }
          });
        });
      };

      const resultChunks = await Promise.all(chunks.map(spawnWorker));
      return resultChunks.flat();
    }

    // Main thread fallback for debug or small batches
    const reflector = new ConducksReflector();
    const results = [];
    const providerMap = new Map<string, any>();
    const loadedGrammars = new Set<string>();

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

        // Load native grammar if not already loaded for this langId
        const langId = provider.langId;
        if (langId && !loadedGrammars.has(langId)) {
          await grammars.loadLanguage(langId);
          loadedGrammars.add(langId);
        }

        const context = new AnalyzeContext();
        if (discoveryMode) context.setDiscoveryMode(true);
        if (globalSymbols) {
          for (const [id, sym] of Object.entries(globalSymbols)) {
            context.registerGlobalSymbol(id, sym);
          }
        }
        for (const pkg of externalPackages ?? []) context.registerExternalPackage(pkg);

        const res = await reflector.reflect(file, provider, context, allPaths);
        results.push({ path: file.path, spectrum: res, state: context.exportState(), success: true });
      } catch (err) {
        console.error(`🛡️ [MainThread Error] ${file.path}:`, err);
        results.push({ success: false, path: file.path });
      }
    }
    return results;
  }
}
