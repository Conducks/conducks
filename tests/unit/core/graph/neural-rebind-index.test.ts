import { describe, it, expect } from '@jest/globals';
import { ConducksGraph } from '@/lib/core/graph/graph-engine.js';

/**
 * ADR 0045 — a binder that moves an edge must move it through the index.
 *
 * `bindNeuralCircuits` resolves a bare call target to a same-file symbol. It used to write
 * `edge.targetId = localId` directly, which updates the edge but not `inEdges`, the backward index
 * keyed by target. The forward direction looked correct, so nothing caught it — but `impact` walks
 * upstream, so "who calls this" lost precisely the edges the binder had just repaired.
 *
 * The assertion that matters is the UPSTREAM one. A test that only checked `edge.targetId` passes
 * against the broken version.
 */
describe('neural binding keeps the backward index truthful', () => {
  const build = () => {
    const engine = new ConducksGraph();
    const g = engine.getGraph();
    g.addNode({ id: 'a.ts::caller', name: 'caller', label: 'BEHAVIOR', properties: { filePath: 'a.ts' } } as any);
    g.addNode({ id: 'a.ts::helper', name: 'helper', label: 'BEHAVIOR', properties: { filePath: 'a.ts' } } as any);
    g.addEdge({
      id: 'e1',
      sourceId: 'a.ts::caller',
      targetId: 'helper',                       // bare, unqualified — what the parser emits
      type: 'CALLS',
      confidence: 0.4,
      properties: { rawTarget: 'helper' },
    } as any);
    return { engine, g };
  };

  it('files the rebound edge under its new target, upstream', () => {
    const { engine, g } = build();
    engine.resonate();

    const edge = g.getNeighbors('a.ts::caller', 'downstream').find(e => e.id === 'e1');
    expect(edge?.targetId).toBe('a.ts::helper');

    const upstream = g.getNeighbors('a.ts::helper', 'upstream').map(e => e.id);
    expect(upstream).toContain('e1');
  });

  it('stops filing it under the target it no longer points at', () => {
    const { engine, g } = build();
    engine.resonate();

    const staleUpstream = g.getNeighbors('helper', 'upstream').map(e => e.id);
    expect(staleUpstream).not.toContain('e1');
  });
});
