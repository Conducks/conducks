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
 * ADR 0084 — a call on a variable produced by a FACTORY.
 *
 * `const coreDb = CoreDatabaseManager.getInstance()`, re-exported as `db`, then `db.query(...)` at
 * 306 call sites. ADR 0082 recorded this as needing a type checker. It does not: TypeScript makes
 * you WRITE the return type, and `getInstance(): CoreDatabaseManager` says it outright — conducks
 * simply never captured it and stored the literal `'void'` for every function in the graph.
 *
 * Four hops, and every one of them is a read of something the source states:
 *   1. `db` is a re-export       -> follow ALIASES / the barrel to `coreDb`
 *   2. `coreDb` came from a call -> read the CALLEE's declared return type
 *   3. the type is a class       -> resolve it in the declaring file
 *   4. `query` is on the PARENT  -> follow EXTENDS
 *
 * Miss any one and the whole chain refuses. Each is pinned separately below, because a single
 * end-to-end test that goes green tells you nothing about which hop is carrying it.
 */

const ROOT = '/repo';
const MGR = `${ROOT}/core/database/manager.ts`;
const BARREL = `${ROOT}/core/database/index.ts`;
const APP = `${ROOT}/app/handler.ts`;

type Sym = { id: string; name: string; instanceOfCall?: string; declaredReturn?: string };

const addUnit = (graph: ConducksAdjacencyList, file: string, symbols: Sym[] = []) => {
  const unitId = `${file}::unit`;
  graph.addNode({ id: unitId, label: 'UNIT', isShallow: false, properties: { unitId: null, name: 'unit', filePath: file, canonicalKind: 'UNIT', canonicalRank: 0 } });
  for (const s of symbols) {
    graph.addNode({
      id: `${file}::${s.id}`, label: 'SYMBOL', isShallow: false,
      properties: {
        unitId, name: s.name, filePath: file, canonicalKind: 'BEHAVIOR', canonicalRank: 7,
        instanceOfCall: s.instanceOfCall, declaredReturn: s.declaredReturn,
      },
    });
  }
  return unitId;
};

const edge = (graph: ConducksAdjacencyList, type: string, from: string, to: string, id = `${type}::${from}->${to}`) =>
  graph.addEdge({ id, sourceId: from, targetId: to, type: type as never, confidence: 1.0, properties: {} });

/**
 * The measured shape. `opts` removes exactly one hop at a time.
 */
const buildGraph = (opts: {
  declaredReturn?: string | null;   // null = the factory declares no return type
  extendsParent?: boolean;          // false = the class has no parent
  memberOnParent?: boolean;         // false = nobody declares `query`
} = {}) => {
  const { declaredReturn = 'CoreDatabaseManager', extendsParent = true, memberOnParent = true } = opts;
  const graph = new ConducksAdjacencyList();

  addUnit(graph, MGR, [
    { id: 'coredatabasemanager', name: 'CoreDatabaseManager' },
    { id: 'coredatabasemanager.getinstance', name: 'getInstance', declaredReturn: declaredReturn ?? undefined },
    { id: 'coredb', name: 'coreDb', instanceOfCall: 'coredatabasemanager.getinstance' },
    { id: 'basedatabasemanager', name: 'BaseDatabaseManager' },
    ...(memberOnParent ? [{ id: 'basedatabasemanager.query', name: 'query' }] : []),
  ]);
  if (extendsParent) edge(graph, 'EXTENDS', `${MGR}::coredatabasemanager`, `${MGR}::basedatabasemanager`);

  // The barrel: `export { coreDb as db }` — a node with the republished name and no definition.
  addUnit(graph, BARREL, [{ id: 'db', name: 'db' }]);
  edge(graph, 'ALIASES', `${BARREL}::db`, `${MGR}::coredb`);

  addUnit(graph, APP, [{ id: 'handler', name: 'handler' }]);
  edge(graph, 'IMPORTS', `${APP}::unit`, `${BARREL}::unit`);
  edge(graph, 'IMPORTS', `${BARREL}::unit`, `${MGR}::unit`);

  graph.addEdge({
    id: 'CALLS::handler->db.query',
    sourceId: `${APP}::handler`,
    targetId: `${BARREL}::db.query`,     // qualified, and no node has this id
    type: 'CALLS', confidence: 0.4, properties: {},
  });
  return graph;
};

