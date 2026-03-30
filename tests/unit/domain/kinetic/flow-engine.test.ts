import { describe, it, expect, beforeEach } from '@jest/globals';
import { ConducksFlowEngine } from '@/lib/domain/kinetic/flow-engine.js';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';

describe('ConducksFlowEngine Unit Tests 🌬️', () => {
  let flowEngine: ConducksFlowEngine;
  let graph: ConducksAdjacencyList;

  beforeEach(() => {
    graph = new ConducksAdjacencyList();
    flowEngine = new ConducksFlowEngine(graph);
  });

  describe('Execution Flow Tracing', () => {
    it('should trace a simple call circuit from start to finish', () => {
      // A -> B -> C
      graph.addNode({ id: 'A', label: 'f', properties: { name: 'Main', filePath: 'main.js' } });
      graph.addNode({ id: 'B', label: 'f', properties: { name: 'Service', filePath: 'svc.js' } });
      graph.addNode({ id: 'C', label: 'f', properties: { name: 'DB', filePath: 'db.js' } });

      graph.addEdge({ id: 'A->B', sourceId: 'A', targetId: 'B', type: 'CALLS' as any, confidence: 1, properties: {} });
      graph.addEdge({ id: 'B->C', sourceId: 'B', targetId: 'C', type: 'CALLS' as any, confidence: 1, properties: {} });

      const circuit = flowEngine.trace('A');
      
      expect(circuit.start).toBe('Main');
      expect(circuit.totalSteps).toBe(2);
      expect(circuit.steps[0].name).toBe('Service');
      expect(circuit.steps[1].name).toBe('DB');
    });

    it('should handle circular dependencies without infinite loops', () => {
      // A -> B -> A
      graph.addNode({ id: 'A', label: 'f', properties: { name: 'A' } });
      graph.addNode({ id: 'B', label: 'f', properties: { name: 'B' } });
      graph.addEdge({ id: 'A->B', sourceId: 'A', targetId: 'B', type: 'CALLS' as any, confidence: 1, properties: {} });
      graph.addEdge({ id: 'B->A', sourceId: 'B', targetId: 'A', type: 'CALLS' as any, confidence: 1, properties: {} });

      const circuit = flowEngine.trace('A');
      expect(circuit.totalSteps).toBe(2); // A -> B and B -> A (back-edge)
    });
  });

  describe('Process Grouping (Reachability)', () => {
    it('should group internal symbols by entry-point reachability', () => {
      // Entry1 -> A -> B
      // Entry2 -> C
      graph.addNode({ id: 'E1', label: 'f', properties: { name: 'Entry1' } });
      graph.addNode({ id: 'A', label: 'f', properties: { name: 'A' } });
      graph.addNode({ id: 'B', label: 'f', properties: { name: 'B' } });
      graph.addNode({ id: 'E2', label: 'f', properties: { name: 'Entry2' } });
      graph.addNode({ id: 'C', label: 'f', properties: { name: 'C' } });

      graph.addEdge({ id: 'E1->A', sourceId: 'E1', targetId: 'A', type: 'CALLS' as any, confidence: 1, properties: {} });
      graph.addEdge({ id: 'A->B', sourceId: 'A', targetId: 'B', type: 'CALLS' as any, confidence: 1, properties: {} });
      graph.addEdge({ id: 'E2->C', sourceId: 'E2', targetId: 'C', type: 'CALLS' as any, confidence: 1, properties: {} });

      const processes = flowEngine.groupProcesses();
      
      expect(processes['Entry1']).toContain('E1');
      expect(processes['Entry1']).toContain('A');
      expect(processes['Entry1']).toContain('B');
      expect(processes['Entry2']).toContain('E2');
      expect(processes['Entry2']).toContain('C');
      expect(processes['Entry2']).not.toContain('A');
    });
  });
});
