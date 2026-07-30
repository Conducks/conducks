import { describe, it, expect } from '@jest/globals';
import { ImportProcessor } from '@/lib/core/parsing/processors/import.js';

/**
 * ADR 0046 — the fuzzy import fallback refuses when it cannot tell.
 *
 * The fallback used to return the first path in `allPaths` order whose basename matched. That order
 * is arbitrary, and ambiguity is not rare: in this repository 15 basenames are duplicated, with
 * `index.ts` occurring 24 times, `queries.ts` 13 and `resolver.ts` 11. Resolving an unresolved
 * `index` import that way is right about one time in twenty-four, and the edge it writes is
 * indistinguishable from a correctly resolved one — so `impact` and `trace` walk it as fact.
 *
 * Refusing costs an edge. Guessing costs a WRONG edge. These tests pin that trade: the unique case
 * must still resolve, or the fix would have been to disable the fallback rather than tighten it.
 */
describe('the fuzzy import fallback', () => {
  const proc = new ImportProcessor();
  const resolve = (spec: string, all: string[]) =>
    (proc as any).resolve(spec, '/proj/src/caller.ts', all);

  it('resolves when exactly one file has that basename', () => {
    const all = ['/proj/src/util/helper.ts', '/proj/src/caller.ts'];
    expect(resolve('helper', all)).toBe('/proj/src/util/helper.ts');
  });

  it('refuses when several files share the basename', () => {
    const all = [
      '/proj/src/a/index.ts',
      '/proj/src/b/index.ts',
      '/proj/src/c/index.ts',
    ];
    // The old code returned '/proj/src/a/index.ts' — correct one time in three here, and one time
    // in twenty-four on this repository.
    expect(resolve('index', all)).toBeUndefined();
  });

  it('refuses when several files share a prefix', () => {
    const all = ['/proj/src/queries-ts.ts', '/proj/src/queries-go.ts'];
    expect(resolve('queries', all)).toBeUndefined();
  });

  it('still resolves a unique prefix match', () => {
    const all = ['/proj/src/queries-ts.ts', '/proj/src/other.ts'];
    expect(resolve('queries', all)).toBe('/proj/src/queries-ts.ts');
  });
});
