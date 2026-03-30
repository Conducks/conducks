import { describe, it, expect, beforeEach } from '@jest/globals';
import { ConducksAdjacencyList, ConducksNode, ConducksEdge } from '@/lib/core/graph/adjacency-list.js';

describe('ConducksAdjacencyList Unit Tests 💎', () => {
  let graph: ConducksAdjacencyList;

  beforeEach(() => {
    graph = new ConducksAdjacencyList();
  });

  describe('Node & Edge Management', () => {
    it('should add and retrieve nodes idempotently', () => {
      const node: ConducksNode = {
        id: 'node1',
        label: 'function',
        properties: { name: 'func1', filePath: 'file1.py' }
      };

      graph.addNode(node);
      expect(graph.getNode('node1')).toBe(node);

      // Idempotency: adding again should not change anything
      graph.addNode({ ...node, label: 'class' });
      expect(graph.getNode('node1')?.label).toBe('function');
    });

    it('should add edges and update gravity heuristics', () => {
      const n1: ConducksNode = { id: 'n1', label: 'f', properties: { name: 'n1', filePath: 'f1' } };
      const n2: ConducksNode = { id: 'n2', label: 'f', properties: { name: 'n2', filePath: 'f1' } };
      graph.addNode(n1);
      graph.addNode(n2);

      const edge: ConducksEdge = {
        id: 'n1::n2::CALLS',
        sourceId: 'n1',
        targetId: 'n2',
        type: 'CALLS',
        confidence: 1.0,
        properties: {}
      };

      graph.addEdge(edge);

      const neighbors = graph.getNeighbors('n1', 'downstream');
      expect(neighbors).toHaveLength(1);
      expect(neighbors[0].targetId).toBe('n2');

      const incoming = graph.getNeighbors('n2', 'upstream');
      expect(incoming).toHaveLength(1);
      expect(incoming[0].sourceId).toBe('n1');

      // Check heuristic gravity
      expect(graph.getNode('n2')?.properties.kineticEnergy).toBe(2); // (In * 2) + Out
      expect(graph.getNode('n1')?.properties.kineticEnergy).toBe(1); // (In * 2) + Out
    });

    it('should rebind edges surgically', () => {
      const n1: ConducksNode = { id: 'n1', label: 'f', properties: { name: 'n1', filePath: 'f1' } };
      const n2: ConducksNode = { id: 'n2', label: 'f', properties: { name: 'n2', filePath: 'f1' } };
      const n3: ConducksNode = { id: 'n3', label: 'f', properties: { name: 'n3', filePath: 'f1' } };
      graph.addNode(n1);
      graph.addNode(n2);
      graph.addNode(n3);

      const edge: ConducksEdge = {
        id: 'n1::n2::CALLS',
        sourceId: 'n1',
        targetId: 'n2',
        type: 'CALLS',
        confidence: 1.0,
        properties: {}
      };

      graph.addEdge(edge);
      graph.rebindEdgeTarget(edge, 'n3');

      expect(graph.getNeighbors('n2', 'upstream')).toHaveLength(0);
      expect(graph.getNeighbors('n3', 'upstream')).toHaveLength(1);
      expect(edge.targetId).toBe('n3');
    });

    it('should clear all nodes and data associated with a file', () => {
      graph.addNode({ id: 'f1::a', label: 'f', properties: { name: 'a', filePath: 'f1.py' } });
      graph.addNode({ id: 'f1::b', label: 'f', properties: { name: 'b', filePath: 'f1.py' } });
      graph.addNode({ id: 'f2::c', label: 'f', properties: { name: 'c', filePath: 'f2.py' } });

      graph.addEdge({ id: 'a::c', sourceId: 'f1::a', targetId: 'f2::c', type: 'CALLS', confidence: 1, properties: {} });

      graph.clearFile('f1.py');

      expect(graph.getNode('f1::a')).toBeUndefined();
      expect(graph.getNode('f1::b')).toBeUndefined();
      expect(graph.getNode('f2::c')).toBeDefined();
      expect(graph.getNeighbors('f2::c', 'upstream')).toHaveLength(0);
    });
  });

  describe('Search & Indexing', () => {
    it('should use fast index for exact name lookups', () => {
      graph.addNode({ id: 'n1', label: 'f', properties: { name: 'TargetFunc', filePath: 'f1' } });
      graph.addNode({ id: 'n2', label: 'f', properties: { name: 'Other', filePath: 'f2' } });

      const matches = graph.findNodesByName('TargetFunc');
      expect(matches).toHaveLength(1);
      expect(matches[0].id).toBe('n1');
    });

    it('should fall back to fuzzy resonance for namespaced queries', () => {
      graph.addNode({ id: 'n1', label: 'class', properties: { name: 'ConducksController', filePath: 'f1' } });

      const matches = graph.findNodesByName('Conducks');
      expect(matches).toHaveLength(1);
      expect(matches[0].properties.name).toBe('ConducksController');
    });
  });

  describe('Graph Algorithms', () => {
    it('should detect circular dependencies (SCC)', () => {
      // Circular: A -> B -> C -> A
      graph.addNode({ id: 'A', label: 'f', properties: { name: 'A', filePath: 'f1' } });
      graph.addNode({ id: 'B', label: 'f', properties: { name: 'B', filePath: 'f1' } });
      graph.addNode({ id: 'C', label: 'f', properties: { name: 'C', filePath: 'f1' } });

      graph.addEdge({ id: 'A->B', sourceId: 'A', targetId: 'B', type: 'CALLS', confidence: 1, properties: {} });
      graph.addEdge({ id: 'B->C', sourceId: 'B', targetId: 'C', type: 'CALLS', confidence: 1, properties: {} });
      graph.addEdge({ id: 'C->A', sourceId: 'C', targetId: 'A', type: 'CALLS', confidence: 1, properties: {} });

      const cycles = graph.detectCycles();
      expect(cycles).toHaveLength(1);
      expect(cycles[0]).toContain('A');
      expect(cycles[0]).toContain('B');
      expect(cycles[0]).toContain('C');
    });

    it('should calculate global structural gravity (PageRank)', () => {
      // Hub and Spoke
      graph.addNode({ id: 'Hub', label: 'class', properties: { name: 'Hub', isClass: true, filePath: 'h' } });
      for (let i = 0; i < 5; i++) {
        const id = `Spoke${i}`;
        graph.addNode({ id, label: 'function', properties: { name: id, isFunction: true, filePath: 's' } });
        graph.addEdge({ id: `${id}->Hub`, sourceId: id, targetId: 'Hub', type: 'CALLS', confidence: 1, properties: {} });
      }

      graph.globalRecalculateGravity(20);

      const hubRank = graph.getNode('Hub')?.properties.rank || 0;
      const spokeRank = graph.getNode('Spoke0')?.properties.rank || 0;

      expect(hubRank).toBeGreaterThan(spokeRank);
    });

    it('should traverse blast radius via upstream BFS', () => {
      // Dependency chain: D -> C -> B -> A (A is the foundation)
      graph.addNode({ id: 'A', label: 'f', properties: { name: 'A', filePath: 'f1' } });
      graph.addNode({ id: 'B', label: 'f', properties: { name: 'B', filePath: 'f1' } });
      graph.addNode({ id: 'C', label: 'f', properties: { name: 'C', filePath: 'f1' } });

      graph.addEdge({ id: 'B->A', sourceId: 'B', targetId: 'A', type: 'CALLS', confidence: 1, properties: {} });
      graph.addEdge({ id: 'C->B', sourceId: 'C', targetId: 'B', type: 'CALLS', confidence: 1, properties: {} });

      const radius = graph.traverseUpstream('A');
      expect(radius.get('A')).toBe(0);
      expect(radius.get('B')).toBe(1);
      expect(radius.get('C')).toBe(2);
    });
  });
});
