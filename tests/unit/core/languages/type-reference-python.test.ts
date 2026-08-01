import { describe, it, expect, beforeAll } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * todo10 Phase 4 — Python had no `pulse_type_target` capture, so TYPE_REFERENCE edges never fired
 * for annotations, generics, or PEP 604 unions. This pins that the capture is real, not just
 * grammar-valid: a query that compiles can still match zero nodes and silently produce nothing
 * (see docs/memory.md — the exact trap todo10 calls out).
 *
 * Runs in a CHILD PROCESS — native tree-sitter poisons later in-process reflects once a prior jest
 * test file in the same worker has loaded it (see java-extraction.test.ts for the full writeup).
 */
describe('Python TYPE_REFERENCE edges (todo10 Phase 4)', () => {
  const FIXTURE = `
from typing import List, Optional, Dict, Union
import collections.abc

class Repo:
    items: List[str]
    default: Optional[int] = None
    mapping: Dict[str, List[int]]
    flexible: Union[int, str]
    modern: int | str
    ordered: collections.abc.Mapping

    def find(self, name: str) -> Optional[int]:
        x: Dict[str, int] = {}
        return None

def process(items: List[Repo]) -> None:
    pass
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

  const file = { path: '/repo/repo.py', source: process.argv[1] };
  const s = await new ConducksReflector().reflect(file, new PythonProvider(), new AnalyzeContext(), [file.path]);

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
    if (!line) throw new Error(`Python reflect child produced no result:\n${out}`);
    result = JSON.parse(line.slice(line.indexOf('__RESULT__') + '__RESULT__'.length));
  }, 180_000);

  it('compiles the full Python query against the installed grammar', () => {
    expect(result.grammarLoaded).toBe(true);
    expect(result.compileError).toBeNull();
  });

  it('produces a NON-ZERO count of TYPE_REFERENCE edges', () => {
    expect(result.typeRefs.length).toBeGreaterThan(0);
  });

  it.each([
    'List', 'Optional', 'Dict', 'Union', 'str', 'int', 'Repo',
  ])('captures %s as a type reference somewhere in the file', (name) => {
    expect(result.typeRefs).toContain(name);
  });

  it('captures a dotted annotation (collections.abc.Mapping) as a single target', () => {
    expect(result.typeRefs).toContain('collections.abc.Mapping');
  });

  it('captures a PEP 604 union member (int | str)', () => {
    expect(result.typeRefs).toEqual(expect.arrayContaining(['int', 'str']));
  });
});
