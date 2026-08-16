import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { AnalyzeOrchestrator } from '@/lib/domain/analysis/orchestrator.js';
import { ConducksGraph } from "@/lib/core/graph/index.js";
import { SynapseRegistry } from '@/lib/core/registry/synapse-registry.js';
import { TypeScriptProvider } from '@/lib/core/parsing/languages/typescript/index.js';
import { grammars } from '@/lib/core/parsing/grammar-registry.js';
import { ConducksComponent } from "@/contracts/index.js";
import { ConducksAdjacencyList } from "@/lib/core/graph/index.js";
import { IntraLinker } from "@/lib/core/graph/index.js";

/**
 * ADR 0071 — a barrel re-export ("export { x as y } from './z'") must not leave the per-binding
 * IMPORTS edge dangling on downstream importers.
 *
 * Measured on the subject-b monorepo vault: 180 of 193 dangling IMPORTS edges carry an `@/core`
 * alias whose FILE resolves correctly (ADR 0070's fix already applies) but whose per-binding target
 * does not exist. `reflection-pipeline.ts` builds that target as `<resolvedFile>::<bindingName>` —
 * e.g. `.../server/index.ts::db` for `import { db } from '@/core/database/server'` — but `db` is not
 * DEFINED in index.ts. It is re-exported from './DatabaseManager' under a different name
 * (`export { coreDb as db } from './DatabaseManager'`), so the target node never existed.
 *
 * Fixed in queries.ts (no reflector.ts/reflection-pipeline.ts/linker-intra.ts edits needed — see ADR
 * 0071 for why): a new per-specifier capture on export-from statements makes the reflector's EXISTING
 * node-creation path mint a real node `<barrelFile>::<publicName>` for every republished binding
 * (renamed or not), and its EXISTING-but-previously-unreachable alias branch emit a durable `ALIASES`
 * edge from that node to the bare original name. `IntraLinker` already treats `ALIASES` as
 * RESOLVABLE (ADR 0053) and rebinds it to the real cross-file definition in its post-wave pass.
 */
describe('Barrel re-export — the public binding a barrel republishes becomes a real node', () => {
  const ROOT = '/repo-reexport';
  let prevWorkers: string | undefined;

  beforeAll(async () => {
    prevWorkers = process.env.CONDUCKS_WORKERS;
    process.env.CONDUCKS_WORKERS = '0';
    await grammars.loadLanguage('typescript');
  });

  afterAll(() => {
    if (prevWorkers === undefined) delete process.env.CONDUCKS_WORKERS;
    else process.env.CONDUCKS_WORKERS = prevWorkers;
  });

  const makeRegistry = () => {
    const registry = new SynapseRegistry<ConducksComponent>();
    registry.registerProvider('.ts', new TypeScriptProvider());
    return registry;
  };

  // Reproduces the exact subject-b barrel shape: a rename ('coreDb as db') and a plain re-export
  // ('pool') in the same statement, plus two downstream importers of the barrel.
  const files = () => [
    {
      path: `${ROOT}/src/core/database/server/DatabaseManager.ts`,
      source: `export const coreDb = 1;\nexport const pool = 2;\n`,
    },
    {
      path: `${ROOT}/src/core/database/server/index.ts`,
      source: `export { coreDb as db, pool } from './DatabaseManager';\n`,
    },
    {
      path: `${ROOT}/src/consumers/renamed.ts`,
      source: `import { db } from '../core/database/server';\nexport function useDb() { return db; }\n`,
    },
    {
      path: `${ROOT}/src/consumers/plain.ts`,
      source: `import { pool } from '../core/database/server';\nexport function usePool() { return pool; }\n`,
    },
  ];

  const barrelId = `${ROOT}/src/core/database/server/index.ts`;
  const dbManagerId = `${ROOT}/src/core/database/server/DatabaseManager.ts`;

  it('mints a node for the renamed public binding ("db") and does not leave the importer dangling', async () => {
    const graph = new ConducksGraph();
    const orchestrator = new AnalyzeOrchestrator(makeRegistry(), graph);
    await orchestrator.analyze(files(), { workspaceRoot: ROOT });

    const g = graph.getGraph();

    // The node the downstream BIND:: edge targets must actually exist now.
    const aliasNode = g.getNode(`${barrelId}::db`);
    expect(aliasNode).toBeDefined();

    // The importer's per-binding edge lands on that real node.
    const unitConsumer = `${ROOT}/src/consumers/renamed.ts::unit`;
    const bind = g.getAllEdges().find(
      e => e.type === 'IMPORTS' && e.sourceId === unitConsumer && e.properties.bindingName === 'db'
    );
    expect(bind).toBeDefined();
    expect(bind!.targetId).toBe(`${barrelId}::db`);
    expect(g.getNode(bind!.targetId)).toBeDefined();
  });

  it('mints a node for a plain (non-renamed) re-exported binding ("pool") too', async () => {
    const graph = new ConducksGraph();
    const orchestrator = new AnalyzeOrchestrator(makeRegistry(), graph);
    await orchestrator.analyze(files(), { workspaceRoot: ROOT });

    const g = graph.getGraph();
    expect(g.getNode(`${barrelId}::pool`)).toBeDefined();

    const unitConsumer = `${ROOT}/src/consumers/plain.ts::unit`;
    const bind = g.getAllEdges().find(
      e => e.type === 'IMPORTS' && e.sourceId === unitConsumer && e.properties.bindingName === 'pool'
    );
    expect(bind).toBeDefined();
    expect(bind!.targetId).toBe(`${barrelId}::pool`);
    expect(g.getNode(bind!.targetId)).toBeDefined();
  });

  it('emits a durable ALIASES edge from the renamed public name to the bare original name', async () => {
    const graph = new ConducksGraph();
    const orchestrator = new AnalyzeOrchestrator(makeRegistry(), graph);
    await orchestrator.analyze(files(), { workspaceRoot: ROOT });

    const g = graph.getGraph();
    const aliasEdge = g.getAllEdges().find(
      e => e.type === 'ALIASES' && e.sourceId === `${barrelId}::db`
    );
    expect(aliasEdge).toBeDefined();
    // QUALIFIED with the file the specifier resolves to. This asserted the BARE name `coredb` until
    // 2026-08-01: the bare form left the target to IntraLinker, which scopes the lookup to files the
    // unit imports — a scope a dynamic import never produces, so those aliases dangled (ADR 0085).
    // The specifier is present in the match, so it is resolved here and the edge points at a real id.
    expect(aliasEdge!.targetId).toBe(`${ROOT}/src/core/database/server/databasemanager.ts::coredb`);
  });

  /**
   * REVERSED 2026-08-02 (ADR 0109). This asserted that a plain re-export must NOT get an ALIASES
   * edge — "does not fabricate" — and the reasoning was that an un-renamed re-export carries the
   * same name at both ends, so IntraLinker could match it without help.
   *
   * Measured on a real monorepo, it cannot. `export { assembleGitClone } from './git-clone'` left
   * the barrel node an ISLAND whose only edge was MEMBER_OF to its own file, so every consumer that
   * imported through the barrel was invisible from the declaration. Answering "who uses this"
   * required querying each node of the re-export chain BY HAND — three separate `impact` calls on
   * openship to find four caller files.
   *
   * With the edge, one call on the declaration returns all four, with correct lines. An un-renamed
   * re-export is not a fabrication: `export { x } from './y'` states that this barrel's `x` IS
   * `y`'s `x`, which is exactly what the edge records.
   */
  it('emits an ALIASES edge for a plain re-export, so barrel consumers stay reachable', async () => {
    const graph = new ConducksGraph();
    const orchestrator = new AnalyzeOrchestrator(makeRegistry(), graph);
    await orchestrator.analyze(files(), { workspaceRoot: ROOT });

    const g = graph.getGraph();
    const aliasEdge = g.getAllEdges().find(
      e => e.type === 'ALIASES' && e.sourceId === `${barrelId}::pool`
    );
    expect(aliasEdge).toBeDefined();
    // Qualified with the file the specifier resolves to, same rule as the renamed form above — a
    // bare target would leave the resolution to a name match, which is what ADR 0085 refuses.
    expect(aliasEdge!.targetId).toContain('::pool');
  });
});

