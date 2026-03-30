import { describe, it, expect, beforeEach } from '@jest/globals';
import { GQLParser } from '@/lib/domain/intelligence/gql-parser.js';
import { ConducksSearch } from '@/lib/domain/intelligence/search-engine.js';
import { ConducksAdjacencyList, ConducksNode, ConducksEdge } from '@/lib/core/graph/adjacency-list.js';

describe('Intelligence Domain Integration (Search & GQL) 🧠', () => {
  let gql: GQLParser;
  let search: ConducksSearch;
  let adjacencyList: ConducksAdjacencyList;

  beforeEach(() => {
    adjacencyList = new ConducksAdjacencyList();
    gql = new GQLParser();
    search = new ConducksSearch(adjacencyList);

    // Seed the graph with some structural data for integration
    const nodeA: ConducksNode = {
      id: 'src/main.py::main',
      label: 'function',
      properties: { name: 'main', filePath: 'src/main.py', rank: 0.1 }
    };
    const nodeB: ConducksNode = {
      id: 'src/utils.py::helper',
      label: 'function',
      properties: { name: 'helper', filePath: 'src/utils.py', rank: 0.8 }
    };

    adjacencyList.addNode(nodeA);
    adjacencyList.addNode(nodeB);

    const edge: ConducksEdge = {
      id: 'src/main.py::main->src/utils.py::helper::CALLS',
      sourceId: nodeA.id,
      targetId: nodeB.id,
      type: 'CALLS',
      confidence: 1.0,
      properties: {}
    };
    adjacencyList.addEdge(edge);
  });

  describe('GQLParser Structural Queries', () => {
    it('should find relationships matching the pattern (function)-[:CALLS]->(function)', () => {
      const results = gql.query(adjacencyList, '(function)-[:CALLS]->(function)');
      expect(results.length).toBe(1);
      expect(results[0].source).toBe('main');
      expect(results[0].target).toBe('helper');
    });

    it('should return empty array for non-matching patterns', () => {
      const results = gql.query(adjacencyList, '(class)-[:EXTENDS]->(interface)');
      expect(results.length).toBe(0);
    });
  });

  describe('ConducksSearch Structural Resonance', () => {
    it('should find nodes by name with term matching', () => {
      const results = search.search('helper');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].properties.name).toBe('helper');
    });

    it('should boost results by Kinetic Gravity (Rank)', () => {
      // Create a node with higher rank but less direct name match
      const nodeC: ConducksNode = {
        id: 'src/core.py::engine',
        label: 'class',
        properties: { name: 'engine', filePath: 'src/core.py', rank: 0.99 } // Max Gravity
      };
      adjacencyList.addNode(nodeC);

      const results = search.search('engine');
      expect(results[0].properties.name).toBe('engine');
      expect(results[0].properties.rank).toBe(0.99);
    });

    it('should propagate Wavefront Resonance to callers (upstream)', () => {
      // Query for 'helper', 'main' should get a resonance score even if it doesn't match the name
      // because it calls 'helper'. 
      // search.propagateWavefront(nodeB.id, 100, results, 1) -> nodeA gets 50 energy.
      const results = search.search('helper');
      const mainNode = results.find(n => n.properties.name === 'main');
      expect(mainNode).toBeDefined();
    });
  });
});
