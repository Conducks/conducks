import { describe, it, expect } from '@jest/globals';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';

/**
 * todo21#P5 — the holder the accessor guard cannot see.
 *
 * `registry.infrastructure.graphEngine` throws when a lazy load is still pending, which turns
 * "forgot to await ensureGraphLoaded()" into a loud failure at the call site. But that getter only
 * runs for callers who go THROUGH it. `search`, `kinetic` and `governance` are handed
 * `graph.getGraph()` at construction (`registry/index.ts:118,132,138`) and hold the object directly,
 * so the getter never runs for them: a deferred graph reads as an EMPTY one, every answer is a
 * confident zero, and nothing errors. That is CONDUCKS-13, and it is why `needsGraph` had to be
 * opt-OUT rather than opt-in.
 *
 * So the guard moved onto the OBJECT. Every holder shares one instance, whenever they captured it.
 */
describe('a deferred graph refuses to answer instead of answering nothing', () => {
  it('throws on a read while deferred, naming both ways out', () => {
    const g = new ConducksAdjacencyList();
    g.markDeferred();
    expect(() => g.getAllNodes()).toThrow(/not materialised/);
    expect(() => g.getAllNodes()).toThrow(/ensureGraphLoaded/);
    expect(() => g.getAllNodes()).toThrow(/answer from SQL/);
  });

  it('guards every read a caller could silently get "nothing" from', () => {
    const g = new ConducksAdjacencyList();
    g.markDeferred();
    expect(() => g.getNode('x')).toThrow(/not materialised/);
    expect(() => g.hasNode('x')).toThrow(/not materialised/);
    expect(() => g.getNodesMap()).toThrow(/not materialised/);
    expect(() => g.getAllEdges()).toThrow(/not materialised/);
    expect(() => g.getNeighbors('x')).toThrow(/not materialised/);
  });

  /**
   * The whole point: a service that captured the list BEFORE the deferral is still caught, because
   * the flag lives on the shared instance rather than on the accessor it never used.
   */
  it('catches a holder that captured the graph before it was deferred', () => {
    const g = new ConducksAdjacencyList();
    const capturedAtConstruction = g;          // what `new ConducksSearch(graph.getGraph())` does
    g.markDeferred();
    expect(() => capturedAtConstruction.getAllNodes()).toThrow(/not materialised/);
  });

  it('answers normally once materialised', () => {
    const g = new ConducksAdjacencyList();
    g.markDeferred();
    g.markMaterialised();
    expect(() => g.getAllNodes()).not.toThrow();
    expect(g.isDeferred).toBe(false);
  });

  /**
   * `analyze` defers the vault load on purpose and then builds the graph FROM SOURCE, so it reads a
   * graph nothing ever loaded — legitimately. Guarding on the deferral alone conflated that with the
   * real failure and turned 53 tests red, which is how the distinction was found: the flag means
   * "empty and nobody is filling it", not "the vault load was skipped".
   */
  it('stops guarding as soon as something starts FILLING the graph', () => {
    const g = new ConducksAdjacencyList();
    g.markDeferred();
    expect(() => g.getAllNodes()).toThrow();

    g.addNode({ id: 'a.ts::fn', label: 'symbol', properties: { name: 'fn' } } as never);

    expect(g.isDeferred).toBe(false);
    expect(() => g.getAllNodes()).not.toThrow();
    expect([...g.getAllNodes()]).toHaveLength(1);
  });

  it('is not deferred by default — the guard is opt-in, so nothing existing changes behaviour', () => {
    const g = new ConducksAdjacencyList();
    expect(g.isDeferred).toBe(false);
    expect(() => g.getAllNodes()).not.toThrow();
  });
});
