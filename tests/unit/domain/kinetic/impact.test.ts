import { describe, it, expect, beforeEach } from '@jest/globals';
import { BlastRadiusAnalyzer } from '@/lib/domain/kinetic/impact.js';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';

describe('BlastRadiusAnalyzer Unit Tests 💥', () => {
  let analyzer: BlastRadiusAnalyzer;
  let graph: ConducksAdjacencyList;

  beforeEach(() => {
    analyzer = new BlastRadiusAnalyzer();
    graph = new ConducksAdjacencyList();
  });

  describe('Impact Analysis', () => {
    it('should calculate the blast radius using weighted Dijkstra (Upstream)', () => {
      // Setup graph: A -> B -> C (A calls B, B calls C)
      // If C changes, B and A are affected (Upstream)
      graph.addNode({ id: 'A', label: 'f', properties: { name: 'A' } });
      graph.addNode({ id: 'B', label: 'f', properties: { name: 'B' } });
      graph.addNode({ id: 'C', label: 'f', properties: { name: 'C' } });

      graph.addEdge({ id: 'A->B', sourceId: 'A', targetId: 'B', type: 'CALLS' as any, confidence: 1, properties: {} });
      graph.addEdge({ id: 'B->C', sourceId: 'B', targetId: 'C', type: 'CALLS' as any, confidence: 1, properties: {} });

      const impact = analyzer.analyzeImpact(graph, 'C', 'upstream');

      expect(impact.affectedCount).toBe(2);
      expect(impact.affectedNodes[0].id).toBe('B'); // Distance 1.0 (CALLS)
      expect(impact.affectedNodes[1].id).toBe('A'); // Distance 2.0 (CALLS + CALLS)
      expect(impact.impactScore).toBe(1.5); // 1/1 + 1/2
      expect(impact.risk).toBe('LOW');
    });

    it('should respect relationship type weights', () => {
      graph.addNode({ id: 'Base', label: 'class', properties: { name: 'Base' } });
      graph.addNode({ id: 'Sub', label: 'class', properties: { name: 'Sub' } });
      graph.addNode({ id: 'Client', label: 'f', properties: { name: 'Client' } });

      // Sub extends Base (Critical)
      graph.addEdge({ id: 'Sub->Base', sourceId: 'Sub', targetId: 'Base', type: 'EXTENDS' as any, confidence: 1, properties: {} });
      // Client calls Base (Standard)
      graph.addEdge({ id: 'Client->Base', sourceId: 'Client', targetId: 'Base', type: 'CALLS' as any, confidence: 1, properties: {} });

      const impact = analyzer.analyzeImpact(graph, 'Base', 'upstream');

      expect(impact.affectedCount).toBe(2);
      // Sub should be closer than Client because EXTENDS (0.5) < CALLS (1.0)
      expect(impact.affectedNodes[0].id).toBe('Sub');
      expect(impact.affectedNodes[0].distance).toBe(0.5);
      expect(impact.affectedNodes[1].id).toBe('Client');
      expect(impact.affectedNodes[1].distance).toBe(1.0);
    });

    it('should cap the blast radius using maxWeight', () => {
      // 10 nodes calling each other in a chain
      for (let i = 0; i < 10; i++) {
        graph.addNode({ id: `n${i}`, label: 'f', properties: { name: `n${i}` } });
        if (i > 0) {
          graph.addEdge({ id: `n${i-1}->n${i}`, sourceId: `n${i-1}`, targetId: `n${i}`, type: 'CALLS' as any, confidence: 1, properties: {} });
        }
      }

      const impact = analyzer.analyzeImpact(graph, 'n9', 'upstream', 3); // Max weight 3.0

      // Only n8, n7, n6 should be affected (distances 1, 2, 3)
      expect(impact.affectedCount).toBe(3);
      expect(impact.affectedNodes.map(n => n.id)).toEqual(['n8', 'n7', 'n6']);
    });
  });
});
