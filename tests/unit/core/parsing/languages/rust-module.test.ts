import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RustResolver } from '@/lib/core/parsing/languages/rust/resolver.js';
import { hasRegisteringDecorator, isRegisteringDecorator } from '@/contracts/index.js';

/**
 * Rust module paths, on a real two-crate Cargo workspace on disk (the resolver reads Cargo.toml):
 *
 *   - the RESOLVER: a crate name, `crate::`, `self::`, `super::` and `mod x;` each map to the file
 *     that declares the module, and a path into the standard library maps to nothing;
 *   - the REFLECTOR: `mod a;` is an import of a.rs, while `mod b { ... }` declares its module INLINE
 *     and names no file. Captured as an import, the inline one was handed to the fuzzy fallback, which
 *     bound `mod tests { }` in lib.rs to `util/tests.rs`, a file lib.rs never mentions;
 *   - a QUALIFIED CALL `core_lib::util::third()` carries the file its module path names, so the
 *     linker can look `third` up in util.rs. Only main.rs's IMPORTS were searched before, and main.rs
 *     imports lib.rs, which does not define `third`;
 *   - `#[test]` is a registration, `#[inline]` is not.
 *
 * Runs the reflector in a CHILD PROCESS — see java-extraction.test.ts for why native tree-sitter
 * requires it.
 */
