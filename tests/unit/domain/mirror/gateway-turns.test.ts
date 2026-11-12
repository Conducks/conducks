import { describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { GatewayService } from '@/lib/domain/mirror/index.js';
import { ConducksGraph } from '@/lib/core/graph/index.js';
import { initGlobalMirror } from '@/interfaces/web/mirror/server.js';

/**
 * The mirror's one vault handle is used by one task at a time (state-machine audit, area B).
 *
 *   P-10-11 the queue was an Express middleware released on the response's `close` — which fires
 *           when the browser ABORTS a fetch — so the next request ran beside a handler still using
 *           the shared handle.
 *   P-10-12 every vault `change` event armed its own reload timer, outside the queue, and each one
 *           closed the handle when it finished — under whatever query was running.
 *
 * The fake handle records how many operations are inside it at once; the answer must never be two.
 */
function fakeVault(delayMs: number) {
  const stats = { inside: 0, maxInside: 0, loads: 0, closesDuringOp: 0 };
  const op = async <T>(v: T): Promise<T> => {
    stats.inside++; stats.maxInside = Math.max(stats.maxInside, stats.inside);
    await new Promise(r => setTimeout(r, delayMs));
    stats.inside--;
    return v;
  };
  const persistence = {
    query: (_sql: string) => op([] as any[]),
    load: async () => { stats.loads++; await op(undefined); },
    close: async () => { if (stats.inside > 0) stats.closesDuringOp++; },
    getVisualWave: () => op({ nodes: [], links: [], clusters: [], truncated: false, totalNodes: 0 }),
    fetchNodeDeep: () => op(null),
  };
  return { persistence: persistence as any, stats };
}

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { while (cleanups.length) await cleanups.pop()!(); });

describe('the mirror vault turn', () => {
  it('an aborted request does not let the next one share the handle (P-10-11)', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-mirror-turn-'));
    cleanups.push(() => fs.rmSync(root, { recursive: true, force: true }));
    const { persistence, stats } = fakeVault(300);
    const server = initGlobalMirror(new GatewayService(new ConducksGraph(), persistence, root));
    const port = await server.start(3900 + Math.floor(Math.random() * 500));
    cleanups.push(() => server.stop());

    const aborted = http.get({ host: '127.0.0.1', port, path: '/api/overview' });
    aborted.on('error', () => { /* we abort it */ });
    await new Promise(r => setTimeout(r, 60));
    aborted.destroy();
    await new Promise(r => setTimeout(r, 20));
    await new Promise<void>(resolve => http.get({ host: '127.0.0.1', port, path: '/api/search?q=ab' }, res => { res.resume(); res.on('end', () => resolve()); }));

    expect(stats.maxInside).toBe(1);
    expect(stats.closesDuringOp).toBe(0);
  }, 30000);

  it('a burst of vault writes is ONE reload, never beside a running query (P-10-12)', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-mirror-burst-'));
    cleanups.push(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, '.conducks'));
    const db = path.join(root, '.conducks', 'conducks-synapse.db');
    fs.writeFileSync(db, 'v0');
    const { persistence, stats } = fakeVault(400);
    const graph = new ConducksGraph();
    const gateway = new GatewayService(graph, persistence, root);
    let pulses = 0;
    gateway.watchSynapse(() => { pulses++; });
    cleanups.push(() => gateway.stop());

    for (let i = 1; i <= 5; i++) {
      fs.writeFileSync(db, `v${i}`.repeat(i));
      await new Promise(r => setTimeout(r, 600));
    }
    const busy = gateway.search('abc');   // a query in flight when the reload fires
    await new Promise(r => setTimeout(r, 3500));
    await busy;

    expect(pulses).toBe(1);
    expect(stats.maxInside).toBe(1);
    expect(stats.closesDuringOp).toBe(0);
  }, 30000);
});
