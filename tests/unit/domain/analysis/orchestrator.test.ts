import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { AnalyzeOrchestrator } from '@/lib/domain/analysis/orchestrator.js';
import { ConducksGraph } from "@/lib/core/graph/index.js";
import { SynapseRegistry } from '@/lib/core/registry/synapse-registry.js';
import { IgnoreManager } from '@/lib/core/parsing/ignore-manager.js';
import { TypeScriptProvider } from '@/lib/core/parsing/languages/typescript/index.js';
import { grammars } from '@/lib/core/parsing/grammar-registry.js';
import { ConducksComponent } from "@/contracts/index.js";
import { CanonicalKind, CanonicalRank } from "@/contracts/index.js";

/**
 * Characterization tests for AnalyzeOrchestrator.analyze(), written ahead of the todo03 Phase 5 A1
 * extraction (orchestrator.ts split into collaborators). There was no prior direct coverage of this
 * method — every existing test exercises the reflector or the graph in isolation — so these pin the
 * behaviour the extraction must reproduce exactly: the L0-L3 containment skeleton it builds before any
 * file is parsed, the taxonomy legend, cross-file/BIND/self/boundary edge shapes it derives from a
 * reflected import, the ignore-manager filter, and `resonate()`'s delegation to graph + aligner.
 *
 * Workers are forced off (CONDUCKS_WORKERS=0) so induction runs the deterministic main-thread fallback
 * path instead of spawning real node subprocesses — faster and avoids flakiness in CI.
 */
