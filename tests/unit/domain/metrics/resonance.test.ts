/**
 * Ported out of tests/legacy/ on 2026-07-26 (todo18 Phase 3). The resonance analyzer had no other coverage.
 *
 * It was archived, excluded from tsc and jest, and still passing against current source — so
 * it described live behaviour nothing else covered. Kept as it was, apart from its location.
 */
import { describe, it, expect } from '@jest/globals';
import { ConducksAdjacencyList } from "@/lib/core/graph/index.js";
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
    // The summary states SHAPE and STACK as two findings. It used to promote a shape score into
    // "(Same Ecosystem)" — a claim about kinship the analyzer measured nothing to support, which on
    // the real subjects labelled a Python scraper and an Electron app as sharing an ecosystem.
    expect(result.summary).toContain('Near-identical structural shape');
    expect(result.summary.toLowerCase()).not.toContain('same ecosystem');
  });

  it('should report weak resonance for dissimilar topology and typology', () => {
    const analyzer = new ResonanceAnalyzer();
    const g1 = buildGraph('function', [10, 10], [[0, 1]]);
    const g2 = buildGraph('class', [0], []);

    const result = analyzer.analyzeResonance(g1, g2);

    expect(result.similarity).toBeLessThan(40);
    expect(result.summary).toContain('Different structural shape');
  });
});
