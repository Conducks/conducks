import { describe, it, expect } from '@jest/globals';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';

/**
 * The name and file-path indexes (todo22#P9).
 *
 * Three separate resolvers each answered "which nodes have this name" or "which nodes are in this
 * file" by walking EVERY node in the graph — `ImportResolver.resolveGlobal`, `SymbolLinker.fuzzyLink`
 * and `getNeighborsByFilePath`. Each runs once per import, per unresolved symbol, or per file pair,
 * so each was O(items x nodes), and two of them also COPIED the whole node map per call.
 *
 * An index is only worth having if it cannot go stale, and the risk is entirely in the write paths:
 * an index maintained on add but not on remove keeps handing out ids for nodes that no longer exist,
 * and the resolver then binds an edge to nothing. That failure is silent, so the removal cases below
 * matter more than the lookup ones.
 */

const node = (id: string, name: string, filePath: string) => ({
  id, label: 'BEHAVIOR', isShallow: true,
  properties: { name, filePath, kind: 'function' },
}) as never;

describe('node indexes — lookups that used to be full scans', () => {
  it('finds every node sharing a lowercased name, whatever the original casing', () => {
    const g = new ConducksAdjacencyList();
    g.addNode(node('/r/a.ts::parse', 'Parse', '/r/a.ts'));
    g.addNode(node('/r/b.ts::parse', 'parse', '/r/b.ts'));
    g.addNode(node('/r/c.ts::other', 'other', '/r/c.ts'));

    const ids = g.getNodeIdsByLowerName('parse');
    expect(new Set(ids)).toEqual(new Set(['/r/a.ts::parse', '/r/b.ts::parse']));
  });

  it('groups nodes by the file that declares them', () => {
    const g = new ConducksAdjacencyList();
    g.addNode(node('/r/a.ts::one', 'one', '/r/a.ts'));
    g.addNode(node('/r/a.ts::two', 'two', '/r/a.ts'));
    g.addNode(node('/r/b.ts::three', 'three', '/r/b.ts'));

    expect(new Set(g.getNodeIdsByFilePath('/r/a.ts'))).toEqual(new Set(['/r/a.ts::one', '/r/a.ts::two']));
    expect(new Set(g.getNodeIdsByFilePath('/r/b.ts'))).toEqual(new Set(['/r/b.ts::three']));
  });

  it('returns nothing for a name or path that was never added, without allocating', () => {
    const g = new ConducksAdjacencyList();
    expect(g.getNodeIdsByLowerName('missing').size).toBe(0);
    expect(g.getNodeIdsByFilePath('/nope.ts').size).toBe(0);
    // The same shared empty set, so a miss on a hot path costs no garbage.
    expect(g.getNodeIdsByLowerName('missing')).toBe(g.getNodeIdsByFilePath('/also-nope.ts'));
  });

  /**
   * The case that makes an index dangerous rather than merely stale. A purged unit's symbols are
   * removed on every pulse; if the index kept their ids, `resolveGlobal` would return a node that
   * `getNode` then answers `undefined` for — and the symbol would resolve to nothing while looking
   * like it resolved to something.
   */
  it('forgets a removed node in BOTH indexes, so no lookup returns a dead id', () => {
    const g = new ConducksAdjacencyList();
    g.addNode(node('/r/a.ts::gone', 'gone', '/r/a.ts'));
    g.addNode(node('/r/a.ts::stays', 'stays', '/r/a.ts'));

    g.clearFile('/r/a.ts');
    g.addNode(node('/r/a.ts::stays', 'stays', '/r/a.ts'));

    expect(g.getNodeIdsByLowerName('gone').size).toBe(0);
    expect(new Set(g.getNodeIdsByFilePath('/r/a.ts'))).toEqual(new Set(['/r/a.ts::stays']));
    for (const id of g.getNodeIdsByFilePath('/r/a.ts')) expect(g.getNode(id)).toBeTruthy();
  });

  it('clears both indexes with the graph, so a re-pulse never sees the previous one', () => {
    const g = new ConducksAdjacencyList();
    g.addNode(node('/r/a.ts::x', 'x', '/r/a.ts'));
    g.clear();
    expect(g.getNodeIdsByLowerName('x').size).toBe(0);
    expect(g.getNodeIdsByFilePath('/r/a.ts').size).toBe(0);
  });

  /**
   * `getNeighborsByFilePath` is the reason the path index exists — it used to filter every node in
   * the graph on every call, twice per candidate pair in the co-change engine.
   */
  it('still returns only cross-file edges from getNeighborsByFilePath', () => {
    const g = new ConducksAdjacencyList();
    g.addNode(node('/r/a.ts::caller', 'caller', '/r/a.ts'));
    g.addNode(node('/r/a.ts::sibling', 'sibling', '/r/a.ts'));
    g.addNode(node('/r/b.ts::callee', 'callee', '/r/b.ts'));
    g.addEdge({ id: 'e1', sourceId: '/r/a.ts::caller', targetId: '/r/b.ts::callee', type: 'CALLS' } as never);
    g.addEdge({ id: 'e2', sourceId: '/r/a.ts::caller', targetId: '/r/a.ts::sibling', type: 'CALLS' } as never);

    const out = g.getNeighborsByFilePath('/r/a.ts', 'downstream');
    expect(out.map(o => o.edge.id)).toEqual(['e1']);      // the same-file edge is excluded
    expect(g.getNeighborsByFilePath('/r/unknown.ts', 'downstream')).toEqual([]);
  });
});