describe('AnalyzeOrchestrator.analyze — characterization', () => {
  const ROOT = '/repo';
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

  const files = () => [
    { path: `${ROOT}/src/a.ts`, source: `import { B } from './sub/b.js';\nexport function useA() { return B; }\n` },
    { path: `${ROOT}/src/sub/b.ts`, source: `export const B = 1;\n` },
    { path: `${ROOT}/src/ext.ts`, source: `import fs from 'node:fs';\nexport function useFs() { return fs; }\n` },
    // Deliberately extensionless: isSelfImportSpecifier() strips the extension off `filePath` but
    // NOT off `specifier` (orchestrator.ts:27-36), so a `.js`-suffixed self-import (the normal ESM
    // shape) never compares equal and the self-import guard silently fails to fire. Only an
    // extensionless specifier — as used here — hits the branch. Reported as a latent bug, not fixed.
    { path: `${ROOT}/src/self.ts`, source: `import { X } from './self';\n` },
  ];

  it('builds the L0-L3 containment skeleton (ecosystem, repository, directory, unit) before parsing', async () => {
    const graph = new ConducksGraph();
    const orchestrator = new AnalyzeOrchestrator(makeRegistry(), graph);

    const result = await orchestrator.analyze(files(), { workspaceRoot: ROOT });

    const g = graph.getGraph();
    expect(g.getNode('ecosystem::global')).toBeDefined();
    const repo = g.getNode('repository::repo');
    expect(repo).toBeDefined();
    // Ranks are asserted THROUGH the table, not as literals. This test used to pin DIRECTORY at 2
    // and that number was wrong — the ladder grew to thirteen rungs and the skeleton builder was
    // never updated, so the characterization was faithfully locking in the defect (ADR 0099).
    expect(repo!.properties.canonicalRank).toBe(CanonicalRank[CanonicalKind.REPOSITORY]);
    expect(repo!.properties.canonicalKind).toBe('REPOSITORY');

    const dir = g.getNode(`directory::${ROOT}/src`);
    expect(dir).toBeDefined();
    expect(dir!.properties.canonicalRank).toBe(CanonicalRank[CanonicalKind.DIRECTORY]);
    // Kind as well as rank: rank alone passed while the kind was mutated to NAMESPACE, so a skeleton
    // level could change what it IS and the characterization would not notice.
    expect(dir!.properties.canonicalKind).toBe('DIRECTORY');

    // The Phase-1 skeleton node placed here first (UNIT's rank, parentId = the directory) is
    // superseded by ConducksGraph.ingestSpectrum's own per-file "module" node once induction reflects
    // a.ts — same id, different rank/parentId. That overwrite happens in graph-engine.ts, outside this
    // module's boundary, so this pins the net observable result rather than the intermediate state.
    const unitA = g.getNode(`${ROOT}/src/a.ts::unit`);
    expect(unitA).toBeDefined();
    expect(unitA!.properties.canonicalKind).toBe('UNIT');
    expect(unitA!.properties.filePath).toBe(`${ROOT}/src/a.ts`);

    // Taxonomy legend: one layer per declared kind, anchored under ecosystem::legend. The list was
    // a hand-written nine and the enum had thirteen, so the graph shipped a legend that described a
    // different taxonomy than the one it used. Derived from the enum now, and asserted from it here
    // for the same reason (ADR 0099).
    expect(g.getNode('ecosystem::legend')).toBeDefined();
    for (const kind of Object.values(CanonicalKind) as CanonicalKind[]) {
      expect(g.getNode(`taxonomy::l${CanonicalRank[kind]}`)).toBeDefined();
    }

    // No persistence configured: node/edge counts reported are the flush totals (0), not the
    // in-memory graph size — this is existing behaviour, not something the extraction may change.
    expect(result.nodeCount).toBe(0);
    expect(result.edgeCount).toBe(0);
    expect(result.pulseId).toMatch(/^pulse_\d+_[a-z0-9]+$/);
  });

  it('resolves a same-family cross-file import into a NEURAL:: edge and a per-binding BIND:: edge', async () => {
    const graph = new ConducksGraph();
    const orchestrator = new AnalyzeOrchestrator(makeRegistry(), graph);
    await orchestrator.analyze(files(), { workspaceRoot: ROOT });

    const g = graph.getGraph();
    const unitA = `${ROOT}/src/a.ts::unit`;
    const unitB = `${ROOT}/src/sub/b.ts::unit`;

    const neural = g.getAllEdges().find(e => e.type === 'IMPORTS' && e.sourceId === unitA && e.targetId === unitB);
    expect(neural).toBeDefined();
    expect(neural!.properties.specifier).toBe('./sub/b.js');
    expect(neural!.properties.origin).toBe('internal');

    const bind = g.getAllEdges().find(e => e.type === 'IMPORTS' && e.sourceId === unitA && e.properties.bindingName === 'b');
    expect(bind).toBeDefined();
    expect(bind!.targetId).toBe(`${ROOT}/src/sub/b.ts::b`);
  });

  it('emits a durable ECOSYSTEM boundary node + DEPENDS_ON edge for an external (stdlib) import', async () => {
    const graph = new ConducksGraph();
    const orchestrator = new AnalyzeOrchestrator(makeRegistry(), graph);
    await orchestrator.analyze(files(), { workspaceRoot: ROOT });

    const g = graph.getGraph();
    // The boundary node itself is created isShallow:true, so ConducksAdjacencyList.addNode's
    // skeleton whitelist (adjacency-list.ts:127-165) both excludes `origin`/`package`/`isBoundary`
    // from the retained skeleton AND skips VMC "meat" compression for shallow nodes — those three
    // properties are silently dropped and never readable back off the node. Only the edge below
    // reliably carries origin/package. Reported as a latent bug, not fixed.
    const boundary = g.getNode('ecosystem::fs');
    expect(boundary).toBeDefined();
    expect(boundary!.properties.canonicalKind).toBe('ECOSYSTEM');

    const dep = g.getAllEdges().find(e => e.type === 'DEPENDS_ON' && e.sourceId === `${ROOT}/src/ext.ts::unit`);
    expect(dep).toBeDefined();
    expect(dep!.targetId).toBe('ecosystem::fs');
    expect(dep!.properties.origin).toBe('stdlib');
  });

  it('emits a SELF:: edge for a self-import specifier instead of a normal cross-file link', async () => {
    const graph = new ConducksGraph();
    const orchestrator = new AnalyzeOrchestrator(makeRegistry(), graph);
    await orchestrator.analyze(files(), { workspaceRoot: ROOT });

    const g = graph.getGraph();
    const unitSelf = `${ROOT}/src/self.ts::unit`;
    const selfEdge = g.getAllEdges().find(e => e.sourceId === unitSelf && e.properties.selfImport === true);
    expect(selfEdge).toBeDefined();
    expect(selfEdge!.targetId).toBe(unitSelf);
    expect(selfEdge!.type).toBe('IMPORTS');

    // The self-import guard only short-circuits the FILE-LEVEL (isRaw) relationship — no plain
    // NEURAL:: cross-file edge is emitted for it. The separate PER-BINDING (isRawBinding)
    // relationship for the same specifier is not guarded and still resolves normally, landing on
    // the file's own symbol node (self.ts::x) — a second, independent characterization, not a bug
    // this task is scoped to touch.
    const fileLevelCrossFile = g.getAllEdges().find(
      e => e.sourceId === unitSelf && e.type === 'IMPORTS' && !e.properties.selfImport && !e.properties.bindingName
    );
    expect(fileLevelCrossFile).toBeUndefined();
  });

  it('excludes ignored files from the unit skeleton entirely', async () => {
    const graph = new ConducksGraph();
    const ignoreManager = { isIgnored: (p: string) => p.endsWith('ext.ts') } as unknown as IgnoreManager;
    const orchestrator = new AnalyzeOrchestrator(makeRegistry(), graph, undefined, undefined, undefined, ignoreManager);
    await orchestrator.analyze(files(), { workspaceRoot: ROOT });

    const g = graph.getGraph();
    expect(g.getNode(`${ROOT}/src/ext.ts::unit`)).toBeUndefined();
    expect(g.getNode(`${ROOT}/src/a.ts::unit`)).toBeDefined();
  });

  it('setPersistence swaps the persistence handle used by the next analyze()', () => {
    const graph = new ConducksGraph();
    const orchestrator = new AnalyzeOrchestrator(makeRegistry(), graph);
    const fakePersistence = { swapped: true } as any;
    orchestrator.setPersistence(fakePersistence);
    expect((orchestrator as any).persistence).toBe(fakePersistence);
  });

  it('resonate() delegates to graph.resonate() and, when configured, the aligner', () => {
    let resonateCalled = false;
    let alignCalledWith: unknown = null;
    const fakeGraph = {
      resonate: () => { resonateCalled = true; },
      getGraph: () => 'the-adjacency-list',
    } as unknown as ConducksGraph;
    const fakeAligner = { align: (g: unknown) => { alignCalledWith = g; } } as any;

    const orchestrator = new AnalyzeOrchestrator(makeRegistry(), fakeGraph, fakeAligner);
    orchestrator.resonate();

    expect(resonateCalled).toBe(true);
    expect(alignCalledWith).toBe('the-adjacency-list');
  });

  it('resonate() is a no-op on the aligner when none is configured', () => {
    let resonateCalled = false;
    const fakeGraph = { resonate: () => { resonateCalled = true; }, getGraph: () => ({}) } as unknown as ConducksGraph;
    const orchestrator = new AnalyzeOrchestrator(makeRegistry(), fakeGraph);
    expect(() => orchestrator.resonate()).not.toThrow();
    expect(resonateCalled).toBe(true);
  });
});
