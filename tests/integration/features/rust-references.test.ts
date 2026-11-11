import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * The ways Rust USES a name without calling it, each of which left a live item reported dead.
 *
 * MEASURED on the 27-crate workspace (945 files) after calls and tests were fixed: of 262 ORPHAN
 * verdicts, 76 were struct/enum names, and `BlobsImpl { .. }`, `Arc::new(HeaderJudge)`,
 * `ConflictKind::Referenced` and `&cli::StdHost` were all live. Trait-impl methods (`fmt` of a
 * `Display` impl) were reported too — the trait machinery calls them, and rustc never warns on one.
 * A binary in `src/bin/` was not parsed at all: the default ignore list skipped every `bin/`.
 *
 * Not compiled here (no cargo on this machine). By the language's rules exactly two items are dead:
 * `ImplOnly` (rustc: "struct `ImplOnly` is never constructed" — an `impl` block is not a use) and
 * `never`. Every other name below is constructed, matched, called or reached through a trait.
 */
describe('Rust names used without a call are not dead (rust)', () => {
  let repo: string;
  let flagged: string[];

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('rust-references');
    writeFile(repo, 'Cargo.toml', `[package]\nname = "cat"\nversion = "0.1.0"\nedition = "2021"\n`);
    writeFile(repo, 'src/lib.rs', `
pub mod ports;
pub mod things;
pub mod other;
pub use ports::StdHost;
pub use things::make;
`);
    writeFile(repo, 'src/ports.rs', `
pub struct StdHost;
`);
    // Two types, each with a `new`. Only `Beta::new` is called — from things.rs, where Alpha lives.
    writeFile(repo, 'src/other.rs', `
pub struct Beta;
impl Beta {
    pub fn new() -> Self { Beta }
}
`);
    writeFile(repo, 'src/things.rs', `
use crate::other::Beta;

pub trait Check { fn check(&self) -> bool; }

pub struct Alpha;
impl Alpha {
    pub fn new() -> Self { Alpha }
}

struct LitStruct { n: i32 }
struct UnitStruct;
struct ImplOnly;
pub enum Kind { A, B }
struct Shown;

impl Check for UnitStruct { fn check(&self) -> bool { true } }
impl Check for ImplOnly { fn check(&self) -> bool { false } }
impl std::fmt::Display for Shown {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result { write!(f, "x") }
}

pub fn make() -> Box<dyn Check> {
    let l = LitStruct { n: 1 };
    let k = Kind::A;
    let s = Shown.to_string();
    let _ = (l.n, s, matches!(k, Kind::B));
    let _b = Beta::new();
    let _parsed: Result<i32, String> = "1".parse::<i32>().map_err(to_err);
    Box::new(UnitStruct)
}

// Passed as a VALUE, never called by name: map_err(to_err).
fn to_err(e: std::num::ParseIntError) -> String { e.to_string() }

fn never() {}
`);
    // A binary target. Cargo puts it in src/bin/, which the ignore list used to skip as build output.
    writeFile(repo, 'src/bin/app.rs', `
use cat::make;

fn main() {
    let _h = &cat::StdHost;
    let c = make();
    std::process::exit(c.check() as i32);
}
`);
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
    const { stdout } = runCli(['prune', '--json'], { cwd: repo });
    flagged = (JSON.parse(stdout) as Array<{ symbol: string }>).map(f => f.symbol.toLowerCase());
  }, 180000);

  afterAll(() => rmRepo(repo));

  it('flags exactly the two dead items, and nothing that is constructed, matched or reached by a trait', () => {
    // Named, not counted: a count cannot say WHICH verdict is wrong.
    const names = ['stdhost', 'litstruct', 'unitstruct', 'implonly', 'kind', 'shown', 'fmt', 'check', 'make', 'to_err', 'never', 'main'];
    const verdict = Object.fromEntries(names.map(s => [s, flagged.includes(s)]));
    expect(verdict).toEqual({
      stdhost: false, litstruct: false, unitstruct: false, implonly: true, kind: false,
      shown: false, fmt: false, check: false, make: false, to_err: false, never: true, main: false,
    });
  });

  it("`Type::new()` reaches THAT type's `new`, not the first `new` in scope", () => {
    // Before: `Beta::new()` bound to Alpha's `new` — first `new` in the caller's file — so Beta's
    // was reported dead. rustc would report Alpha's instead, but prune cannot say so here, by design:
    // the dangling `Box::new` spares every symbol named `new` (a dangling NAME protects the name).
    const { stdout } = runCli(['prune', '--json'], { cwd: repo });
    const news = (JSON.parse(stdout) as Array<{ symbol: string; file: string }>)
      .filter(f => f.symbol === 'new').map(f => f.file.split('/').pop());
    expect(news).not.toContain('other.rs');
  });

  it('a path into another module reaches the declaration: impact finds the binary', () => {
    // A name is also spared by a DANGLING reference of the same name, so the verdict alone cannot
    // show that `&cat::StdHost` reached `ports.rs`. The caller list can.
    const { stdout } = runCli(['impact', 'StdHost', 'upstream', '--json'], { cwd: repo });
    const ids = (JSON.parse(stdout).affectedNodes as Array<{ id: string }>).map(n => n.id.toLowerCase());
    expect(ids.some(id => id.includes('src/bin/app.rs'))).toBe(true);
  });
});
