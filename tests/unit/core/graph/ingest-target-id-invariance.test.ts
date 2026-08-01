import { describe, it, expect } from '@jest/globals';
import { ConducksGraph } from '@/lib/core/graph/graph-engine.js';

/**
 * A pulse must produce the same graph whatever the wave size.
 *
 * It did not. MEASURED on this repo (548 units), cold vault, interleaved, two runs per arm and
 * byte-identical within an arm: `CONDUCKS_CHUNK_SIZE=500` produced 4,205 vault nodes / 14,068 edges
 * and `=100` produced 4,212 / 14,068, with 258 edge ids differing in each direction. The union of
 * node ids the WAVES build is identical at both sizes, and forcing 47 worker subprocesses instead of
 * 11 changes nothing — so neither parsing nor worker chunking is the lever. The divergence appears
 * between the end of a wave and the vault.
 *
 * The mechanism is here. `ingestSpectrum` takes the fully-qualified target id the reflector produced
 * and, when that id is not resident in the IN-MEMORY graph, strips it to a bare name (the "Ghost
 * Local" branch). The orchestrator CLEARS the in-memory graph after every wave flush, so residency
 * is a function of wave size and file order rather than of the code being analysed. The same edge
 * therefore keeps its exact target in a one-wave run and degrades to a name lookup in a five-wave
 * one, and the two disagree. The node count follows: `pruneTaxonomy` drops an ATOM with no
 * non-structural edge, so an edge that lands elsewhere decides whether its target survives.
 *
 * This test asserts the invariant at the point it is violated: the edge an ingest produces must not
 * depend on what else happens to be in the graph at that moment.
 */
describe('ingestSpectrum — a target id does not depend on graph residency', () => {
  const CALLER = '/repo/a.ts';
  const TARGET_ID = '/repo/b.ts::callee';

  const spectrum = () => ({
    nodes: [{
      name: 'caller',
      canonicalKind: 'BEHAVIOR',
      range: { start: { line: 1 }, end: { line: 2 } },
      metadata: { id: `${CALLER}::caller`, canonicalKind: 'BEHAVIOR', canonicalRank: 4 },
    }],
    relationships: [{
      type: 'CALLS',
      sourceName: 'caller',
      targetName: TARGET_ID,
      confidence: 1.0,
      metadata: {},
    }],
  });

  /** Ingests one file's spectrum and returns the CALLS edge's target, if any. */
  const targetAfterIngest = (targetIsResident: boolean): string | undefined => {
    const graph = new ConducksGraph();
    if (targetIsResident) {
      graph.getGraph().addNode({
        id: TARGET_ID, label: 'BEHAVIOR', isShallow: true,
        properties: { name: 'callee', filePath: '/repo/b.ts' } as any,
      });
    }
    graph.ingestSpectrum(CALLER, spectrum() as any, false, `${CALLER}::unit`, 'repository::repo');
    return graph.getGraph().getAllEdges().find(e => e.type === 'CALLS')?.targetId;
  };

  it('keeps the reflector\'s fully-qualified target whether or not the target node is resident', () => {
    const resident = targetAfterIngest(true);
    const absent = targetAfterIngest(false);

    // The invariant. Wave size and file order decide residency; neither may decide the graph.
    expect(absent).toBe(resident);
    // And stated positively, so the test still fails if BOTH sides regress to the bare name.
    expect(resident).toBe(TARGET_ID);
  });
});