const targetOf = (graph: ConducksAdjacencyList) =>
  graph.getAllEdges().find(e => e.id === 'calls::handler->db.query')?.targetId;

const UNRESOLVED = `${BARREL}::db.query`;

describe('a call on a variable a factory produced', () => {
  it('resolves through the alias, the return type and the parent class', () => {
    const graph = buildGraph();
    linker().resolve(graph);
    expect(targetOf(graph)).toBe(`${MGR}::basedatabasemanager.query`);
  });

  /** Hop 2. No declared return type is the one case that genuinely IS unknowable here. */
  it('refuses when the factory declares no return type', () => {
    const graph = buildGraph({ declaredReturn: null });
    linker().resolve(graph);
    expect(targetOf(graph)).toBe(UNRESOLVED);
  });

  /**
   * A constructed type is not a name. `Promise<CoreDatabaseManager>` describes a wrapper around the
   * value, and unwrapping one is inference rather than reading — ADR 0070's line.
   *
   * HONEST NOTE: this test does not prove the identifier guard. Deleting that guard leaves it GREEN,
   * because `promise<coredatabasemanager>` then resolves to no class and the rule refuses one step
   * later anyway — verified by mutation. It is kept as a behaviour pin, not as coverage of the rail;
   * the rail's value is that it refuses at the point of reading rather than by accident downstream.
   */
  it('refuses when the declared return type is a constructed type', () => {
    for (const declared of ['Promise<CoreDatabaseManager>', 'CoreDatabaseManager | null', 'CoreDatabaseManager[]']) {
      const graph = buildGraph({ declaredReturn: declared });
      linker().resolve(graph);
      expect(targetOf(graph)).toBe(UNRESOLVED);
    }
  });

  /** Hop 4. Without the heritage walk this is the 281-edge case that silently stays dangling. */
  it('refuses when no class in the chain declares the member', () => {
    const graph = buildGraph({ memberOnParent: false });
    linker().resolve(graph);
    expect(targetOf(graph)).toBe(UNRESOLVED);
  });

  it('refuses when the type has no parent and does not declare the member itself', () => {
    const graph = buildGraph({ extendsParent: false });
    linker().resolve(graph);
    expect(targetOf(graph)).toBe(UNRESOLVED);
  });

  /**
   * The ordering bug, pinned. `EXTENDS` targets are resolved by this SAME pass, so a heritage edge
   * may still be a bare name when the rule reads it. Before it was resolved inside the walk, the
   * identical lookup succeeded 80 times and refused 226 — same type, same member, different edge
   * order. A rule whose answer depends on iteration order is worse than one that always refuses.
   */
  it('resolves even when the heritage edge is still an unresolved bare name', () => {
    const graph = buildGraph();
    for (const e of graph.getAllEdges()) {
      if (e.type === 'EXTENDS') graph.rebindEdgeTarget(e, 'basedatabasemanager');   // bare, as emitted
    }
    linker().resolve(graph);
    expect(targetOf(graph)).toBe(`${MGR}::basedatabasemanager.query`);
  });
});

