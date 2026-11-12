import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FederatedLinker, ConducksAdjacencyList } from '@/lib/core/graph/index.js';

/**
 * Round 2 of the state-machine audit, on the round-1 fixes to the federated linker:
 *
 *   Q-02-5: the P-02-11 queue was an INSTANCE field, and the process builds several linkers over the
 *           same project (the registry holds one, `createLinker` and `analyze` build their own) — two
 *           of them linking at once still lost a link;
 *   Q-02-6: `hydrate` opened every neighbour's vault and never closed it. MEASURED: after one hydrate
 *           the neighbour's own `analyze` failed "Vault Locked … Another process is WRITING this
 *           vault" for as long as the hydrating process (an MCP server, a mirror) lived.
 */
let base: string;
const project = (name: string) => {
  const dir = path.join(base, name);
  fs.mkdirSync(path.join(dir, '.conducks'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.conducks', 'conducks-synapse.db'), '');
  return dir;
};
beforeEach(() => { base = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-fed2-')); });
afterEach(() => { fs.rmSync(base, { recursive: true, force: true }); jest.restoreAllMocks(); });

describe('federated linker, round 2', () => {
  it('two linkers over the same project keep every link registered at the same time', async () => {
    const a = project('a'), b = project('b'), c = project('c'), d = project('d');
    const main = path.join(base, 'main');
    const one = new FederatedLinker(main), two = new FederatedLinker(main);
    await Promise.all([one.link(a), two.link(b), one.link(c), two.link(d)]);
    expect((await one.getLinks()).sort()).toEqual([a, b, c, d].sort());
  });

  it('closes each neighbour vault it opened, on success and on failure', async () => {
    const a = project('a'), b = project('b');
    const closed: string[] = [];
    const linker = new FederatedLinker(path.join(base, 'main'), undefined, (p: string) => ({
      load: async () => { if (p === a) throw new Error('vault locked'); },
      close: async () => { closed.push(p); },
    }));
    await linker.link(a);
    await linker.link(b);
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await linker.hydrate(new ConducksAdjacencyList());
    expect(closed.sort()).toEqual([a, b].sort());
  });
});
