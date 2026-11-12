import { describe, it, expect } from '@jest/globals';
import { ConducksAdjacencyList, type ConducksEdge } from '@/lib/core/graph/adjacency-list.js';
import { CycleDetector, formatCycleCluster } from '@/lib/core/graph/algorithms/cycle-detector.js';

/**
 * State-machine audit, 2026-11-12.
 *
 * P-02-5: the SCC walk skips edges the caller filtered out, but the single-node "edge to itself"
 * check did not — so with CALLS ignored (the import-cycle audit), every self-recursive function was
 * reported as a one-node cycle, and `describeCluster`, which DOES apply the filter, then found no
 * route: an ARCH-3 violation printed as "(no edge-valid route found)".
 *
 * P-02-8: the shared edge was counted over EVERY cycle found but printed against the SHOWN ones, so a
 * capped list read "cuts 3/2 shown cycles".
 */
const mkNode = (id: string) => ({ id, label: 'function', properties: { name: id.split('::').pop(), filePath: id.split('::')[0] } });
const mkEdge = (source: string, target: string, type: ConducksEdge['type'] = 'IMPORTS'): ConducksEdge =>
  ({ id: `${source}::${type}::${target}`, sourceId: source, targetId: target, type, confidence: 1, properties: {} });

describe('cycle admission and counting agree', () => {
  it('a filtered-out self edge is not a cycle', () => {
    const graph = new ConducksAdjacencyList();
    graph.addNode(mkNode('/a.ts::fib') as any);
    graph.addEdge(mkEdge('/a.ts::fib', '/a.ts::fib', 'CALLS'));
    expect(CycleDetector.detect(graph, { ignoreTypes: ['CALLS'] as any })).toEqual([]);
    expect(CycleDetector.detect(graph)).toEqual([['/a.ts::fib']]);
  });

  it('the shared-edge count is over the same cycles its denominator names', () => {
    // x -> h, then h -> a|b|c -> x: three cycles, and the edge x -> h is in all three.
    const graph = new ConducksAdjacencyList();
    const ids = ['x', 'h', 'a', 'b', 'c'].map(n => `/${n}.ts::unit`);
    for (const id of ids) graph.addNode(mkNode(id) as any);
    graph.addEdge(mkEdge(ids[0], ids[1]));
    for (const spoke of ids.slice(2)) {
      graph.addEdge(mkEdge(ids[1], spoke));
      graph.addEdge(mkEdge(spoke, ids[0]));
    }
    const text = formatCycleCluster(CycleDetector.describeCluster(graph, ids, {}, 2));
    const m = text.match(/cuts (\d+)\/(\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeLessThanOrEqual(Number(m![2]));
  });
});
