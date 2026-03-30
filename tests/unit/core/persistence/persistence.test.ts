import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';
import { JsonPersistence, DuckDbPersistence } from '@/lib/core/persistence/persistence.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

describe('Persistence Layer Unit Tests 💾', () => {
  let graph: ConducksAdjacencyList;
  let tempDir: string;

  beforeEach(async () => {
    graph = new ConducksAdjacencyList();
    tempDir = path.join(os.tmpdir(), `conducks-test-${Math.random().toString(36).substring(7)}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('JsonPersistence', () => {
    it('should save and load a graph state as JSON', async () => {
      const persistence = new JsonPersistence(tempDir);

      graph.addNode({ id: 'n1', label: 'f', properties: { name: 'n1', filePath: 'f1' } });
      graph.addEdge({ id: 'n1::n2', sourceId: 'n1', targetId: 'n2', type: 'CALLS' as any, confidence: 1, properties: {} });

      const pulseId = await persistence.save(graph);
      expect(pulseId).toBe('json_latest');

      const newGraph = new ConducksAdjacencyList();
      const success = await persistence.load(newGraph);

      expect(success).toBe(true);
      expect(newGraph.getNode('n1')).toBeDefined();
      expect(newGraph.getNeighbors('n1', 'downstream')).toHaveLength(1);
    });

    it('should handle missing files gracefully during load', async () => {
      const persistence = new JsonPersistence(tempDir);
      const success = await persistence.load(graph);
      expect(success).toBe(false);
    });
  });

  describe('DuckDbPersistence', () => {
    it('should operate in memory correctly (Conducks)', async () => {
      // Using :memory: for high-speed unit testing
      const persistence = new DuckDbPersistence(':memory:');

      graph.addNode({ id: 'n1', label: 'f', properties: { name: 'n1', filePath: 'f1', rank: 0.5 } });
      graph.setMetadata('projectName', 'TestProject');

      const pulseId = await persistence.save(graph);
      expect(pulseId).toMatch(/^pulse_/);

      const newGraph = new ConducksAdjacencyList();
      const success = await persistence.load(newGraph);

      expect(success).toBe(true);
      expect(newGraph.getNode('n1')).toBeDefined();
      expect(newGraph.getNode('n1')?.properties.rank).toBe(0.5);
      expect(newGraph.getMetadata('projectName')).toBe('TestProject');

      await persistence.close();
    });

    it('should detect and handle empty databases', async () => {
      const persistence = new DuckDbPersistence(':memory:');
      const success = await persistence.load(graph);
      expect(success).toBe(false);
      await persistence.close();
    });
  });
});
