import { describe, it, expect } from '@jest/globals';
import { RegistryBootstrapper } from '@/lib/core/registry-bootstrapper.js';
import { SynapsePersistence } from '@/lib/core/persistence/persistence.js';
import { ConducksGraph } from "@/lib/core/graph/index.js";
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Deferred graph load (todo21#P5, ADR 0036).
 *
 * Materialising the graph costs ~165 MB and 146 ms, and most read-only callers never walk it — the
 * MCP tool surface answers most questions from SQL or from files. `lazy` defers the load until
 * something needs a walkable graph.
 *
 * The danger this file exists to pin is NOT that the deferral fails to save memory. It is that a
 * deferred graph reads as an EMPTY one: measured, four of six MCP tools broke that way and THREE
 * broke SILENTLY — zero nodes, zero flows, symbol-not-found, no error anywhere. So the deferral is
 * only safe while forgetting to materialise is LOUD, and that is what these tests hold.
 */

const mkBootstrapper = () => {
  const graph = new ConducksGraph();
  const persistence = new SynapsePersistence(':memory:', true);
  const bootstrapper = new RegistryBootstrapper();
  return { graph, persistence, bootstrapper };
};

describe('RegistryBootstrapper — the deferred graph load', () => {
  it('reports the graph as deferred until someone asks for it', async () => {
    const { bootstrapper } = mkBootstrapper();
    // Nothing deferred yet on a fresh bootstrapper: `graphIsDeferred` must not read as "true by
    // default", or the guard would fire on every path before initialize() ever ran.
    expect(bootstrapper.graphIsDeferred).toBe(false);
  });

  it('ensureGraphLoaded is a no-op when nothing was deferred', async () => {
    const { bootstrapper, persistence } = mkBootstrapper();
    await expect(bootstrapper.ensureGraphLoaded(persistence)).resolves.toBeUndefined();
    expect(bootstrapper.graphIsDeferred).toBe(false);
  });

  it('runs a deferred load exactly once, however many callers ask', async () => {
    const { bootstrapper, persistence } = mkBootstrapper();
    let loads = 0;
    // Reach past the type to install a pending load without standing up a real vault: what is
    // under test is the once-only contract, not what the loader does.
    (bootstrapper as unknown as { pendingLoad: (p: unknown) => Promise<void> }).pendingLoad =
      async () => { loads++; };

    expect(bootstrapper.graphIsDeferred).toBe(true);
    await Promise.all([
      bootstrapper.ensureGraphLoaded(persistence),
      bootstrapper.ensureGraphLoaded(persistence),
      bootstrapper.ensureGraphLoaded(persistence),
    ]);

    // Three callers, one load — otherwise every tool in a session pays the 165 MB again.
    expect(loads).toBe(1);
    expect(bootstrapper.graphIsDeferred).toBe(false);
  });

  it('passes the CURRENT persistence to the loader, not one captured at defer time', async () => {
    const { bootstrapper } = mkBootstrapper();
    const stale = new SynapsePersistence(':memory:', true);
    const current = new SynapsePersistence(':memory:', true);
    let seen: unknown = null;
    (bootstrapper as unknown as { pendingLoad: (p: unknown) => Promise<void> }).pendingLoad =
      async (p: unknown) => { seen = p; };

    await bootstrapper.ensureGraphLoaded(current);

    // The read-only path closes its connection after loading, so a captured one is dead by the
    // time anybody needs the graph — that produced "Database was already closed" on the first
    // attempt at this feature. The loader must resolve the connection at call time.
    expect(seen).toBe(current);
    expect(seen).not.toBe(stale);
  });

  it('clears a deferral when a later initialize loads the graph eagerly', async () => {
    const { bootstrapper, graph, persistence } = mkBootstrapper();
    const staleLoader = async () => { throw new Error('the previous root\'s loader ran'); };
    const peek = () => (bootstrapper as unknown as { pendingLoad: unknown }).pendingLoad;
    (bootstrapper as unknown as { pendingLoad: unknown }).pendingLoad = staleLoader;
    expect(peek()).toBe(staleLoader);

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-lazy-'));
    const fresh = new SynapsePersistence(root, false);
    await fresh.query('SELECT 1');   // create the vault so a read-only anchor can open it
    await fresh.close();

    await bootstrapper.initialize(
      { readOnly: false, root, lazy: false },
      {
        graph, persistence,
        ignoreManager: { } as never,
        federation: { hydrate: async () => {} } as never,
        updatePersistence: () => {},
        updateIgnoreManager: () => {},
      },
    );

    // An EAGER initialize loads the graph itself and queues nothing — so a deferral left over from
    // the previous anchor must be cleared, or `graphIsDeferred` reports true against a graph that
    // is already in memory and the accessor guard throws on a perfectly valid read. The lazy→lazy
    // case cannot catch this: it overwrites the closure as a side effect.
    expect(peek()).toBeNull();
    expect(bootstrapper.graphIsDeferred).toBe(false);

    fs.rmSync(root, { recursive: true, force: true });
  }, 60000);
});
