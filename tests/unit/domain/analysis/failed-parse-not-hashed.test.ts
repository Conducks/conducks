import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AnalyzeOrchestrator } from '@/lib/domain/analysis/orchestrator.js';
import { ConducksGraph } from "@/lib/core/graph/index.js";
import { SynapseRegistry } from "@/lib/core/registry/index.js";
import { TypeScriptProvider, grammars } from "@/lib/core/parsing/index.js";
import { SynapsePersistence } from '@/lib/core/persistence/persistence.js';
import { ConducksComponent } from "@/contracts/index.js";

/**
 * A file that could not be parsed must not be recorded as analyzed (state-machine audit P-06-1).
 *
 * The orchestrator logged the failure ("their symbols and edges are MISSING from this graph") and
 * then hashed EVERY file of the pulse, the failed one included. The next `analyze` then saw a
 * recorded hash and an older mtime and never read the file again: its symbols stayed missing until
 * the file changed or `--force` was given.
 */
describe('a failed parse leaves no file hash', () => {
  let root: string;
  let prevWorkers: string | undefined;
  beforeAll(async () => {
    prevWorkers = process.env.CONDUCKS_WORKERS;
    process.env.CONDUCKS_WORKERS = '0';
    await grammars.loadLanguage('typescript');
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-failed-parse-'));
  });
  afterAll(() => {
    if (prevWorkers === undefined) delete process.env.CONDUCKS_WORKERS; else process.env.CONDUCKS_WORKERS = prevWorkers;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('hashes the file that parsed and not the one that failed', async () => {
    const registry = new SynapseRegistry<ConducksComponent>();
    registry.registerProvider('.ts', new TypeScriptProvider());
    const orchestrator = new AnalyzeOrchestrator(registry, new ConducksGraph());
    const vault = new SynapsePersistence(root, false);
    orchestrator.setPersistence(vault);

    const pool = (orchestrator as any).workerPool;
    const real = pool.run.bind(pool);
    pool.run = async (chunk: Array<{ path: string }>, ...rest: unknown[]) => {
      const results = await real(chunk, ...rest);
      return results.map((r: any) => r.path.endsWith('bad.ts') ? { path: r.path, success: false, error: 'grammar crashed' } : r);
    };

    await orchestrator.analyze([
      { path: `${root}/src/good.ts`, source: 'export function good() { return 1; }\n' },
      { path: `${root}/src/bad.ts`, source: 'export function bad() { return 2; }\n' },
    ], { workspaceRoot: root });

    const hashed = [...(await vault.getAllFileHashes()).keys()].map(f => path.basename(f)).sort();
    await vault.close();
    expect(hashed).toEqual(['good.ts']);
  }, 60000);
});
