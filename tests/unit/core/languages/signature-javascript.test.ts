import { describe, it, expect, beforeAll } from '@jest/globals';
import { ConducksReflector } from '@/lib/domain/analysis/reflector.js';
import { AnalyzeContext } from '@/lib/core/parsing/context.js';
import { JavaScriptProvider } from '@/lib/core/parsing/languages/javascript/index.js';
import { grammars } from '@/lib/core/parsing/grammar-registry.js';

/**
 * `dna.params` for JavaScript (ADR 0086). JavaScript has no type annotations, so every parameter
 * records `type: null` — that is the honest answer, not a gap, and is asserted below rather than
 * left implicit.
 *
 * TypeScript and TSX are the reference implementation (tests/unit/core/instance-type-capture.test.ts);
 * this file is the same shape, minus `@return_type`, which JavaScript has nothing to capture.
 */
describe('a JavaScript function records the parameters it declares', () => {
  const reflector = new ConducksReflector();
  const provider = new JavaScriptProvider();

  const paramsOf = async (source: string, name: string) => {
    const context = new AnalyzeContext();
    const file = { path: '/repo/a.js', source };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spectrum: any = await reflector.reflect(file, provider as any, context, [file.path]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return spectrum.nodes.find((n: any) => String(n.name).toLowerCase() === name)?.dna?.params;
  };

  beforeAll(async () => {
    await grammars.loadLanguage('javascript');
  });

  it('records names, in order, with type always null', async () => {
    expect(await paramsOf('function f(a, b) {}', 'f')).toEqual([
      { name: 'a', type: null, optional: false },
      { name: 'b', type: null, optional: false },
    ]);
  });

  it('records an empty list for a function that genuinely takes none', async () => {
    expect(await paramsOf('function none() {}', 'none')).toEqual([]);
  });

  it('records an async function declaration', async () => {
    expect(await paramsOf('async function af(a) {}', 'af')).toEqual([{ name: 'a', type: null, optional: false }]);
  });

  it('records an exported function declaration', async () => {
    expect(await paramsOf('export function ef(a, b) {}', 'ef')).toEqual([
      { name: 'a', type: null, optional: false },
      { name: 'b', type: null, optional: false },
    ]);
  });

  it('records a default-exported function declaration', async () => {
    expect(await paramsOf('export default function df(a) {}', 'df')).toEqual([
      { name: 'a', type: null, optional: false },
    ]);
  });

  /** A rest element keeps its `...` — the name alone would claim a single value. */
  it('keeps the rest marker', async () => {
    expect(await paramsOf('function rest(...args) {}', 'rest')).toEqual([{ name: '...args', type: null, optional: false }]);
  });

  /** A destructured parameter binds several names and has no single one — the literal pattern is kept. */
  it('keeps a destructured object parameter as its pattern', async () => {
    expect(await paramsOf('function destructured({ a, b }) {}', 'destructured')).toEqual([
      { name: '{ a, b }', type: null, optional: false },
    ]);
  });

  it('keeps a destructured array parameter as its pattern', async () => {
    expect(await paramsOf('function destructuredArr([a, b]) {}', 'destructuredarr')).toEqual([
      { name: '[a, b]', type: null, optional: false },
    ]);
  });

  /**
   * JavaScript's `assignment_pattern` (a default value) has no `pattern`/`name` field — only
   * `left`/`right` — unlike TypeScript's `default_parameter`, which carries a `pattern` field for
   * the bare name. `paramsOf` (reflector.ts, frozen) falls through to the node's own text for
   * anything with neither field, so a JS default parameter records its whole `a = 1` literally
   * rather than just `a`. Honest given what the grammar exposes, but a real divergence from
   * TypeScript's shape — see the handover for this as a reported finding.
   */
  it('records a defaulted parameter as its name, with the default carved off', async () => {
    expect(await paramsOf('function defaulted(a = 1) {}', 'defaulted')).toEqual([
      { name: 'a', type: null, optional: false },
    ]);
  });

  it('records a class method', async () => {
    expect(await paramsOf('class C { m(x) {} }', 'm')).toEqual([{ name: 'x', type: null, optional: false }]);
  });

  it('records a static method', async () => {
    expect(await paramsOf('class C { static s(x) {} }', 's')).toEqual([{ name: 'x', type: null, optional: false }]);
  });

  it('records an async method', async () => {
    expect(await paramsOf('class C { async am(x) {} }', 'am')).toEqual([{ name: 'x', type: null, optional: false }]);
  });

  it('records a generator method', async () => {
    expect(await paramsOf('class C { *gm(x) {} }', 'gm')).toEqual([{ name: 'x', type: null, optional: false }]);
  });

  it('records a getter with an empty parameter list', async () => {
    expect(await paramsOf('class C { get g() { return 1; } }', 'g')).toEqual([]);
  });

  it('records a private method', async () => {
    expect(await paramsOf('class C { #p(x) {} }', '#p')).toEqual([{ name: 'x', type: null, optional: false }]);
  });

  it('records a constructor', async () => {
    expect(await paramsOf('class C { constructor(x) {} }', 'constructor')).toEqual([
      { name: 'x', type: null, optional: false },
    ]);
  });

  it('records an object-literal method', async () => {
    expect(await paramsOf('const obj = { m(a) {} };', 'm')).toEqual([{ name: 'a', type: null, optional: false }]);
  });

  it('records an arrow function assigned to a const', async () => {
    expect(await paramsOf('const f = (a, b) => a + b;', 'f')).toEqual([
      { name: 'a', type: null, optional: false },
      { name: 'b', type: null, optional: false },
    ]);
  });

  it('records a function expression assigned to a const', async () => {
    expect(await paramsOf('const f = function (a) {};', 'f')).toEqual([{ name: 'a', type: null, optional: false }]);
  });

  it('leaves a plain variable untouched by the arrow/function-expression pattern', async () => {
    expect(await paramsOf('const plain = 42;', 'plain')).toEqual([]);
  });
});
