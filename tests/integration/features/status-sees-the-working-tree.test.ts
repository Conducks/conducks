import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * `status` reported SYNCHRONIZED with edited files sitting on disk.
 *
 * Its staleness came from `conducks-core.ts` — `currentHead !== lastPulsedCommit` — which is a claim
 * about GIT, not about the files. Every uncommitted edit, which is the normal state while working,
 * left HEAD untouched, so the line said in-sync about a graph that no longer described the code.
 *
 * MEASURED before the fix: analyze a two-file project, delete the only call to a symbol, and
 * `status` printed `Staleness: SYNCHRONIZED` while `impact` still reported the deleted caller.
 *
 * The content-hash engine that answers this correctly already existed — `classifyFreshness`, the one
 * `monitor` and `watch` share (ADR 0036) — and `status` simply never asked it. Both lines are kept:
 * commits-behind is a real and different question from files-changed, and collapsing them would lose
 * the one that tells you a colleague's commits are missing.
 */
describe('status compares the working tree, not only commits', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('status-freshness');
    writeFile(repo, 'src/dep.ts', 'export function dep(): number { return 1; }\n');
    writeFile(repo, 'src/main.ts',
      "import { dep } from './dep.js';\nexport function run(): number { return dep(); }\n");
    commit(repo, 'init');
    runCli(['analyze'], { cwd: repo });
  }, 300_000);

  afterAll(() => rmRepo(repo));

  const freshness = () => JSON.parse(runCli(['status', '--json'], { cwd: repo }).stdout).freshness;

  it('reports a clean tree as matching the pulse', () => {
    // `tracked` is asserted too, and that is not decoration: the first version of this test passed
    // `repo` where `runCli` wants `{ cwd: repo }`, so every command ran against THIS repository
    // instead of the fixture. Clean-tree expectations all passed while measuring the wrong project
    // (ADR 0044 — a check that ran on nothing is not a pass).
    const f = freshness();
    expect({ changed: f.changed, removed: f.removed, stale: f.stale }).toEqual({ changed: 0, removed: 0, stale: false });
    expect(f.tracked).toBeGreaterThan(0);
  });

  it('sees an UNCOMMITTED edit', () => {
    // The case that broke. Nothing is committed, so the git measure cannot move.
    writeFile(repo, 'src/main.ts',
      "import { dep } from './dep.js';\nexport function run(): number { return dep() + 1; }\n");

    const f = freshness();
    expect({ changed: f.changed, stale: f.stale }).toEqual({ changed: 1, stale: true });
  });

  it('still reports the commit distance separately', () => {
    // The counter-test: the two questions must not be collapsed into one. An edit is not a commit,
    // and the git line stays put while the working tree line moves.
    const out = JSON.parse(runCli(['status', '--json'], { cwd: repo }).stdout);
    expect(out.staleness.stale).toBe(false);
  });
});
