import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ImportProcessor } from "@/lib/core/parsing/index.js";
import { AnalyzeOrchestrator } from '@/lib/domain/analysis/orchestrator.js';
import { ConducksGraph } from "@/lib/core/graph/index.js";
import { SynapseRegistry } from "@/lib/core/registry/index.js";
import { TypeScriptProvider } from "@/lib/core/parsing/index.js";
import { grammars } from "@/lib/core/parsing/index.js";
import { ConducksComponent } from "@/contracts/index.js";

/**
 * ADR 0070 — an unresolvable `@/` alias must refuse, not guess by basename.
 *
 * Measured on a real foreign repository (subject-b/app, 474 units): `import { registry } from
 * '@/core/registry/Registry'` has no in-scope target — `@/core` maps (per that repo's tsconfig) to
 * a sibling PACKAGE outside the analyzed tree. `ImportProcessor.resolve()`'s alias branch (3b)
 * correctly found no suffix match, but fell through to the generic fuzzy fallback (step 4), which
 * basename-prefix-matched the alias's last segment "Registry" against an unrelated in-scope file,
 * `Registry.test.ts`, purely because its basename happens to start with the same word. Every one of
 * 106 importers of that alias then bound onto that one wrong file — a fabricated target, exactly
 * what ADR 0055 ("a node is a symbol, not a fragment of source") rules out, just reached through a
 * code path that ADR never covered: import resolution, not induction.
 *
 * These tests pin both halves: the unresolvable alias now refuses (no edge, not a wrong one), and a
 * genuinely in-scope alias still resolves — the fallback exists for real reasons and this fix must
 * not disable it.
 */
describe('ImportProcessor — an unresolvable alias refuses instead of guessing', () => {
  const proc = new ImportProcessor();
  const resolve = (spec: string, all: string[]) =>
    (proc as any).resolve(spec, '/proj/src/caller.ts', all);
  const link = (spec: string, all: string[]) =>
    (proc as any).link(spec, '/proj/src/caller.ts', all);

  it('refuses an alias whose suffix does not exist in scope, even when a coincidental basename match exists', () => {
    // Mirrors the subject-b case exactly: '@/core/registry/Registry' has no file under a `core/`
    // tree in scope, but 'Registry.test.ts' is present and its basename starts with 'Registry' — the
    // old fuzzy fallback (step 4) would prefix-match onto it.
    const all = ['/proj/src/caller.ts', '/proj/src/tests/Registry.test.ts'];
    expect(resolve('@/core/registry/Registry', all)).toBeUndefined();
    expect(link('@/core/registry/Registry', all)).toBeUndefined();
  });

  it('refuses an alias with no candidate at all in scope', () => {
    const all = ['/proj/src/caller.ts', '/proj/src/unrelated.ts'];
    expect(resolve('@/product/billing/Invoice', all)).toBeUndefined();
  });

  it('still resolves an alias whose suffix genuinely exists in scope', () => {
    const all = ['/proj/src/caller.ts', '/proj/src/components/Bar.ts'];
    expect(resolve('@/components/Bar', all)).toBe('/proj/src/components/Bar.ts');
    expect(link('@/components/Bar', all)).toEqual({
      targetId: '/proj/src/components/bar.ts',
      type: 'IMPORTS',
    });
  });

  it('a bare (non-alias) specifier still uses the fuzzy fallback unchanged', () => {
    // The fix scopes the refusal to the `@/`/`~/` branch only — the fuzzy fallback (step 4) still
    // does its job for the callers it was written for (see import-ambiguity.test.ts).
    const all = ['/proj/src/util/helper.ts', '/proj/src/caller.ts'];
    expect(resolve('helper', all)).toBe('/proj/src/util/helper.ts');
  });
});

/**
 * End-to-end through ReflectionPipeline via AnalyzeOrchestrator (in-memory graph, no persistence —
 * same harness as orchestrator.test.ts). Proves the fix at the edge level, not just resolve().
 */
describe('ReflectionPipeline — per-binding IMPORTS edges, before/after the alias fix', () => {
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
    // The subject-b shape: an alias whose root maps outside this analysis's scope, plus an
    // unrelated file present in-scope that coincidentally shares a basename prefix with the alias's
    // last segment.
    {
      path: `${ROOT}/src/consumer.ts`,
      source: `import { registry } from '@/core/registry/Registry';\nexport function useRegistry() { return registry; }\n`,
    },
    { path: `${ROOT}/src/tests/Registry.test.ts`, source: `export const dummy = 1;\n` },
    // A genuinely in-scope alias, same shape, that must keep resolving.
    {
      path: `${ROOT}/src/components/foo.ts`,
      source: `import { bar } from '@/components/bar';\nexport function useFoo() { return bar; }\n`,
    },
    { path: `${ROOT}/src/components/bar.ts`, source: `export const bar = 1;\n` },
  ];

  it('produces no edge at all for the unresolvable alias — not a wrong one', async () => {
    const graph = new ConducksGraph();
    const orchestrator = new AnalyzeOrchestrator(makeRegistry(), graph);
    await orchestrator.analyze(files(), { workspaceRoot: ROOT });

    const g = graph.getGraph();
    const unitConsumer = `${ROOT}/src/consumer.ts::unit`;

    // No per-binding BIND:: edge for `registry` at all.
    const bind = g.getAllEdges().find(
      e => e.type === 'IMPORTS' && e.sourceId === unitConsumer && e.properties.bindingName === 'registry'
    );
    expect(bind).toBeUndefined();

    // No file-level NEURAL:: cross-file edge either.
    const neural = g.getAllEdges().find(
      e => e.type === 'IMPORTS' && e.sourceId === unitConsumer && !e.properties.bindingName
    );
    expect(neural).toBeUndefined();

    // And critically: nothing points at the coincidental decoy file's fabricated symbol.
    const phantom = g.getAllEdges().find(e => e.targetId === `${ROOT}/src/tests/Registry.test.ts::registry`);
    expect(phantom).toBeUndefined();
  });

  it('still produces both edges for a genuinely in-scope alias — the fix does not over-correct', async () => {
    const graph = new ConducksGraph();
    const orchestrator = new AnalyzeOrchestrator(makeRegistry(), graph);
    await orchestrator.analyze(files(), { workspaceRoot: ROOT });

    const g = graph.getGraph();
    const unitFoo = `${ROOT}/src/components/foo.ts::unit`;
    const unitBar = `${ROOT}/src/components/bar.ts::unit`;

    const neural = g.getAllEdges().find(e => e.type === 'IMPORTS' && e.sourceId === unitFoo && e.targetId === unitBar);
    expect(neural).toBeDefined();
    expect(neural!.properties.specifier).toBe('@/components/bar');

    const bind = g.getAllEdges().find(
      e => e.type === 'IMPORTS' && e.sourceId === unitFoo && e.properties.bindingName === 'bar'
    );
    expect(bind).toBeDefined();
    expect(bind!.targetId).toBe(`${ROOT}/src/components/bar.ts::bar`);
  });

  it('the fixture as a whole: exactly one BIND:: edge total — the genuine one, none for the phantom', async () => {
    const graph = new ConducksGraph();
    const orchestrator = new AnalyzeOrchestrator(makeRegistry(), graph);
    await orchestrator.analyze(files(), { workspaceRoot: ROOT });

    const g = graph.getGraph();
    const allBindEdges = g.getAllEdges().filter(e => e.type === 'IMPORTS' && e.properties.bindingName);
    expect(allBindEdges.length).toBe(1);
    expect(allBindEdges[0].properties.bindingName).toBe('bar');
  });
});
