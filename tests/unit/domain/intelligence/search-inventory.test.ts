import { describe, it, expect, beforeEach } from '@jest/globals';
import { ConducksSearch } from '@/lib/domain/intelligence/search-engine.js';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';

/**
 * `conducks query "*"` is documented in features.md as Symbol Listing — "the heaviest things here",
 * for reading a codebase top-down. It returned "No symbols found" on every project, because `*` was
 * scored as a literal token and no symbol is named `*`.
 *
 * Node ids are built the way the pulse builds them (CONDUCKS-28): a bare name as an id is the fixture
 * shape that makes a broken lookup look correct.
 */
describe('search — the "*" inventory', () => {
  let graph: ConducksAdjacencyList;
  let search: ConducksSearch;

  const addNode = (id: string, name: string, canonicalKind: string, rank = 0) => {
    graph.addNode({ id, label: canonicalKind.toLowerCase(), properties: { name, canonicalKind, rank, filePath: '/repo/src/a.ts' } } as never);
  };

  beforeEach(() => {
    graph = new ConducksAdjacencyList();
    search = new ConducksSearch(graph);
    addNode('repository::repo', 'repo', 'REPOSITORY', 0.9);
    addNode('directory::/repo/src', 'src', 'DIRECTORY', 0.8);
    addNode('/repo/src/a.ts::unit', 'a.ts', 'UNIT', 0.3);
    addNode('/repo/src/a.ts::heavy', 'heavyFn', 'BEHAVIOR', 0.7);
    addNode('/repo/src/a.ts::light', 'lightFn', 'BEHAVIOR', 0.1);
    addNode('/repo/src/a.ts::widget', 'Widget', 'STRUCTURE', 0.5);
  });

  it('returns symbols instead of nothing', () => {
    const results = search.search('*');
    expect(results.length).toBeGreaterThan(0);
  });

  it('orders by structural gravity, heaviest first', () => {
    const names = search.search('*').map(n => n.properties.name);
    expect(names).toEqual(['heavyFn', 'Widget', 'a.ts', 'lightFn']);
  });

  it('excludes containers — an inventory of directories is not what was asked for', () => {
    const kinds = search.search('*').map(n => n.properties.canonicalKind);
    expect(kinds).not.toContain('REPOSITORY');
    expect(kinds).not.toContain('DIRECTORY');
  });

  it('honours the limit', () => {
    expect(search.search('*', 2).map(n => n.properties.name)).toEqual(['heavyFn', 'Widget']);
  });

  it('treats an empty query the same way, rather than matching everything by accident', () => {
    expect(search.search('   ').map(n => n.properties.name)).toEqual(search.search('*').map(n => n.properties.name));
  });

  it('still searches by name for a real query', () => {
    const names = search.search('heavyFn').map(n => n.properties.name);
    expect(names).toContain('heavyFn');
    expect(names).not.toContain('lightFn');
  });

  it('falls back to name order when nothing has been ranked yet', () => {
    const fresh = new ConducksAdjacencyList();
    const s = new ConducksSearch(fresh);
    for (const [id, name] of [['/r/a.ts::c', 'charlie'], ['/r/a.ts::a', 'alpha'], ['/r/a.ts::b', 'bravo']]) {
      fresh.addNode({ id, label: 'behavior', properties: { name, canonicalKind: 'BEHAVIOR', rank: 0 } } as never);
    }
    // rank is 0 for everything until `resonate` runs — the order must still be stable and readable.
    expect(s.search('*').map(n => n.properties.name)).toEqual(['alpha', 'bravo', 'charlie']);
  });
});
