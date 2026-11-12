import { describe, it, expect, afterEach } from '@jest/globals';
import { RegistryBootstrapper } from "@/lib/core/bootstrap/index.js";
import { SynapsePersistence } from "@/lib/core/persistence/index.js";
import { ConducksGraph } from "@/lib/core/graph/index.js";
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * The bootstrapper's anchor and load state (state-machine audit, 2026-11-12, area B).
 *
 *   P-01-2  `graphIsDeferred` read `pendingLoad` only, which the load clears at its START — so for
 *           the whole load the guard let a caller walk a half-filled graph.
 *   P-01-14 a MODE change did not clear the graph before loading the vault into it, so a node the
 *           vault no longer holds survived a read-only → write switch.
 *   P-01-5  the first load hydrated federation from a linker built for `process.cwd()`, not for the
 *           anchored root.
 *   P-10-3  `graphIsStale` / `reloadGraph`: a newer pulse in the vault is noticed and reloaded.
 */
const roots: string[] = [];
afterEach(() => { while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true }); });

const node = (id: string) => ({ id, name: id.split('::').pop(), filePath: id.split('::')[0], canonicalKind: 'BEHAVIOR', canonicalRank: 7, properties: {} });

async function vaultWith(ids: string[], pulseId = 'pulse_1'): Promise<string> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-anchor-state-'));
  roots.push(root);
  const p = new SynapsePersistence(root, false);
  await p.saveNodes(ids.map(node), pulseId);
  await p.run(`INSERT INTO pulses (id, timestamp, nodeCount, edgeCount) VALUES (?, ?, ?, ?)`, [pulseId, Date.now(), ids.length, 0]);
  await p.close();
  return root;
}

const ctx = (graph: ConducksGraph, persistence: SynapsePersistence, extra: Record<string, unknown> = {}) => ({
  graph, persistence,
  ignoreManager: {} as never,
  federationFor: () => ({ hydrate: async () => {} }) as never,
  updatePersistence: () => {},
  updateIgnoreManager: () => {},
  ...extra,
});

