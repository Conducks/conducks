import { describe, it, expect, beforeEach } from '@jest/globals';
import { ConducksSearch } from '@/lib/domain/intelligence/search-engine.js';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';

describe('SearchEngine Unit Tests 🔍', () => {
  let searchEngine: ConducksSearch;
  let graph: ConducksAdjacencyList;

  beforeEach(() => {
    graph = new ConducksAdjacencyList();
    searchEngine = new ConducksSearch(graph);
  });

  describe('Structural Resonance Search', () => {
    it('should rank symbols by direct term matching', () => {
      graph.addNode({ id: 'UserAccount', label: 'class', properties: { name: 'UserAccount', filePath: 'user.js' } });
      graph.addNode({ id: 'OtherNode', label: 'class', properties: { name: 'Other', filePath: 'other.js' } });

      const results = searchEngine.search('UserAccount');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('UserAccount');
    });

    it('should apply kinetic gravity multiplier (Node Rank)', () => {
      // Setup: two nodes matching 'Auth'
      // AuthCore has high rank (gravity), AuthService has low rank.
      graph.addNode({ id: 'AuthCore', label: 'f', properties: { name: 'AuthCore', rank: 0.9 } });
      graph.addNode({ id: 'AuthService', label: 'f', properties: { name: 'AuthService', rank: 0.1 } });

      const results = searchEngine.search('Auth');
      expect(results[0].id).toBe('AuthCore');
      expect(results[1].id).toBe('AuthService');
    });

    it('should propagate resonance (Wavefront Echo)', () => {
      // Setup: Caller -> Target
      // Query matches Target. Caller should resonate as an "Echo" because it calls a matching node.
      graph.addNode({ id: 'Target', label: 'f', properties: { name: 'SecretLogic' } });
      graph.addNode({ id: 'Caller', label: 'f', properties: { name: 'OrdinaryModule' } });
      graph.addEdge({ id: 'C->T', sourceId: 'Caller', targetId: 'Target', type: 'CALLS' as any, confidence: 1, properties: {} });

      const results = searchEngine.search('SecretLogic');
      
      // Target is 1st. Caller should be 2nd because it echoed.
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('Target');
      expect(results[1].id).toBe('Caller');
    });

    it('should respect limits', () => {
      for (let i = 0; i < 10; i++) {
        graph.addNode({ id: `n${i}`, label: 'f', properties: { name: 'match' } });
      }
      const results = searchEngine.search('match', 5);
      expect(results).toHaveLength(5);
    });
  });
});
