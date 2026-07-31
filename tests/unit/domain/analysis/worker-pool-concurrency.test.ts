import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';

/**
 * todo21#P1, ADR 0072 — `spawnSync` was awaited INSIDE the chunk loop, so a pool sized to the core
 * count ran its chunks one at a time: it paid the cost of splitting work into N pieces and bought
 * none of the parallelism. This mocks `node:child_process` so the test proves the POOL's dispatch
 * shape (are all chunks launched together, and does a dead worker still fail loudly per ADR 0049)
 * without paying for a real tree-sitter grammar load or process boot per chunk.
 *
 * Reverting `worker-pool.ts` to the old `for (...) { await spawnWorker(chunk) }` shape turns the
 * first test red (spawns land DELAY_MS apart instead of together) while leaving the second green —
 * confirming the first test is the one actually pinning the concurrency fix.
 */

const mockState: {
  timestamps: number[];
  liveProcs: Array<EventEmitter & { kill: jest.Mock }>;
  handler: (proc: EventEmitter & { kill: jest.Mock }, tempInput: string, tempOutputFile: string) => void;
} = {
  timestamps: [],
  liveProcs: [],
  handler: () => {},
};

// Real ESM (this project runs jest with --experimental-vm-modules) does not let `jest.mock`
// intercept a Node builtin the way it does a userland module — `jest.unstable_mockModule` plus a
// dynamic import of the module under test is the mechanism Jest documents for this case.
jest.unstable_mockModule('node:child_process', () => ({
  spawn: jest.fn((_cmd: string, args: string[]) => {
    mockState.timestamps.push(Date.now());
    const proc = new EventEmitter() as EventEmitter & { kill: jest.Mock };
    (proc as any).kill = jest.fn();
    mockState.liveProcs.push(proc);
    const tempInput = args[args.length - 1] as string;
    const inputData = JSON.parse(fs.readFileSync(tempInput, 'utf8'));
    mockState.handler(proc, tempInput, inputData.tempOutputFile);
    return proc;
  }),
}));

const { WorkerPool } = await import('@/lib/domain/analysis/worker-pool.js');

function makeFiles(n: number) {
  return Array.from({ length: n }, (_, i) => ({ path: `/p/f${i}.ts`, source: 'const x = 1;' }));
}

describe('WorkerPool dispatches chunks concurrently', () => {
  const originalWorkers = process.env.CONDUCKS_WORKERS;

  beforeEach(() => {
    mockState.timestamps = [];
    mockState.liveProcs = [];
    mockState.handler = () => {};
    process.env.CONDUCKS_WORKERS = '4';
  });

  afterEach(() => {
    if (originalWorkers === undefined) delete process.env.CONDUCKS_WORKERS;
    else process.env.CONDUCKS_WORKERS = originalWorkers;
    jest.clearAllMocks();
  });

  it('launches every chunk before the first one exits, instead of one at a time', async () => {
    const DELAY_MS = 100;
    mockState.handler = (proc, _tempInput, tempOutputFile) => {
      setTimeout(() => {
        fs.writeFileSync(tempOutputFile, JSON.stringify([]));
        proc.emit('exit', 0, null);
      }, DELAY_MS);
    };

    const files = makeFiles(4); // CONDUCKS_WORKERS=4 -> chunkSize 1 -> 4 chunks
    const pool = new WorkerPool({} as any);
    await pool.run(files, false, files.map(f => f.path));

    expect(mockState.timestamps).toHaveLength(4);
    const spread = Math.max(...mockState.timestamps) - Math.min(...mockState.timestamps);
    // Sequential dispatch (the bug) spaces launches ~DELAY_MS apart — ~300ms for the last of 4.
    // Concurrent dispatch launches all 4 within a few ms of each other, regardless of DELAY_MS.
    expect(spread).toBeLessThan(DELAY_MS / 2);
  });

  it('a dead worker fails loudly naming the lost files (ADR 0049) and kills its still-running siblings', async () => {
    let callIndex = 0;
    mockState.handler = (proc, _tempInput, tempOutputFile) => {
      const isFirst = callIndex === 0;
      callIndex++;
      if (isFirst) {
        setTimeout(() => proc.emit('exit', 1, null), 5); // crashes almost immediately
      } else {
        setTimeout(() => {
          fs.writeFileSync(tempOutputFile, JSON.stringify([]));
          proc.emit('exit', 0, null);
        }, 300); // still running when the first one dies
      }
    };

    const files = makeFiles(4);
    const pool = new WorkerPool({} as any);

    await expect(pool.run(files, false, files.map(f => f.path)))
      .rejects.toThrow(/exited with status 1/);

    const killedCount = mockState.liveProcs.filter(p => p.kill.mock.calls.length > 0).length;
    expect(killedCount).toBeGreaterThan(0);
  });
});
