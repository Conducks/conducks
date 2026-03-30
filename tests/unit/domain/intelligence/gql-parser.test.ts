import { describe, it, expect, beforeEach } from '@jest/globals';
import { GQLParser } from '@/lib/domain/intelligence/gql-parser.js';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';

describe('GQLParser Unit Tests 🕵️‍♂️', () => {
  let parser: GQLParser;
  let graph: ConducksAdjacencyList;

  beforeEach(() => {
    parser = new GQLParser();
    graph = new ConducksAdjacencyList();
  });

  describe('Query Execution', () => {
    it('should find matching structural patterns (source-[:type]->target)', () => {
      // Setup graph: User -> Profile (CALLS)
      graph.addNode({ id: 'User', label: 'class', properties: { name: 'User', filePath: 'user.js' } });
      graph.addNode({ id: 'Profile', label: 'class', properties: { name: 'Profile', filePath: 'profile.js' } });
      graph.addEdge({ id: 'U->P', sourceId: 'User', targetId: 'Profile', type: 'CALLS' as any, confidence: 1, properties: {} });

      const results = parser.query(graph, '(class)-[:CALLS]->(class)');
      
      expect(results).toHaveLength(1);
      expect(results[0].source).toBe('User');
      expect(results[0].target).toBe('Profile');
      expect(results[0].type).toBe('CALLS');
    });

    it('should be case-insensitive for node labels', () => {
      graph.addNode({ id: 'A', label: 'Function', properties: { name: 'A', filePath: 'a.js' } });
      graph.addNode({ id: 'B', label: 'METHOD', properties: { name: 'B', filePath: 'b.js' } });
      graph.addEdge({ id: 'A->B', sourceId: 'A', targetId: 'B', type: 'CALLS' as any, confidence: 1, properties: {} });

      const results = parser.query(graph, '(function)-[:CALLS]->(method)');
      expect(results).toHaveLength(1);
      expect(results[0].source).toBe('A');
    });

    it('should return empty array for non-matching patterns', () => {
      graph.addNode({ id: 'A', label: 'class', properties: { name: 'A', filePath: 'a.js' } });
      const results = parser.query(graph, '(function)-[:CALLS]->(class)');
      expect(results).toHaveLength(0);
    });

    it('should return empty array for invalid syntax', () => {
      const results = parser.query(graph, 'invalid syntax query');
      expect(results).toHaveLength(0);
    });

    it('should handle partial label matches', () => {
      graph.addNode({ id: 'A', label: 'async_function', properties: { name: 'A', filePath: 'a.js' } });
      graph.addNode({ id: 'B', label: 'class', properties: { name: 'B', filePath: 'b.js' } });
      graph.addEdge({ id: 'A->B', sourceId: 'A', targetId: 'B', type: 'CALLS' as any, confidence: 1, properties: {} });

      const results = parser.query(graph, '(function)-[:CALLS]->(class)');
      expect(results).toHaveLength(1);
      expect(results[0].source).toBe('A');
    });
  });
});
