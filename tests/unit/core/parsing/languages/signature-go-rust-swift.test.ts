import { describe, it, expect, beforeAll } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * ADR 0086/0084 — `dna.params` and `dna.returns` were fabricated for every function in every
 * language except TypeScript/TSX: `params` was the literal `[]` and `returns` was the literal
 * `'void'` (later `null`), regardless of what the source actually declared. This file pins the real
 * measurement for Go, Rust and Swift, added by capturing `@params` / `@return_type` on the existing
 * `@isFunction` / `@isMethod` patterns in each language's `queries.ts` — `reflector.ts`'s
 * `paramsOf()`/`returnTypeOf()` are FROZEN and already read those two capture names generically.
 *
 * Runs each language in its own CHILD PROCESS — see `java-extraction.test.ts` / `go-heritage.test.ts`
 * / `swift-extraction.test.ts` for why: native tree-sitter only survives in the FIRST jest test file
 * that loads a given grammar in a worker process; merely importing the grammar registry in-process
 * poisons the next native suite in the same worker.
 */

function runChild(childScript: string, source: string): any {
  const tsx = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
  const out = execFileSync(tsx, ['-e', childScript, source], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const line = out.split('\n').find((l) => l.includes('__RESULT__'));
  if (!line) throw new Error(`reflect child produced no result:\n${out}`);
  return JSON.parse(line.slice(line.indexOf('__RESULT__') + '__RESULT__'.length));
}

const childFor = (providerImport: string, providerClass: string, filePath: string, langId: string) => `
(async () => {
  const { ConducksReflector } = await import('./src/lib/core/parsing/reflector.ts');
  const { AnalyzeContext } = await import('./src/lib/core/parsing/context.ts');
  const { ${providerClass} } = await import('${providerImport}');
  const { grammars } = await import('./src/lib/core/parsing/grammar-registry.ts');

  await grammars.loadLanguage('${langId}');

  const file = { path: '${filePath}', source: process.argv[1] };
  const s = await new ConducksReflector().reflect(file, new ${providerClass}(), new AnalyzeContext(), [file.path]);

  console.log('__RESULT__' + JSON.stringify({
    nodes: s.nodes.map((n) => ({
      name: n.name,
      kind: n.kind,
      params: n.metadata && n.metadata.dna && n.metadata.dna.params,
      returns: n.metadata && n.metadata.dna && n.metadata.dna.returns,
    })),
  }));
})();
`;

type SigNode = { name: string; kind: string; params: Array<{ name: string; type: string | null; optional: boolean }>; returns: string | null };
type SigResult = { nodes: SigNode[] };

// ---------------------------------------------------------------------------------------------
describe('Go: parameters and return type', () => {
  const FIXTURE = `package main

func plain() {}
func withParams(a string, b int) {}
func withReturn(a string) Foo { return x }
func multiReturn() (Foo, error) { return x, nil }
func grouped(a, b string) {}

type S struct{}
func (s *S) Method(x int) string { return "" }
`;

  const CHILD = childFor('./src/lib/core/parsing/languages/go/index.ts', 'GoProvider', '/repo/service.go', 'go');
  let result: SigResult;
  const node = (name: string) => result.nodes.find((n) => n.name === name)!;

  beforeAll(() => { result = runChild(CHILD, FIXTURE) as SigResult; }, 180_000);

  it('records an empty list for a function that genuinely takes none', () => {
    expect(node('plain').params).toEqual([]);
    expect(node('plain').returns).toBeNull();
  });

  it('records name and declared type for typed parameters', () => {
    expect(node('withParams').params).toEqual([
      { name: 'a', type: 'string', optional: false },
      { name: 'b', type: 'int', optional: false },
    ]);
  });

  it('records a single declared return type verbatim', () => {
    expect(node('withReturn').returns).toBe('Foo');
  });

  /**
   * Hard case (Go multi-value return): `func f() (Foo, error)` puts the WHOLE `parameter_list` on
   * the `result` field, not one type. Capturing it verbatim would give the text "(Foo, error)" for
   * what the helper treats as a single declared type — not honest. DECISION: the query's
   * `result: [...]  @return_type` alternation lists only single-type node kinds (type_identifier,
   * qualified_type, generic_type, pointer_type) and deliberately EXCLUDES parameter_list, so a
   * multi-value return simply does not match and `returns` stays null — refuse rather than guess
   * (ADR 0070), same principle as the TS generic-truncation refusal.
   */
  it('refuses a multi-value return rather than fabricating a joined string', () => {
    expect(node('multiReturn').returns).toBeNull();
  });

  /**
   * Hard case (Go grouped params): `func f(a, b string)` is ONE `parameter_declaration` node
   * carrying TWO `name:` fields (both `a` and `b`) and a single `type:`. The frozen
   * `paramsOf()` reads `child.childForFieldName('name')`, which — like tree-sitter's field lookup
   * generally — returns only the FIRST child bound to that field, so `b` is silently lost: the
   * declaration is one namedChild of the parameter_list, and only its first name surfaces. This is
   * a real loss, reported as a finding rather than fixed here (`reflector.ts` is frozen); the test
   * pins the ACTUAL current behavior so a future change to the shared helper is forced to touch
   * this test rather than silently changing what Go reports.
   */
  it('records EVERY name in a grouped parameter declaration', () => {
    // `func f(a, b string)` is ONE node with TWO name children sharing one type. Reading only the
    // first silently understated the arity — fixed by ADR 0087, which reads them all.
    expect(node('grouped').params).toEqual([
      { name: 'a', type: 'string', optional: false },
      { name: 'b', type: 'string', optional: false },
    ]);
  });

  it('records a method parameters and return type the same way, not the receiver', () => {
    expect(node('Method').params).toEqual([{ name: 'x', type: 'int', optional: false }]);
    expect(node('Method').returns).toBe('string');
  });
});

// ---------------------------------------------------------------------------------------------
describe('Rust: parameters and return type', () => {
  const FIXTURE = `
fn plain() {}
fn with_params(a: String, b: i32) {}
fn with_return(a: String) -> Foo { x }

struct S;
impl S {
    fn method(&self, x: i32) -> String { String::new() }
}
`;

  const CHILD = childFor('./src/lib/core/parsing/languages/rust/index.ts', 'RustProvider', '/repo/lib.rs', 'rust');
  let result: SigResult;
  const node = (name: string) => result.nodes.find((n) => n.name === name)!;

  beforeAll(() => { result = runChild(CHILD, FIXTURE) as SigResult; }, 180_000);

  it('records an empty list for a function that genuinely takes none', () => {
    expect(node('plain').params).toEqual([]);
    expect(node('plain').returns).toBeNull();
  });

  it('records name and declared type for typed parameters (pattern field)', () => {
    expect(node('with_params').params).toEqual([
      { name: 'a', type: 'String', optional: false },
      { name: 'b', type: 'i32', optional: false },
    ]);
  });

  it('records the declared return type verbatim', () => {
    expect(node('with_return').returns).toBe('Foo');
  });

  /**
   * Hard case (Rust `&self`): the receiver is a `self_parameter` namedChild of `parameters`, with
   * NO `pattern`/`name`/`type` field of its own. DECISION: keep it AS a parameter — it is written
   * in the parameter list, so leaving it out would misstate the arity a caller sees in the source.
   * The frozen helper's fallback chain (`pattern` -> `name` -> node text) lands on the node's own
   * text, so it is recorded verbatim as `{ name: '&self', type: null, optional: false }` — the same
   * "keep it literal" treatment ADR 0086 already gives a destructured TS parameter.
   */
  it('records &self as a parameter, verbatim, with no declared type', () => {
    expect(node('method').params).toEqual([
      { name: '&self', type: null, optional: false },
      { name: 'x', type: 'i32', optional: false },
    ]);
    expect(node('method').returns).toBe('String');
  });
});

// ---------------------------------------------------------------------------------------------
describe('Swift: parameters and return type', () => {
  const FIXTURE = `
func plain() {}
func withParams(a: String, b: Int) {}
func withReturn(a: String) -> Foo { return x }

class C {
    func method(x: Int) -> String { return "" }
}
`;

  const CHILD = childFor('./src/lib/core/parsing/languages/swift/index.ts', 'SwiftProvider', '/repo/File.swift', 'swift');
  let result: SigResult;
  const node = (name: string) => result.nodes.find((n) => n.name === name)!;

  beforeAll(() => { result = runChild(CHILD, FIXTURE) as SigResult; }, 180_000);

  it('records a declared return type, aliased onto the same field id as the function name', () => {
    expect(node('withReturn').returns).toBe('Foo');
    expect(node('method').returns).toBe('String');
  });

  it('records null when no return type is declared', () => {
    expect(node('plain').returns).toBeNull();
  });

  /**
   * WAS A REPORTED GAP, now FIXED (ADR 0088). tree-sitter-swift has NO wrapper node for value
   * parameters — they are field-less children of `function_declaration`, beside its own name and
   * body — so the original `@params` contract (one node, all children are parameters) could not
   * express it, and capturing the function itself would have pulled in the name and body as fake
   * parameters. The helper now accepts a SECOND capture, `@params_inline`, which tags the function
   * and filters its children by node TYPE. Explicit rather than heuristic: a shape-based guess
   * ("has a type field") would silently drop Ruby's bare identifier parameters.
   *
   * An argument LABEL is kept with the name: `with b: String` records `"with b"`, because both are
   * written and the caller writes the label. Dropping either would misstate the call site.
   */
  it('captures Swift parameters through the inline form, label included', () => {
    expect(node('withParams').params).toEqual([
      { name: 'a', type: 'String', optional: false },
      { name: 'b', type: 'Int', optional: false },
    ]);
    expect(node('method').params).toEqual([{ name: 'x', type: 'Int', optional: false }]);
  });

  /** A Swift function taking nothing records an empty list that MEANS empty, not "not measured". */
  it('records zero parameters for a Swift function that takes none', () => {
    expect(node('plain').params).toEqual([]);
  });
});
