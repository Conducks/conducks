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
 * todo29#P3b — a call on a variable whose type is written on its declaration.
 *
 * Measured on subject-b: `export const Registry = globalForRegistry.registry ?? new ServiceRegistry()`,
 * then 192 call sites doing `Registry.get(...)`. The call processor resolves the RECEIVER — the
 * dangling target is `registry.ts::registry.get`, carrying the file that defines `Registry` — and
 * then stops, because the member belongs to `Registry`'s TYPE and nothing in the graph said what
 * that type was. `ServiceRegistry.get` existed as a node the whole time, one hop away and unreachable.
 *
 * The reflector now records `instanceOf` from the declaration, and IntraLinker walks it. Two rails
 * keep it a READ rather than a guess (ADR 0070): the member node must already exist, and a factory
 * (`X.getInstance()`) records nothing, because its return type is not stated at the declaration.
 * That second half is why subject-b's other 281 dangling calls — `db.query`, where `db` comes from
 * `CoreDatabaseManager.getInstance()` — stay dangling until there is a real type checker.
 */

const ROOT = '/repo';

const addUnit = (graph: ConducksAdjacencyList, file: string, symbols: Array<{ id: string; name: string; instanceOf?: string }> = []) => {
  const unitId = `${file}::unit`;
  graph.addNode({ id: unitId, label: 'UNIT', isShallow: false, properties: { unitId: null, name: 'unit', filePath: file, canonicalKind: 'UNIT', canonicalRank: 0 } });
  for (const s of symbols) {
    graph.addNode({
      id: `${file}::${s.id}`, label: 'SYMBOL', isShallow: false,
      properties: { unitId, name: s.name, filePath: file, canonicalKind: 'BEHAVIOR', canonicalRank: 7, instanceOf: s.instanceOf },
    });
  }
  return unitId;
};

const importEdge = (graph: ConducksAdjacencyList, from: string, to: string) =>
  graph.addEdge({ id: `IMPORTS::${from}->${to}`, sourceId: from, targetId: to, type: 'IMPORTS', confidence: 1.0, properties: {} });

const REGISTRY_FILE = `${ROOT}/core/registry/registry.ts`;

/** The subject-b shape: instance and class in one file, called from another. */
const buildGraph = (opts: { instanceOf?: string | null; memberExists?: boolean } = {}) => {
  // `null` means "no type recorded". Passing `instanceOf: undefined` would hit the default below —
  // a destructuring default fires on an explicit undefined — and silently test the opposite case.
  const { instanceOf = 'serviceregistry', memberExists = true } = opts;
  const graph = new ConducksAdjacencyList();

  addUnit(graph, REGISTRY_FILE, [
    { id: 'registry', name: 'Registry', instanceOf: instanceOf ?? undefined },
    { id: 'serviceregistry', name: 'ServiceRegistry' },
    ...(memberExists ? [{ id: 'serviceregistry.get', name: 'get' }] : []),
  ]);
  const consumer = addUnit(graph, `${ROOT}/app/handler.ts`, [{ id: 'handler', name: 'handler' }]);
  importEdge(graph, consumer, `${REGISTRY_FILE}::unit`);

  graph.addEdge({
    id: 'CALLS::handler->registry.get',
    sourceId: `${ROOT}/app/handler.ts::handler`,
    targetId: `${REGISTRY_FILE}::registry.get`,   // qualified, and no node has this id
    type: 'CALLS', confidence: 0.4, properties: {},
  });
  return graph;
};

/** `addEdge` lowercases the id it stores, so look it up the way the graph holds it. */
const targetOf = (graph: ConducksAdjacencyList, id: string) =>
  graph.getAllEdges().find(e => e.id === id.toLowerCase())?.targetId;

describe('a call on a variable declared with new', () => {
  it('rebinds to the member of the recorded type', () => {
    const graph = buildGraph();
    linker().resolve(graph);
    expect(targetOf(graph, 'CALLS::handler->registry.get')).toBe(`${REGISTRY_FILE}::serviceregistry.get`);
  });

  /**
   * The whole point of the rule, stated as its own check: WITHOUT the recorded type the edge has no
   * way through. If this ever passes, the rebind above is being done by something else and the
   * feature is unverified.
   */
  it('leaves the edge dangling when no type was recorded', () => {
    const graph = buildGraph({ instanceOf: null });
    linker().resolve(graph);
    expect(targetOf(graph, 'CALLS::handler->registry.get')).toBe(`${REGISTRY_FILE}::registry.get`);
  });

  /**
   * The safety rail. A type that does not own the member must resolve to NOTHING — inventing
   * `ServiceRegistry.get` because a `ServiceRegistry` exists is the guess ADR 0070 refuses, and it
   * would read as a real call edge to every consumer of the graph.
   */
  it('refuses when the type has no such member', () => {
    const graph = buildGraph({ memberExists: false });
    linker().resolve(graph);
    expect(targetOf(graph, 'CALLS::handler->registry.get')).toBe(`${REGISTRY_FILE}::registry.get`);
  });

  /** A type name that names nothing in the graph is not a licence to mint an id for it. */
  it('refuses when the recorded type is not a node anywhere', () => {
    const graph = buildGraph({ instanceOf: 'externalclient' });
    linker().resolve(graph);
    expect(targetOf(graph, 'CALLS::handler->registry.get')).toBe(`${REGISTRY_FILE}::registry.get`);
  });

  /** An id that already resolves must not be touched — the rule only fires on a MISSING target. */
  it('leaves an edge whose target exists alone', () => {
    const graph = buildGraph();
    graph.addEdge({
      id: 'CALLS::handler->serviceregistry.get',
      sourceId: `${ROOT}/app/handler.ts::handler`,
      targetId: `${REGISTRY_FILE}::serviceregistry.get`,
      type: 'CALLS', confidence: 1.0, properties: {},
    });
    linker().resolve(graph);
    expect(targetOf(graph, 'CALLS::handler->serviceregistry.get')).toBe(`${REGISTRY_FILE}::serviceregistry.get`);
  });
});
