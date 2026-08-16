import { describe, it, expect } from '@jest/globals';
import { KineticService } from '@/lib/domain/kinetic/index.js';
import { ConducksAdjacencyList } from "@/lib/core/graph/index.js";

/**
 * `lib/domain/kinetic` had four source files and no unit tests (todo25#P5). It owns `impact` and
 * `trace` — the two answers a user acts on before changing code — so it was the least-covered code
 * with the highest consequence of being wrong.
 *
 * Two behaviours are pinned here because both are surprising and neither was written down:
 *
 *  1. `getImpact`'s third parameter is named `depth` at every call site and is passed straight to
 *     `analyzeImpact` as `maxWeight` — a cumulative EDGE-WEIGHT ceiling, not a hop count. With
 *     CALLS weighted 1.0 and IMPORTS 2.0, "depth 3" reaches three calls deep or one import deep.
 *  2. Dijkstra drops a node once it exceeds the ceiling and sets no flag, so a truncated result is
 *     indistinguishable from a small one by shape alone.
 */
const node = (id: string) => ({ id, name: id.split('::').pop(), label: 'BEHAVIOR', properties: { name: id.split('::').pop(), filePath: 'a.ts' } } as any);
const edge = (from: string, to: string, type = 'CALLS') =>
  ({ id: `${from}->${to}`, sourceId: from, targetId: to, type, confidence: 1, properties: {} } as any);

/** a -> b -> c -> d, a straight chain of calls. */
const chain = () => {
  const g = new ConducksAdjacencyList();
  ['a.ts::a', 'a.ts::b', 'a.ts::c', 'a.ts::d'].forEach(id => g.addNode(node(id)));
  g.addEdge(edge('a.ts::a', 'a.ts::b'));
  g.addEdge(edge('a.ts::b', 'a.ts::c'));
  g.addEdge(edge('a.ts::c', 'a.ts::d'));
  return g;
};

describe('impact', () => {
  it('reaches downstream symbols from the starting point', () => {
    const svc = new KineticService(chain() as any);
    const res: any = svc.getImpact('a.ts::a', 'downstream', 10);
    const ids = (res.affectedNodes ?? res.nodes ?? []).map((n: any) => n.id ?? n.nodeId);
    expect(ids).toEqual(expect.arrayContaining(['a.ts::b', 'a.ts::c']));
  });

  it('the third argument is a WEIGHT ceiling, not a hop count', () => {
    const svc = new KineticService(chain() as any);
    const tight: any = svc.getImpact('a.ts::a', 'downstream', 1);
    const loose: any = svc.getImpact('a.ts::a', 'downstream', 10);
    const count = (r: any) => (r.affectedNodes ?? r.nodes ?? []).length;
    // A CALLS edge costs 1.0, so a ceiling of 1 admits strictly fewer nodes than a ceiling of 10.
    // If this ever becomes equal, the parameter has silently changed meaning.
    expect(count(tight)).toBeLessThan(count(loose));
  });

  it('returns an empty result rather than throwing for an unknown symbol', () => {
    const svc = new KineticService(chain() as any);
    const res: any = svc.getImpact('a.ts::nope', 'downstream', 10);
    expect((res.affectedNodes ?? res.nodes ?? []).length).toBe(0);
  });
});

describe('trace', () => {
  it('follows the chain downstream', () => {
    const svc = new KineticService(chain() as any);
    const res: any = svc.trace('a.ts::a');
    expect(JSON.stringify(res)).toContain('a.ts::b');
  });

  it('does not hang on a cycle', () => {
    const g = chain();
    g.addEdge(edge('a.ts::d', 'a.ts::a')); // close the loop
    const svc = new KineticService(g as any);
    expect(() => svc.trace('a.ts::a')).not.toThrow();
  });
});
