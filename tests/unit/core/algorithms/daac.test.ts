import { describe, it, expect } from '@jest/globals';
import { DAACClustering } from '@/lib/core/algorithms/clustering/daac.js';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';

describe('DAACClustering Unit Tests 🧩', () => {
  it('should merge highly related files into the same community', () => {
    const graph = new ConducksAdjacencyList();

    graph.addNode({
      id: '/repo/src/auth/service.ts',
      label: 'module',
      properties: { name: 'service', filePath: '/repo/src/auth/service.ts' },
    });
    graph.addNode({
      id: '/repo/src/auth/controller.ts',
      label: 'module',
      properties: { name: 'controller', filePath: '/repo/src/auth/controller.ts' },
    });
    graph.addNode({
      id: '/repo/src/billing/service.ts',
      label: 'module',
      properties: { name: 'billing', filePath: '/repo/src/billing/service.ts' },
    });

    graph.addEdge({
      id: 'auth-service-calls-controller',
      sourceId: '/repo/src/auth/service.ts',
      targetId: '/repo/src/auth/controller.ts',
      type: 'CALLS',
      confidence: 1,
      properties: {},
    });

    const clustering = new DAACClustering();
    const clusters = clustering.cluster(graph, 0.5);

    expect(clusters.get('/repo/src/auth/service.ts')).toBe(clusters.get('/repo/src/auth/controller.ts'));
    expect(clusters.get('/repo/src/auth/service.ts')).not.toBe(clusters.get('/repo/src/billing/service.ts'));
  });

  it('should return one cluster per file when threshold is very high', () => {
    const graph = new ConducksAdjacencyList();

    graph.addNode({
      id: '/repo/a.ts',
      label: 'module',
      properties: { name: 'a', filePath: '/repo/a.ts' },
    });
    graph.addNode({
      id: '/repo/b.ts',
      label: 'module',
      properties: { name: 'b', filePath: '/repo/b.ts' },
    });

    const clustering = new DAACClustering();
    const clusters = clustering.cluster(graph, 0.99);

    expect(clusters.size).toBe(2);
    expect(clusters.get('/repo/a.ts')).not.toBe(clusters.get('/repo/b.ts'));
  });
});
