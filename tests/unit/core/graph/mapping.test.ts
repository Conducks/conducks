import { describe, it, expect, beforeEach } from '@jest/globals';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';

describe('Conducks: Kinetic Symbol Mapping Unit Tests 💎', () => {
  let graph: ConducksAdjacencyList;
  const filePath = 'test.py';

  beforeEach(() => {
    graph = new ConducksAdjacencyList();

    // Add a module node
    graph.addNode({
      id: 'test.py::global',
      label: 'module',
      properties: { name: 'global', filePath, range: { start: { line: 1, column: 0 }, end: { line: 100, column: 0 } } }
    });

    // Add a function node
    graph.addNode({
      id: 'test.py::foo',
      label: 'function',
      properties: { name: 'foo', filePath, range: { start: { line: 10, column: 0 }, end: { line: 20, column: 0 } } }
    });

    // Add a nested function node
    graph.addNode({
      id: 'test.py::bar',
      label: 'function',
      properties: { name: 'bar', filePath, range: { start: { line: 12, column: 0 }, end: { line: 15, column: 0 } } }
    });
  });

  it('should find the innermost symbol at a given line', () => {
    const symbol = graph.findSymbolAtLine(filePath, 13);
    expect(symbol).toBeDefined();
    expect(symbol?.properties.name).toBe('bar');
  });

  it('should fallback to the enclosing symbol if not in nested', () => {
    const symbol = graph.findSymbolAtLine(filePath, 11);
    expect(symbol).toBeDefined();
    expect(symbol?.properties.name).toBe('foo');
  });

  it('should fallback to the module if outside any specific symbol', () => {
    const symbol = graph.findSymbolAtLine(filePath, 5);
    expect(symbol).toBeDefined();
    expect(symbol?.properties.name).toBe('global');
  });

  it('should return undefined for a non-existent file', () => {
    const symbol = graph.findSymbolAtLine('elsewhere.py', 1);
    expect(symbol).toBeUndefined();
  });
});
