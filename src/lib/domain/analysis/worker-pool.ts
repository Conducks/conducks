import { ConducksReflector } from "@/lib/domain/analysis/reflector.js";
import { AnalyzeContext } from "@/lib/core/parsing/context.js";
import { SynapseRegistry } from "@/lib/core/registry/synapse-registry.js";
import { grammars } from "@/lib/core/parsing/grammar-registry.js";
import { ConducksComponent } from "@/contracts/types.js";
import type { PrismSpectrum } from "@/types/prism-types.js";
import { spawnSync } from "node:child_process";
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
    globalSymbols?: Record<string, any>
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
    const skipWorker = workerCount <= 0 || (!isTs && tsxLoader === null);
    if (!skipWorker) {
      // NOTE: tsxLoader is null when running compiled JS; tsxLoader! below will throw if workerCount>0 in that mode.
      const coreCount = workerCount;
      const chunkSize = Math.ceil(unitCount / coreCount);
      const results: Array<{ success: boolean; path: string; spectrum?: PrismSpectrum; state?: unknown }> = [];

      for (let i = 0; i < unitCount; i += chunkSize) {
        const chunk = files.slice(i, i + chunkSize);

        const spawnWorker = async (chunk: string[]) => {
          return new Promise<any[]>((resolve) => {

            const tempInput = path.join(os.tmpdir(), `conducks_in_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
            const tempOutput = path.join(os.tmpdir(), `conducks_out_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);

            fs.writeFileSync(tempInput, JSON.stringify({ units: chunk, allPaths, discoveryMode, globalSymbols, isFork: true, tempOutputFile: tempOutput }));

            // The outcome is INSPECTED (ADR 0049). This return value used to be discarded, and a
            // missing output file resolved to `[]` — so a segfault in a native parser, an OOM kill
            // and a chunk of genuinely symbol-free files were the same result. A chunk is
            // files.length / coreCount, so one crash silently dropped hundreds of files from the
            // pulse and every count downstream was quietly short.
            const proc = spawnSync('node', [
              '--no-warnings',
              '--import', tsxLoader!,
              workerScript,
              tempInput
            ], {
              env: { ...process.env, CONDUCKS_WORKER_MODE: 'spawn' },
              stdio: 'inherit',
              // Generous on purpose, and a guess until something real trips it — a value too low
              // fails legitimate large files, and one too high is indistinguishable from none.
              timeout: 10 * 60 * 1000,
            });

            const cleanup = () => {
              try { fs.unlinkSync(tempInput); } catch { /* best effort */ }
              try { fs.unlinkSync(tempOutput); } catch { /* best effort */ }
            };

            if (proc.error || proc.signal || (proc.status !== null && proc.status !== 0)) {
              cleanup();
              const how = proc.signal === 'SIGTERM' && !proc.error
                ? 'timed out after 10m'
                : proc.signal ? `was killed by ${proc.signal}`
                : proc.error ? `failed to start: ${proc.error.message}`
                : `exited with status ${proc.status}`;
              throw new Error(
                `[WorkerPool] Parse worker ${how}. ${chunk.length} file(s) in this chunk were NOT analysed, ` +
                `starting with ${chunk.slice(0, 3).map((u: any) => u.path).join(', ')}. ` +
                `This is a failure, not an empty result — the pulse is aborted rather than silently short.`
              );
            }

            if (fs.existsSync(tempOutput)) {
              try {
                const results = JSON.parse(fs.readFileSync(tempOutput, 'utf8'));
                cleanup();
                resolve(results);
              } catch (e: any) {
                cleanup();
                throw new Error(`[WorkerPool] Worker output was unreadable (${e.message}). ${chunk.length} file(s) unaccounted for.`);
              }
            } else {
              cleanup();
              throw new Error(
                `[WorkerPool] Worker exited cleanly but wrote no output file. ${chunk.length} file(s) unaccounted for. ` +
                `An absent result is not an empty one.`
              );
            }
          });
        };

        const resultChunk = await spawnWorker(chunk as any);
        results.push(...resultChunk);
      }
      return results;
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
