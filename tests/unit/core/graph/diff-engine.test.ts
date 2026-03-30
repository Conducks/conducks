import { describe, it, expect, beforeEach } from '@jest/globals';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';
import { ConducksDiffEngine } from '@/lib/core/graph/diff-engine.js';

describe('ConducksDiffEngine Unit Tests 💎', () => {
  let engine: ConducksDiffEngine;
  let base: ConducksAdjacencyList;
  let head: ConducksAdjacencyList;

  beforeEach(() => {
    engine = new ConducksDiffEngine();
    base = new ConducksAdjacencyList();
    head = new ConducksAdjacencyList();
  });

  it('should detect added and removed nodes', () => {
    base.addNode({ id: 'stable', label: 'f', properties: { name: 'stable', filePath: 'f1' } });
    base.addNode({ id: 'removed', label: 'f', properties: { name: 'removed', filePath: 'f1' } });

    head.addNode({ id: 'stable', label: 'f', properties: { name: 'stable', filePath: 'f1' } });
    head.addNode({ id: 'added', label: 'f', properties: { name: 'added', filePath: 'f1' } });

    const result = engine.diff(base, head);
    
    expect(result.nodes.added).toBe(1);
    expect(result.nodes.removed).toBe(1);
    expect(result.nodes.list.added).toContain('added');
    expect(result.nodes.list.removed).toContain('removed');
  });

  it('should detect added and removed edges', () => {
    base.addNode({ id: 'A', label: 'f', properties: { name: 'A', filePath: 'f1' } });
    base.addNode({ id: 'B', label: 'f', properties: { name: 'B', filePath: 'f1' } });
    head.addNode({ id: 'A', label: 'f', properties: { name: 'A', filePath: 'f1' } });
    head.addNode({ id: 'B', label: 'f', properties: { name: 'B', filePath: 'f1' } });

    const edge = { id: 'A::B::CALLS', sourceId: 'A', targetId: 'B', type: 'CALLS' as any, confidence: 1, properties: {} };
    base.addEdge(edge);
    // Head has no edges

    let result = engine.diff(base, head);
    expect(result.edges.removed).toBe(1);
    expect(result.edges.added).toBe(0);

    head.addEdge(edge);
    result = engine.diff(base, head);
    expect(result.edges.removed).toBe(0);
    expect(result.edges.added).toBe(0);
  });

  it('should detect property drift (Architectural Drift)', () => {
    const baseNode = { id: 'drift', label: 'f', properties: { name: 'drift', filePath: 'f1', rank: 0.1, complexity: 5 } };
    const headNode = { id: 'drift', label: 'f', properties: { name: 'drift', filePath: 'f1', rank: 0.2, complexity: 10 } };

    base.addNode(baseNode);
    head.addNode(headNode);

    const result = engine.diff(base, head);
    
    expect(result.drift['drift']).toBeDefined();
    expect(result.drift['drift'].gravityShift).toBeCloseTo(0.1);
    expect(result.drift['drift'].complexityBloat).toBe(5);
  });

  it('should return a concise summary', () => {
    base.addNode({ id: 'A', label: 'f', properties: { name: 'A', filePath: 'f1' } });
    head.addNode({ id: 'A', label: 'f', properties: { name: 'A', filePath: 'f1' } });
    head.addNode({ id: 'B', label: 'f', properties: { name: 'B', filePath: 'f1' } });

    const result = engine.diff(base, head);
    expect(result.summary).toContain('+1/-0 Symbols');
  });

  it('should handle no changes gracefully', () => {
    const node = { id: 'A', label: 'f', properties: { name: 'A', filePath: 'f1' } };
    base.addNode(node);
    head.addNode(node);

    const result = engine.diff(base, head);
    expect(result.summary).toBe('No structural changes.');
  });
});
