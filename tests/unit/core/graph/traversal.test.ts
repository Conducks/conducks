import { describe, it, expect } from '@jest/globals';
import { ConducksAdjacencyList } from '@/lib/core/graph/index.js';

/**
 * Blast radius and pathfinding — the two walks `impact` and `trace` are built on (rule 10).
 *
 * `algorithms/traversal.ts` had ZERO statement coverage across the whole suite, which is a strange
 * place for this codebase to have none: `traverseUpstream` is what `impact` reports, and its two
 * guards are the difference between an answer and a hang. A cycle in the graph is not exotic —
 * `audit` exists to find them — so an unvisited-set bug here is a product that stops responding.
 *
 * Driven through `ConducksAdjacencyList`, which is how every caller reaches it, rather than through
 * the static directly: the id-lowercasing (CONDUCKS-4) happens on the way in, and a test that
 * skipped it would pass while every real caller failed.
 */
const node = (id: string, layer = 0) => ({
  id, label: 'BEHAVIOR' as any,
  properties: { name: id.split('::').pop(), filePath: id.split('::')[0], canonicalKind: 'BEHAVIOR', layer } as any,
});

const edge = (from: string, to: string) => ({
  id: `${from}->${to}`, sourceId: from, targetId: to,
  type: 'CALLS' as any, confidence: 1.0, properties: {} as any,
});

/** a -> b -> c, so walking UPSTREAM from c reaches b at 1 and a at 2. */
const chain = (): ConducksAdjacencyList => {
  const g = new ConducksAdjacencyList();
  for (const id of ['/p/a.ts::a', '/p/b.ts::b', '/p/c.ts::c']) g.addNode(node(id));
  g.addEdge(edge('/p/a.ts::a', '/p/b.ts::b'));
  g.addEdge(edge('/p/b.ts::b', '/p/c.ts::c'));
  return g;
};

describe('traverseUpstream — who is affected if this changes', () => {
  it('records each caller at its distance from the start', () => {
    const depths = chain().traverseUpstream('/p/c.ts::c');

    expect(depths.get('/p/c.ts::c')).toBe(0);
    expect(depths.get('/p/b.ts::b')).toBe(1);
    expect(depths.get('/p/a.ts::a')).toBe(2);
  });

  it('stops at maxDepth instead of walking the whole graph', () => {
    const depths = chain().traverseUpstream('/p/c.ts::c', 1);

    expect(depths.has('/p/b.ts::b')).toBe(true);
    expect(depths.has('/p/a.ts::a')).toBe(false);
  });

  it('terminates on a cycle, and reports each node once', () => {
    const g = chain();
    g.addEdge(edge('/p/c.ts::c', '/p/a.ts::a'));

    const depths = g.traverseUpstream('/p/c.ts::c');

    expect(depths.size).toBe(3);
  });

  it('reports the SHORTEST distance when two paths reach the same caller', () => {
    // What the `visited` set actually protects, established by mutation rather than by reading:
    // removing it does NOT hang — `maxDepth` still bounds the walk — so the earlier cycle case
    // passed either way and proved nothing about the guard. What breaks without it is the ANSWER.
    // A node reachable at depth 1 and again at depth 3 gets its entry overwritten by whichever
    // path the queue drains last, and `impact` then reports a direct caller as distant.
    //
    //   far -> near -> start   and   far -> start      (so `far` is 1 away, and also 2 away)
    const g = new ConducksAdjacencyList();
    for (const id of ['/p/start.ts::start', '/p/near.ts::near', '/p/far.ts::far']) g.addNode(node(id));
    g.addEdge(edge('/p/near.ts::near', '/p/start.ts::start'));
    g.addEdge(edge('/p/far.ts::far', '/p/near.ts::near'));
    g.addEdge(edge('/p/far.ts::far', '/p/start.ts::start'));

    expect(g.traverseUpstream('/p/start.ts::start').get('/p/far.ts::far')).toBe(1);
  });

  it('keys the START node by its lowercased id, because ids are lowercased on write', () => {
    // CONDUCKS-4. A user pastes a real-cased path out of their editor and every macOS temp dir has
    // one. Asserted on the START key specifically: every OTHER key comes from an edge, which is
    // already lowercase, so a test that checked a neighbour would pass without the lowercasing and
    // hide the one id that needs it. Mutation caught exactly that.
    const depths = chain().traverseUpstream('/P/C.ts::C');

    expect(depths.has('/p/c.ts::c')).toBe(true);
    expect(depths.has('/P/C.ts::C')).toBe(false);
  });

  it('answers with just the start for a node nothing calls', () => {
    expect([...chain().traverseUpstream('/p/a.ts::a').keys()]).toEqual(['/p/a.ts::a']);
  });
});

describe('traverseAStar — a path between two symbols', () => {
  it('returns the path from start to target, both ends included', () => {
    const path = chain().traverseAStar('/p/a.ts::a', '/p/c.ts::c');

    expect(path[0]).toBe('/p/a.ts::a');
    expect(path[path.length - 1]).toBe('/p/c.ts::c');
  });

  it('returns nothing when no path exists rather than an invented one', () => {
    // A pathfinder that returned a partial walk on failure would be read as "these are connected",
    // and nothing downstream could tell that apart from a real route.
    const g = chain();
    g.addNode(node('/p/z.ts::z'));

    expect(g.traverseAStar('/p/a.ts::a', '/p/z.ts::z')).toEqual([]);
  });

  it('terminates on a cycle here too', () => {
    const g = chain();
    g.addEdge(edge('/p/c.ts::c', '/p/a.ts::a'));

    expect(() => g.traverseAStar('/p/a.ts::a', '/p/c.ts::c')).not.toThrow();
  });
});