describe('getNeighbors filters by edge type', () => {
  /**
   * The parameter existed and was never applied, so an alias walk followed a MEMBER_OF edge into the
   * directory tree. Nothing failed — it just answered with the wrong edge.
   */
  /** `db` carries its ALIASES edge plus a containment edge, the way a real symbol node does. */
  const twoEdged = () => {
    const graph = buildGraph();
    edge(graph, 'MEMBER_OF', `${BARREL}::db`, `${BARREL}::unit`);
    return graph;
  };

  it('returns only edges of the requested type', () => {
    const graph = twoEdged();
    const aliases = graph.getNeighbors(`${BARREL}::db`, 'downstream', 'ALIASES' as never);
    expect(graph.getNeighbors(`${BARREL}::db`, 'downstream').length).toBeGreaterThan(aliases.length);
    expect(aliases.map(e => e.type)).toEqual(['ALIASES']);
  });

  it('returns everything when no type is given', () => {
    const types = new Set(twoEdged().getNeighbors(`${BARREL}::db`, 'downstream').map(e => e.type));
    expect(types.has('ALIASES')).toBe(true);
    expect(types.has('MEMBER_OF')).toBe(true);
  });
});

/**
 * The uniqueness gate. Every lookup these rules make resolves through the units a file imports, and
 * two of those can export the SAME NAME — picking the first is the coincidence-binding ADR 0070
 * refuses. Costs nothing on the measured subject (77 dangling either way, 100% verified), so it is a
 * guard for the next codebase rather than a fix for this one; an unexercised guard is an unverified
 * one, which is what these tests are for.
 *
 * The class has to live OUTSIDE the declaring file for the gate to matter: a same-file declaration is
 * unambiguous by definition and is looked up directly, before any import scope is consulted. The
 * first version of this test put the rival behind a file that declared the class itself, so the
 * direct hit won and the refusal never ran — the test failed and the code was right.
 */
describe('an ambiguous name is refused, not guessed', () => {
  const TYPES_A = `${ROOT}/core/database/types-a.ts`;
  const TYPES_B = `${ROOT}/core/database/types-b.ts`;

  /** `manager.ts` holds the factory and the variable; the CLASS lives elsewhere and is imported. */
  const buildSplit = (rival: boolean) => {
    const graph = new ConducksAdjacencyList();

    addUnit(graph, MGR, [
      { id: 'coredatabasemanager.getinstance', name: 'getInstance', declaredReturn: 'CoreDatabaseManager' },
      { id: 'coredb', name: 'coreDb', instanceOfCall: 'coredatabasemanager.getinstance' },
    ]);
    addUnit(graph, TYPES_A, [
      { id: 'coredatabasemanager', name: 'CoreDatabaseManager' },
      { id: 'coredatabasemanager.query', name: 'query' },
    ]);
    edge(graph, 'IMPORTS', `${MGR}::unit`, `${TYPES_A}::unit`);

    if (rival) {
      addUnit(graph, TYPES_B, [
        { id: 'coredatabasemanager', name: 'CoreDatabaseManager' },
        { id: 'coredatabasemanager.query', name: 'query' },
      ]);
      edge(graph, 'IMPORTS', `${MGR}::unit`, `${TYPES_B}::unit`);
    }

    addUnit(graph, BARREL, [{ id: 'db', name: 'db' }]);
    edge(graph, 'ALIASES', `${BARREL}::db`, `${MGR}::coredb`);
    addUnit(graph, APP, [{ id: 'handler', name: 'handler' }]);
    edge(graph, 'IMPORTS', `${APP}::unit`, `${BARREL}::unit`);

    graph.addEdge({
      id: 'CALLS::handler->db.query',
      sourceId: `${APP}::handler`, targetId: `${BARREL}::db.query`,
      type: 'CALLS', confidence: 0.4, properties: {},
    });
    return graph;
  };

  /** One declaration, imported: resolves. This is the control — without it the refusal proves nothing. */
  it('resolves when exactly one imported unit declares the class', () => {
    const graph = buildSplit(false);
    linker().resolve(graph);
    expect(targetOf(graph)).toBe(`${TYPES_A}::coredatabasemanager.query`);
  });

  it('refuses when two imported units declare the same class name', () => {
    const graph = buildSplit(true);
    linker().resolve(graph);
    expect(targetOf(graph)).toBe(UNRESOLVED);
  });
});
