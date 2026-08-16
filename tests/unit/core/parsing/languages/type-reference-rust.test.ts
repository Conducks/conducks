import { describe, it, expect, beforeAll } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * todo10 Phase 4 — Rust had no `pulse_type_target` capture, so TYPE_REFERENCE edges never fired for
 * field/parameter/let/return types, generics, or trait bounds. This pins that the capture is real,
 * not just grammar-valid (see docs/memory.md — a query that compiles can still match zero nodes).
 *
 * Runs in a CHILD PROCESS — see java-extraction.test.ts for why native tree-sitter requires it.
 */
describe('Rust TYPE_REFERENCE edges (todo10 Phase 4)', () => {
  const FIXTURE = `
use std::collections::HashMap;

struct Repo {
    items: Vec<String>,
    mapping: HashMap<String, Vec<i32>>,
    parent: Option<Box<Repo>>,
    display: std::fmt::Result,
}

trait Shape {
    fn area(&self) -> f64;
}

fn process<T: Clone + Shape>(items: &Vec<T>, boxed: Box<dyn Shape>) -> Result<Repo, String> {
    let x: HashMap<String, i32> = HashMap::new();
    let y: Box<dyn Shape> = Box::new(x);
    let z: &Repo = &x;
    Ok(Repo { items: vec![], mapping: HashMap::new(), parent: None, display: Ok(()) })
}

impl Shape for Repo {
    fn area(&self) -> f64 { 0.0 }
}
`;

  const CHILD = `
(async () => {
  const { ConducksReflector } = await import('./src/lib/core/parsing/reflector.ts');
  const { AnalyzeContext } = await import('./src/lib/core/parsing/context.ts');
  const { RustProvider } = await import('./src/lib/core/parsing/languages/rust/index.ts');
  const { RUST_QUERIES } = await import('./src/lib/core/parsing/languages/rust/queries.ts');
  const { grammars } = await import('./src/lib/core/parsing/grammar-registry.ts');

  await grammars.loadLanguage('rust');
  const lang = grammars.getLanguage('rust');

  let compileError = null;
  try { grammars.createQuery(lang, RUST_QUERIES); }
  catch (err) { compileError = String(err && err.message ? err.message : err); }

  const file = { path: '/repo/repo.rs', source: process.argv[1] };
  const s = await new ConducksReflector().reflect(file, new RustProvider(), new AnalyzeContext(), [file.path]);

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
    if (!line) throw new Error(`Rust reflect child produced no result:\n${out}`);
    result = JSON.parse(line.slice(line.indexOf('__RESULT__') + '__RESULT__'.length));
  }, 180_000);

  it('compiles the full Rust query against the installed grammar', () => {
    expect(result.grammarLoaded).toBe(true);
    expect(result.compileError).toBeNull();
  });

  it('produces a NON-ZERO count of TYPE_REFERENCE edges', () => {
    expect(result.typeRefs.length).toBeGreaterThan(0);
  });

  it.each([
    'Vec', 'HashMap', 'Option', 'Box', 'Repo', 'String', 'Clone', 'Shape', 'Result',
  ])('captures %s as a type reference somewhere in the file', (name) => {
    expect(result.typeRefs).toContain(name);
  });

  it('captures a scoped type path (std::fmt::Result) as a single whole target', () => {
    expect(result.typeRefs).toContain('std::fmt::Result');
    // The path prefix must NOT also appear as its own partial capture (that would be double-counting).
    expect(result.typeRefs).not.toContain('std::fmt');
  });
});
