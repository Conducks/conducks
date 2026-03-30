import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { ConducksAdvisor } from '@/lib/domain/governance/advisor.js';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';

describe('ConducksAdvisor Unit Tests ⚖️', () => {
  let advisor: ConducksAdvisor;
  let graph: ConducksAdjacencyList;

  beforeEach(() => {
    advisor = new ConducksAdvisor();
    graph = new ConducksAdjacencyList();
  });

  describe('Architectural Auditing', () => {
    it('should detect circular dependencies and flag them as errors', () => {
      // Setup cycle: A -> B -> A
      graph.addNode({ id: 'A', label: 'f', properties: { name: 'A' } });
      graph.addNode({ id: 'B', label: 'f', properties: { name: 'B' } });
      graph.addEdge({ id: 'A->B', sourceId: 'A', targetId: 'B', type: 'CALLS' as any, confidence: 1, properties: {} });
      graph.addEdge({ id: 'B->A', sourceId: 'B', targetId: 'A', type: 'CALLS' as any, confidence: 1, properties: {} });

      const advice = advisor.analyze(graph);
      const cycles = advice.filter(a => a.type === 'CIRCULAR');

      expect(cycles).toHaveLength(1);
      expect(cycles[0].level).toBe('ERROR');
      expect(graph.getNode('A')?.properties.anomaly).toBe('cycle');
    });

    it('should identify monolithic hubs (excessive coupling)', () => {
      // Setup hub: H is called by 10 nodes
      graph.addNode({ id: 'H', label: 'f', properties: { name: 'H' } });
      for (let i = 0; i < 20; i++) {
        const id = `node_${i}`;
        graph.addNode({ id, label: 'f', properties: { name: id } });
        graph.addEdge({ id: `${id}->H`, sourceId: id, targetId: 'H', type: 'CALLS' as any, confidence: 1, properties: {} });
      }

      // The stats getter calculates median degree on the fly.
      const advice = advisor.analyze(graph);
      const hubs = advice.filter(a => a.type === 'HUB');

      expect(hubs.some(h => h.nodes.includes('H'))).toBe(true);
      expect(hubs[0].level).toBe('WARNING');
    });

    it('should use intuition to link strings to symbols', () => {
      graph.addNode({ id: 'file.js::targetFunc', label: 'function', properties: { name: 'targetFunc', filePath: 'file.js' } });
      graph.addNode({ id: 'other.js::str', label: 'string', properties: { name: '"targetFunc"', filePath: 'other.js' } });

      const advice = advisor.analyze(graph);
      const intuition = advice.filter(a => a.type === 'INTUITION');

      expect(intuition).toHaveLength(1);
      expect(intuition[0].nodes).toContain('file.js::targetFunc');
      expect(intuition[0].nodes).toContain('other.js::str');
    });
  });

  describe('Composite Risk Scoring (6-Signal Model)', () => {
    it('should calculate risk breakdown correctly', () => {
      const node = {
        id: 'HighRisk',
        label: 'function',
        properties: {
          name: 'HighRisk',
          rank: 0.8,         // High gravity
          complexity: 15,    // High complexity
          resonance: 80,     // High churn
          entropy: 0.7,       // High social fragmentation
          debtMarkers: [1, 2, 3] // Significant debt
        }
      } as any;

      const breakdown = advisor.calculateRiskBreakdown(node, graph);

      expect(breakdown.total).toBeGreaterThan(0.5);
      expect(breakdown.gravity).toBeCloseTo(0.8 * 0.25, 2);
      expect(breakdown.complexity).toBeCloseTo((15 / 20) * 0.35, 2);
    });

    it('should surface high-risk symbols in analysis', () => {
      graph.addNode({
        id: 'DangerZone',
        label: 'function',
        properties: {
          name: 'DangerZone',
          rank: 0.9,
          complexity: 25,
          resonance: 150
        }
      });

      const advice = advisor.analyze(graph);
      const riskAdvice = advice.filter(a => a.message.includes('High Risk Symbols'));

      expect(riskAdvice).toHaveLength(1);
      expect(riskAdvice[0].nodes[0]).toContain('DangerZone');
    });
  });
});
