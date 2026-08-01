import { describe, it, expect } from '@jest/globals';
import { nextRoutePath, nextRouteMethods, nextRoutes } from '@/lib/core/parsing/next-routes.js';

/**
 * Next.js app-router routes (todo29#P5).
 *
 * Every existing route pattern matches the EXPRESS shape — a call expression naming its own path.
 * Next.js declares a route by FILE POSITION, so no query can capture it. Measured on mentorseed:
 * 118 route files, ZERO route nodes — conducks saw who CALLED an endpoint and not who SERVED it,
 * on the most common React stack.
 */
describe('deriving a route path from a Next.js file position', () => {
  it('derives the URL from the directories between app/ and route.ts', () => {
    expect(nextRoutePath('app/src/app/api/onboarding/step/route.ts')).toBe('/api/onboarding/step');
  });

  /** A dynamic segment is written the way every other route in the graph writes a parameter. */
  it('turns [id] into :id', () => {
    expect(nextRoutePath('admin/src/app/api/plans/[id]/route.ts')).toBe('/api/plans/:id');
  });

  it('turns a catch-all [...slug] into :slug*', () => {
    expect(nextRoutePath('src/app/docs/[...slug]/route.ts')).toBe('/docs/:slug*');
  });

  /**
   * A route GROUP organises files and contributes nothing to the URL. Leaving it in produces a path
   * that never matches a real request — worse than no route, because it looks resolved.
   */
  it('removes route groups entirely', () => {
    expect(nextRoutePath('src/app/(marketing)/api/health/route.ts')).toBe('/api/health');
    expect(nextRoutePath('src/app/(admin)/(internal)/api/x/route.ts')).toBe('/api/x');
  });

  it('handles a route at the app root', () => {
    expect(nextRoutePath('src/app/route.ts')).toBe('/');
  });

  /**
   * A repository with SEVERAL apps — mentorseed has `app/src/app/...` and `admin/src/app/...` —
   * must resolve each against its own root, which is why the scan starts at the LAST `app/`.
   */
  it('anchors at the last app/ segment in a multi-app repository', () => {
    expect(nextRoutePath('admin/src/app/api/users/route.ts')).toBe('/api/users');
    expect(nextRoutePath('app/src/app/api/users/route.ts')).toBe('/api/users');
  });

  it('accepts .tsx and .js route files', () => {
    expect(nextRoutePath('src/app/api/a/route.tsx')).toBe('/api/a');
    expect(nextRoutePath('src/app/api/b/route.js')).toBe('/api/b');
  });

  it('is not a route file when the basename is something else', () => {
    expect(nextRoutePath('src/app/api/users/page.tsx')).toBeNull();
    expect(nextRoutePath('src/app/api/users/layout.tsx')).toBeNull();
    expect(nextRoutePath('src/lib/route.ts')).toBeNull();     // `route.ts` outside any app/
  });

  it('handles windows separators', () => {
    expect(nextRoutePath('src\\app\\api\\users\\route.ts')).toBe('/api/users');
  });
});

describe('which methods a route file serves', () => {
  it('reads them from the exported names', () => {
    expect(nextRouteMethods(['GET', 'POST', 'runtime']).sort()).toEqual(['GET', 'POST']);
  });

  /**
   * Case-sensitive on purpose. Next.js only treats an UPPERCASE export as a handler, so accepting
   * `get` would invent an endpoint for any file exporting a helper by that name.
   */
  it('ignores a lowercase export of the same name', () => {
    expect(nextRouteMethods(['get', 'post'])).toEqual([]);
  });

  it('ignores non-HTTP exports', () => {
    expect(nextRouteMethods(['dynamic', 'revalidate', 'metadata'])).toEqual([]);
  });
});

describe('the pairs a file serves', () => {
  it('emits one per exported method', () => {
    expect(nextRoutes('src/app/api/plans/[id]/route.ts', ['GET', 'DELETE', 'dynamic']))
      .toEqual([
        { method: 'GET', path: '/api/plans/:id' },
        { method: 'DELETE', path: '/api/plans/:id' },
      ]);
  });

  it('emits nothing for a route file that exports no handler', () => {
    expect(nextRoutes('src/app/api/x/route.ts', ['helper'])).toEqual([]);
  });

  it('emits nothing for a non-route file, whatever it exports', () => {
    expect(nextRoutes('src/lib/util.ts', ['GET', 'POST'])).toEqual([]);
  });
});
