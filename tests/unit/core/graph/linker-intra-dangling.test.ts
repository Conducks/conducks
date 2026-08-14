import { describe, it, expect } from '@jest/globals';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';
import { IntraLinker } from '@/lib/core/graph/linker-intra.js';

/**
 * todo29#P3b — the four dangling-edge families the ADR 0071 barrel fix left open.
 *
 * Every fixture below is the SHAPE measured in the subject-b five-service vault
 * (`.conducks/conducks-synapse.db`, 6,002 nodes / 19,008 edges / 182 dangling edges), reduced to the
 * smallest graph that reproduces it. The ids are the real ones, lowercased the way the graph stores
 * them.
 */

const ROOT = '/repo';

/** A unit node plus the symbols inside it, with the `unitId` back-reference IntraLinker indexes on. */
const addUnit = (graph: ConducksAdjacencyList, file: string, symbols: Array<{ id: string; name: string }> = []) => {
  const unitId = `${file}::unit`;
  graph.addNode({ id: unitId, label: 'UNIT', isShallow: false, properties: { unitId: null, name: 'unit', filePath: file, canonicalKind: 'UNIT', canonicalRank: 0 } });
  for (const s of symbols) {
    graph.addNode({ id: `${file}::${s.id}`, label: 'SYMBOL', isShallow: false, properties: { unitId, name: s.name, filePath: file, canonicalKind: 'BEHAVIOR', canonicalRank: 7 } });
  }
  return unitId;
};

const importEdge = (graph: ConducksAdjacencyList, from: string, to: string) =>
  graph.addEdge({ id: `IMPORTS::${from}->${to}`, sourceId: from, targetId: to, type: 'IMPORTS', confidence: 1.0, properties: {} });

describe('GROUP 2 — a qualified member call resolves through the barrel that republishes it', () => {
  /**
   * Measured shape: `authService.ts` calls `userRepository.create(...)`, the call processor writes
   * the target exactly as written (`userrepository.create`), and the definition lives at
   * `user.repository.ts::userrepository.create` — a node whose `name` is only `create`.
   *
   * Two separate defects kept it dangling, and the fixture holds both:
   *   1. the index was keyed by `name`, so the qualified form was never a lookup key;
   *   2. `authService.ts` imports `userRepository` from the BARREL `auth/server/index.ts`, not from
   *      the defining file, so a depth-1 import scope never reaches it.
   */
  const buildGraph = () => {
    const graph = new ConducksAdjacencyList();

    const consumer = addUnit(graph, `${ROOT}/app/authservice.ts`, [{ id: 'authservice.signup', name: 'signup' }]);
    const barrel = addUnit(graph, `${ROOT}/core/auth/server/index.ts`);
    const definer = addUnit(graph, `${ROOT}/core/auth/server/repositories/user.repository.ts`, [
      { id: 'userrepository', name: 'userRepository' },
      { id: 'userrepository.create', name: 'create' },
    ]);

    importEdge(graph, consumer, barrel);
    importEdge(graph, barrel, definer);

    graph.addEdge({
      id: 'CALLS::signup->userrepository.create',
      sourceId: `${ROOT}/app/authservice.ts::authservice.signup`,
      targetId: 'userrepository.create',
      type: 'CALLS', confidence: 0.4, properties: {},
    });
    return graph;
  };

  it('binds `userrepository.create` to the defining node two import hops away', () => {
    const graph = buildGraph();
    const resolved = new IntraLinker().resolve(graph);

    const hit = resolved.find(r => r.id === 'calls::signup->userrepository.create');
    expect(hit).toBeDefined();
    expect(hit!.newTargetId).toBe(`${ROOT}/core/auth/server/repositories/user.repository.ts::userrepository.create`);
  });

  it('refuses when two units behind the barrel define the same qualified member', () => {
    const graph = buildGraph();
    // A second repository file, republished by the same barrel, defining the identical member path.
    const rival = addUnit(graph, `${ROOT}/core/auth/server/repositories/legacy.repository.ts`, [
      { id: 'userrepository.create', name: 'create' },
    ]);
    importEdge(graph, `${ROOT}/core/auth/server/index.ts::unit`, rival);

    const resolved = new IntraLinker().resolve(graph);
    expect(resolved.find(r => r.id === 'calls::signup->userrepository.create')).toBeUndefined();
  });
});

