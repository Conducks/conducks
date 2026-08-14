import { describe, it, expect, beforeAll } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * Python produced NO heritage edge for any class, ever.
 *
 * `reflector.ts` gates its heritage branch on there being a co-captured node — the
 * `else if ((cName === 'heritage' …) && node)` guard — so a heritage capture with no `@name` beside
 * it is dropped on the floor. The Python grammar captured only `@heritage`. TypeScript, TSX and
 * JavaScript all co-capture `@name` for exactly this reason, and the JavaScript grammar carries a
 * comment saying so; Python was simply missed.
 *
 * What it cost, MEASURED on the frozen Python subject: **17 of 27 `STALE_IMPORT` findings were base
 * classes being inherited from** — `BaseExtractor` across 11 files, plus `BaseSpecialist`,
 * `BaseMapper`, `BaseWriter` and `BaseLevel`. 63% of the category was wrong, and every one told the
 * reader to delete an import whose class the very next line inherits from. Acting on any of them
 * breaks the module at import time. After the fix: 27 → 10 findings, zero base-class false
 * positives.
 *
 * Runs in a CHILD PROCESS for the reason `java-extraction.test.ts` documents: native tree-sitter
 * only works in the first jest file that loads it in a worker.
 */
describe('Python class inheritance', () => {
  const FIXTURE = `
from foundation.base_interfaces import BaseExtractor, BaseWriter
from abc import ABC

class AboutExtractor(BaseExtractor):
    def run(self):
        return 1

class ChunkedWriter(BaseWriter, ABC):
    def write(self):
        return 2

class Standalone:
    def nothing(self):
        return 3
`;

  const CHILD = `
(async () => {
  const { ConducksReflector } = await import('./src/lib/core/parsing/reflector.ts');
  const { AnalyzeContext } = await import('./src/lib/core/parsing/context.ts');
  const { PythonProvider } = await import('./src/lib/core/parsing/languages/python/index.ts');
  const { PYTHON_QUERIES } = await import('./src/lib/core/parsing/languages/python/queries.ts');
  const { grammars } = await import('./src/lib/core/parsing/grammar-registry.ts');

  await grammars.loadLanguage('python');
  const lang = grammars.getLanguage('python');

  let compileError = null;
  try { grammars.createQuery(lang, PYTHON_QUERIES); }
  catch (err) { compileError = String(err && err.message ? err.message : err); }

  const file = { path: '/repo/extractors/about.py', source: process.argv[1] };
  const s = await new ConducksReflector().reflect(file, new PythonProvider(), new AnalyzeContext(), [file.path]);

  console.log('__RESULT__' + JSON.stringify({
    compileError,
    classes: s.nodes.filter((n) => n.kind === 'struct').map((n) => n.name),
    heritage: s.relationships
      .filter((r) => r.type === 'EXTENDS' || r.type === 'IMPLEMENTS')
      .map((r) => ({ type: r.type, source: String(r.sourceName), target: String(r.targetName) })),
  }));
})();
`;

  let result: {
    compileError: string | null;
    classes: string[];
    heritage: Array<{ type: string; source: string; target: string }>;
  };

  beforeAll(() => {
    const tsx = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
    const out = execFileSync(tsx, ['-e', CHILD, FIXTURE], {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    const line = out.split('\n').find((l) => l.includes('__RESULT__'));
    if (!line) throw new Error(`Python heritage child produced no result:\n${out}`);
    result = JSON.parse(line.slice(line.indexOf('__RESULT__') + '__RESULT__'.length));
  }, 180_000);

  it('compiles the full Python query against the installed grammar', () => {
    // The fix adds @name and @isStruct to a pattern that already existed. If that ever makes the
    // query invalid, the whole Python grammar silently degrades — so this is checked first.
    expect(result.compileError).toBeNull();
  });

  it('still extracts the classes themselves', () => {
    // Guards the node-creation race ADR 0086 names: the heritage pattern now also carries @isStruct
    // and matches the SAME class_definition as the plain pattern. Each class must appear, and a
    // class with no superclass must not be lost.
    expect(result.classes.sort()).toEqual(['AboutExtractor', 'ChunkedWriter', 'Standalone']);
  });

  it('records the base class as a heritage edge', () => {
    // Named, not counted: this is the edge whose absence made every imported base class read as
    // deletable dead code.
    const targets = result.heritage.map((h) => h.target.toLowerCase());
    expect({
      baseExtractor: targets.some((t) => t.includes('baseextractor')),
      baseWriter: targets.some((t) => t.includes('basewriter')),
    }).toEqual({ baseExtractor: true, baseWriter: true });
  });

  it('records EVERY base in a multiple-inheritance list', () => {
    // `class ChunkedWriter(BaseWriter, ABC)` — Python allows several, and capturing only the first
    // would leave the same hole for the rest.
    const targets = result.heritage.map((h) => h.target.toLowerCase());
    expect(targets.some((t) => t.includes('abc'))).toBe(true);
  });
});
