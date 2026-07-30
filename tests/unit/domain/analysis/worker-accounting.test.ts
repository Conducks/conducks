import { describe, it, expect } from '@jest/globals';
import { AnalyzeOrchestrator } from '@/lib/domain/analysis/orchestrator.js';

/**
 * ADR 0049 — a short wave aborts the pulse instead of committing a partial graph.
 *
 * `WorkerPool` discarded spawnSync's status, a missing output file resolved to `[]`, and the worker's
 * crash path never wrote that file — so a segfault, an OOM kill and a chunk of symbol-free files
 * were the same result. A chunk is files.length / coreCount, so one crash dropped hundreds of files
 * and every downstream count was quietly short.
 *
 * This drives the orchestrator's half: the SECOND line of defence, which exists because the pool's
 * own accounting is the thing being checked and a checker inside the thing it checks shares its
 * blind spot. The pool is stubbed to return fewer results than it was given, which is exactly what a
 * silently-dropped chunk looked like.
 */
describe('the orchestrator refuses a wave that came back short', () => {
  const buildOrchestrator = (returnedPaths: string[]) => {
    const orch = new AnalyzeOrchestrator({ resolve: () => undefined } as any, {
      getGraph: () => ({ setMetadata: () => {}, getAllNodes: () => [], stats: { nodeCount: 0, edgeCount: 0 } }),
      flushAndClear: async () => ({ nodeCount: 0, edgeCount: 0 }),
    } as any);
    // Stub the pool: it reports success while returning fewer results than it was handed.
    (orch as any).workerPool = { run: async () => returnedPaths.map(p => ({ path: p, success: true, spectrum: { nodes: [] } })) };
    (orch as any).skeletonBuilder = { build: () => ({}) };
    (orch as any).reflectionPipeline = { apply: () => {} };
    return orch;
  };

  it('throws naming the files that never came back', async () => {
    const files = [
      { path: '/p/a.ts', source: 'a' },
      { path: '/p/b.ts', source: 'b' },
      { path: '/p/c.ts', source: 'c' },
    ];
    const orch = buildOrchestrator(['/p/a.ts']); // b and c vanished

    await expect(orch.analyze(files, { workspaceRoot: '/p' }))
      .rejects.toThrow(/never accounted for/);
  });

  it('names the specific missing paths, not just a count', async () => {
    const files = [
      { path: '/p/a.ts', source: 'a' },
      { path: '/p/lost.ts', source: 'b' },
    ];
    const orch = buildOrchestrator(['/p/a.ts']);

    await expect(orch.analyze(files, { workspaceRoot: '/p' }))
      .rejects.toThrow(/lost\.ts/);
  });

  it('does not fire when every unit came back', async () => {
    const files = [{ path: '/p/a.ts', source: 'a' }];
    const orch = buildOrchestrator(['/p/a.ts']);

    await expect(orch.analyze(files, { workspaceRoot: '/p' })).resolves.toBeDefined();
  });
});
