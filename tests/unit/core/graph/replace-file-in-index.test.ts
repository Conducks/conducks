import { describe, it, expect } from '@jest/globals';
import { ConducksAdjacencyList } from '@/lib/core/graph/index.js';

/**
 * `replaceFile` keeps a removed node's INCOMING index while other files' edges still point at it
 * (state-machine audit P-02-1) — but once the last of those edges is gone the entry has nothing to
 * index, and it stayed: an empty set per removed id, for the life of a watch or MCP session
 * (round 2, Q-02-4). `rebindEdgeTarget` already drops an index entry that empties; this matches it.
 */
const node = (id: string, file: string) =>
  ({ id, label: 'BEHAVIOR', properties: { name: id.split('::').pop(), filePath: file, canonicalKind: 'BEHAVIOR' } } as never);

describe('replaceFile and the incoming index', () => {
  it('a removed symbol leaves no index entry once nothing calls it any more', () => {
    const g = new ConducksAdjacencyList();
    for (let i = 0; i < 50; i++) {
      // a.ts declares f<i>, b.ts calls it; then a.ts renames it away and b.ts drops the call.
      g.addNode(node(`/r/a.ts::f${i}`, '/r/a.ts'));
      g.addNode(node('/r/b.ts::caller', '/r/b.ts'));
      g.addEdge({ id: `call${i}`, sourceId: '/r/b.ts::caller', targetId: `/r/a.ts::f${i}`, type: 'CALLS', confidence: 1, properties: {} } as never);
      g.replaceFile('/r/a.ts', new Set());
      g.replaceFile('/r/b.ts', new Set(['/r/b.ts::caller']));
    }
    const inIndex = (g as any).inEdges as Map<string, Set<unknown>>;
    expect([...inIndex.keys()].filter(k => k.startsWith('/r/a.ts::'))).toEqual([]);
  });

  it('while a caller still points at the removed symbol, its upstream edge is kept (P-02-1)', () => {
    const g = new ConducksAdjacencyList();
    g.addNode(node('/r/a.ts::f', '/r/a.ts'));
    g.addNode(node('/r/b.ts::caller', '/r/b.ts'));
    g.addEdge({ id: 'call', sourceId: '/r/b.ts::caller', targetId: '/r/a.ts::f', type: 'CALLS', confidence: 1, properties: {} } as never);
    g.replaceFile('/r/a.ts', new Set());
    expect(g.getNeighbors('/r/a.ts::f', 'upstream').map((e: any) => e.id)).toEqual(['call']);
  });
});
