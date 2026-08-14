import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * `::` means two different things, and the linker only knew one of them.
 *
 * A resolved node id is `<filePath>::<symbol>`, so `IntraLinker` skipped every edge whose target
 * contained `::` as "already resolved". Rust's path separator is also `::`, so `helper::alpha()`
 * was handed back untouched — and the external-induction pass then invented a phantom
 * `helper::alpha` node for it (`filePath: external://helper/alpha`), because the rule that decides
 * "is this namespace local" only recognises `.ts` and `.js`.
 *
 * The result: the call edge pointed at a node that was not the declaration, so the real function
 * had no callers. MEASURED against rustc on this exact fixture — rustc reports **only `beta`** as
 * never used, while conducks reported BOTH `alpha` and `beta` as ORPHAN and found 0 callers for
 * `alpha`. Two of the two functions flagged, one of them wrong.
 *
 * The second half of the fix is `mod helper;` being captured as an import at all. `RustResolver`
 * has always known how to map a module declaration to `helper.rs` or `helper/mod.rs` — its own
 * docstring says "Maps Rust 'use' and 'mod' declarations to file paths" — but nothing captured a
 * `mod_item`, so half of it was unreachable and there was no import edge to resolve against.
 *
 * Scored against rustc rather than against a hand-written expectation: the compiler is the only
 * authority on which Rust function is dead, and this test is worthless if it merely agrees with
 * whatever conducks currently prints.
 */
describe('a Rust scoped call resolves to the declaration, not a phantom', () => {
  let repo: string;
  let findings: Array<{ type: string; symbol: string }>;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('rust-scoped-call');

    // `alpha` is called through the module path. `beta` is not called at all.
    // Verified with `rustc --edition 2021`: the only warning is "function `beta` is never used".
    writeFile(repo, 'src/helper.rs', `
pub fn alpha() -> i32 { 1 }
pub fn beta() -> i32 { 2 }
`);
    // The call is a real call_expression, NOT inside a macro — a macro body is an unparsed
    // token_tree in tree-sitter-rust, so `println!("{}", helper::alpha())` contains no call node at
    // all and would make this test pass for the wrong reason.
    writeFile(repo, 'src/main.rs', `
mod helper;

fn main() {
    let v = helper::alpha();
    std::process::exit(v);
}
`);

    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
    const { stdout } = runCli(['prune', '--json'], { cwd: repo });
    findings = JSON.parse(stdout) as Array<{ type: string; symbol: string }>;
  }, 180000);

  afterAll(() => rmRepo(repo));

  it('does not call a function dead that the module path reaches', () => {
    // Named, not counted: "1 finding" would not say WHICH one survived.
    const flagged = findings.map(f => f.symbol.toLowerCase());
    expect({ alpha: flagged.includes('alpha'), beta: flagged.includes('beta') })
      .toEqual({ alpha: false, beta: true });
  });

  it('still finds the genuinely dead one — the fix is not just silence', () => {
    // Precision without recall is free: resolving nothing at all would also stop flagging `alpha`.
    // rustc says `beta` is dead, so conducks must still say so.
    expect(findings.some(f => f.symbol.toLowerCase() === 'beta')).toBe(true);
  });
});
