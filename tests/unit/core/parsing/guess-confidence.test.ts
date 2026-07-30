import { describe, it, expect } from '@jest/globals';
import { CallProcessor } from '@/lib/core/parsing/processors/call.js';
import { HeritageProcessor } from '@/lib/core/parsing/processors/heritage.js';

/**
 * ADR 0046 — confidence prices the guess.
 *
 * Both processors used to stamp one confidence per edge TYPE regardless of how the target was
 * arrived at: 0.85 for every CALLS edge, 1.0 for every heritage edge. So an edge whose target
 * resolved to a real file and an edge that gave up and emitted a bare name were identical in the
 * vault, which is why `WHERE confidence < 0.6` returned zero rows on a graph where half the edges
 * point at nothing. These tests fail if either processor goes back to a flat value.
 */

const spectrum = () => ({ nodes: [], relationships: [], metadata: { language: 'typescript' } } as any);

/** Resolution-mode context that resolves exactly one binding and nothing else. */
const context = (known: Record<string, string>) => ({
  isResolutionMode: () => true,
  resolveLocalBinding: (name: string) => known[name],
} as any);

describe('a call edge is priced by whether its target was found', () => {
  it('records a resolved target at full confidence', () => {
    const s = spectrum();
    new CallProcessor().process('helper', 'caller', 'CALLS', s, [], context({ helper: '/src/util.ts' }));
    const rel = s.relationships[0];
    expect(rel.targetName).toBe('/src/util.ts::helper');
    expect(rel.confidence).toBe(0.85);
    expect(rel.metadata.resolved).toBe(true);
  });

  it('records an unresolved target BELOW the fuzzy threshold, not beside a resolved one', () => {
    const s = spectrum();
    new CallProcessor().process('mystery', 'caller', 'CALLS', s, [], context({}));
    const rel = s.relationships[0];
    expect(rel.targetName).toBe('mystery');
    expect(rel.metadata.resolved).toBe(false);
    expect(rel.confidence).toBeLessThan(0.6);
  });

  it('leaves resolved and unresolved edges distinguishable by confidence alone', () => {
    const s = spectrum();
    const p = new CallProcessor();
    p.process('helper', 'caller', 'CALLS', s, [], context({ helper: '/src/util.ts' }));
    p.process('mystery', 'caller', 'CALLS', s, [], context({}));
    const [resolved, guessed] = s.relationships;
    expect(resolved.confidence).not.toBe(guessed.confidence);
  });
});

describe('a heritage edge is priced by whether the clause was captured or inferred', () => {
  it('records a query-supplied relation as certain', () => {
    const s = spectrum();
    new HeritageProcessor().process('BaseThing', 'Child', s, 'EXTENDS');
    expect(s.relationships[0].type).toBe('EXTENDS');
    expect(s.relationships[0].confidence).toBe(1.0);
  });

  it('does not record a name-guessed relation as certain', () => {
    const s = spectrum();
    // No explicit type, so the `I`-prefix heuristic decides IMPLEMENTS — a guess about the KIND of
    // relation, which is why the edge survives but its confidence must not read as captured fact.
    new HeritageProcessor().process('IThing', 'Child', s);
    const rel = s.relationships[0];
    expect(rel.type).toBe('IMPLEMENTS');
    expect(rel.confidence).toBeLessThan(1.0);
    expect(rel.metadata.inferredRelation).toBe(true);
  });
});

describe('a rebind clears the guess it was written with', () => {
  it('raises a low-confidence edge when its target becomes known', async () => {
    const { ConducksAdjacencyList } = await import('@/lib/core/graph/adjacency-list.js');
    const g = new ConducksAdjacencyList();
    g.addNode({ id: 'a.ts::caller', name: 'caller', label: 'BEHAVIOR', properties: { filePath: 'a.ts' } } as any);
    g.addNode({ id: 'a.ts::helper', name: 'helper', label: 'BEHAVIOR', properties: { filePath: 'a.ts' } } as any);
    const edge = { id: 'e1', sourceId: 'a.ts::caller', targetId: 'helper', type: 'CALLS', confidence: 0.4, properties: {} } as any;
    g.addEdge(edge);

    g.rebindEdgeTarget(edge, 'a.ts::helper');
    expect(edge.confidence).toBe(0.85);
  });

  it('does not touch an edge that was never a guess', async () => {
    const { ConducksAdjacencyList } = await import('@/lib/core/graph/adjacency-list.js');
    const g = new ConducksAdjacencyList();
    g.addNode({ id: 'a.ts::x', name: 'x', label: 'BEHAVIOR', properties: { filePath: 'a.ts' } } as any);
    g.addNode({ id: 'a.ts::y', name: 'y', label: 'BEHAVIOR', properties: { filePath: 'a.ts' } } as any);
    // 0.6 is the inferred-heritage band: a real judgement, not a give-up, so a rebind leaves it.
    const edge = { id: 'e2', sourceId: 'a.ts::x', targetId: 'y', type: 'EXTENDS', confidence: 0.6, properties: {} } as any;
    g.addEdge(edge);

    g.rebindEdgeTarget(edge, 'a.ts::y');
    expect(edge.confidence).toBe(0.6);
  });
});
