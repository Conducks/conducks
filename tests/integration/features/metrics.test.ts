import { describe, it, expect, beforeEach } from '@jest/globals';
import { ConducksAdjacencyList, ConducksNode, ConducksEdge } from '@/lib/core/graph/adjacency-list.js';

describe('Metrics Domain Integration (Gravity & Entry Points) 📊', () => {
  let adjacencyList: ConducksAdjacencyList;

  beforeEach(() => {
    adjacencyList = new ConducksAdjacencyList();
  });

  describe('GravityEngine (PageRank Power Iteration)', () => {
    it('should determine structural importance through global convergence', () => {
      // Create a "Star" topology: Multiple nodes call one central "Core"
      const core: ConducksNode = {
        id: 'src/core.ts::Database',
        label: 'class',
        properties: { name: 'Database', filePath: 'src/core.ts', isClass: true }
      };
      adjacencyList.addNode(core);

      for (let i = 0; i < 5; i++) {
        const caller: ConducksNode = {
          id: `src/client${i}.ts::run`,
          label: 'function',
          properties: { name: `run${i}`, filePath: `src/client${i}.ts`, isFunction: true }
        };
        adjacencyList.addNode(caller);
        adjacencyList.addEdge({
          id: `e${i}`,
          sourceId: caller.id,
          targetId: core.id,
          type: 'CALLS',
          confidence: 1.0,
          properties: {}
        });
      }

      // Initial ranks are uniform or log-based. Global recalculate uses power iteration.
      adjacencyList.globalRecalculateGravity(10); // 10 iterations for convergence

      const coreRank = adjacencyList.getNode(core.id)?.properties.rank || 0;
      const callerRank = adjacencyList.getNode('src/client0.ts::run')?.properties.rank || 0;

      // The core (called by many) should have significantly higher gravity than any single caller
      expect(coreRank).toBeGreaterThan(callerRank);
    });

    it('should handle cyclical importance (PageRank loops)', () => {
      const nodeA: ConducksNode = { id: 'A', label: 'function', properties: { name: 'A', filePath: 'f1.ts', isFunction: true } };
      const nodeB: ConducksNode = { id: 'B', label: 'function', properties: { name: 'B', filePath: 'f2.ts', isFunction: true } };
      
      adjacencyList.addNode(nodeA);
      adjacencyList.addNode(nodeB);
      
      adjacencyList.addEdge({ id: 'a-b', sourceId: 'A', targetId: 'B', type: 'CALLS', confidence: 1.0, properties: {} });
      adjacencyList.addEdge({ id: 'b-a', sourceId: 'B', targetId: 'A', type: 'CALLS', confidence: 1.0, properties: {} });

      adjacencyList.globalRecalculateGravity(20);

      const rankA = adjacencyList.getNode('A')?.properties.rank || 0;
      const rankB = adjacencyList.getNode('B')?.properties.rank || 0;

      // In a perfectly symmetric loop, ranks should converge to equality
      expect(Math.abs(rankA - rankB)).toBeLessThan(0.001);
    });
  });

  describe('Entry Point Intelligence', () => {
    it('should identify entry points by naming heuristic', () => {
      const node: ConducksNode = {
        id: 'src/main.ts::main',
        label: 'function',
        properties: { name: 'main', filePath: 'src/main.ts' }
      };
      adjacencyList.addNode(node);
      adjacencyList.detectEntryPoints();

      expect(adjacencyList.getNode(node.id)?.properties.isEntryPoint).toBe(true);
    });

    it('should identify entry points by structural signature (Pure Source)', () => {
      // A node with 0 incoming but multiple outgoing edges is a likely entry point
      const source: ConducksNode = {
        id: 'src/bootstrap.ts::init',
        label: 'function',
        properties: { name: 'init', filePath: 'src/bootstrap.ts' }
      };
      adjacencyList.addNode(source);

      for (let i = 0; i < 4; i++) {
        const leaf: ConducksNode = { id: `leaf-${i}`, label: 'function', properties: { name: 'l', filePath: 'f.ts' } };
        adjacencyList.addNode(leaf);
        adjacencyList.addEdge({ id: `e-${i}`, sourceId: source.id, targetId: leaf.id, type: 'CALLS', confidence: 1.0, properties: {} });
      }

      adjacencyList.detectEntryPoints();
      expect(adjacencyList.getNode(source.id)?.properties.isEntryPoint).toBe(true);
    });
  });
});
