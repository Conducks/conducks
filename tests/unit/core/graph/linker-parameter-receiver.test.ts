import { describe, it, expect } from '@jest/globals';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';
import { IntraLinker } from '@/lib/core/graph/linker-intra.js';
import { TypeScriptResolver } from '@/lib/core/parsing/index.js';

/**
 * The real resolver, wired the way production wires it.
 *
 * `IntraLinker` takes its specifier resolver as an argument and REFUSES a default (ADR 0150 rule 5b
 * — `core/graph` may not reach into `core/parsing` for one). A stub returning undefined would make
 * every case here pass for the wrong reason, since dangling is also what a genuinely unresolvable
 * specifier produces.
 */
const tsResolver = new TypeScriptResolver();
const linker = () => new IntraLinker((s, f, a) => tsResolver.resolve(s, f, a));


/**
 * todo42#P1 — a call on a receiver that is a TYPED PARAMETER.
 *
 * `function run(registry: Registry) { registry.lookup(...) }` — the receiver has no node of its own
 * (a parameter is an ATOM, and an unreferenced ATOM is pruned), but its TYPE is written in the
 * signature and the enclosing function records it as `paramTypes`. The three-segment chain
 * (`spectrum.nodes.find`) already reads that map; the PLAIN two-segment form — the more common
 * shape — never did, so `registry.lookup` dangled while every fact needed to resolve it sat in the
 * graph.
 *
 * An UNTYPED parameter is refused outright: `registry` with no annotation states nothing, and
 * guessing from the name is how the vault filled with `results.foreach` (todo42's own words).
 */
const ROOT = '/repo';

const addUnit = (graph: ConducksAdjacencyList, file: string, symbols: Array<{ id: string; name: string; paramTypes?: Record<string, string> }> = []) => {
  const unitId = `${file}::unit`;
  graph.addNode({ id: unitId, label: 'UNIT', isShallow: false, properties: { unitId: null, name: 'unit', filePath: file, canonicalKind: 'UNIT', canonicalRank: 0 } });
  for (const s of symbols) {
    graph.addNode({
      id: `${file}::${s.id}`, label: 'SYMBOL', isShallow: false,
      properties: { unitId, name: s.name, filePath: file, canonicalKind: 'BEHAVIOR', canonicalRank: 7, paramTypes: s.paramTypes },
    });
  }
  return unitId;
};

const importEdge = (graph: ConducksAdjacencyList, from: string, to: string) =>
  graph.addEdge({ id: `IMPORTS::${from}->${to}`, sourceId: from, targetId: to, type: 'IMPORTS', confidence: 1.0, properties: {} });

const build = (paramTypes?: Record<string, string>, withImport = true) => {
  const graph = new ConducksAdjacencyList();
  const regFile = `${ROOT}/core/registry.ts`;
  addUnit(graph, regFile, [
    { id: 'registry', name: 'Registry' },
    { id: 'registry.lookup', name: 'lookup' },
  ]);
  const consumer = addUnit(graph, `${ROOT}/app/run.ts`, [{ id: 'run', name: 'run', paramTypes }]);
  if (withImport) importEdge(graph, consumer, `${regFile}::unit`);

  graph.addEdge({
    id: 'CALLS::run->registry.lookup',
    sourceId: `${ROOT}/app/run.ts::run`,
    targetId: 'registry.lookup',   // bare receiver.member — no node has this id
    type: 'CALLS', confidence: 0.4, properties: {},
  });
  return graph;
};

describe('a receiver that is a typed parameter', () => {
  // Looked up by SOURCE, not by edge id — rebinding a target re-keys the edge.
  const callEdge = (graph: ConducksAdjacencyList) =>
    [...graph.getAllEdges()].find(e => e.sourceId === `${ROOT}/app/run.ts::run` && e.type === 'CALLS')!;

  it('resolves the member on the declared parameter type', () => {
    const graph = build({ registry: 'Registry' });
    linker().resolve(graph);
    expect(callEdge(graph).targetId).toBe(`${ROOT}/core/registry.ts::registry.lookup`);
  });

  /**
   * With the param UNTYPED and no import scope, nothing may bind. (On an IMPORTED unit the older
   * 3c step still matches the method name within the import scope — that is pre-existing behaviour
   * with its own rail, and this test does not relitigate it. What the typed-parameter path adds is
   * resolution that names the RIGHT member because the signature says so, not because a name
   * matched.)
   */
  it('binds nothing when the parameter is untyped and the file imports nothing', () => {
    const graph = build(undefined, false);
    linker().resolve(graph);
    expect(callEdge(graph).targetId).toBe('registry.lookup');   // still dangling — stated, not guessed
  });

  it('refuses when the type resolves nowhere in scope', () => {
    const graph = build({ registry: 'UnknownType' }, false);
    linker().resolve(graph);
    expect(callEdge(graph).targetId).toBe('registry.lookup');
  });
});