describe('GROUP 1 — a named import of an external symbol binds under its package namespace', () => {
  /**
   * Measured shape: `AdminSidebar.tsx` writes `import { UsersIcon, AcademicCapIcon } from
   * '@heroicons/react/24/outline'`. The CONSTRUCTS emitter resolves what it renders
   * (`@heroicons/react/24/outline::arrowrightstartonrectangleicon`); the reference-as-value emitter
   * writes the BARE binding (`usersicon`) and dangles. An external import produces NO IMPORTS edge
   * at all — 0 of subject-b's 3,095 — so the import scope cannot see the package.
   *
   * The evidence used instead is the unit's OWN already-resolved edge naming that namespace.
   */
  const buildGraph = () => {
    const graph = new ConducksAdjacencyList();
    const unit = addUnit(graph, `${ROOT}/admin/adminsidebar.tsx`);

    // The resolved half of the same import — this is what proves the unit references the package.
    graph.addEdge({
      id: 'CONSTRUCTS::sidebar->arrowicon', sourceId: unit,
      targetId: '@heroicons/react/24/outline::arrowrightstartonrectangleicon',
      type: 'CONSTRUCTS', confidence: 0.9, properties: {},
    });
    // Some other unit in the workspace renders UsersIcon, which is what attests the symbol.
    const other = addUnit(graph, `${ROOT}/admin/dashboard.tsx`);
    graph.addEdge({
      id: 'CONSTRUCTS::dashboard->usersicon', sourceId: other,
      targetId: '@heroicons/react/24/outline::usersicon',
      type: 'CONSTRUCTS', confidence: 0.9, properties: {},
    });
    // The dangling one.
    graph.addEdge({
      id: 'ACCESSES::sidebar->usersicon', sourceId: unit, targetId: 'usersicon',
      type: 'ACCESSES', confidence: 0.8, properties: { referenceAsValue: true, original: 'UsersIcon' },
    });
    return graph;
  };

  it('binds the bare external binding to `<package>::<symbol>`', () => {
    const graph = buildGraph();
    const resolved = new IntraLinker().resolve(graph);

    const hit = resolved.find(r => r.id === 'accesses::sidebar->usersicon');
    expect(hit).toBeDefined();
    expect(hit!.newTargetId).toBe('@heroicons/react/24/outline::usersicon');
  });

  it('refuses when two packages the unit references both export the name', () => {
    const graph = buildGraph();
    const unit = `${ROOT}/admin/adminsidebar.tsx::unit`;
    graph.addEdge({
      id: 'CONSTRUCTS::sidebar->lucide', sourceId: unit,
      targetId: 'lucide-react::layers', type: 'CONSTRUCTS', confidence: 0.9, properties: {},
    });
    graph.addEdge({
      id: 'CONSTRUCTS::dashboard->lucideusers', sourceId: `${ROOT}/admin/dashboard.tsx::unit`,
      targetId: 'lucide-react::usersicon', type: 'CONSTRUCTS', confidence: 0.9, properties: {},
    });

    const resolved = new IntraLinker().resolve(graph);
    expect(resolved.find(r => r.id === 'accesses::sidebar->usersicon')).toBeUndefined();
  });

  it('does not bind a name the unit never showed evidence of importing', () => {
    const graph = buildGraph();
    // A THIRD unit that renders nothing external, referencing the same bare name.
    const stranger = addUnit(graph, `${ROOT}/admin/stranger.tsx`);
    graph.addEdge({
      id: 'ACCESSES::stranger->usersicon', sourceId: stranger, targetId: 'usersicon',
      type: 'ACCESSES', confidence: 0.8, properties: {},
    });

    const resolved = new IntraLinker().resolve(graph);
    expect(resolved.find(r => r.id === 'accesses::stranger->usersicon')).toBeUndefined();
  });

  it('never treats a constructed namespace (`ecosystem::`, `lib::`, `global::`) as a package', () => {
    // `ecosystem::next` is a MANIFEST node — "this project declares a dependency called next" — and
    // `lib::`/`global::` are induction's own containers. All three read as `<namespace>::<symbol>`
    // and none of them is a module a name can be imported FROM. Without the guard, a unit whose
    // `package.json` declares `next` would bind its bare `next` reference to the manifest entry.
    const graph = new ConducksAdjacencyList();
    const unit = addUnit(graph, `${ROOT}/app/page.tsx`);

    graph.addEdge({ id: 'DEPENDS_ON::page->next', sourceId: unit, targetId: 'ecosystem::next', type: 'DEPENDS_ON', confidence: 1.0, properties: {} });
    graph.addEdge({ id: 'VIRTUAL_LINK::page->libglob', sourceId: unit, targetId: 'lib::glob', type: 'VIRTUAL_LINK', confidence: 1.0, properties: {} });
    graph.addEdge({ id: 'CALLS::page->globalfetch', sourceId: unit, targetId: 'global::fetch', type: 'CALLS', confidence: 0.9, properties: {} });

    for (const bare of ['next', 'glob', 'fetch']) {
      graph.addEdge({ id: `ACCESSES::page->${bare}`, sourceId: unit, targetId: bare, type: 'ACCESSES', confidence: 0.8, properties: {} });
    }

    const resolved = new IntraLinker().resolve(graph);
    for (const bare of ['next', 'glob', 'fetch']) {
      expect(resolved.find(r => r.id === `accesses::page->${bare}`)).toBeUndefined();
    }
  });
});

