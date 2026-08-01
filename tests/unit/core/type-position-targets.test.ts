import { describe, it, expect, beforeAll } from '@jest/globals';
import { ConducksReflector } from '@/lib/core/parsing/reflector.js';
import { AnalyzeContext } from '@/lib/core/parsing/context.js';
import { TypeScriptProvider } from '@/lib/core/parsing/languages/typescript/index.js';
import { grammars } from '@/lib/core/parsing/grammar-registry.js';

/**
 * todo14 — the four type positions the original captures missed: `Foo[]`, `x as Foo`, `n is Foo`,
 * `Foo | null`. Each pattern captures only its DIRECT type_identifier children; nesting is covered
 * by the sibling patterns. These canaries pin that each position yields a TYPE_REFERENCE, so the
 * next grammar bump (or an over-eager pattern cleanup) fails loudly instead of silently returning
 * STALE_IMPORT to its 36-false-positive era.
 *
 * Runs in-process like type-only-imports.test.ts — safe because jest recycles the worker per file
 * (workerIdleMemoryLimit; see memory.md on the one-wrapper-per-process constraint).
 */
describe('Type-position captures (todo14)', () => {
  const reflector = new ConducksReflector();
  const provider = new TypeScriptProvider();

  const reflect = async (source: string) => {
    const context = new AnalyzeContext();
    const file = { path: '/repo/a.ts', source };
    return reflector.reflect(file, provider as any, context, [file.path, '/repo/b.ts']);
  };

  const typeRefs = (spectrum: any) =>
    spectrum.relationships
      .filter((r: any) => r.type === 'TYPE_REFERENCE')
      .map((r: any) => r.metadata?.original ?? r.targetName);

  beforeAll(async () => {
    await grammars.loadLanguage('typescript');
  });

  it('array type position: Foo[]', async () => {
    const s = await reflect(`import { Foo } from './b.js';\nexport const xs: Foo[] = [];`);
    expect(typeRefs(s)).toContain('Foo');
  });

  it('as-expression position: x as Foo', async () => {
    const s = await reflect(`import { Foo } from './b.js';\nexport const y = (globalThis as unknown) as Foo;`);
    expect(typeRefs(s)).toContain('Foo');
  });

  it('type-predicate position: n is Foo', async () => {
    const s = await reflect(`import { Foo } from './b.js';\nexport function isFoo(n: unknown): n is Foo { return true; }`);
    expect(typeRefs(s)).toContain('Foo');
  });

  it('union position: Foo | null', async () => {
    const s = await reflect(`import { Foo } from './b.js';\nexport let z: Foo | null = null;`);
    expect(typeRefs(s)).toContain('Foo');
  });

  it('nested: Bar[] inside a union still resolves via the array pattern', async () => {
    const s = await reflect(`import { Bar } from './b.js';\nexport let w: Bar[] | null = null;`);
    expect(typeRefs(s)).toContain('Bar');
  });

  it('a type used ONLY in these positions classifies its import as type-only', async () => {
    const s = await reflect(`import { Foo } from './b.js';\nexport const xs: Foo[] = [];`);
    const b = s.relationships.find(
      (r: any) => r.type === 'IMPORTS' && r.metadata?.isRawBinding && r.metadata.bindingNameRaw === 'Foo'
    );
    expect(b?.metadata?.isTypeOnly).toBe(true);
  });
});
