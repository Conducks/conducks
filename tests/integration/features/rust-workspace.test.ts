import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * A Cargo WORKSPACE: two crates, one using the other by its crate name. The three facts the
 * graph got wrong on a real 27-crate workspace (measured 2026-11-11, 945 files):
 *
 *   1. `use core_lib::helper;` and `core_lib::util::third()` name a sibling crate. The resolver
 *      only knew `crate::` and `mod x;`, so the crate name resolved to nothing, the call became a
 *      phantom `external://core_lib/...` node, and `impact helper` found 0 callers while `main`
 *      plainly calls it. `third` was then reported dead.
 *   2. `#[cfg(test)] mod tests;` puts tests in `tests.rs`, a name the test-path contract did not
 *      know, so 2,252 of 3,070 prune findings on that workspace were test functions.
 *   3. `#[cfg(test)] mod tests { #[test] fn ... }` inline: same tests, same wrong verdict.
 *
 * Scored against rustc, the only authority on which Rust function is dead: `cargo check` on this
 * exact fixture warns about ONE function, `unused`, and nothing else. Everything the test names
 * below is a function rustc compiles and links; calling any of them dead is a wrong delete verdict.
 */
describe('a Cargo workspace: crate names resolve, tests are tests (rust)', () => {
  let repo: string;
  let flagged: string[];

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('rust-workspace');
    writeFile(repo, 'Cargo.toml', `[workspace]\nmembers = ["crates/core_lib", "crates/app"]\nresolver = "2"\n`);
    // The crate is NAMED with a hyphen and USED with an underscore, as Cargo requires.
    writeFile(repo, 'crates/core_lib/Cargo.toml', `[package]\nname = "core-lib"\nversion = "0.1.0"\nedition = "2021"\n`);
    writeFile(repo, 'crates/core_lib/src/lib.rs', `
pub mod util;
pub use util::helper;

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn inline_test() {
        assert_eq!(helper(), 1);
    }
}
`);
    // util.rs is not mod.rs, so its child module lives in util/tests.rs.
    writeFile(repo, 'crates/core_lib/src/util.rs', `
pub fn helper() -> i32 { 1 }
pub fn third() -> i32 { 3 }
fn unused() -> i32 { 0 }

#[cfg(test)]
mod tests;
`);
    writeFile(repo, 'crates/core_lib/src/util/tests.rs', `
use super::*;
#[test]
fn file_test() {
    assert_eq!(third(), 3);
}
`);
    writeFile(repo, 'crates/app/Cargo.toml', `[package]\nname = "app"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\ncore-lib = { path = "../core_lib" }\n`);
    writeFile(repo, 'crates/app/src/main.rs', `
use core_lib::helper;

fn main() {
    let a = helper();
    let b = core_lib::util::third();
    std::process::exit(a + b);
}
`);
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
    const { stdout } = runCli(['prune', '--json'], { cwd: repo });
    flagged = (JSON.parse(stdout) as Array<{ symbol: string }>).map(f => f.symbol.toLowerCase());
  }, 180000);

  afterAll(() => rmRepo(repo));

  const callersOf = (symbol: string): string[] => {
    const { stdout } = runCli(['impact', symbol, 'upstream', '--json'], { cwd: repo });
    return (JSON.parse(stdout).affectedNodes as Array<{ id: string }>).map(n => n.id.toLowerCase());
  };

  it('flags exactly what rustc flags: unused, and nothing that is called or is a test', () => {
    // Named, not counted: a count cannot say WHICH verdict is wrong.
    const verdict = Object.fromEntries(['helper', 'third', 'unused', 'inline_test', 'file_test', 'main']
      .map(s => [s, flagged.includes(s)]));
    expect(verdict).toEqual({ helper: false, third: false, unused: true, inline_test: false, file_test: false, main: false });
  });

  it('a call through the crate name reaches the declaration: impact finds main', () => {
    // `use core_lib::helper;` then `helper()`; and the fully qualified `core_lib::util::third()`.
    expect(callersOf('helper').some(id => id.includes('crates/app/src/main.rs'))).toBe(true);
    expect(callersOf('third').some(id => id.includes('crates/app/src/main.rs'))).toBe(true);
  });
});
