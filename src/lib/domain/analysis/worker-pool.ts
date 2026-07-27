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

            spawnSync('node', [
              '--no-warnings',
              '--import', tsxLoader!,
              workerScript,
              tempInput
            ], {
              env: { ...process.env, CONDUCKS_WORKER_MODE: 'spawn' },
              stdio: 'inherit'
            });

            if (fs.existsSync(tempOutput)) {
              try {
                const results = JSON.parse(fs.readFileSync(tempOutput, 'utf8'));
                fs.unlinkSync(tempInput);
                fs.unlinkSync(tempOutput);
                resolve(results);
              } catch (e) {
                resolve([]);
              }
            } else {
              resolve([]);
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
