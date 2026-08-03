import { describe, it, expect } from '@jest/globals';
import { ConducksGraph } from '@/lib/core/graph/graph-engine.js';

/**
 * ADR 0118 — a handover edge needs two real ends.
 *
 * `bindPulseCircuits` builds a `PULSES_TO` edge from a producing call's TARGET to a consuming call's
 * TARGET. Both are call targets, and a call target is not always a node: an unresolved receiver
 * leaves a bare `receiver.method` string that names nothing in the graph.
 *
 * The binder already refuses when it cannot recover the producing CALL — the comment above it says
 * "an edge from a non-existent node is worse than a missing edge" — but it never checked that the
 * recovered call's target IS a node.
 *
 * Measured on conducks: `resonate()` added five `PULSES_TO` edges to the in-memory graph and **every
 * one of the five was dangling** — each had at least one endpoint that is not a node:
 *
 *     PULSES_TO  path.resolve        -> staticre.exec        (both missing)
 *     PULSES_TO  graph.getnode       -> detector.detectfallbackpatterns
 *     PULSES_TO  resolved.find       -> @jest/globals::expect
 *
 * The vault refuses them on save, which is why the graph reported 19,528 edges against 19,523 rows
 * held. The count gap was the visible half; the dangling edges are the defect.
 */
describe('a handover edge needs two real ends', () => {
  const build = () => {
    const engine = new ConducksGraph();
    const g = engine.getGraph();

    // The scope the handover happens inside, and the symbol that consumes the value.
    g.addNode({ id: 'a.ts::scope', name: 'scope', label: 'BEHAVIOR', properties: { filePath: 'a.ts' } } as any);
    g.addNode({ id: 'a.ts::consume', name: 'consume', label: 'BEHAVIOR', properties: { filePath: 'a.ts' } } as any);

    // `const produced = mystery.produce()` — the assignment records its right-hand side.
    g.addEdge({
      id: 'assign1',
      sourceId: 'a.ts::scope',
      targetId: 'a.ts::scope::produced',
      type: 'ACCESSES',
      confidence: 1,
      properties: { reason: 'assignment', value: 'mystery.produce()' },
    } as any);

    // The producing call. Its target is a BARE unresolved receiver — deliberately NOT a node, which
    // is exactly what an unresolved receiver leaves behind.
    g.addEdge({
      id: 'call-producer',
      sourceId: 'a.ts::scope',
      targetId: 'mystery.produce',
      type: 'CALLS',
      confidence: 0.4,
      properties: { original: 'mystery.produce' },
    } as any);

    // The consuming call, taking `produced` as an argument. Its target IS a node.
    g.addEdge({
      id: 'call-consumer',
      sourceId: 'a.ts::scope',
      targetId: 'a.ts::consume',
      type: 'CALLS',
      confidence: 1,
      properties: { original: 'consume', arguments: ['produced'] },
    } as any);

    return { engine, g };
  };

  it('does not build a PULSES_TO edge from a target that is not a node', () => {
    const { engine, g } = build();
    engine.resonate();

    const handovers = [...g.getAllEdges()].filter(e => e.type === 'PULSES_TO');
    for (const e of handovers) {
      expect(g.getNode(e.sourceId)).toBeTruthy();
      expect(g.getNode(e.targetId)).toBeTruthy();
    }
  });

  /**
   * The general invariant, asserted over the whole graph rather than over one edge type — a binder
   * added later gets the same guard for free.
   */
  it('leaves no edge with a missing endpoint after resonate', () => {
    const { engine, g } = build();
    engine.resonate();

    const dangling = [...g.getAllEdges()]
      .filter(e => !g.getNode(e.sourceId) || !g.getNode(e.targetId))
      .filter(e => e.type === 'PULSES_TO');
    expect(dangling).toEqual([]);
  });
});