/**
 * IntraLinker already classifies ALIASES as RESOLVABLE (ADR 0053, linker-intra.ts). This proves that
 * classification actually resolves the bare re-export ALIASES edge produced above to the real
 * cross-file definition, scoped by the barrel's own IMPORTS edge to the file it re-exports from —
 * exactly the mechanism CALLS/TYPE_REFERENCE already use, no new resolution code required.
 */
describe('IntraLinker — resolves a barrel re-export ALIASES edge to its real definition', () => {
  const barrelUnit = '/repo/server/index.ts::unit';
  const barrelFile = '/repo/server/index.ts';
  const targetUnit = '/repo/server/DatabaseManager.ts::unit';
  const targetFile = '/repo/server/DatabaseManager.ts';

  const buildGraph = () => {
    const graph = new ConducksAdjacencyList();
    graph.addNode({ id: barrelUnit, label: 'UNIT', isShallow: false, properties: { unitId: null, name: 'unit', filePath: barrelFile } });
    graph.addNode({ id: `${barrelFile}::db`, label: 'ATOM', isShallow: false, properties: { unitId: barrelUnit, name: 'db', filePath: barrelFile } });
    graph.addNode({ id: targetUnit, label: 'UNIT', isShallow: false, properties: { unitId: null, name: 'unit', filePath: targetFile } });
    graph.addNode({ id: `${targetFile}::coredb`, label: 'ATOM', isShallow: false, properties: { unitId: targetUnit, name: 'coreDb', filePath: targetFile } });

    // The barrel's own whole-file IMPORTS edge to the file it re-exports from — already resolved,
    // same as any other relative import.
    graph.addEdge({ id: 'IMPORTS::barrel->target', sourceId: barrelUnit, targetId: targetUnit, type: 'IMPORTS', confidence: 1.0, properties: {} });

    // The bare ALIASES edge this task's queries.ts fix emits.
    graph.addEdge({ id: 'ALIASES::db->coredb', sourceId: `${barrelFile}::db`, targetId: 'coredb', type: 'ALIASES', confidence: 1.0, properties: {} });

    return graph;
  };

  it('rebinds the bare ALIASES target to the real definition in the imported file', () => {
    const graph = buildGraph();
    const linker = new IntraLinker();
    const resolved = linker.resolve(graph);

    const hit = resolved.find(r => r.id === 'aliases::db->coredb');
    expect(hit).toBeDefined();
    expect(hit!.newTargetId).toBe(`${targetFile.toLowerCase()}::coredb`);
  });
});
