import { describe, it, expect } from '@jest/globals';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';
import { ResonanceAnalyzer } from '@/lib/domain/metrics/resonance.js';

function buildGraph(kind: string, kineticValues: number[], edges: Array<[number, number]>): ConducksAdjacencyList {
  const graph = new ConducksAdjacencyList();

  kineticValues.forEach((energy, i) => {
    graph.addNode({
      id: `/repo/${kind}-${i}.ts::${kind}${i}`,
      label: kind,
      properties: {
        name: `${kind}${i}`,
        filePath: `/repo/${kind}-${i}.ts`,
        kineticEnergy: energy,
      },
    });
  });

  edges.forEach(([from, to], i) => {
    graph.addEdge({
      id: `${kind}-edge-${i}`,
      sourceId: `/repo/${kind}-${from}.ts::${kind}${from}`,
      targetId: `/repo/${kind}-${to}.ts::${kind}${to}`,
      type: 'CALLS',
      confidence: 1,
      properties: {},
    });
  });

  return graph;
}

describe('ResonanceAnalyzer Unit Tests 🎼', () => {
  it('should report pristine mirror for structurally identical graphs', () => {
    const analyzer = new ResonanceAnalyzer();
    const g1 = buildGraph('function', [2, 4], [[0, 1]]);
    const g2 = buildGraph('function', [2, 4], [[0, 1]]);

    const result = analyzer.analyzeResonance(g1, g2);

    expect(result.similarity).toBe(100);
    expect(result.summary).toContain('Pristine Mirror');
  });

  it('should report weak resonance for dissimilar topology and typology', () => {
    const analyzer = new ResonanceAnalyzer();
    const g1 = buildGraph('function', [10, 10], [[0, 1]]);
    const g2 = buildGraph('class', [0], []);

    const result = analyzer.analyzeResonance(g1, g2);

    expect(result.similarity).toBeLessThan(40);
    expect(result.summary).toContain('Weak Resonance');
  });
});
