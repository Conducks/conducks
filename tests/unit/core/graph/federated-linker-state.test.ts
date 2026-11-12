import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FederatedLinker } from '@/lib/core/graph/linker-federated.js';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';

/**
 * The federated link list and its hydration (state-machine audit, 2026-11-12):
 *
 *   P-02-11: `link` read the list, added a path and wrote it back with nothing in between, so two
 *            links registered together kept only the last;
 *   P-02-12: `hydrate` stopped at the first neighbour that failed, so every neighbour after it went
 *            unloaded behind one generic error;
 *   P-02-13: a neighbour that loaded fine but added no NEW nodes was reported "Hydration failed".
 */
let base: string;
const project = (name: string) => {
  const dir = path.join(base, name);
  fs.mkdirSync(path.join(dir, '.conducks'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.conducks', 'conducks-synapse.db'), '');
  return dir;
};
beforeEach(() => { base = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-fed-')); });
afterEach(() => { fs.rmSync(base, { recursive: true, force: true }); jest.restoreAllMocks(); });

describe('federated links', () => {
  it('keeps every link registered at the same time', async () => {
    const a = project('a'), b = project('b'), c = project('c');
    const linker = new FederatedLinker(path.join(base, 'main'));
    await Promise.all([linker.link(a), linker.link(b), linker.link(c)]);
    expect((await linker.getLinks()).sort()).toEqual([a, b, c].sort());
  });

  it('a neighbour that fails does not stop the ones after it', async () => {
    const a = project('a'), b = project('b');
    const loaded: string[] = [];
    const linker = new FederatedLinker(path.join(base, 'main'), undefined, (p: string) => ({
      load: async (g: ConducksAdjacencyList) => {
        if (p === a) throw new Error('vault locked');
        loaded.push(p);
        g.addNode({ id: `${p}::x`, label: 'BEHAVIOR', properties: { name: 'x' } } as never);
      },
    }));
    await linker.link(a);
    await linker.link(b);
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await linker.hydrate(new ConducksAdjacencyList());
    expect(loaded).toEqual([b]);
  });

  it('a neighbour that loads but adds nothing new is not reported as failed', async () => {
    const a = project('a');
    const linker = new FederatedLinker(path.join(base, 'main'), undefined, () => ({ load: async () => {} }));
    await linker.link(a);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await linker.hydrate(new ConducksAdjacencyList());
    expect(warn.mock.calls.map(c => String(c[0])).filter(m => /failed/i.test(m))).toEqual([]);
  });
});