let root: string;
const write = (rel: string, body: string) => {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
};
const FILES = [
  'Cargo.toml',
  'crates/core_lib/Cargo.toml', 'crates/core_lib/src/lib.rs', 'crates/core_lib/src/util.rs',
  'crates/core_lib/src/util/tests.rs', 'crates/core_lib/src/net/mod.rs', 'crates/core_lib/src/net/tcp.rs',
  'crates/app/Cargo.toml', 'crates/app/src/main.rs', 'crates/app/src/vec.rs',
  // A FIXTURE WORKSPACE inside the tree, repeating the crate names — the shape of a gate's test
  // fixtures (measured on the 27-crate workspace: `cli` declared 8 times, `docs` about 60).
  'crates/gates/tests/fixtures/one/Cargo.toml',
  'crates/gates/tests/fixtures/one/crates/core_lib/Cargo.toml', 'crates/gates/tests/fixtures/one/crates/core_lib/src/lib.rs',
  'crates/gates/tests/fixtures/one/crates/app/Cargo.toml', 'crates/gates/tests/fixtures/one/crates/app/src/main.rs',
  // Two crates of ONE name in ONE workspace: nothing tells them apart, so nothing is chosen.
  'dup/Cargo.toml', 'dup/a/Cargo.toml', 'dup/a/src/lib.rs', 'dup/b/Cargo.toml', 'dup/b/src/lib.rs',
  'dup/user/Cargo.toml', 'dup/user/src/main.rs',
];
const abs = (rel: string) => path.join(root, rel);
const rsFiles = () => FILES.filter(f => f.endsWith('.rs')).map(abs);

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-rust-module-'));
  write('Cargo.toml', '[workspace]\nmembers = ["crates/core_lib", "crates/app"]\n');
  write('crates/core_lib/Cargo.toml', '[package]\nname = "core-lib"\nversion = "0.1.0"\n');
  write('crates/core_lib/src/lib.rs', 'pub mod util;\npub mod net;\n');
  write('crates/core_lib/src/util.rs', 'pub fn third() -> i32 { 3 }\n#[cfg(test)]\nmod tests;\n');
  write('crates/core_lib/src/util/tests.rs', 'use super::*;\n');
  write('crates/core_lib/src/net/mod.rs', 'pub mod tcp;\n');
  write('crates/core_lib/src/net/tcp.rs', 'pub fn connect() {}\n');
  write('crates/app/Cargo.toml', '[package]\nname = "app"\nversion = "0.1.0"\n');
  write('crates/app/src/main.rs', 'fn main() {}\n');
  write('crates/app/src/vec.rs', '');
  const fx = 'crates/gates/tests/fixtures/one';
  write(`${fx}/Cargo.toml`, '[workspace]\nmembers = ["crates/*"]\n');
  write(`${fx}/crates/core_lib/Cargo.toml`, '[package]\nname = "core-lib"\nversion = "0.1.0"\n');
  write(`${fx}/crates/core_lib/src/lib.rs`, '');
  write(`${fx}/crates/app/Cargo.toml`, '[package]\nname = "app"\nversion = "0.1.0"\n');
  write(`${fx}/crates/app/src/main.rs`, '');
  write('dup/Cargo.toml', '[workspace]\nmembers = ["a", "b", "user"]\n');
  write('dup/a/Cargo.toml', '[package]\nname = "twin"\n');
  write('dup/a/src/lib.rs', '');
  write('dup/b/Cargo.toml', '[package]\nname = "twin"\n');
  write('dup/b/src/lib.rs', '');
  write('dup/user/Cargo.toml', '[package]\nname = "user"\n');
  write('dup/user/src/main.rs', '');
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('RustResolver: a module path names the file that declares it', () => {
  const resolve = (spec: string, from: string) => new RustResolver().resolve(spec, abs(from), rsFiles());

  it.each([
    ['core_lib', 'crates/app/src/main.rs', 'crates/core_lib/src/lib.rs'],          // crate name, `-` → `_`
    ['core_lib::util::third', 'crates/app/src/main.rs', 'crates/core_lib/src/util.rs'],
    ['core_lib::net::tcp', 'crates/app/src/main.rs', 'crates/core_lib/src/net/tcp.rs'],
    ['crate::util', 'crates/core_lib/src/net/tcp.rs', 'crates/core_lib/src/util.rs'],
    ['crate', 'crates/core_lib/src/net/tcp.rs', 'crates/core_lib/src/lib.rs'],
    ['super', 'crates/core_lib/src/util/tests.rs', 'crates/core_lib/src/util.rs'],
    ['super::super', 'crates/core_lib/src/net/tcp.rs', 'crates/core_lib/src/lib.rs'],
    ['self::tcp', 'crates/core_lib/src/net/mod.rs', 'crates/core_lib/src/net/tcp.rs'],
    ['tests', 'crates/core_lib/src/util.rs', 'crates/core_lib/src/util/tests.rs'],  // `mod tests;` in util.rs
    ['tcp', 'crates/core_lib/src/net/mod.rs', 'crates/core_lib/src/net/tcp.rs'],    // `mod tcp;` in mod.rs
    // A crate name means the crate of THAT name in the importer's own workspace.
    ['core_lib', 'crates/gates/tests/fixtures/one/crates/app/src/main.rs', 'crates/gates/tests/fixtures/one/crates/core_lib/src/lib.rs'],
  ])('%s from %s → %s', (spec, from, to) => {
    expect(resolve(spec, from)).toBe(abs(to));
  });

  it.each([
    ['std::process', 'crates/app/src/main.rs'],     // the standard library is not in the tree
    ['tests', 'crates/core_lib/src/lib.rs'],         // lib.rs's child `tests` would be src/tests.rs, which does not exist
    ['serde::Deserialize', 'crates/app/src/main.rs'],
    ['twin', 'dup/user/src/main.rs'],               // two `twin` crates in one workspace: refused, not guessed
  ])('%s from %s → nothing', (spec, from) => {
    expect(resolve(spec, from)).toBeUndefined();
  });
});

describe('Rust attributes as decorators', () => {
  it.each(['#[test]', '#[tokio::test]', '#[tokio::main]', '#[no_mangle]', '#[get("/x")]'])(
    '%s registers the function', a => expect(isRegisteringDecorator(a)).toBe(true));

  // rustc still reports a function carrying only these as never used, so they must not excuse it.
  it.each(['#[inline]', '#[inline(always)]', '#[must_use]', '#[allow(dead_code)]', '#[cfg(test)]',
    '#[doc = "x"]', '#[deprecated(note = "x")]', '#[track_caller]', '#[cold]', '#[rustfmt::skip]'])(
    '%s is a pure modifier', a => expect(isRegisteringDecorator(a)).toBe(false));

  it('one registering attribute among modifiers is enough', () => {
    expect(hasRegisteringDecorator(['#[inline]', '#[test]'])).toBe(true);
    expect(hasRegisteringDecorator(['#[inline]', '#[must_use]'])).toBe(false);
  });
});

