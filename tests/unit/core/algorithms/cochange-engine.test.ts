import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { CoChangeEngine } from '@/lib/core/algorithms/cochange-engine.js';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';
import { DuckDbPersistence } from '@/lib/core/persistence/persistence.js';
import path from 'node:path';

describe('CoChangeEngine Unit Tests 🕵️‍♂️', () => {
  let engine: CoChangeEngine;
  let graph: ConducksAdjacencyList;
  let persistence: DuckDbPersistence;
  let db: any;
  const mockProjectDir = '/mock/project';

  beforeEach(async () => {
    graph = new ConducksAdjacencyList();
    persistence = new DuckDbPersistence(':memory:');
    db = await persistence.getRawConnection();

    const historyMock = () => {
      return (global as any).__MOCK_GIT_LOG || '';
    };

    engine = new CoChangeEngine(mockProjectDir, historyMock);
  });

  afterEach(async () => {
    await persistence.close();
    jest.restoreAllMocks();
    delete (global as any).__MOCK_GIT_LOG;
  });

  it('should identify hidden temporal coupling between files', async () => {
    // 1. Mock Git Log Output
    const mockGitLog = [
      'COMMIT:h1', 'src/A.py', 'src/B.py',
      'COMMIT:h2', 'src/A.py', 'src/B.py',
      'COMMIT:h3', 'src/A.py', 'src/B.py',
      'COMMIT:h4', 'src/A.py', 'src/B.py',
      'COMMIT:h5', 'src/A.py', 'src/B.py'
    ].join('\n');

    (global as any).__MOCK_GIT_LOG = mockGitLog;

    // 2. Setup Graph (Structural state - NO edge between A and B)
    graph.addNode({ id: 'A::main', label: 'f', properties: { name: 'main', filePath: path.resolve(mockProjectDir, 'src/A.py') } });
    graph.addNode({ id: 'B::main', label: 'f', properties: { name: 'main', filePath: path.resolve(mockProjectDir, 'src/B.py') } });

    // 3. Discover Hidden Coupling
    const hidden = await engine.discoverHiddenCoupling(graph, db);

    expect(hidden).toHaveLength(1);
    expect(hidden[0].fileA).toBe(path.resolve(mockProjectDir, 'src/A.py'));
    expect(hidden[0].fileB).toBe(path.resolve(mockProjectDir, 'src/B.py'));
    expect(hidden[0].confidence).toBe(0.5); // 5/10
  });

  it('should ignore coupling if a structural edge exists', async () => {
    const mockGitLog = [
      'COMMIT:h1', 'src/A.py', 'src/B.py',
      'COMMIT:h2', 'src/A.py', 'src/B.py',
      'COMMIT:h3', 'src/A.py', 'src/B.py',
      'COMMIT:h4', 'src/A.py', 'src/B.py'
    ].join('\n');

    (global as any).__MOCK_GIT_LOG = mockGitLog;

    const fileA = path.resolve(mockProjectDir, 'src/A.py');
    const fileB = path.resolve(mockProjectDir, 'src/B.py');
    graph.addNode({ id: 'A', label: 'f', properties: { name: 'A', filePath: fileA } });
    graph.addNode({ id: 'B', label: 'f', properties: { name: 'B', filePath: fileB } });
    
    // Add structural edge
    graph.addEdge({ id: 'A->B', sourceId: 'A', targetId: 'B', type: 'CALLS' as any, confidence: 1, properties: {} });

    const hidden = await engine.discoverHiddenCoupling(graph, db);
    expect(hidden).toHaveLength(0);
  });
});
