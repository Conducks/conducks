import { describe, it, expect, beforeAll } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * Two more use-positions that produced NO evidence, both found by running the CLI benchmark against
 * real subjects rather than by reading code.
 *
 * **JSX `onClick={handler}`** — the identifier sits in `(jsx_attribute (jsx_expression (identifier)))`
 * and no pattern reached it, so a handler declared and then wired to a prop looked unreferenced.
 * MEASURED on the monorepo subject: **28 of 126 ORPHAN findings** were handlers referenced exactly
 * this way (`onAction={handleAction}`, `onClick={exportCSV}`). In React this is not an edge case, it
 * is how components are joined. After the fix: 126 → 98, zero JSX false positives.
 *
 * **Python member READ** — `EntryPoint.LEVEL_1_ONLY`. Python had no value-position captures at all.
 * MEASURED on the Python subject: **3 of 10 STALE_IMPORT findings** were enums used only through
 * their members, so the import was called stale while the module branched on it. After the fix:
 * 10 → 7, and the 7 survivors are each verified true.
 *
 * Both are the same idea the TypeScript grammar already carried: a name READ is a use. Asserted at
 * the reflector level, in a child process, for the reason `java-extraction.test.ts` documents.
 */
describe('value positions that produced no evidence', () => {
  const TSX_FIXTURE = `
import { handleSave, Panel } from './lib.js';

export function Toolbar() {
  const exportCSV = () => 1;
  return (
    <div>
      <button onClick={exportCSV}>export</button>
      <Panel onAction={handleSave} />
    </div>
  );
}
`;

  const PY_FIXTURE = `
from foundation.enums import EntryPoint, InputType, Handler

def choose(job):
    if job.type == InputType.URL_LIST:
        return EntryPoint.LEVEL_1_ONLY
    return None

registry = [Handler]
`;

  const child = (provider: string, queries: string, lang: string, file: string) => `
(async () => {
  const { ConducksReflector } = await import('./src/lib/core/parsing/reflector.ts');
  const { AnalyzeContext } = await import('./src/lib/core/parsing/context.ts');
  const mod = await import('./src/lib/core/parsing/languages/${provider}/index.ts');
  const q = await import('./src/lib/core/parsing/languages/${provider}/queries.ts');
  const { grammars } = await import('./src/lib/core/parsing/grammar-registry.ts');
  await grammars.loadLanguage('${lang}');
  let compileError = null;
  try { grammars.createQuery(grammars.getLanguage('${lang}'), q.${queries}); }
  catch (err) { compileError = String(err && err.message ? err.message : err); }
  const Provider = mod.${provider === 'tsx' ? 'TSXProvider' : 'PythonProvider'};
  const f = { path: '${file}', source: process.argv[1] };
  const s = await new ConducksReflector().reflect(f, new Provider(), new AnalyzeContext(), [f.path]);
  console.log('__RESULT__' + JSON.stringify({
    compileError,
    // Every name this file was seen USING, from any evidence-bearing relationship.
    used: s.relationships.map((r) => String(r.targetName)),
  }));
})();
`;

  const run = (src: string, childSrc: string) => {
    const tsx = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
    const out = execFileSync(tsx, ['-e', childSrc, src], {
      cwd: process.cwd(), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    });
    const line = out.split('\n').find((l) => l.includes('__RESULT__'));
    if (!line) throw new Error(`child produced no result:\n${out}`);
    return JSON.parse(line.slice(line.indexOf('__RESULT__') + '__RESULT__'.length)) as
      { compileError: string | null; used: string[] };
  };

  let tsxResult: { compileError: string | null; used: string[] };
  let pyResult: { compileError: string | null; used: string[] };

  beforeAll(() => {
    tsxResult = run(TSX_FIXTURE, child('tsx', 'TSX_QUERIES', 'tsx', '/repo/Toolbar.tsx'));
    pyResult = run(PY_FIXTURE, child('python', 'PYTHON_QUERIES', 'python', '/repo/flow.py'));
  }, 180_000);

  it('compiles both grammars after the added patterns', () => {
    expect({ tsx: tsxResult.compileError, python: pyResult.compileError })
      .toEqual({ tsx: null, python: null });
  });

  it('sees a handler passed through a JSX expression container', () => {
    const used = tsxResult.used.join(' ').toLowerCase();
    // Asserted on the IMPORTED handler, because that is the edge this layer produces:
    // `onAction={handleSave}` becomes `ACCESSES toolbar -> ./lib.js::handlesave`.
    //
    // A handler declared LOCALLY in the same component emits no relationship in an isolated
    // spectrum — it is resolved further down the pipeline, once the file's own bindings are in the
    // graph. That path is covered end-to-end rather than pretended at here: MEASURED on the
    // monorepo subject, `handleAction`, `exportCSV`, `save` and `handleModalSubmit` were each
    // reported ORPHAN before this pattern and each is unreported after it (126 → 98 ORPHANs, zero
    // JSX-referenced ones left). Asserting the local case at THIS layer would assert something the
    // layer does not do, and would pass for the wrong reason.
    expect(used).toContain('handlesave');
  });

  it('sees a Python name read through a member, a list and a conditional', () => {
    const used = pyResult.used.join(' ').toLowerCase();
    expect({
      memberRead: used.includes('entrypoint') && used.includes('inputtype'),
      listElement: used.includes('handler'),
    }).toEqual({ memberRead: true, listElement: true });
  });
});