describe('Rust reflection: inline modules, qualified calls, attributes', () => {
  const MAIN = `
mod vec;
mod inline_mod {
    pub fn inside() {}
}

#[test]
fn a_test() {}

#[inline]
#[must_use]
fn modified() -> i32 { 0 }

fn main() {
    core_lib::util::third();
    core_lib::net::tcp::connect();
    let v: Vec<i32> = Vec::new();
    std::process::exit(0);
    inline_mod::inside();
}
`;

  const CHILD = `
(async () => {
  const { ConducksReflector } = await import('./src/lib/core/parsing/reflector.ts');
  const { AnalyzeContext } = await import('./src/lib/core/parsing/context.ts');
  const { RustProvider } = await import('./src/lib/core/parsing/languages/rust/index.ts');
  const { grammars } = await import('./src/lib/core/parsing/grammar-registry.ts');
  await grammars.loadLanguage('rust');
  const [filePath, source, all] = process.argv.slice(1);
  const file = { path: filePath, source };
  const s = await new ConducksReflector().reflect(file, new RustProvider(), new AnalyzeContext(), JSON.parse(all));
  console.log('__RESULT__' + JSON.stringify({
    imports: s.relationships.filter((r) => r.type === 'IMPORTS').map((r) => r.metadata && r.metadata.specifier),
    calls: s.relationships.filter((r) => r.type === 'CALLS' || r.type === 'CONSTRUCTS')
      .map((r) => ({ target: r.targetName, qualifierFile: (r.metadata && r.metadata.qualifierFile) || null })),
    decorators: Object.fromEntries(s.nodes.filter((n) => n.name)
      .map((n) => [n.name, (n.metadata && n.metadata.dna && n.metadata.dna.decorators) || []])),
  }));
})();
`;

  let result: {
    imports: string[];
    calls: Array<{ target: string; qualifierFile: string | null }>;
    decorators: Record<string, string[]>;
  };

  beforeAll(() => {
    const tsx = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
    const out = execFileSync(tsx, ['-e', CHILD, abs('crates/app/src/main.rs'), MAIN, JSON.stringify(rsFiles())], {
      cwd: process.cwd(), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    });
    const line = out.split('\n').find((l) => l.includes('__RESULT__'));
    if (!line) throw new Error(`Rust reflect child produced no result:\n${out}`);
    result = JSON.parse(line.slice(line.indexOf('__RESULT__') + '__RESULT__'.length));
  }, 180_000);

  it('`mod vec;` is an import; the inline `mod inline_mod { }` is not', () => {
    expect(result.imports).toContain('vec');
    expect(result.imports).not.toContain('inline_mod');
  });

  const qualifierOf = (target: string) => result.calls.find(c => c.target === target)?.qualifierFile;

  it('a call through a crate path carries the file its module path names', () => {
    expect(qualifierOf('core_lib::util::third')).toBe(abs('crates/core_lib/src/util.rs').toLowerCase());
    expect(qualifierOf('core_lib::net::tcp::connect')).toBe(abs('crates/core_lib/src/net/tcp.rs').toLowerCase());
  });

  it('a TYPE prefix is not a module: `Vec::new` does not bind to the child module vec.rs', () => {
    // The resolver matches files case-insensitively (vault ids are lower-cased), so without the
    // casing rule `Vec` would name `vec.rs`.
    expect(result.calls.some(c => c.target === 'vec::new')).toBe(true);
    expect(qualifierOf('vec::new')).toBeNull();
  });

  it('a path into the standard library or into this same file carries nothing', () => {
    expect(qualifierOf('std::process::exit')).toBeNull();
    expect(qualifierOf('inline_mod::inside')).toBeNull();
  });

  it('a preceding `#[...]` attribute is recorded as a decorator of the function', () => {
    expect(result.decorators['a_test']).toEqual(['#[test]']);
    expect(result.decorators['modified']).toEqual(['#[inline]', '#[must_use]']);
    expect(result.decorators['main']).toEqual([]);
  });
});