describe('Wildcard re-export — `export * from` resolves at the target file', () => {
  /**
   * ADR 0071 left this unfixed and said why: `export * from './x'` enumerates no symbol name at the
   * re-exporting file, so nothing keys a node there. That objection is about PARSE time, where the
   * orchestrator clears the graph between waves and the target file may not have been read yet.
   *
   * IntraLinker runs after the whole graph is reloaded, so the objection no longer holds: the
   * barrel's own whole-file IMPORTS edge names the file the wildcard re-exports FROM, and that file's
   * symbols are in the graph. Measured shape: `packages/core/index.ts::browserstoragemanager`.
   *
   * The edge is pointed at the real definition rather than a node minted at the barrel — nothing is
   * invented, and the importer lands on the file that defines the symbol.
   */
  const buildGraph = () => {
    const graph = new ConducksAdjacencyList();
    const consumer = addUnit(graph, `${ROOT}/app/storage-user.ts`);
    const barrel = addUnit(graph, `${ROOT}/core/index.ts`);
    const definer = addUnit(graph, `${ROOT}/core/storage/browser.ts`, [
      { id: 'browserstoragemanager', name: 'BrowserStorageManager' },
    ]);

    // `export * from './storage/browser'` — the whole-file specifier edge survives; the names do not.
    importEdge(graph, barrel, definer);
    importEdge(graph, consumer, barrel);

    // The per-binding IMPORTS edge a downstream importer builds, targeting a node that never existed.
    graph.addEdge({
      id: 'IMPORTS::consumer->core-index-bsm', sourceId: consumer,
      targetId: `${ROOT}/core/index.ts::browserstoragemanager`,
      type: 'IMPORTS', confidence: 1.0, properties: { bindingName: 'browserstoragemanager' },
    });
    return graph;
  };

  it('rebinds the dangling barrel binding to the file the wildcard republishes it from', () => {
    const graph = buildGraph();
    const resolved = new IntraLinker().resolve(graph);

    const hit = resolved.find(r => r.id === 'imports::consumer->core-index-bsm');
    expect(hit).toBeDefined();
    expect(hit!.newTargetId).toBe(`${ROOT}/core/storage/browser.ts::browserstoragemanager`);
  });

  it('leaves a per-binding IMPORTS edge alone when its node already exists', () => {
    const graph = buildGraph();
    graph.addNode({
      id: `${ROOT}/core/index.ts::browserstoragemanager`, label: 'SYMBOL', isShallow: false,
      properties: { unitId: `${ROOT}/core/index.ts::unit`, name: 'BrowserStorageManager', filePath: `${ROOT}/core/index.ts`, canonicalKind: 'BEHAVIOR', canonicalRank: 7 },
    });

    const resolved = new IntraLinker().resolve(graph);
    expect(resolved.find(r => r.id === 'imports::consumer->core-index-bsm')).toBeUndefined();
  });
});

