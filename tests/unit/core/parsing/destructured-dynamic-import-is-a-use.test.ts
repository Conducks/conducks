import { describe, it, expect, beforeAll } from '@jest/globals';
import { ConducksReflector } from '@/lib/core/parsing/reflector.js';
import { AnalyzeContext } from '@/lib/core/parsing/context.js';
import { grammars } from '@/lib/core/parsing/grammar-registry.js';
import { TypeScriptProvider } from '@/lib/core/parsing/languages/typescript/index.js';

/**
 * `const { X } = await import('./lib.js')` — and then X is READ rather than CALLED (todo66).
 *
 * Two separate holes, both found by the same measurement and both invisible while the specifier
 * that reaches them did not resolve at all:
 *
 *   1. The un-renamed destructure emitted an ALIASES edge and registered NO local binding, while the
 *      RENAMED form (`const { a: b } = await import(…)`) did both. So a CALL through the name landed
 *      and a value READ did not — `resolveLocalBinding` returned undefined, the reference-as-value
 *      edge was emitted as a bare name, and the export it came from read as unconsumed.
 *   2. `for (const { id } of LIST as Array<T>)` hid the read behind an `as_expression`, which had a
 *      pattern for its TYPE half and none for its VALUE half.
 *
 * Measured on subject-c: of todo66's six symbols, five are CALLED and cleared as soon as the build
 * layout resolved; `TOOL_REGISTRARS` is destructured, cast, and iterated — never called — and needed
 * both fixes. That is the whole difference between the five and the one.
 *
 * The cost of getting this wrong is not a missing edge. `prune` says UNUSED_EXPORT, and a person
 * deletes an export the code reads.
 */
const reflector = new ConducksReflector();
const provider = new TypeScriptProvider();

/**
 * `/p/lib.ts` is in the file list deliberately: the binding is only registered when the specifier
 * RESOLVES to a real project file, so a fixture without the target silently exercises nothing. The
 * first version of this suite omitted it and all four cases failed against the fixed build.
 */
const ALL_FILES = ['/p/app.ts', '/p/lib.ts'];

const namesReadBy = async (source: string): Promise<string[]> => {
  const file = { path: '/p/app.ts', source };
  const spectrum: any = await reflector.reflect(file, provider as never, new AnalyzeContext(), ALL_FILES);
  return (spectrum.relationships ?? [])
    .filter((e: any) => e.metadata?.referenceAsValue)
    .map((e: any) => String(e.targetName));
};

describe('a name destructured from a dynamic import is bound, so reading it is a use', () => {
  beforeAll(async () => {
    await grammars.loadLanguage('typescript');
    // A grammar that failed to load parses nothing and every case below would fail with a message
    // that reads like a reflector bug. Said once, here.
    expect(grammars.isLanguageUnavailable('typescript')).toBe(false);
  }, 120000);

  it('qualifies a value READ with the module it came from, not a bare name', async () => {
    // The bare name is what dangled. It is free for the linker to bind to any imported unit owning
    // that name (ADR 0085), and it leaves the real export looking unconsumed.
    const targets = await namesReadBy(`
      export async function outer() {
        const { READ_ONLY } = await import('./lib.js');
        return READ_ONLY.length;
      }
    `);

    expect(targets.some(t => t.includes('::read_only') && t !== 'read_only')).toBe(true);
  });

  it('does the same for the RENAMED form, which already worked — kept so both stay symmetric', async () => {
    const targets = await namesReadBy(`
      export async function outer() {
        const { READ_ONLY: local } = await import('./lib.js');
        return local.length;
      }
    `);

    expect(targets.some(t => t.includes('::'))).toBe(true);
  });

  it('reads the identifier through a TYPE ASSERTION, where only the type half was captured', async () => {
    // `LIST as Array<T>` in a for-of: the grammar node is `as_expression`, so `for_in_statement
    // right:` never sees an identifier. `(as_expression (type_identifier) @pulse_type_target)` had
    // existed for a long time — the value half beside it simply was never written.
    const targets = await namesReadBy(`
      export async function outer() {
        const { REGISTRARS } = await import('./lib.js');
        for (const { id } of REGISTRARS as Array<{ id: string }>) { void id; }
      }
    `);

    expect(targets.some(t => t.includes('registrars'))).toBe(true);
  });

  it('reads a plain `x as T` outside any loop', async () => {
    const targets = await namesReadBy(`
      export async function outer() {
        const { VALUE } = await import('./lib.js');
        return (VALUE as { n: number }).n;
      }
    `);

    expect(targets.some(t => t.includes('value'))).toBe(true);
  });
});

describe('what stays unbound, so the fix does not invent a source', () => {
  it('a locally declared name is NOT qualified with a module', async () => {
    // The second half of the gate in the reference-as-value branch: a null binding means the symbol
    // is defined in THIS file, and a bare name is correct there because the intra-file linker binds
    // it afterwards. Qualifying it would point the edge at a module that never exported it.
    const targets = await namesReadBy(`
      const LOCAL = [1];
      export function outer() {
        return LOCAL.length;
      }
    `);

    expect(targets.filter(t => t.includes('::'))).toEqual([]);
  });
});
