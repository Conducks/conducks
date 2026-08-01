import { describe, it, expect, beforeAll } from '@jest/globals';
import { ConducksReflector } from '@/lib/core/parsing/reflector.js';
import { AnalyzeContext } from '@/lib/core/parsing/context.js';
import { CProvider } from '@/lib/core/parsing/languages/c/index.js';
import { CPPProvider } from '@/lib/core/parsing/languages/cpp/index.js';
import { CSharpProvider } from '@/lib/core/parsing/languages/csharp/index.js';
import { JavaProvider } from '@/lib/core/parsing/languages/java/index.js';
import { grammars } from '@/lib/core/parsing/grammar-registry.js';
import type { ConducksProvider } from '@/lib/core/parsing/providers/base.js';

/**
 * `dna.params`/`dna.returns` for c, cpp, csharp, java (ADR 0086, ADR 0084). Until 2026-08-01 these
 * were `[]` and `null` for every function in these languages — fabricated, per the ADR, since nobody
 * had looked. This pins the FOUR grammar shapes measured against real tree-sitter parses (see
 * queries.ts probes and comments in each language's file for the exact node-types.json evidence).
 */
describe('c, cpp, csharp, java record the signatures they declare', () => {
  const reflector = new ConducksReflector();

  const dnaOf = async (provider: ConducksProvider, langId: string, path: string, source: string, name: string) => {
    await grammars.loadLanguage(langId);
    const context = new AnalyzeContext();
    const file = { path, source };
    const spectrum: any = await reflector.reflect(file, provider as any, context, [file.path]);
    return spectrum.nodes.find((n: any) => String(n.name).toLowerCase() === name.toLowerCase())?.dna;
  };

  beforeAll(async () => {
    await grammars.loadLanguage('c');
    await grammars.loadLanguage('cpp');
    await grammars.loadLanguage('csharp');
    await grammars.loadLanguage('java');
  });

  describe('c', () => {
    const provider = new CProvider();

    /**
     * WAS A KNOWN GAP, now FIXED by ADR 0087. The name is no longer looked up through a field chain
     * that eleven languages disagreed about; the annotation is CARVED OUT of the parameter's own
     * span instead, so whatever the grammar calls the identifier, what is left after removing the
     * type is the name. This test asserted the broken value ("int a") and now asserts the right one.
     */
    it('records typed parameters, with the type carved off the name', async () => {
      const dna = await dnaOf(provider, 'c', '/repo/a.c', 'int add(int a, int b) { return a + b; }', 'add');
      expect(dna.params).toEqual([
        { name: 'a', type: 'int', optional: false },
        { name: 'b', type: 'int', optional: false },
      ]);
    });

    /**
     * The `(void)` idiom — C's explicit way of saying "takes nothing". The grammar gives it as ONE
     * `parameter_declaration` whose whole text is the type, so it used to record a single parameter
     * named "void" for a function taking none. Carving the annotation out leaves an empty string,
     * and an empty name is not a parameter (ADR 0087).
     */
    it('records zero parameters for the (void) idiom', async () => {
      const dna = await dnaOf(provider, 'c', '/repo/a.c', 'int g(void) { return 0; }', 'g');
      expect(dna.params).toEqual([]);
    });

    /** Empty parens — the other way to write it. Both must agree. */
    it('records an empty list for a function that takes no arguments', async () => {
      const dna = await dnaOf(provider, 'c', '/repo/a.c', 'void noargs() {}', 'noargs');
      expect(dna.params).toEqual([]);
    });

    it('records the declared return type', async () => {
      const dna = await dnaOf(provider, 'c', '/repo/a.c', 'int add(int a, int b) { return a + b; }', 'add');
      expect(dna.returns).toBe('int');
    });

    it('records void only when void is what the source says', async () => {
      const dna = await dnaOf(provider, 'c', '/repo/a.c', 'void noargs() {}', 'noargs');
      expect(dna.returns).toBe('void');
    });
  });

  describe('cpp', () => {
    const provider = new CPPProvider();

    /** Same declarator-field gap as C — see the C describe block above and queries.ts. */
    it('records typed parameters, with the type carved off the name', async () => {
      const src = 'class Foo {\npublic:\n  int add(int a, int b) { return a + b; }\n};\n';
      const dna = await dnaOf(provider, 'cpp', '/repo/a.cpp', src, 'add');
      expect(dna.params).toEqual([
        { name: 'a', type: 'int', optional: false },
        { name: 'b', type: 'int', optional: false },
      ]);
    });

    it('records an empty list for a method that takes no arguments', async () => {
      const src = 'class Foo {\npublic:\n  void empty() {}\n};\n';
      const dna = await dnaOf(provider, 'cpp', '/repo/a.cpp', src, 'empty');
      expect(dna.params).toEqual([]);
    });

    it('records the declared return type', async () => {
      const src = 'class Foo {\npublic:\n  int add(int a, int b) { return a + b; }\n};\n';
      const dna = await dnaOf(provider, 'cpp', '/repo/a.cpp', src, 'add');
      expect(dna.returns).toBe('int');
    });

    /** A constructor has no return type — ADR 0086 forbids inventing one. */
    it('records no return type for a constructor', async () => {
      const src = 'class Foo {\npublic:\n  Foo() {}\n};\n';
      const dna = await dnaOf(provider, 'cpp', '/repo/a.cpp', src, 'Foo');
      expect(dna.returns).toBeNull();
    });
  });

  describe('csharp', () => {
    const provider = new CSharpProvider();

    /** C# `parameter` exposes a `name` field directly, so this fits reflector.ts's fallback chain cleanly. */
    it('records name and declared type for typed parameters', async () => {
      const src = 'class Foo {\n  public int Add(int a, string b) { return a; }\n}\n';
      const dna = await dnaOf(provider, 'csharp', '/repo/a.cs', src, 'Add');
      expect(dna.params).toEqual([
        { name: 'a', type: 'int', optional: false },
        { name: 'b', type: 'string', optional: false },
      ]);
    });

    it('records an empty list for a method that takes no arguments', async () => {
      const src = 'class Foo {\n  public void Empty() {}\n}\n';
      const dna = await dnaOf(provider, 'csharp', '/repo/a.cs', src, 'Empty');
      expect(dna.params).toEqual([]);
    });

    it('records the declared return type', async () => {
      const src = 'class Foo {\n  public int Add(int a, string b) { return a; }\n}\n';
      const dna = await dnaOf(provider, 'csharp', '/repo/a.cs', src, 'Add');
      expect(dna.returns).toBe('int');
    });

    /** A constructor has no `returns` field in this grammar at all — ADR 0086 forbids inventing one. */
    it('records no return type for a constructor', async () => {
      const src = 'class Foo {\n  public Foo() {}\n}\n';
      const dna = await dnaOf(provider, 'csharp', '/repo/a.cs', src, 'Foo');
      expect(dna.returns).toBeNull();
    });
  });

  describe('java', () => {
    const provider = new JavaProvider();

    /** Java `formal_parameter` exposes a `name` field directly, so this fits the fallback chain cleanly. */
    it('records name and declared type for typed parameters', async () => {
      const src = 'class Foo {\n  public int add(int a, String b) { return a; }\n}\n';
      const dna = await dnaOf(provider, 'java', '/repo/a.java', src, 'add');
      expect(dna.params).toEqual([
        { name: 'a', type: 'int', optional: false },
        { name: 'b', type: 'String', optional: false },
      ]);
    });

    it('records an empty list for a method that takes no arguments', async () => {
      const src = 'class Foo {\n  public void empty() {}\n}\n';
      const dna = await dnaOf(provider, 'java', '/repo/a.java', src, 'empty');
      expect(dna.params).toEqual([]);
    });

    it('records the declared return type', async () => {
      const src = 'class Foo {\n  public int add(int a, String b) { return a; }\n}\n';
      const dna = await dnaOf(provider, 'java', '/repo/a.java', src, 'add');
      expect(dna.returns).toBe('int');
    });

    it('records void only when void is what the source says', async () => {
      const src = 'class Foo {\n  public void empty() {}\n}\n';
      const dna = await dnaOf(provider, 'java', '/repo/a.java', src, 'empty');
      expect(dna.returns).toBe('void');
    });
  });
});