describe('ALIASES chains — followed past one hop, and terminating on a cycle', () => {
  /**
   * ADR 0071 resolves ONE hop per pass and says so. Each hop is a RENAMED re-export, which is the
   * only shape that emits an ALIASES edge at all — a plain `export { x } from './y'` deliberately
   * fabricates none, so a chain is only chained where every hop renames:
   *
   *   inner.ts    export const coreDb
   *   middle.ts   export { coreDb as midDb } from './inner'
   *   outer.ts    export { midDb as db }     from './middle'
   *
   * One pass leaves `outer.ts::db` pointing at `middle.ts::middb` — a real node, so nothing dangles,
   * but the link stops short of the definition.
   */
  it('walks a two-hop chain to the definition, not to the middle barrel', () => {
    const graph = new ConducksAdjacencyList();
    const outer = addUnit(graph, `${ROOT}/core/outer.ts`, [{ id: 'db', name: 'db' }]);
    const middle = addUnit(graph, `${ROOT}/core/middle.ts`, [{ id: 'middb', name: 'midDb' }]);
    const inner = addUnit(graph, `${ROOT}/core/inner.ts`, [{ id: 'coredb', name: 'coreDb' }]);

    importEdge(graph, outer, middle);
    importEdge(graph, middle, inner);

    graph.addEdge({ id: 'ALIASES::outer-db', sourceId: `${ROOT}/core/outer.ts::db`, targetId: 'middb', type: 'ALIASES', confidence: 1.0, properties: {} });
    graph.addEdge({ id: 'ALIASES::middle-middb', sourceId: `${ROOT}/core/middle.ts::middb`, targetId: 'coredb', type: 'ALIASES', confidence: 1.0, properties: {} });

    const resolved = new IntraLinker().resolve(graph);

    // Hop 1 is what ADR 0071 already delivered.
    const middleEdge = graph.getAllEdges().find(e => e.id === 'aliases::middle-middb')!;
    expect(middleEdge.targetId).toBe(`${ROOT}/core/inner.ts::coredb`);

    // Hop 2 is what this task adds.
    const outerEdge = graph.getAllEdges().find(e => e.id === 'aliases::outer-db')!;
    expect(outerEdge.targetId).toBe(`${ROOT}/core/inner.ts::coredb`);
    expect(resolved.some(r => r.id === 'aliases::outer-db' && r.newTargetId === outerEdge.targetId)).toBe(true);
  });

  it('terminates on a cycle instead of looping, keeping the last real node it reached', () => {
    // Two barrels re-exporting each other — `a::x` aliases `b::x` aliases `a::x`.
    const graph = new ConducksAdjacencyList();
    const a = addUnit(graph, `${ROOT}/core/a.ts`, [{ id: 'x', name: 'x' }]);
    const b = addUnit(graph, `${ROOT}/core/b.ts`, [{ id: 'x', name: 'x' }]);
    importEdge(graph, a, b);
    importEdge(graph, b, a);

    graph.addEdge({ id: 'ALIASES::a-x', sourceId: `${ROOT}/core/a.ts::x`, targetId: `${ROOT}/core/b.ts::x`, type: 'ALIASES', confidence: 1.0, properties: {} });
    graph.addEdge({ id: 'ALIASES::b-x', sourceId: `${ROOT}/core/b.ts::x`, targetId: `${ROOT}/core/a.ts::x`, type: 'ALIASES', confidence: 1.0, properties: {} });

    // The assertion that matters is that this RETURNS at all.
    const resolved = new IntraLinker().resolve(graph);
    expect(Array.isArray(resolved)).toBe(true);

    for (const id of ['aliases::a-x', 'aliases::b-x']) {
      const edge = graph.getAllEdges().find(e => e.id === id)!;
      expect(graph.hasNode(edge.targetId)).toBe(true);
    }
  });
});
