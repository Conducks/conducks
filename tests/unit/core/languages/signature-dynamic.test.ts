import { describe, it, expect, beforeAll } from '@jest/globals';
import { ConducksReflector } from '@/lib/core/parsing/reflector.js';
import { AnalyzeContext } from '@/lib/core/parsing/context.js';
import { PythonProvider } from '@/lib/core/parsing/languages/python/index.js';
import { RubyProvider } from '@/lib/core/parsing/languages/ruby/index.js';
import { PHPProvider } from '@/lib/core/parsing/languages/php/index.js';
import { grammars } from '@/lib/core/parsing/grammar-registry.js';

/**
 * Dynamic-language signature capture — python, ruby, php (ADR 0086/0087).
 *
 * Before this file, `dna.params` was `[]` and `dna.returns` was `null` for every function in these
 * three languages, indistinguishable from "measured and empty". These tests pin what the @params /
 * @return_type captures added to each queries.ts actually produce, read through the FROZEN
 * `paramsOf`/`returnTypeOf` in reflector.ts (not edited here — see instance-type-capture.test.ts for
 * its TypeScript-side contract).
 *
 * Two of the three languages EXPOSED A GAP in that helper, which ADR 0087 then fixed:
 * Ruby's splat/block/keyword parameters and PHP's by-reference/variadic parameters carry a `name`
 * field pointing at the bare identifier, so the marker (*, &, ...) is dropped. Those cases are
 * asserted here as MEASURED — documenting the real behaviour, not the ideal one — so a future change
 * to the query or the helper is caught by a red test rather than silently drifting further.
 */

async function paramsAndReturns(
  reflector: ConducksReflector,
  provider: any,
  path: string,
  source: string,
  name: string,
) {
  const context = new AnalyzeContext();
  const file = { path, source };
  const spectrum: any = await reflector.reflect(file, provider, context, [path]);
  const node = spectrum.nodes.find((n: any) => String(n.name).toLowerCase() === name);
  return { params: node?.dna?.params, returns: node?.dna?.returns };
}

describe('python: parameters and return type', () => {
  const reflector = new ConducksReflector();
  const provider = new PythonProvider();

  beforeAll(async () => {
    await grammars.loadLanguage('python');
  });

  const run = (source: string, name: string) =>
    paramsAndReturns(reflector, provider as any, '/repo/a.py', source, name);

  it('records a zero-argument function as a genuinely empty list', async () => {
    const { params, returns } = await run('def none() -> None:\n    pass\n', 'none');
    expect(params).toEqual([]);
    expect(returns).toBe('None');
  });

  it('records an untyped parameter\'s bare name and null type', async () => {
    const { params } = await run('def plain(x, y):\n    pass\n', 'plain');
    expect(params).toEqual([
      { name: 'x', type: null, optional: false },
      { name: 'y', type: null, optional: false },
    ]);
  });

  it('records default_parameter and typed_default_parameter names correctly', async () => {
    const { params } = await run('def f(b=2, c: int = 3):\n    pass\n', 'f');
    expect(params).toEqual([
      { name: 'b', type: null, optional: false },
      { name: 'c', type: 'int', optional: false },
    ]);
  });

  it('keeps the *args / **kwargs markers', async () => {
    const { params } = await run('def f(*args, **kwargs):\n    pass\n', 'f');
    expect(params).toEqual([
      { name: '*args', type: null, optional: false },
      { name: '**kwargs', type: null, optional: false },
    ]);
  });

  it('reads a declared return type verbatim', async () => {
    const { returns } = await run('def f() -> int:\n    pass\n', 'f');
    expect(returns).toBe('int');
  });

  it('records null when no return type is declared', async () => {
    const { returns } = await run('def f():\n    pass\n', 'f');
    expect(returns).toBeNull();
  });

  it('records self explicitly, as the source writes it', async () => {
    const { params } = await run('class C:\n    def m(self, a):\n        pass\n', 'm');
    expect(params[0]).toEqual({ name: 'self', type: null, optional: false });
  });

  /**
   * WAS A KNOWN GAP, now FIXED by ADR 0087. A typed_parameter has neither a 'pattern' nor a 'name'
   * field, which used to force a fallback to the node's whole text ("a: str"). The type is now
   * carved out by byte offset instead, so the absent field costs nothing.
   */
  it('records just the identifier for a typed parameter', async () => {
    const { params } = await run('def f(a: str):\n    pass\n', 'f');
    expect(params).toEqual([{ name: 'a', type: 'str', optional: false }]);
  });
});

