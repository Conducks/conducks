/**
 * Ported out of tests/legacy/ on 2026-07-26 (todo18 Phase 3). Kinetic symbol mapping on the adjacency list had no other coverage.
 *
 * It was archived, excluded from tsc and jest, and still passing against current source — so
 * it described live behaviour nothing else covered. Kept as it was, apart from its location.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';

describe('Conducks: Kinetic Symbol Mapping Unit Tests 💎', () => {
  let graph: ConducksAdjacencyList;
  const filePath = 'test.py';

  beforeEach(() => {
    graph = new ConducksAdjacencyList();

    // Add a module node
    graph.addNode({
      id: 'test.py::unit',
      label: 'module',
      properties: { name: 'UNIT', filePath, range: { start: { line: 1, column: 0 }, end: { line: 100, column: 0 } } }
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
    expect(symbol?.properties.name).toBe('UNIT');
  });

  it('should return undefined for a non-existent file', () => {
    const symbol = graph.findSymbolAtLine('elsewhere.py', 1);
    expect(symbol).toBeUndefined();
  });
});

// F-05 blast radius: a node built by the REAL pipeline (reflector.ts -> graph-engine.ts) never
// carries `label: 'module'` for its file node — `label` is set to `canonicalKind`, which for the
// file's own node is the uppercase string 'UNIT' (graph-engine.ts:488). The fixture above uses the
// older `label: 'module'` spelling and so never exercised that shape; this block does.
describe('Conducks: findSymbolAtLine against a REAL-shaped unit node (canonicalKind UNIT)', () => {
  let graph: ConducksAdjacencyList;
  const filePath = 'real.ts';

  beforeEach(() => {
    graph = new ConducksAdjacencyList();
    graph.addNode({
      id: 'real.ts::unit',
      label: 'UNIT',
      properties: { name: 'real.ts', filePath, canonicalKind: 'UNIT', range: { start: { line: 1, column: 0 }, end: { line: 100, column: 0 } } },
    });
    graph.addNode({
      id: 'real.ts::sofie',
      label: 'BEHAVIOR',
      properties: { name: 'sofie', filePath, canonicalKind: 'BEHAVIOR', range: { start: { line: 20, column: 0 }, end: { line: 40, column: 0 } } },
    });
  });

  it('finds the nested symbol over the whole-file UNIT node', () => {
    const symbol = graph.findSymbolAtLine(filePath, 25);
    expect(symbol?.properties.name).toBe('sofie');
  });

  it('COUNTER-TEST: a genuinely module-level line still falls back to the UNIT node', () => {
    const symbol = graph.findSymbolAtLine(filePath, 5);
    expect(symbol?.properties.name).toBe('real.ts');
  });
});