describe('the bootstrapper anchor state', () => {
  it('reads as deferred for the WHOLE load, not only until it starts (P-01-2)', async () => {
    const b = new RegistryBootstrapper();
    let finish!: () => void;
    (b as unknown as { pendingLoad: unknown }).pendingLoad = () => new Promise<void>(r => { finish = r; });

    const loading = b.ensureGraphLoaded(new SynapsePersistence(':memory:', true));
    expect(b.graphIsDeferred).toBe(true);
    finish();
    await loading;
    expect(b.graphIsDeferred).toBe(false);
  });

  it('a mode change reloads into an EMPTY graph, so a node the vault dropped is gone (P-01-14)', async () => {
    const root = await vaultWith(['/p/a.ts::kept', '/p/a.ts::dropped']);
    const b = new RegistryBootstrapper();
    const graph = new ConducksGraph();
    let current = new SynapsePersistence(':memory:', true);
    const update = { updatePersistence: (p: SynapsePersistence) => { current = p; } };

    await b.initialize({ readOnly: true, root, lazy: false }, ctx(graph, current, update));
    expect(graph.getGraph().getNode('/p/a.ts::dropped')).toBeDefined();

    // A write session in the same process removes `dropped` from the vault.
    const w = new SynapsePersistence(root, false);
    await w.run(`DELETE FROM nodes WHERE id = '/p/a.ts::dropped'`);
    await w.close();

    await b.initialize({ readOnly: false, root, lazy: false }, ctx(graph, current, update));
    expect(graph.getGraph().getNode('/p/a.ts::kept')).toBeDefined();
    expect(graph.getGraph().getNode('/p/a.ts::dropped')).toBeUndefined();
    await current.close();
  }, 60000);

  it('hydrates federation from a linker for the ANCHORED root (P-01-5)', async () => {
    const root = await vaultWith(['/p/a.ts::x']);
    const b = new RegistryBootstrapper();
    const asked: string[] = [];
    await b.initialize({ readOnly: true, root, lazy: false }, ctx(new ConducksGraph(), new SynapsePersistence(':memory:', true), {
      federationFor: (r: string) => { asked.push(r); return { hydrate: async () => {} }; },
    }));
    expect(asked).toEqual([root]);
  }, 60000);

  it('notices a newer pulse and reloads from it (P-10-3)', async () => {
    const root = await vaultWith(['/p/a.ts::old']);
    const b = new RegistryBootstrapper();
    const graph = new ConducksGraph();
    let current = new SynapsePersistence(':memory:', true);
    await b.initialize({ readOnly: true, root, lazy: true }, ctx(graph, current, { updatePersistence: (p: SynapsePersistence) => { current = p; } }));
    await b.ensureGraphLoaded(current);
    expect(await b.graphIsStale(current)).toBe(false);
    await current.close();   // as every MCP call does on release; the next query reopens it

    const w = new SynapsePersistence(root, false);
    await w.saveNodes([node('/p/a.ts::added')], 'pulse_2');
    await w.run(`INSERT INTO pulses (id, timestamp, nodeCount, edgeCount) VALUES (?, ?, ?, ?)`, ['pulse_2', Date.now() + 1000, 2, 0]);
    await w.close();

    expect(await b.graphIsStale(current)).toBe(true);
    b.reloadGraph(graph);
    await b.ensureGraphLoaded(current);
    expect(graph.getGraph().getNode('/p/a.ts::added')).toBeDefined();
    expect(await b.graphIsStale(current)).toBe(false);
    await current.close();
  }, 60000);

  it('a re-anchor waits out a load still running for the old root (P-01-10)', async () => {
    const root = await vaultWith(['/p/new.ts::fresh']);
    const first = await vaultWith(['/old/root.ts::first']);
    const b = new RegistryBootstrapper();
    const graph = new ConducksGraph();
    // Warm the grammar engine with a first anchor, so the re-anchor below reaches its graph clear
    // without awaiting anything — the window the old load lands in.
    await b.initialize({ readOnly: true, root: first, lazy: true }, ctx(graph, new SynapsePersistence(':memory:', true)));
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    (b as unknown as { pendingLoad: unknown }).pendingLoad = async () => {
      await gate;
      graph.getGraph().addNode({ id: '/old/root.ts::stale', label: 'BEHAVIOR' as never, properties: { name: 'stale', filePath: '/old/root.ts' } as never });
    };

    const oldLoad = b.ensureGraphLoaded(new SynapsePersistence(':memory:', true));
    const reanchor = b.initialize({ readOnly: true, root, lazy: true }, ctx(graph, new SynapsePersistence(':memory:', true)));
    release();
    await oldLoad;
    await reanchor;
    const fresh = new SynapsePersistence(root, true);
    await b.ensureGraphLoaded(fresh);
    await fresh.close();

    expect(graph.getGraph().getNode('/p/new.ts::fresh')).toBeDefined();
    expect(graph.getGraph().getNode('/old/root.ts::stale')).toBeUndefined();
  }, 60000);
});

/**
 * Round 2 (state-machine re-audit, 2026-11-12), the load state as the round-1 fixes left it:
 *
 *   Q-01-2  `loadedPulse === null` meant both "nothing loaded" and "loaded from a vault with no pulse",
 *           so an MCP server started before the first `analyze` never noticed that analyze.
 *   Q-01-1  a load for the OLD root that failed during a re-anchor restored its own closure into
 *           `pendingLoad` after the re-anchor had cleared it; the eager path never re-armed, so the
 *           new root read as deferred forever and its next load ran the old root's closure.
 *   Q-01-4  a load that failed after filling the graph (federation hydrate) left it marked
 *           materialised while the bootstrapper called it deferred, and the retry loaded on top.
 *   Q-01-3  the pulse id was read AFTER the load, so a pulse committed in between was recorded as
 *           loaded and the stale graph was never noticed.
 */
