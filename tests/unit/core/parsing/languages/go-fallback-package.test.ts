import { describe, it, expect } from '@jest/globals';
import { GoResolver } from '@/lib/core/parsing/languages/go/resolver.js';

/**
 * Without a go.mod, an import is looked for by walking up from the importer (state-machine audit
 * P-04-6). That walk matched by PATH PREFIX on one side lower-cased and the other not, and took the
 * first hit of an unsorted list: `internal/store` answered with `internal/storefront/x.go`, which
 * file won depended on list order, and on a path with an upper-case letter nothing matched at all.
 * The go.mod path already used `packageFile` — the exact directory, sorted, case-insensitive. The
 * fallback now does the same.
 */
describe('Go resolution without a go.mod', () => {
  const r = new GoResolver();
  const from = '/r/cmd/main.go';

  it('names the package directory exactly, not a directory that merely starts with its name', () => {
    const files = ['/r/internal/storefront/x.go', '/r/internal/store/b.go', '/r/internal/store/a.go', from];
    expect(r.resolve('internal/store', from, files)).toBe('/r/internal/store/a.go');
    expect(r.resolve('internal/store', from, ['/r/internal/storefront/x.go', from])).toBeUndefined();
  });

  it('matches a real path with upper-case letters', () => {
    const files = ['/Users/Said/r/internal/store/a.go', '/Users/Said/r/cmd/main.go'];
    expect(r.resolve('internal/store', '/Users/Said/r/cmd/main.go', files)).toBe('/Users/Said/r/internal/store/a.go');
  });
});
