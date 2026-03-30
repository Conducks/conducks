import { describe, it, expect, beforeEach } from '@jest/globals';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';
import { TestAligner } from '@/lib/domain/metrics/test-aligner.js';

describe('TestAligner Unit Tests', () => {
  let graph: ConducksAdjacencyList;
  let aligner: TestAligner;

  beforeEach(() => {
    graph = new ConducksAdjacencyList();
    aligner = new TestAligner();
  });

  it('marks downstream production nodes as covered by a test file', () => {
    graph.addNode({ id: '/repo/tests/service.test.ts::suite', label: 'function', properties: { name: 'suite', filePath: '/repo/tests/service.test.ts', isTest: true } as any });
    graph.addNode({ id: '/repo/src/service.ts::service', label: 'function', properties: { name: 'service', filePath: '/repo/src/service.ts' } as any });

    graph.addEdge({
      id: 't::p::CALLS',
      sourceId: '/repo/tests/service.test.ts::suite',
      targetId: '/repo/src/service.ts::service',
      type: 'CALLS',
      confidence: 1,
      properties: {}
    });

    aligner.align(graph);

    expect(graph.getNode('/repo/src/service.ts::service')?.properties.coveredBy).toEqual(['/repo/tests/service.test.ts']);
  });

  it('does not duplicate coveredBy when multiple paths reach the same node', () => {
    graph.addNode({ id: '/repo/tests/api.test.ts::suite', label: 'function', properties: { name: 'suite', filePath: '/repo/tests/api.test.ts', isTest: true } as any });
    graph.addNode({ id: 'A', label: 'function', properties: { name: 'A', filePath: '/repo/src/a.ts' } as any });
    graph.addNode({ id: 'B', label: 'function', properties: { name: 'B', filePath: '/repo/src/b.ts' } as any });
    graph.addNode({ id: 'C', label: 'function', properties: { name: 'C', filePath: '/repo/src/c.ts' } as any });

    graph.addEdge({ id: '1', sourceId: '/repo/tests/api.test.ts::suite', targetId: 'A', type: 'CALLS', confidence: 1, properties: {} });
    graph.addEdge({ id: '2', sourceId: '/repo/tests/api.test.ts::suite', targetId: 'B', type: 'CALLS', confidence: 1, properties: {} });
    graph.addEdge({ id: '3', sourceId: 'A', targetId: 'C', type: 'CALLS', confidence: 1, properties: {} });
    graph.addEdge({ id: '4', sourceId: 'B', targetId: 'C', type: 'CALLS', confidence: 1, properties: {} });

    aligner.align(graph);

    expect(graph.getNode('C')?.properties.coveredBy).toEqual(['/repo/tests/api.test.ts']);
  });

  it('respects max traversal depth of 5 hops', () => {
    const testId = '/repo/tests/depth.test.ts::suite';
    graph.addNode({ id: testId, label: 'function', properties: { name: 'suite', filePath: '/repo/tests/depth.test.ts', isTest: true } as any });

    for (let i = 1; i <= 6; i++) {
      graph.addNode({ id: `N${i}`, label: 'function', properties: { name: `N${i}`, filePath: `/repo/src/n${i}.ts` } as any });
    }

    graph.addEdge({ id: 'd1', sourceId: testId, targetId: 'N1', type: 'CALLS', confidence: 1, properties: {} });
    graph.addEdge({ id: 'd2', sourceId: 'N1', targetId: 'N2', type: 'CALLS', confidence: 1, properties: {} });
    graph.addEdge({ id: 'd3', sourceId: 'N2', targetId: 'N3', type: 'CALLS', confidence: 1, properties: {} });
    graph.addEdge({ id: 'd4', sourceId: 'N3', targetId: 'N4', type: 'CALLS', confidence: 1, properties: {} });
    graph.addEdge({ id: 'd5', sourceId: 'N4', targetId: 'N5', type: 'CALLS', confidence: 1, properties: {} });
    graph.addEdge({ id: 'd6', sourceId: 'N5', targetId: 'N6', type: 'CALLS', confidence: 1, properties: {} });

    aligner.align(graph);

    expect(graph.getNode('N5')?.properties.coveredBy).toEqual(['/repo/tests/depth.test.ts']);
    expect(graph.getNode('N6')?.properties.coveredBy).toBeUndefined();
  });

  it('uses global test nodes under /tests/ and skips marking test nodes as targets', () => {
    graph.addNode({ id: '/repo/tests/global.ts::all', label: 'file', properties: { name: 'all', filePath: '/repo/tests/global.ts', isGlobalNode: true } as any });
    graph.addNode({ id: '/repo/src/worker.ts::run', label: 'function', properties: { name: 'run', filePath: '/repo/src/worker.ts' } as any });
    graph.addNode({ id: '/repo/tests/other.test.ts::helper', label: 'function', properties: { name: 'helper', filePath: '/repo/tests/other.test.ts', isTest: true } as any });

    graph.addEdge({ id: 'g1', sourceId: '/repo/tests/global.ts::all', targetId: '/repo/src/worker.ts::run', type: 'CALLS', confidence: 1, properties: {} });
    graph.addEdge({ id: 'g2', sourceId: '/repo/tests/global.ts::all', targetId: '/repo/tests/other.test.ts::helper', type: 'CALLS', confidence: 1, properties: {} });

    aligner.align(graph);

    expect(graph.getNode('/repo/src/worker.ts::run')?.properties.coveredBy).toEqual(['/repo/tests/global.ts']);
    expect(graph.getNode('/repo/tests/other.test.ts::helper')?.properties.coveredBy).toBeUndefined();
  });
});
