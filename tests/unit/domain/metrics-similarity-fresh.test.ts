import { describe, it, expect } from '@jest/globals';
import { MetricsService } from '@/lib/domain/metrics/index.js';
import { ConducksGraph } from '@/lib/core/graph/index.js';

/**
 * The neighbour weights behind level similarity must follow the graph (state-machine audit P-05-3).
 * They were cached against the EDGE COUNT, so an edit that swapped one call for another — same count,
 * which is exactly what a re-pulse does — kept the old weights: a neighbour no longer reached still
 * counted, and the new one did not.
 */
const fn = (id: string) => ({ id, label: 'BEHAVIOR' as any, properties: { name: id.split('::').pop(), filePath: id.split('::')[0], canonicalKind: 'BEHAVIOR' } as any });
const call = (s: string, t: string) => ({ id: `${s}->${t}`, sourceId: s, targetId: t, type: 'CALLS' as any, confidence: 1, properties: {} });

describe('level similarity after an edit that keeps the edge count', () => {
  it('equals a fresh computation on the edited graph', () => {
    const build = (callers: Array<[string, string]>) => {
      const graph = new ConducksGraph();
      const g = graph.getGraph();
      for (const id of ['/a.ts::a', '/b.ts::b', '/c.ts::c', '/x.ts::x', '/y.ts::y', '/z.ts::z']) g.addNode(fn(id));
      for (const [s, t] of callers) g.addEdge(call(s, t));
      return graph;
    };
    const before: Array<[string, string]> = [['/a.ts::a', '/x.ts::x'], ['/b.ts::b', '/x.ts::x'], ['/c.ts::c', '/x.ts::x'], ['/b.ts::b', '/y.ts::y'], ['/c.ts::c', '/z.ts::z']];

    const graph = build(before);
    const metrics = new MetricsService(graph, {} as any);
    metrics.getLevelSimilarity('/b.ts::b', '/c.ts::c');   // fills the cache

    // a stops calling x and calls y instead: same number of edges.
    const g = graph.getGraph();
    g.replaceFile('/a.ts', new Set(['/a.ts::a']));
    g.addEdge(call('/a.ts::a', '/y.ts::y'));

    const fresh = new MetricsService(build([...before.slice(1), ['/a.ts::a', '/y.ts::y']]), {} as any);
    expect(metrics.getLevelSimilarity('/b.ts::b', '/c.ts::c')).toBeCloseTo(fresh.getLevelSimilarity('/b.ts::b', '/c.ts::c'), 10);
  });
});
