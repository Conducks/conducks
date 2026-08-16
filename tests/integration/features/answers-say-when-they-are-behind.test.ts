import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * The commands that ANSWER questions never asked whether the graph still describes the code.
 *
 * `status` was taught to compare the working tree (its staleness was a git measure and could not
 * move until something was committed). `impact` and `prune` were not, so they stated confident
 * results about a graph built before the edit that prompted the question — which is exactly the case
 * that started this: deleting the only call to a symbol and being told the caller still exists.
 *
 * A WARNING, never a refusal and never a change to the answer. ADR 0036 makes a daemon an
 * accelerator and never a requirement, and refusing would break every CI use where the vault is
 * built once and read many times. On STDERR, because the export oracle parses `prune --json` and a
 * warning on stdout would break it — asserted below rather than assumed.
 */
describe('an answer says when it is behind the working tree', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('stale-warning');
    writeFile(repo, 'src/dep.ts', 'export function dep(): number { return 1; }\n');
    writeFile(repo, 'src/main.ts',
      "import { dep } from './dep.js';\nexport function run(): number { return dep(); }\n");
    commit(repo, 'init');
    runCli(['analyze'], { cwd: repo });
  }, 300_000);

  afterAll(() => rmRepo(repo));

  const edit = () => writeFile(repo, 'src/main.ts',
    "import { dep } from './dep.js';\nexport function run(): number { return dep() + 1; }\n");

  it('says nothing while the tree matches the pulse', () => {
    // The counter-test. A warning on every run is a warning nobody reads.
    const res = runCli(['impact', 'dep', 'upstream'], { cwd: repo });
    expect(res.stderr).not.toContain('behind the working tree');
  });

  it('warns from impact once a file has changed', () => {
    edit();
    const res = runCli(['impact', 'dep', 'upstream'], { cwd: repo });

    expect(res.stderr).toContain('behind the working tree');
    expect(res.stderr).toContain('1 file(s) changed');
  });

  it('warns from prune too', () => {
    edit();
    const res = runCli(['prune'], { cwd: repo });

    expect(res.stderr).toContain('behind the working tree');
  });

  it('keeps `prune --json` parseable, warning and all', () => {
    // The export oracle reads this stream. A warning printed to stdout would break every gate that
    // depends on it, which is why the sink is asserted and not merely intended.
    edit();
    const res = runCli(['prune', '--json'], { cwd: repo });

    expect(() => JSON.parse(res.stdout)).not.toThrow();
    expect(res.stdout).not.toContain('behind the working tree');
  });

  it('still answers rather than refusing', () => {
    edit();
    const res = runCli(['impact', 'dep', 'upstream'], { cwd: repo });

    expect(res.status).toBe(0);
    expect(res.stdout).toContain('Impact Report');
  });
});
