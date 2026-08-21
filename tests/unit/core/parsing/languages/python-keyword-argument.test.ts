import { describe, it, expect, beforeAll } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * F-02 — a Python KEYWORD ARGUMENT value is a read, and the grammar had no pattern for it.
 *
 * `(call arguments: (argument_list (identifier) @ref_value))` matches only an identifier that is a
 * DIRECT child of `argument_list`. A keyword argument wraps its value one level deeper, inside a
 * `keyword_argument` node (`f(key=value)` parses as `argument_list(keyword_argument(identifier
 * "key") value: (identifier "value")))`), so `entities.sort(key=_score_entity)` produced no
 * reference at all. MEASURED on the scraper subject: `_score_entity` (live_structure.py:28, used
 * at :92) reported ORPHAN in `prune` and 0 callers in `impact` despite being the sort key on the
 * very next block.
 *
 * The counter-test is the one the prior research reasoned about but never ran against a live
 * parser: a STRING passed as a keyword value (`sort(key="_score_entity")`) and an ATTRIBUTE passed
 * as a keyword value (`sort(key=obj._score_entity)`) must NOT produce an edge to the identifier
 * `_score_entity` — only the bare-identifier keyword value should.
 */
describe('python keyword argument value is a read', () => {
  const FIXTURE = `
def _score_entity(e):
    return e.rank

def _other_bare(e):
    return 0

def run(entities, obj):
    entities.sort(key=_score_entity)
    entities.sort(key="_score_entity")
    entities.sort(key=obj._score_entity)
    entities.sort(_other_bare)
`;

  const child = `
(async () => {
  const { ConducksReflector } = await import('./src/lib/core/parsing/reflector.ts');
  const { AnalyzeContext } = await import('./src/lib/core/parsing/context.ts');
  const mod = await import('./src/lib/core/parsing/languages/python/index.ts');
  const q = await import('./src/lib/core/parsing/languages/python/queries.ts');
  const { grammars } = await import('./src/lib/core/parsing/grammar-registry.ts');
  await grammars.loadLanguage('python');
  let compileError = null;
  try { grammars.createQuery(grammars.getLanguage('python'), q.PYTHON_QUERIES); }
  catch (err) { compileError = String(err && err.message ? err.message : err); }
  const Provider = mod.PythonProvider;
  const f = { path: '/repo/flow.py', source: process.argv[1] };
  const s = await new ConducksReflector().reflect(f, new Provider(), new AnalyzeContext(), [f.path]);
  console.log('__RESULT__' + JSON.stringify({
    compileError,
    used: s.relationships.map((r) => String(r.targetName)),
  }));
})();
`;

  const run = (src: string) => {
    const tsx = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
    const out = execFileSync(tsx, ['-e', child, src], {
      cwd: process.cwd(), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    });
    const line = out.split('\n').find((l) => l.includes('__RESULT__'));
    if (!line) throw new Error(`child produced no result:\n${out}`);
    return JSON.parse(line.slice(line.indexOf('__RESULT__') + '__RESULT__'.length)) as
      { compileError: string | null; used: string[] };
  };

  let result: { compileError: string | null; used: string[] };

  beforeAll(() => {
    result = run(FIXTURE);
  }, 180_000);

  it('compiles the grammar with the added pattern', () => {
    expect(result.compileError).toBeNull();
  });

  it('sees the bare identifier keyword-argument value as a read, exactly once', () => {
    const hits = result.used.filter((n) => n.toLowerCase() === '_score_entity');
    // Exactly one edge: the bare-identifier keyword value. The string literal and the attribute
    // access must NOT also mint one — that is the counter-test this finding exists to close.
    expect(hits.length).toBe(1);
  });

  it('still sees a positional (non-keyword) call-argument read', () => {
    expect(result.used.map((n) => n.toLowerCase())).toContain('_other_bare');
  });
});
