import { describe, it, expect, beforeAll } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * todo13 — the Java query used to fail tree-sitter compilation (TSQueryErrorStructure at offset 921:
 * in grammar 0.23 the `superclass:` field holds a (superclass) wrapper, not a bare type_identifier).
 * One bad pattern fails the WHOLE query, so every .java file silently collapsed to the Gnosis
 * file-only fallback. These tests make the next grammar bump fail LOUDLY instead of degrading.
 *
 * Why EVERYTHING runs in a CHILD PROCESS: native tree-sitter can only be driven from the FIRST jest
 * test file that loads it in a worker process. In any later file `tree.rootNode` comes back
 * `undefined` (the getter on the shared native Tree prototype stays bound to the first wrapper
 * instance), `Query.matches` throws "Cannot read properties of undefined (reading 'tree')" and the
 * reflector falls back to Gnosis — for reasons that have nothing to do with Java. Merely importing
 * the grammar registry in-process is enough to poison the NEXT native suite, so this file imports
 * no parsing code at all. Reproduce the underlying jest problem with:
 *   npm test -- --runInBand tests/unit/core/type-only-imports.test.ts <any other native suite>
 * Spawning `tsx` gives this suite a clean process, so it is order-independent either way.
 */
describe('Java extraction', () => {
  const FIXTURE = `
package com.example.app;

import java.util.List;
import com.example.other.Helper;

interface Greeter {
    String greet(String who);
}

public class HelloService extends BaseService implements Greeter {
    private final String prefix;
    private int counter;

    public HelloService(String prefix) {
        this.prefix = prefix;
        this.counter = 0;
    }

    public String greet(String who) {
        List<String> parts = Helper.split(who);
        return prefix + parts.get(0);
    }

    private void bump() {
        counter = counter + 1;
    }
}

record Point(int x, int y) {}

enum Mode {
    FAST, SLOW
}
`;

  const CHILD = `
(async () => {
  const { ConducksReflector } = await import('./src/lib/domain/analysis/reflector.ts');
  const { AnalyzeContext } = await import('./src/lib/core/parsing/context.ts');
  const { JavaProvider } = await import('./src/lib/core/parsing/languages/java/index.ts');
  const { JAVA_QUERIES } = await import('./src/lib/core/parsing/languages/java/queries.ts');
  const { grammars } = await import('./src/lib/core/parsing/grammar-registry.ts');

  await grammars.loadLanguage('java');
  const lang = grammars.getLanguage('java');

  let compileError = null;
  try { grammars.createQuery(lang, JAVA_QUERIES); }
  catch (err) { compileError = String(err && err.message ? err.message : err); }

  const file = { path: '/repo/HelloService.java', source: process.argv[1] };
  const s = await new ConducksReflector().reflect(file, new JavaProvider(), new AnalyzeContext(), [file.path]);

  console.log('__RESULT__' + JSON.stringify({
    grammarLoaded: !!lang,
    compileError,
    nodes: s.nodes.map((n) => ({ name: n.name, kind: n.kind })),
    rels: s.relationships.map((r) => ({
      type: r.type,
      source: r.sourceName,
      target: r.targetName,
      specifier: r.metadata && r.metadata.specifier,
    })),
  }));
})();
`;

  let result: {
    grammarLoaded: boolean;
    compileError: string | null;
    nodes: Array<{ name: string; kind: string }>;
    rels: Array<{ type: string; source: string; target: string; specifier?: string }>;
  };

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

  it('does not degrade to the file-only Gnosis fallback', () => {
    const named = result.nodes.filter((n) => n.kind !== 'file' && n.kind !== 'unit');
    expect(named.length).toBeGreaterThanOrEqual(9);
  });

  it.each([
    ['HelloService', 'struct'],
    ['Point', 'struct'],
    ['Greeter', 'interface'],
    ['Mode', 'enum'],
    ['greet', 'function'],
    ['bump', 'function'],
    ['prefix', 'field'],
    ['counter', 'field'],
    ['parts', 'variable'],
    ['com.example.app', 'package'],
  ])('extracts %s as a %s', (name, kind) => {
    expect(result.nodes.find((n) => n.name === name)?.kind).toBe(kind);
  });

  it('records the import specifiers', () => {
    const imports = result.rels.filter((r) => r.type === 'IMPORTS').map((r) => r.specifier);
    expect(imports).toContain('java.util.List');
    expect(imports).toContain('com.example.other.Helper');
  });

  it('records extends and implements heritage', () => {
    const heritage = result.rels.filter((r) => r.type === 'EXTENDS' || r.type === 'IMPLEMENTS');
    expect(heritage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'HelloService', target: 'BaseService' }),
        expect.objectContaining({ source: 'HelloService', target: 'Greeter' }),
      ])
    );
  });

  it('records a method call made inside a method body', () => {
    const calls = result.rels.filter((r) => r.type === 'CALLS').map((r) => r.target);
    expect(calls).toContain('split');
  });
});
