import { describe, it, expect } from '@jest/globals';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';
import { IntraLinker } from '@/lib/core/graph/linker-intra.js';

/**
 * todo58 — a destructured dynamic import INSIDE a function left the call pointing at a local.
 *
 * The SCM query for `const { x } = await import('./y.js')` has existed since ADR 0071's family and
 * works: it mints a module-level binding node and an ALIASES edge to the real definition. But when
 * the import sits inside a function — which is the whole point of a dynamic import — the destructured
 * name is ALSO a function-scoped local, and the call resolves to THAT.
 *
 * Measured shape, reduced from a 22-node repro (and the same shape as sofie's
 * `electron/main/index.ts:1315`, inside an `ipcMain.handle` callback):
 *
 *   main.ts::readroutingprompt          --ALIASES--> loader.ts::readroutingprompt   (nobody points here)
 *   main.ts::handle                     --CALLS-->   main.ts::handle.readroutingprompt  (a local ATOM)
 *
 * Two nodes for one fact, and they never meet. The alias hangs off a node nothing calls, and the call
 * lands on a local that defines nothing — so `loader.ts::readroutingprompt` has no callers and
 * `prune` reports live code as dead. Measured on sofie: 9 of 172 findings wrong by this one
 * mechanism, and `impact` returned 2 of 3 real callers for `loadKernelPrompt`.
 *
 * The rebind is a READ of the file's own syntax, not a guess: the local and the binding are in the
 * SAME file and carry the SAME bare name, and the binding says outright what it aliases.
 */

const ROOT = '/repo';
const LOADER = `${ROOT}/src/loader.ts`;
const MAIN = `${ROOT}/src/main.ts`;

const build = () => {
  const graph = new ConducksAdjacencyList();
  const unit = (file: string) => {
    const id = `${file}::unit`;
    graph.addNode({ id, label: 'UNIT', isShallow: false, properties: { unitId: null, name: 'unit', filePath: file, canonicalKind: 'UNIT', canonicalRank: 0 } });
    return id;
  };
  const loaderUnit = unit(LOADER);
  const mainUnit = unit(MAIN);

  // The real function, in the file the dynamic import names.
  graph.addNode({ id: `${LOADER}::readroutingprompt`, label: 'SYMBOL', isShallow: false, properties: { unitId: loaderUnit, name: 'readRoutingPrompt', filePath: LOADER, canonicalKind: 'BEHAVIOR', canonicalRank: 7 } });

  // The module-level binding the SCM query mints for the destructure, plus its ALIASES edge.
  graph.addNode({ id: `${MAIN}::readroutingprompt`, label: 'SYMBOL', isShallow: false, properties: { unitId: mainUnit, name: 'readRoutingPrompt', filePath: MAIN, canonicalKind: 'BEHAVIOR', canonicalRank: 7 } });
  graph.addEdge({ id: 'ALIASES::1', sourceId: `${MAIN}::readroutingprompt`, targetId: `${LOADER}::readroutingprompt`, type: 'ALIASES', confidence: 1.0, properties: {} });

  // The enclosing function, and the function-SCOPED local the destructure also creates.
  graph.addNode({ id: `${MAIN}::handle`, label: 'SYMBOL', isShallow: false, properties: { unitId: mainUnit, name: 'handle', filePath: MAIN, canonicalKind: 'BEHAVIOR', canonicalRank: 7 } });
  graph.addNode({ id: `${MAIN}::handle.readroutingprompt`, label: 'SYMBOL', isShallow: false, properties: { unitId: mainUnit, name: 'readRoutingPrompt', filePath: MAIN, canonicalKind: 'ATOM', canonicalRank: 9 } });
  graph.addEdge({ id: 'CALLS::1', sourceId: `${MAIN}::handle`, targetId: `${MAIN}::handle.readroutingprompt`, type: 'CALLS', confidence: 1.0, properties: {} });

  return graph;
};

describe('a dynamic import inside a function still reaches the real definition — todo58', () => {
  it('rebinds the call from the function-scoped local to the aliased definition', () => {
    const graph = build();
    new IntraLinker().resolve(graph);

    // Located by source+type, not by id — the graph re-keys edge ids on ingest.
    const call = graph.getAllEdges().find(e => e.type === 'CALLS' && e.sourceId === `${MAIN}::handle`);
    expect(call?.targetId).toBe(`${LOADER}::readroutingprompt`);
  });

  it('so the definition has a caller, which is what stops prune calling it dead', () => {
    const graph = build();
    new IntraLinker().resolve(graph);

    const callers = graph.getAllEdges().filter(e => e.type === 'CALLS' && e.targetId === `${LOADER}::readroutingprompt`);
    expect(callers).toHaveLength(1);
  });

  it('leaves a local alone when the file has no binding of that name — no guessing', () => {
    const graph = build();
    // A local that shares no name with any binding: nothing states what it refers to.
    graph.addNode({ id: `${MAIN}::handle.somethingelse`, label: 'SYMBOL', isShallow: false, properties: { unitId: `${MAIN}::unit`, name: 'somethingElse', filePath: MAIN, canonicalKind: 'ATOM', canonicalRank: 9 } });
    graph.addEdge({ id: 'CALLS::2', sourceId: `${MAIN}::handle`, targetId: `${MAIN}::handle.somethingelse`, type: 'CALLS', confidence: 1.0, properties: {} });

    new IntraLinker().resolve(graph);
    const untouched = graph.getAllEdges().filter(e => e.type === 'CALLS' && e.sourceId === `${MAIN}::handle`)
      .map(e => e.targetId);
    expect(untouched).toContain(`${MAIN}::handle.somethingelse`);
  });

  it('does not reach across files — a same-named local elsewhere is untouched', () => {
    const graph = build();
    const other = `${ROOT}/src/other.ts`;
    graph.addNode({ id: `${other}::unit`, label: 'UNIT', isShallow: false, properties: { unitId: null, name: 'unit', filePath: other, canonicalKind: 'UNIT', canonicalRank: 0 } });
    graph.addNode({ id: `${other}::run`, label: 'SYMBOL', isShallow: false, properties: { unitId: `${other}::unit`, name: 'run', filePath: other, canonicalKind: 'BEHAVIOR', canonicalRank: 7 } });
    graph.addNode({ id: `${other}::run.readroutingprompt`, label: 'SYMBOL', isShallow: false, properties: { unitId: `${other}::unit`, name: 'readRoutingPrompt', filePath: other, canonicalKind: 'ATOM', canonicalRank: 9 } });
    graph.addEdge({ id: 'CALLS::3', sourceId: `${other}::run`, targetId: `${other}::run.readroutingprompt`, type: 'CALLS', confidence: 1.0, properties: {} });

    new IntraLinker().resolve(graph);
    const crossFile = graph.getAllEdges().find(e => e.type === 'CALLS' && e.sourceId === `${other}::run`);
    expect(crossFile?.targetId).toBe(`${other}::run.readroutingprompt`);
  });
});
