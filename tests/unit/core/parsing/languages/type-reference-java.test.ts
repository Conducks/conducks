import { describe, it, expect, beforeAll } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * todo10 Phase 4 — Java had no `pulse_type_target` capture, so TYPE_REFERENCE edges never fired for
 * field/parameter/local/return types, generics, bounds, or throws clauses. This pins that the
 * capture is real, not just grammar-valid (see docs/memory.md — a query that compiles can still
 * match zero nodes and silently produce nothing).
 *
 * Runs in a CHILD PROCESS — see java-extraction.test.ts for why native tree-sitter requires it.
 */
describe('Java TYPE_REFERENCE edges (todo10 Phase 4)', () => {
  const FIXTURE = `
import java.util.List;

class Repo<T extends Comparable<T>> {
    private List<String> items;
    private Map<String, Integer> mapping;
    private Repo parent;
    protected java.util.Optional<Repo> maybe;

    public Repo find(String name, List<Integer> ids) throws java.io.IOException {
        Map<String, Integer> local = new java.util.HashMap<>();
        return null;
    }
}

interface Shape {
    double area();
}

class Uses {
    void go(Repo repo) {
        Registry.register(Plugin.class);          // class literal
        String t = Strings.trimAll(" x ");        // static call qualifier
        Object c = Color.RED;                     // static field qualifier
        Runnable r = Helper::run;                 // method reference qualifier
        repo.find("a", null);                     // a VARIABLE receiver — not a type
        boolean m = repo instanceof Marker;       // instanceof
        Object g = (Tagged) repo;                 // cast
        Object[] cells = new Cell[2];             // array creation
        Slot[] slots = null;                      // array type
        try { } catch (Boom | Bang e) { }         // catch (multi)
        Object p = new Pair<>(1, 2);              // diamond
    }
}

class StringAdapter extends Adapter<String> implements Codec<String> { }
record Point(int x) implements Shaped<Point> { }
`;

  const CHILD = `
(async () => {
  const { ConducksReflector } = await import('./src/lib/core/parsing/reflector.ts');
  const { AnalyzeContext } = await import('./src/lib/core/parsing/context.ts');
  const { JavaProvider } = await import('./src/lib/core/parsing/languages/java/index.ts');
  const { JAVA_QUERIES } = await import('./src/lib/core/parsing/languages/java/queries.ts');
  const { grammars } = await import('./src/lib/core/parsing/grammar-registry.ts');

  await grammars.loadLanguage('java');
  const lang = grammars.getLanguage('java');

  let compileError = null;
  try { grammars.createQuery(lang, JAVA_QUERIES); }
  catch (err) { compileError = String(err && err.message ? err.message : err); }

  const file = { path: '/repo/Repo.java', source: process.argv[1] };
  const s = await new ConducksReflector().reflect(file, new JavaProvider(), new AnalyzeContext(), [file.path]);

  console.log('__RESULT__' + JSON.stringify({
    grammarLoaded: !!lang,
    compileError,
    typeRefs: s.relationships.filter((r) => r.type === 'TYPE_REFERENCE').map((r) => r.metadata && r.metadata.original),
    other: s.relationships.filter((r) => r.type !== 'TYPE_REFERENCE').map((r) => r.type + ' ' + ((r.metadata && r.metadata.original) || r.targetName || r.targetId)),
  }));
})();
`;

  let result: { grammarLoaded: boolean; compileError: string | null; typeRefs: string[]; other: string[] };

  beforeAll(() => {
    const tsx = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
    const out = execFileSync(tsx, ['-e', CHILD, FIXTURE], {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    const line = out.split('\n').find((l) => l.includes('__RESULT__'));
    if (!line) throw new Error(`Java reflect child produced no result:\n${out}`);
    result = JSON.parse(line.slice(line.indexOf('__RESULT__') + '__RESULT__'.length));
  }, 180_000);

  it('compiles the full Java query against the installed grammar', () => {
    expect(result.grammarLoaded).toBe(true);
    expect(result.compileError).toBeNull();
  });

  it('produces a NON-ZERO count of TYPE_REFERENCE edges', () => {
    expect(result.typeRefs.length).toBeGreaterThan(0);
  });

  it.each([
    'List', 'String', 'Map', 'Integer', 'Repo', 'Comparable', 'T',
  ])('captures %s as a type reference somewhere in the file', (name) => {
    expect(result.typeRefs).toContain(name);
  });

  it('captures a dotted field type (java.util.Optional) without double-counting the prefix', () => {
    expect(result.typeRefs).toContain('java.util.Optional');
    expect(result.typeRefs).not.toContain('java.util');
  });

  // Java oracle, 2026-11-12: `Plugin` was ORPHAN while `Registry.register(Plugin.class)` used it, and a
  // class reached only as `Strings.trimAll(...)`, `Color.RED` or `Strings::upper` had no edge to it.
  it.each(['Plugin', 'Registry', 'Strings', 'Color', 'Helper'])(
    'captures %s named as a class literal, a static qualifier or a method reference', (name) => {
      expect(result.typeRefs).toContain(name);
    });

  it('does not take a lower-case variable receiver for a type', () => {
    expect(result.typeRefs).not.toContain('repo');
  });

  // Java oracle on gson + fixture, 2026-11-12: each of these alone left its class ORPHAN.
  it.each(['Marker', 'Tagged', 'Cell', 'Slot', 'Boom', 'Bang'])(
    'captures %s named by instanceof, a cast, a catch clause or an array type', (name) => {
      expect(result.typeRefs).toContain(name);
    });

  it('a generic supertype is heritage: extends Adapter<String>, implements Codec<String>, a record\'s interfaces', () => {
    const heritage = result.other.filter(r => /^(EXTENDS|IMPLEMENTS) /.test(r)).join(' | ');
    for (const name of ['Adapter', 'Codec', 'Shaped']) expect(heritage).toContain(name);
  });

  it('a diamond `new Pair<>(…)` constructs Pair', () => {
    expect(result.other.join(' | ')).toMatch(/(CONSTRUCTS|CALLS) [^|]*Pair/i);
  });

  it('captures a checked exception type from a throws clause', () => {
    expect(result.typeRefs).toContain('java.io.IOException');
  });
});
