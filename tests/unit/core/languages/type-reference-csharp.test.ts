import { describe, it, expect, beforeAll } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * todo10 Phase 4 — C# had no `pulse_type_target` capture, so TYPE_REFERENCE edges never fired for
 * variable/parameter/return/property types, generics, or constraint clauses. This pins that the
 * capture is real, not just grammar-valid (see docs/memory.md — a query that compiles can still
 * match zero nodes and silently produce nothing).
 *
 * Runs in a CHILD PROCESS — see java-extraction.test.ts for why native tree-sitter requires it.
 */
describe('C# TYPE_REFERENCE edges (todo10 Phase 4)', () => {
  const FIXTURE = `
using System.Collections.Generic;

namespace App {
    class Repo<T> where T : IComparable<T> {
        private List<string> items;
        private Repo parent;
        protected System.Nullable<int> maybe;

        public Repo Find(string name, List<int> ids) {
            Dictionary<string, int> local = new Dictionary<string, int>();
            return null;
        }

        public Repo MyProp { get; set; }
    }

    interface IShape {
        double Area();
    }
}
`;

  const CHILD = `
(async () => {
  const { ConducksReflector } = await import('./src/lib/core/parsing/reflector.ts');
  const { AnalyzeContext } = await import('./src/lib/core/parsing/context.ts');
  const { CSharpProvider } = await import('./src/lib/core/parsing/languages/csharp/index.ts');
  const { CSHARP_QUERIES } = await import('./src/lib/core/parsing/languages/csharp/queries.ts');
  const { grammars } = await import('./src/lib/core/parsing/grammar-registry.ts');

  await grammars.loadLanguage('csharp');
  const lang = grammars.getLanguage('csharp');

  let compileError = null;
  try { grammars.createQuery(lang, CSHARP_QUERIES); }
  catch (err) { compileError = String(err && err.message ? err.message : err); }

  const file = { path: '/repo/Repo.cs', source: process.argv[1] };
  const s = await new ConducksReflector().reflect(file, new CSharpProvider(), new AnalyzeContext(), [file.path]);

  console.log('__RESULT__' + JSON.stringify({
    grammarLoaded: !!lang,
    compileError,
    typeRefs: s.relationships.filter((r) => r.type === 'TYPE_REFERENCE').map((r) => r.metadata && r.metadata.original),
  }));
})();
`;

  let result: { grammarLoaded: boolean; compileError: string | null; typeRefs: string[] };

  beforeAll(() => {
    const tsx = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
    const out = execFileSync(tsx, ['-e', CHILD, FIXTURE], {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    const line = out.split('\n').find((l) => l.includes('__RESULT__'));
    if (!line) throw new Error(`C# reflect child produced no result:\n${out}`);
    result = JSON.parse(line.slice(line.indexOf('__RESULT__') + '__RESULT__'.length));
  }, 180_000);

  it('compiles the full C# query against the installed grammar', () => {
    expect(result.grammarLoaded).toBe(true);
    expect(result.compileError).toBeNull();
  });

  it('produces a NON-ZERO count of TYPE_REFERENCE edges', () => {
    expect(result.typeRefs.length).toBeGreaterThan(0);
  });

  it.each([
    'List', 'Repo', 'IComparable', 'T', 'Dictionary',
  ])('captures %s as a type reference somewhere in the file', (name) => {
    expect(result.typeRefs).toContain(name);
  });

  it('captures a qualified type (System.Nullable<int>) as a single whole target', () => {
    expect(result.typeRefs).toContain('System.Nullable<int>');
  });
});
