import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * `self.step()` in Rust is a call to the method `step` of the same impl — the implicit receiver,
 * spelled `this.` in TypeScript and `self.` in Python. The call processor strips the receiver for
 * those two and kept Rust's, so the target stayed `self.step` and matched nothing.
 *
 * MEASURED on the 27-crate workspace (945 files): 157 of 685 ORPHAN verdicts were methods called as
 * `self.<name>(...)` in their own file — `write_new` in crdt/door.rs, `ids_of` in
 * index-trigram/segments — each a wrong delete verdict on code the program runs.
 *
 * Not compiled here (no cargo on the machine this was written on). By the language's rules `idle`
 * is the one method nothing calls — rustc's dead_code lint reports "method `idle` is never used" —
 * and `step` is reached from `main` through `run`.
 */
describe('a Rust `self.method()` call reaches the method (rust)', () => {
  let repo: string;
  let flagged: string[];

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('rust-self-call');
    writeFile(repo, 'src/main.rs', `
struct Engine { n: i32 }

impl Engine {
    fn new() -> Self { Engine { n: 1 } }
    fn run(&self) -> i32 { self.step() + 1 }
    fn step(&self) -> i32 { self.n }
    fn idle(&self) -> i32 { 0 }
}

fn main() {
    let e = Engine::new();
    std::process::exit(e.run());
}
`);
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
    const { stdout } = runCli(['prune', '--json'], { cwd: repo });
    flagged = (JSON.parse(stdout) as Array<{ symbol: string }>).map(f => f.symbol.toLowerCase());
  }, 180000);

  afterAll(() => rmRepo(repo));

  it('does not call a method dead that `self.` reaches, and still flags the one nothing calls', () => {
    // Both halves at once: resolving nothing would also stop flagging `step`. `run` is reached
    // only through the local `e.run()`, the other receiver shape a method call has.
    expect({ step: flagged.includes('step'), run: flagged.includes('run'), idle: flagged.includes('idle') })
      .toEqual({ step: false, run: false, idle: true });
  });

  it('impact finds the caller through self', () => {
    const { stdout } = runCli(['impact', 'step', 'upstream', '--json'], { cwd: repo });
    const ids = (JSON.parse(stdout).affectedNodes as Array<{ id: string }>).map(n => n.id.toLowerCase());
    expect(ids.some(id => id.endsWith('.run') || id.endsWith('::run'))).toBe(true);
  });
});
