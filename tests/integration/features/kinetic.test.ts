import { describe, it, expect, beforeEach } from '@jest/globals';
import { ConducksFlowEngine } from '@/lib/domain/kinetic/flow-engine.js';
import { BlastRadiusAnalyzer } from '@/lib/domain/kinetic/impact.js';
import { ConducksAdjacencyList, ConducksNode, ConducksEdge } from '@/lib/core/graph/adjacency-list.js';

describe('Kinetic Domain Integration (Flow & Impact) ⚡', () => {
  let flowEngine: ConducksFlowEngine;
  let impactAnalyzer: BlastRadiusAnalyzer;
  let adjacencyList: ConducksAdjacencyList;

  beforeEach(() => {
    adjacencyList = new ConducksAdjacencyList();
    flowEngine = new ConducksFlowEngine(adjacencyList);
    impactAnalyzer = new BlastRadiusAnalyzer();

    // Seed a call chain: Entry -> A -> B -> C
    const entry: ConducksNode = {
      id: 'src/app.ts::run',
      label: 'function',
      properties: { name: 'run', filePath: 'src/app.ts' }
    };
    const nodeA: ConducksNode = {
      id: 'src/lib/a.ts::funcA',
      label: 'function',
      properties: { name: 'funcA', filePath: 'src/lib/a.ts' }
    };
    const nodeB: ConducksNode = {
      id: 'src/lib/b.ts::funcB',
      label: 'function',
      properties: { name: 'funcB', filePath: 'src/lib/b.ts' }
    };
    const nodeC: ConducksNode = {
      id: 'src/lib/c.ts::funcC',
      label: 'function',
      properties: { name: 'funcC', filePath: 'src/lib/c.ts' }
    };

    adjacencyList.addNode(entry);
    adjacencyList.addNode(nodeA);
    adjacencyList.addNode(nodeB);
    adjacencyList.addNode(nodeC);

    adjacencyList.addEdge({ id: 'e1', sourceId: entry.id, targetId: nodeA.id, type: 'CALLS', confidence: 1.0, properties: {} });
    adjacencyList.addEdge({ id: 'e2', sourceId: nodeA.id, targetId: nodeB.id, type: 'CALLS', confidence: 1.0, properties: {} });
    adjacencyList.addEdge({ id: 'e3', sourceId: nodeB.id, targetId: nodeC.id, type: 'CALLS', confidence: 1.0, properties: {} });
  });

  describe('ConducksFlowEngine Technical Tracing', () => {
    it('should trace the full execution flow from an entry point', () => {
      const circuit = flowEngine.trace('src/app.ts::run');
      expect(circuit.totalSteps).toBe(3);
      expect(circuit.steps[0].name).toBe('funcA');
      expect(circuit.steps[1].name).toBe('funcB');
      expect(circuit.steps[2].name).toBe('funcC');
    });

    it('should group symbols into processes by reachability', () => {
      const processes = flowEngine.groupProcesses();
      expect(processes['run']).toBeDefined();
      expect(processes['run']).toContain('src/lib/c.ts::funcC');
    });
  });

  describe('BlastRadiusAnalyzer (Change Impact)', () => {
    it('should calculate the recursive upstream impact (Who calls ME)', () => {
      // If we change nodeC, who is affected? (B, A, Entry)
      const impact = impactAnalyzer.analyzeImpact(adjacencyList, 'src/lib/c.ts::funcC', 'upstream');
      
      expect(impact.affectedCount).toBe(3);
      const names = impact.affectedNodes.map(n => n.name);
      expect(names).toContain('funcB');
      expect(names).toContain('funcA');
      expect(names).toContain('run');
    });

    it('should factor in structural relationship weights', () => {
       // Add an EXTENDS relationship (weight 0.5) vs CALLS (weight 1.0)
       const nodeD: ConducksNode = {
         id: 'src/lib/d.ts::Base',
         label: 'class',
         properties: { name: 'Base', filePath: 'src/lib/d.ts' }
       };
       const nodeE: ConducksNode = {
         id: 'src/lib/e.ts::Impl',
         label: 'class',
         properties: { name: 'Impl', filePath: 'src/lib/e.ts' }
       };
       adjacencyList.addNode(nodeD);
       adjacencyList.addNode(nodeE);

       adjacencyList.addEdge({ id: 'extends', sourceId: nodeE.id, targetId: nodeD.id, type: 'EXTENDS', confidence: 1.0, properties: {} });
       
       const impact = impactAnalyzer.analyzeImpact(adjacencyList, 'src/lib/d.ts::Base', 'upstream');
       const affected = impact.affectedNodes.find(n => n.name === 'Impl');
       expect(affected?.distance).toBe(0.5); // EXTENDS weight
    });
  });
});
