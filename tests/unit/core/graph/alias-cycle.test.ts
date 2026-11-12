import { describe, it, expect } from '@jest/globals';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';
import { IntraLinker } from '@/lib/core/graph/linker-intra.js';

/**
 * ALIASES chains are collapsed to the node that really declares the name, and a cycle must stop at
 * the last REAL node it reached (state-machine audit P-02-7). Two barrels re-exporting each other —
 * `a` aliases `b`, `b` aliases `a` — walked back to the edge's own SOURCE and rebound each edge to
 * itself: `a -> a` and `b -> b`, a node aliasing itself.
 */
const node = (id: string) => ({ id, label: 'ATOM' as any, properties: { name: id.split('::').pop(), filePath: id.split('::')[0], canonicalKind: 'ATOM', unitId: `${id.split('::')[0]}::unit` } as any });
const alias = (s: string, t: string) => ({ id: `${s}->${t}`, sourceId: s, targetId: t, type: 'ALIASES' as any, confidence: 1, properties: {} });

describe('alias chain collapse', () => {
  it('leaves a mutual alias pair as it is, not as two self-aliases', () => {
    const g = new ConducksAdjacencyList();
    g.addNode(node('/a.ts::x'));
    g.addNode(node('/b.ts::x'));
    g.addEdge(alias('/a.ts::x', '/b.ts::x'));
    g.addEdge(alias('/b.ts::x', '/a.ts::x'));
    new IntraLinker(() => undefined).resolve(g);
    const pairs = g.getAllEdges().filter(e => e.type === 'ALIASES').map(e => `${e.sourceId}>${e.targetId}`).sort();
    expect(pairs).toEqual(['/a.ts::x>/b.ts::x', '/b.ts::x>/a.ts::x']);
  });

  it('still collapses a plain chain to its end', () => {
    const g = new ConducksAdjacencyList();
    for (const f of ['a', 'b', 'c']) g.addNode(node(`/${f}.ts::x`));
    g.addEdge(alias('/a.ts::x', '/b.ts::x'));
    g.addEdge(alias('/b.ts::x', '/c.ts::x'));
    new IntraLinker(() => undefined).resolve(g);
    const fromA = g.getAllEdges().filter(e => e.type === 'ALIASES' && e.sourceId === '/a.ts::x').map(e => e.targetId);
    expect(fromA).toEqual(['/c.ts::x']);
  });
});