describe('ruby: parameters, no return type', () => {
  const reflector = new ConducksReflector();
  const provider = new RubyProvider();

  beforeAll(async () => {
    await grammars.loadLanguage('ruby');
  });

  const run = (source: string, name: string) =>
    paramsAndReturns(reflector, provider as any, '/repo/a.rb', source, name);

  it('records a zero-argument (paren-less) method as a genuinely empty list', async () => {
    const { params, returns } = await run('def none\n  1\nend\n', 'none');
    expect(params).toEqual([]);
    // Ruby has no type annotations: no @return_type capture exists at all, so this is always null.
    expect(returns).toBeNull();
  });

  it('records a bare identifier parameter with a null type — Ruby has no annotations', async () => {
    const { params } = await run('def f(a, b)\n  1\nend\n', 'f');
    expect(params).toEqual([
      { name: 'a', type: null, optional: false },
      { name: 'b', type: null, optional: false },
    ]);
  });

  it('marks an optional_parameter (positional default) as optional', async () => {
    const { params } = await run('def f(a, b = 2)\n  1\nend\n', 'f');
    expect(params).toEqual([
      { name: 'a', type: null, optional: false },
      { name: 'b', type: null, optional: true },
    ]);
  });

  it('never captures a return type for a singleton method either', async () => {
    const { returns } = await run('def self.factory(a)\n  1\nend\n', 'factory');
    expect(returns).toBeNull();
  });

  /**
   * WAS A KNOWN GAP, FIXED by ADR 0087. splat_parameter, block_parameter and keyword_parameter all
   * carry a 'name' field pointing at the bare identifier, so paramsOf's pattern-then-name fallback
   * picks 'name' and the *, &, and trailing : markers are all LOST. Measured, not assumed.
   */
  it('keeps the splat, block and keyword markers', async () => {
    const { params } = await run('def f(*args, k:, &blk)\n  1\nend\n', 'f');
    expect(params).toEqual([
      // Markers KEPT (ADR 0087): `*args` is not `args`, and Ruby's `k:` is a keyword parameter,
      // which means something different from a positional `k`. Nothing else records the difference.
      { name: '*args', type: null, optional: false },
      { name: 'k:', type: null, optional: false },
      { name: '&blk', type: null, optional: false },
    ]);
  });
});

describe('php: parameters and return type', () => {
  const reflector = new ConducksReflector();
  const provider = new PHPProvider();

  beforeAll(async () => {
    await grammars.loadLanguage('php');
  });

  const run = (source: string, name: string) =>
    paramsAndReturns(reflector, provider as any, '/repo/a.php', source, name);

  it('records a zero-argument method as a genuinely empty list', async () => {
    const { params, returns } = await run('<?php\nclass C {\n  public function none(): void {}\n}\n', 'none');
    expect(params).toEqual([]);
    expect(returns).toBe('void');
  });

  it('records a typed parameter name (with its $ sigil) and declared type', async () => {
    const { params } = await run('<?php\nfunction f(string $a, int $b) {}\n', 'f');
    expect(params).toEqual([
      { name: '$a', type: 'string', optional: false },
      { name: '$b', type: 'int', optional: false },
    ]);
  });

  it('reads a declared class return type verbatim', async () => {
    const { returns } = await run('<?php\nclass C {\n  public function m(): int { return 1; }\n}\n', 'm');
    expect(returns).toBe('int');
  });

  it('records null when no return type is declared', async () => {
    const { returns } = await run('<?php\nfunction f($x) {}\n', 'f');
    expect(returns).toBeNull();
  });

  /**
   * WAS A KNOWN GAP, FIXED by ADR 0087. A by-reference parameter (&$c) and a variadic parameter
   * (...$rest) both carry a 'name' field pointing at the variable_name node ("$c" / "$rest"),
   * which does not include the & or ... prefix — that token is a sibling, not part of the name
   * field's own text. paramsOf's pattern-then-name fallback picks 'name' and the marker is LOST.
   */
  it('keeps the by-reference and variadic markers', async () => {
    const { params } = await run('<?php\nfunction f(&$c, ...$rest) {}\n', 'f');
    expect(params).toEqual([
      { name: '&$c', type: null, optional: false },
      { name: '...$rest', type: null, optional: false },
    ]);
  });
});