describe('the bootstrapper load state, round 2', () => {
  it('a graph loaded from a vault with no pulse notices the first one (Q-01-2)', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-anchor-nopulse-'));
    roots.push(root);
    const seed = new SynapsePersistence(root, false);
    await seed.saveNodes([node('/p/a.ts::before')], 'pulse_0');
    await seed.close();

    const b = new RegistryBootstrapper();
    const graph = new ConducksGraph();
    let current = new SynapsePersistence(':memory:', true);
    await b.initialize({ readOnly: true, root, lazy: true }, ctx(graph, current, { updatePersistence: (p: SynapsePersistence) => { current = p; } }));
    await b.ensureGraphLoaded(current);
    expect(await b.graphIsStale(current)).toBe(false);
    await current.close();

    const w = new SynapsePersistence(root, false);
    await w.saveNodes([node('/p/a.ts::analyzed')], 'pulse_1');
    await w.run(`INSERT INTO pulses (id, timestamp, nodeCount, edgeCount) VALUES (?, ?, ?, ?)`, ['pulse_1', Date.now(), 2, 0]);
    await w.close();

    expect(await b.graphIsStale(current)).toBe(true);
    await current.close();
  }, 60000);

  it('a failed old-root load does not survive an eager re-anchor (Q-01-1)', async () => {
    const root = await vaultWith(['/p/new.ts::fresh']);
    const first = await vaultWith(['/old/root.ts::first']);
    const b = new RegistryBootstrapper();
    const graph = new ConducksGraph();
    await b.initialize({ readOnly: true, root: first, lazy: true }, ctx(graph, new SynapsePersistence(':memory:', true)));
    let fail!: () => void;
    const gate = new Promise<void>((_, reject) => { fail = () => reject(new Error('Conflicting lock is held')); });
    (b as unknown as { pendingLoad: unknown }).pendingLoad = async () => { await gate; };

    const oldLoad = b.ensureGraphLoaded(new SynapsePersistence(':memory:', true)).catch(() => 'failed');
    const reanchor = b.initialize({ readOnly: true, root, lazy: false }, ctx(graph, new SynapsePersistence(':memory:', true)));
    fail();
    expect(await oldLoad).toBe('failed');
    await reanchor;

    expect(b.graphIsDeferred).toBe(false);
    expect(graph.getGraph().getNode('/p/new.ts::fresh')).toBeDefined();
  }, 60000);

  it('a load that fails after filling the graph leaves it deferred, and the retry starts clean (Q-01-4)', async () => {
    const root = await vaultWith(['/p/a.ts::one', '/p/a.ts::two']);
    const b = new RegistryBootstrapper();
    const graph = new ConducksGraph();
    let hydrations = 0;
    const federationFor = () => ({ hydrate: async (g: any) => {
      hydrations++;
      if (hydrations === 1) throw new Error('neighbour vault locked');
      g.addNode({ id: '/n/x.ts::neighbour', label: 'BEHAVIOR', properties: { name: 'neighbour', filePath: '/n/x.ts' } });
    } }) as never;
    let current = new SynapsePersistence(':memory:', true);
    await b.initialize({ readOnly: true, root, lazy: true }, ctx(graph, current, { federationFor, updatePersistence: (p: SynapsePersistence) => { current = p; } }));

    await expect(b.ensureGraphLoaded(current)).rejects.toThrow('neighbour vault locked');
    expect(b.graphIsDeferred).toBe(true);
    expect(graph.getGraph().isDeferred).toBe(true);   // the guard and the bootstrapper agree

    await b.ensureGraphLoaded(current);
    expect(graph.getGraph().isDeferred).toBe(false);
    expect(graph.getGraph().getNode('/p/a.ts::one')).toBeDefined();
    expect(graph.getGraph().getNode('/n/x.ts::neighbour')).toBeDefined();
    await current.close();
  }, 60000);

  it('records the pulse the load STARTED from, so a pulse landing mid-load reads as stale (Q-01-3)', async () => {
    const root = await vaultWith(['/p/a.ts::one']);
    const b = new RegistryBootstrapper();
    const graph = new ConducksGraph();
    await b.initialize({ readOnly: true, root, lazy: true }, ctx(graph, new SynapsePersistence(':memory:', true)));
    let loaded = false;
    const racing = {
      load: async () => { loaded = true; },   // an outside analyze commits pulse_2 while this runs
      currentPulse: async () => ({ id: loaded ? 'pulse_2' : 'pulse_1', timestamp: 0, commitHash: null, branch: null }),
    } as unknown as SynapsePersistence;
    await b.ensureGraphLoaded(racing);
    expect(await b.graphIsStale(racing)).toBe(true);
  }, 60000);
});
