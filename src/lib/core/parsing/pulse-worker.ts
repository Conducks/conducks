import { parentPort, workerData } from 'node:worker_threads';
import { ConducksReflector } from "@/lib/domain/analysis/reflector.js";
import { AnalyzeContext } from "@/lib/core/parsing/context.js";
import { grammars } from "./grammar-registry.js";
import { PythonProvider } from "@/lib/core/parsing/languages/python/index.js";
import path from 'node:path';

/**
 * Conducks — Pulse Worker (v5 Python Pure Mode) 💎
 */

async function runWorker() {
  const { units, grammarDir } = workerData;

  await grammars.init();
  const reflector = new ConducksReflector();
  const context = new AnalyzeContext();
  const allPaths = units.map((u: any) => u.path);

  // Conducks: Python only 🐍
  const providers = new Map<string, any>([
    [".py", new PythonProvider()]
  ]);

  const results = [];

  for (const unit of units) {
    const ext = path.extname(unit.path);
    const provider = providers.get(ext);
    if (!provider) continue;

    try {
      const spectrum = await reflector.reflect(unit, provider, context, allPaths);
      results.push({ path: unit.path, spectrum });
    } catch (err) {
      results.push({ path: unit.path, error: (err as Error).message });
    }
  }

  parentPort?.postMessage(results);
}

runWorker().catch(err => {
  console.error(`[Conducks Pulse Worker] Fatal Error:`, err);
  process.exit(1);
});
