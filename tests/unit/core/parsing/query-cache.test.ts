import { describe, it, expect, beforeAll } from '@jest/globals';
import { grammars } from '@/lib/core/parsing/grammar-registry.js';
import { TypeScriptProvider } from '@/lib/core/parsing/languages/typescript/index.js';
import { PythonProvider } from '@/lib/core/parsing/languages/python/index.js';

/**
 * ADR 0065 — `createQuery` compiles once per language, not once per file.
 *
 * `reflector.ts` calls `grammars.createQuery(lang, provider.queryScm)` once per FILE, but both
 * arguments are per-LANGUAGE constants: `lang` is the same object for a given langId for the life
 * of the process (`loadLanguage` sets it once and guards re-entry), and `queryScm` is a readonly
 * class field on the provider. Uncached, a 299-file TypeScript pulse compiled the identical query
 * 299 times. This test pins the invariant by asserting repeated calls with the same (lang, source)
 * pair return the SAME compiled Query object rather than a fresh one each time.
 */
describe('createQuery caches compiled queries per language', () => {
  beforeAll(async () => {
    await grammars.loadLanguage('typescript');
    await grammars.loadLanguage('python');
  });

  it('returns the identical Query object across repeated calls for the same language', () => {
    if (!grammars.isNativeAvailable()) return; // no C++ toolchain on this machine — Gnosis-only, nothing to cache
    const lang = grammars.getLanguage('typescript');
    if (!lang) return; // native grammar failed to induce on this machine

    const source = new TypeScriptProvider().queryScm;

    const first = grammars.createQuery(lang, source);
    const second = grammars.createQuery(lang, source);
    const third = grammars.createQuery(lang, source);

    expect(first).toBeDefined();
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it('does not share a cache entry across two different languages', () => {
    if (!grammars.isNativeAvailable()) return;
    const tsLang = grammars.getLanguage('typescript');
    const pyLang = grammars.getLanguage('python');
    if (!tsLang || !pyLang) return;

    const tsQuery = grammars.createQuery(tsLang, new TypeScriptProvider().queryScm);
    const pyQuery = grammars.createQuery(pyLang, new PythonProvider().queryScm);

    expect(tsQuery).toBeDefined();
    expect(pyQuery).toBeDefined();
    expect(tsQuery).not.toBe(pyQuery);
  });
});
