import { describe, it, expect, beforeAll } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * A ZERO-ARGUMENT Python call produced no CALLS edge at all.
 *
 * The pattern constrained the argument list with a bare `(_)`, which requires the list to contain at
 * least ONE node, so `start()`, `run()`, `self.close()` matched nothing and were invisible to the
 * whole graph — not to one analyzer. TypeScript, TSX and JavaScript already quantified with `(_)*`;
 * Python was the only grammar with the strict form, and every other language captures the call
 * target without constraining arguments at all.
 *
 * What it cost, measured on a two-file fixture: `prune` reported the import of a function called on
 * the next line as STALE_IMPORT — a verdict telling the reader to delete an import their code needs
 * — and `trace` on the calling function returned zero steps. Both are the ADR 0044 shape: an answer
 * derived from evidence that was never collected.
 *
 * Asserted as a PAIR on purpose. A no-arg call and a one-arg call sit in the same function, so the
 * test cannot pass by the pattern matching nothing at all, and a regression names which arity broke.
 *
 * Runs in a CHILD PROCESS for the reason `java-extraction.test.ts` documents at length: native
 * tree-sitter only works in the first jest file that loads it in a worker, so this file imports no
 * parsing code itself.
 */
describe('Python zero-argument calls', () => {
  const FIXTURE = `
from pkg.lib import used_fn, helper

def run():
    helper("x")
    return used_fn()

class Service:
    def close(self):
        pass

    def shutdown(self):
        self.close()
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

  const file = { path: '/repo/pkg/main.py', source: process.argv[1] };
  const s = await new ConducksReflector().reflect(file, new PythonProvider(), new AnalyzeContext(), [file.path]);

  console.log('__RESULT__' + JSON.stringify({
    grammarLoaded: !!lang,
    compileError,
    calls: s.relationships
      .filter((r) => r.type === 'CALLS')
      .map((r) => String(r.targetName)),
    callPairs: s.relationships
      .filter((r) => r.type === 'CALLS')
      .map((r) => ({ source: String(r.sourceName), target: String(r.targetName) })),
  }));
})();
`;

  let result: {
    grammarLoaded: boolean;
    compileError: string | null;
    calls: string[];
    callPairs: Array<{ source: string; target: string }>;
  };

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

  it('records a call with NO arguments and one WITH arguments alike', () => {
    // Named rather than counted: "2 calls" would send the reader back to the fixture to work out
    // which arity regressed, and the no-arg half is the one that was broken.
    const has = (name: string) => result.calls.some((c) => c.toLowerCase().includes(name));
    expect({ zeroArg: has('used_fn'), withArg: has('helper') })
      .toEqual({ zeroArg: true, withArg: true });
  });

  it('resolves a `self.method()` call to the METHOD, not to the receiver', () => {
    // This assertion is the inverse of what it said when written, and that was the point: it
    // pinned the gap as current behaviour — target `self`, not `close` — with a note that the day
    // the target carried the method, the test would fail and the claim would be rewritten
    // deliberately. That day came in the same session; this is the rewrite.
    //
    // The gap was two lines deep. `self.` was never stripped the way `this.` is (the strip's own
    // comment says class self-calls resolve via same-file lookup), AND the built-in check tested
    // the UNSTRIPPED target — so `self` matched the Python built-in list and the call bound to
    // `GLOBAL::self`, one synthetic node absorbing every intra-class call in the language.
    //
    // MEASURED on the Electron subject's Python daemon: `_drain_queue` went from 1 caller to 13,
    // `_transcribe` and `_await_response` from 0 to 11 each. Prune's totals did not move, so the
    // recall was not bought with precision.
    const attributeCall = result.callPairs.find((c) => c.source.toLowerCase().includes('shutdown'));
    expect(attributeCall).toBeDefined();
    expect(attributeCall!.target.toLowerCase()).toContain('close');
    expect(attributeCall!.target.toLowerCase()).not.toContain('global::self');
  });
});
