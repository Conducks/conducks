import { describe, it, expect } from '@jest/globals';
import { ImportProcessor } from '@/lib/core/parsing/processors/import.js';
import { AnalyzeContext } from '@/lib/core/parsing/context.js';
import { essenceLens } from '@/lib/core/parsing/essence-lens.js';

/**
 * ADR 0077 — a declared package refuses the fallback, it does not answer in its place.
 *
 * `registerExternalPackage()` had no production caller, so `isExternalPackage()` answered `false`
 * for everything and step 2 of the resolver was dead code that looked live. A bare specifier then
 * fell through to the basename fallback, and on subject-b `next/headers` matched the project's own
 * `packages/core/security/server/headers.ts` while `vitest/config` matched its `config.ts` — six
 * IMPORTS edges pointing at project files that have nothing to do with those packages.
 *
 * A WRONG edge, not a missing one. ADR 0070 refused that trade for aliases; this is the same
 * failure one specifier-shape over.
 */
describe('a declared package never resolves by basename', () => {
  const proc = new ImportProcessor();
  const ctxWith = (...pkgs: string[]) => {
    const c = new AnalyzeContext();
    for (const p of pkgs) c.registerExternalPackage(p.toLowerCase());
    return c;
  };
  const resolve = (spec: string, all: string[], ctx?: AnalyzeContext) =>
    (proc as any).resolve(spec, '/proj/app/caller.ts', all, undefined, ctx);

  // The exact subject-b shape: the project owns a file whose basename is the package's subpath.
  const PROJECT = [
    '/proj/packages/core/security/server/headers.ts',
    '/proj/packages/core/config/server/config.ts',
    '/proj/app/caller.ts',
  ];

  it('refuses `next/headers` rather than matching the project\'s own headers.ts', () => {
    expect(resolve('next/headers', PROJECT, ctxWith('next'))).toBeUndefined();
  });

  it('refuses `vitest/config` rather than matching the project\'s own config.ts', () => {
    expect(resolve('vitest/config', PROJECT, ctxWith('vitest'))).toBeUndefined();
  });

  /**
   * The guard is what changed, not the fallback. Without a manifest saying `next` is a package,
   * there is nothing to distinguish this from a language where a bare specifier legitimately names
   * a project module — which is what step 4 exists for.
   */
  it('still reaches the fallback when NO manifest declares the package', () => {
    expect(resolve('next/headers', PROJECT, ctxWith())).toBe('/proj/packages/core/security/server/headers.ts');
  });

  /**
   * `specifier.split('/')[0]` gives `@playwright`, which is not a package, so a scoped dependency
   * could never match however the set was populated.
   */
  it('looks a scoped package up by BOTH segments', () => {
    const all = ['/proj/src/test.ts', '/proj/app/caller.ts'];
    expect(resolve('@playwright/test', all, ctxWith('@playwright/test'))).toBeUndefined();
    // and the scope alone is not the package — declaring only `@playwright` must not match
    expect(resolve('@playwright/test', all, ctxWith('@playwright'))).toBe('/proj/src/test.ts');
  });

  it('treats a deep subpath of a scoped package as that package', () => {
    const all = ['/proj/src/next.ts', '/proj/app/caller.ts'];
    expect(resolve('@vercel/analytics/next', all, ctxWith('@vercel/analytics'))).toBeUndefined();
  });

  /** A relative specifier is never a package, whatever the manifest happens to contain. */
  it('leaves relative specifiers alone', () => {
    const all = ['/proj/app/next.ts', '/proj/app/caller.ts'];
    expect(resolve('./next', all, ctxWith('next'))).toBe('/proj/app/next.ts');
  });
});

/**
 * The names have to be read BEFORE the wave that resolves imports. `refract()` reads the same
 * manifests in step 3 of the pulse, which is after, and that ordering is why the set was empty at
 * the only moment it is consulted.
 */
describe('declaredDependencies reads what the resolver needs', () => {
  it('reads dependencies, devDependencies and peerDependencies from a package.json', () => {
    const src = JSON.stringify({
      dependencies: { next: '^16.0.0', '@heroicons/react': '^2' },
      devDependencies: { '@playwright/test': '^1' },
      peerDependencies: { react: '^19' },
    });
    expect(essenceLens.declaredDependencies('/p/package.json', src).sort())
      .toEqual(['@heroicons/react', '@playwright/test', 'next', 'react']);
  });

  it('strips version specifiers and comments from a requirements.txt', () => {
    const src = '# comment\nfastapi==0.1\nrequests>=2.0\n\npydantic\n';
    expect(essenceLens.declaredDependencies('/p/requirements.txt', src)).toEqual(['fastapi', 'requests', 'pydantic']);
  });

  it('declares nothing for a malformed manifest instead of throwing', () => {
    expect(essenceLens.declaredDependencies('/p/package.json', '{not json')).toEqual([]);
  });
});
