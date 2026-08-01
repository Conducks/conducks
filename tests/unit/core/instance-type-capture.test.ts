import { describe, it, expect, beforeAll } from '@jest/globals';
import { ConducksReflector } from '@/lib/domain/analysis/reflector.js';
import { AnalyzeContext } from '@/lib/core/parsing/context.js';
import { TypeScriptProvider } from '@/lib/core/parsing/languages/typescript/index.js';
import { grammars } from '@/lib/core/parsing/grammar-registry.js';

/**
 * todo29#P3b — the declaration half of typed-receiver resolution.
 *
 * `const registry = new ServiceRegistry()` states the variable's type on its own line. The reflector
 * records it as `instanceOf`, and IntraLinker uses it to bind `registry.get(...)` to
 * `ServiceRegistry.get` (see linker-typed-receiver.test.ts for that half). Measured on mentorseed:
 * 218 dangling edges resolved, 695 -> 477.
 *
 * A query that COMPILES and matches NOTHING is the failure ADR 0071 records, and it is invisible
 * without a canary — the graph simply stays the same size. These pin each accepted form, and the
 * REFUSED one below is the more important half: a factory call states no type, so recording one
 * would be a guess (ADR 0070), which is why mentorseed's `db.query` family stays dangling.
 */
describe('a variable declared with new records its type', () => {
  const reflector = new ConducksReflector();
  const provider = new TypeScriptProvider();

  const instanceOf = async (source: string, name: string) => {
    const context = new AnalyzeContext();
    const file = { path: '/repo/a.ts', source };
    const spectrum: any = await reflector.reflect(file, provider as any, context, [file.path]);
    const node = spectrum.nodes.find((n: any) => String(n.name).toLowerCase() === name);
    return node?.metadata?.instanceOf;
  };

  beforeAll(async () => {
    await grammars.loadLanguage('typescript');
  });

  it('records the class from a direct new', async () => {
    expect(await instanceOf('const registry = new ServiceRegistry();', 'registry')).toBe('serviceregistry');
  });

  /**
   * The mentorseed shape verbatim — a global-cache fallback, which is how a Next.js codebase keeps
   * one instance across hot reloads. The type is on the RIGHT of the `??`, so the direct pattern
   * alone missed all 192 call sites.
   */
  it('records the class from a ?? fallback', async () => {
    expect(await instanceOf('const registry = globalForRegistry.registry ?? new ServiceRegistry();', 'registry'))
      .toBe('serviceregistry');
  });

  it('records the class name from a namespaced constructor', async () => {
    expect(await instanceOf('const c = new Core.ServiceRegistry();', 'c')).toBe('serviceregistry');
  });

  /**
   * THE REFUSAL. `getInstance()` returns something the declaration does not name — assuming it
   * returns a `CoreDatabaseManager` is a guess, and a wrong one whenever a factory returns a
   * subclass or an interface. 281 of mentorseed's remaining dangling edges are this shape, and they
   * stay dangling until conducks has a real type checker. If this test ever fails, someone has
   * taught the reflector to guess.
   */
  it('records NOTHING for a factory call', async () => {
    expect(await instanceOf('const db = CoreDatabaseManager.getInstance();', 'db')).toBeUndefined();
  });

  it('records nothing for a plain value', async () => {
    expect(await instanceOf('const n = 42;', 'n')).toBeUndefined();
  });
});
