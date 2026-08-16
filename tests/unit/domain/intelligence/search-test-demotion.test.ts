import { describe, it, expect, beforeEach } from '@jest/globals';
import { ConducksSearch } from '@/lib/domain/intelligence/search-engine.js';
import { ConducksAdjacencyList } from "@/lib/core/graph/index.js";

/**
 * todo43 — a test file matching a query is not the same claim as a source file matching it.
 *
 * Measured on this repository: `query "baseline drift coverage"` ranked `coverage-bind.test.ts` and
 * `coverage-commands.test.ts` above `coverage-baseline.ts` — the file actually asked for — because
 * on 189 suites the tests outnumber the sources and gravity follows edge count, not authority.
 *
 * Demotion, not exclusion: a query FOR a test still finds it, and a name that exists only in tests
 * still answers.
 */
describe('search demotes test files below source', () => {
  let graph: ConducksAdjacencyList;
  let search: ConducksSearch;

  const addNode = (id: string, name: string, filePath: string, rank: number) => {
    graph.addNode({ id, label: 'unit', properties: { name, canonicalKind: 'UNIT', rank, filePath } } as never);
  };

  beforeEach(() => {
    graph = new ConducksAdjacencyList();
    search = new ConducksSearch(graph);
    // The test files carry MORE gravity — the measured shape of the defect.
    addNode('/r/tests/unit/coverage-bind.test.ts::unit', 'coverage-bind.test.ts', '/r/tests/unit/coverage-bind.test.ts', 0.9);
    addNode('/r/src/lib/coverage-baseline.ts::unit', 'coverage-baseline.ts', '/r/src/lib/coverage-baseline.ts', 0.4);
  });

  it('ranks the source file above a heavier test file', () => {
    const names = search.search('coverage').map(n => n.properties.name);
    expect(names.indexOf('coverage-baseline.ts')).toBeLessThan(names.indexOf('coverage-bind.test.ts'));
  });

  it('still returns a symbol that exists only in tests', () => {
    const names = search.search('bind').map(n => n.properties.name);
    expect(names).toContain('coverage-bind.test.ts');
  });
});
