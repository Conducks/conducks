import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { GVREngine } from '@/lib/core/algorithms/refactor/gvr-engine.js';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';
import fs from 'node:fs/promises';

describe('GVREngine Unit Tests 🏗️', () => {
  let engine: GVREngine;
  let graph: ConducksAdjacencyList;

  beforeEach(() => {
    engine = new GVREngine();
    graph = new ConducksAdjacencyList();
    jest.clearAllMocks();
  });

  it('should rename a symbol across multiple affected files', async () => {
    // 1. Setup Graph: myFunc is in a.py and called by b.py
    graph.addNode({ id: 'a.py::myFunc', label: 'f', properties: { name: 'myFunc', filePath: 'a.py' } });
    graph.addNode({ id: 'b.py::caller', label: 'f', properties: { name: 'caller', filePath: 'b.py' } });
    graph.addEdge({ id: 'b->a', sourceId: 'b.py::caller', targetId: 'a.py::myFunc', type: 'CALLS' as any, confidence: 1, properties: {} });

    // 2. Mock FS
    const mockFiles: Record<string, string> = {
      'a.py': 'def myFunc(): pass',
      'b.py': 'myFunc()'
    };
    
    jest.spyOn(fs, 'readFile').mockImplementation(async (path) => mockFiles[path.toString()]);
    const writeSpy = jest.spyOn(fs, 'writeFile').mockImplementation(async (path, data) => {
      mockFiles[path.toString()] = data.toString();
    });

    // 3. Execute Rename
    const result = await engine.renameSymbol(graph, 'a.py::myFunc', 'newFunc');

    expect(result.success).toBe(true);
    expect(result.affectedFiles).toContain('a.py');
    expect(result.affectedFiles).toContain('b.py');
    expect(mockFiles['a.py']).toBe('def newFunc(): pass');
    expect(mockFiles['b.py']).toBe('newFunc()');
    expect(writeSpy).toHaveBeenCalledTimes(2);
  });

  it('should rollback all changes if any write fails', async () => {
    graph.addNode({ id: 'a.py::myFunc', label: 'f', properties: { name: 'myFunc', filePath: 'a.py' } });
    graph.addNode({ id: 'b.py::caller', label: 'f', properties: { name: 'caller', filePath: 'b.py' } });
    graph.addEdge({ id: 'b->a', sourceId: 'b.py::caller', targetId: 'a.py::myFunc', type: 'CALLS' as any, confidence: 1, properties: {} });

    const originalFiles: Record<string, string> = {
      'a.py': 'def myFunc(): pass',
      'b.py': 'myFunc()'
    };
    
    const mockFiles = { ...originalFiles };
    jest.spyOn(fs, 'readFile').mockImplementation(async (path) => mockFiles[path.toString()]);
    
    // Fail on the second write
    let writes = 0;
    const writeSpy = jest.spyOn(fs, 'writeFile').mockImplementation(async (path, data) => {
      writes++;
      if (writes === 2) throw new Error('Disk Full');
      mockFiles[path.toString()] = data.toString();
    });

    const result = await engine.renameSymbol(graph, 'a.py::myFunc', 'newFunc');

    expect(result.success).toBe(false);
    expect(result.message).toContain('Disk Full');
    
    // Both files should be back to original (one wrote then rolled back, one never wrote or failed)
    expect(writeSpy).toHaveBeenCalledWith('a.py', originalFiles['a.py'], 'utf-8'); // Rollback call
  });
});
