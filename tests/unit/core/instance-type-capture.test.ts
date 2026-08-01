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
   * A factory does not state its type HERE, so nothing is recorded here — but the type is not
   * unknowable, which is what ADR 0082 got wrong. It is written on the CALLEE
   * (`getInstance(): CoreDatabaseManager`), so the call is recorded instead and IntraLinker reads
   * the declared return type once the whole graph exists (ADR 0084). Still never a guess: the value
   * is a `new` on the declaration, an annotation on the callee, or nothing.
   */
  it('records NOTHING as a type for a factory call — it records the CALL instead', async () => {
    expect(await instanceOf('const db = CoreDatabaseManager.getInstance();', 'db')).toBeUndefined();
  });

  it('records nothing for a plain value', async () => {
    expect(await instanceOf('const n = 42;', 'n')).toBeUndefined();
  });
});

/**
 * The DECLARED return type, which was the literal `'void'` for every function in every language
 * until 2026-08-01 — 4,267 nodes on the mentorseed vault all claiming void, none measured, and
 * `conducks query` reporting it to users as a fact (ADR 0084).
 */
describe('a function records the return type it declares', () => {
  const reflector = new ConducksReflector();
  const provider = new TypeScriptProvider();

  const returnsOf = async (source: string, name: string) => {
    const context = new AnalyzeContext();
    const file = { path: '/repo/a.ts', source };
    const spectrum: any = await reflector.reflect(file, provider as any, context, [file.path]);
    const node = spectrum.nodes.find((n: any) => String(n.name).toLowerCase() === name);
    return node?.dna?.returns ?? node?.metadata?.dna?.returns;
  };

  beforeAll(async () => {
    await grammars.loadLanguage('typescript');
  });

  it('reads a function declaration return type', async () => {
    expect(await returnsOf('export function f(): Foo { return x; }', 'f')).toBe('Foo');
  });

  it('reads a method return type — the factory case', async () => {
    expect(await returnsOf('class A { static getInstance(): CoreDatabaseManager { return x; } }', 'getinstance'))
      .toBe('CoreDatabaseManager');
  });

  it('keeps a generic verbatim rather than truncating it to a wrong type', async () => {
    expect(await returnsOf('function f(): Promise<Foo> { }', 'f')).toBe('Promise<Foo>');
  });

  /** `null`, not `'void'`. An absent annotation is not a claim that the function returns nothing. */
  it('records null when no return type is declared', async () => {
    expect(await returnsOf('function f() { }', 'f')).toBeNull();
  });

  it('records void only when void is what the source says', async () => {
    expect(await returnsOf('function f(): void { }', 'f')).toBe('void');
  });

  it('records the factory call on the variable it produced', async () => {
    const context = new AnalyzeContext();
    const file = { path: '/repo/a.ts', source: 'const db = CoreDatabaseManager.getInstance();' };
    const spectrum: any = await reflector.reflect(file, provider as any, context, [file.path]);
    const node = spectrum.nodes.find((n: any) => String(n.name).toLowerCase() === 'db');
    expect(node?.metadata?.instanceOfCall).toBe('coredatabasemanager.getinstance');
  });
});
