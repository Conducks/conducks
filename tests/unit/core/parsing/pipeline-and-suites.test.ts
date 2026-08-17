import { describe, it, expect } from '@jest/globals';
import { ConducksPipeline, TYPESCRIPT_SUITE, PYTHON_SUITE } from '@/lib/core/parsing/index.js';

/**
 * The three parsing door exports nothing named (ADR 0150 rules 10 and 12).
 *
 * `topologicalSort` decides the ORDER files are parsed in, which is what makes the two-pass model
 * work: discovery mints nodes, resolution binds against everything the first pass learned. An order
 * that put a dependent before its dependency would leave references unresolved and look exactly
 * like a project that genuinely has none.
 *
 * The case that matters is the CYCLE. A topological sort has no valid answer for one, and the two
 * wrong things to do are drop those files or loop forever. This one appends them as a final tier —
 * asserted below, because "the pulse silently parsed 40 fewer files" is not a failure anything else
 * would report.
 */
describe('topologicalSort orders files so a dependency is parsed first', () => {
  it('puts a dependency in an earlier tier than its dependent', () => {
    // a imports b; b imports c. c has nothing, so it goes first.
    const imports = new Map([
      ['a.ts', new Set(['b.ts'])],
      ['b.ts', new Set(['c.ts'])],
    ]);

    const tiers = ConducksPipeline.topologicalSort(imports, ['a.ts', 'b.ts', 'c.ts']);
    const tierOf = (f: string) => tiers.findIndex(t => t.includes(f));

    expect(tierOf('c.ts')).toBeLessThan(tierOf('b.ts'));
    expect(tierOf('b.ts')).toBeLessThan(tierOf('a.ts'));
  });

  it('returns EVERY file, so nothing is dropped from the pulse', () => {
    const imports = new Map([['a.ts', new Set(['b.ts'])]]);
    const all = ['a.ts', 'b.ts', 'lonely.ts'];

    const flat = ConducksPipeline.topologicalSort(imports, all).flat();

    expect(flat.sort()).toEqual([...all].sort());
  });

  it('emits an unimported file in the FIRST tier — it blocks nothing', () => {
    const tiers = ConducksPipeline.topologicalSort(new Map(), ['x.ts', 'y.ts']);
    expect(tiers[0].sort()).toEqual(['x.ts', 'y.ts']);
  });

  it('appends a CYCLE as a final tier instead of dropping it or hanging', () => {
    // a ↔ b. Neither can ever reach degree 0, so both fall out of the main loop. Dropping them
    // would silently shrink the pulse; the sort keeps them and parses them last.
    const imports = new Map([
      ['a.ts', new Set(['b.ts'])],
      ['b.ts', new Set(['a.ts'])],
    ]);

    const tiers = ConducksPipeline.topologicalSort(imports, ['a.ts', 'b.ts']);

    expect(tiers.flat().sort()).toEqual(['a.ts', 'b.ts']);
  });

  it('keeps the acyclic part ordered while a cycle sits elsewhere in the graph', () => {
    // The counter-test for the case above: "append everything left over" must not degrade into
    // "give up on ordering", which would pass the cycle case and quietly break every other file.
    const imports = new Map([
      ['app.ts', new Set(['util.ts'])],
      ['x.ts', new Set(['y.ts'])],
      ['y.ts', new Set(['x.ts'])],
    ]);

    const tiers = ConducksPipeline.topologicalSort(imports, ['app.ts', 'util.ts', 'x.ts', 'y.ts']);
    const tierOf = (f: string) => tiers.findIndex(t => t.includes(f));

    expect(tierOf('util.ts')).toBeLessThan(tierOf('app.ts'));
    expect(tiers.flat().sort()).toEqual(['app.ts', 'util.ts', 'x.ts', 'y.ts']);
  });

  it('answers with no tiers for no files, rather than one empty tier', () => {
    expect(ConducksPipeline.topologicalSort(new Map(), [])).toEqual([]);
  });
});

describe('the language suites are complete triples', () => {
  it('each carries a provider, a resolver and an extractor', () => {
    // A suite missing one member fails at the call site with a `cannot read property of undefined`
    // far from here. Two languages ship one; both are asserted so adding a third has a shape to
    // copy that is checked rather than remembered.
    for (const suite of [TYPESCRIPT_SUITE, PYTHON_SUITE]) {
      expect(suite.id).toEqual(expect.any(String));
      expect(suite.provider).toBeDefined();
      expect(suite.resolver).toBeDefined();
      expect(suite.extractor).toBeDefined();
    }
  });

  it('the two suites are distinct, and each names its own language', () => {
    expect(TYPESCRIPT_SUITE.id).not.toBe(PYTHON_SUITE.id);
    expect(TYPESCRIPT_SUITE.id).toContain('typescript');
    expect(PYTHON_SUITE.id).toContain('python');
  });
});
