import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * ADR 0119 — a flag the command does not know is an error, not a no-op.
 *
 * Every command's arg parser skipped unknown `--flags` by design. So a typo was accepted silently
 * and the command did something else:
 *
 *   conducks entry --jsn                          human output, exit 0 — the caller believes
 *                                                 it asked for JSON and got it
 *   conducks coverage cov.json --vs-baselin       ran the ORDINARY overlay, exit 0 — the
 *                                                 regression gate never ran, and said nothing
 *
 * The second is the shape ADR 0116 fixed by hand for one command: a gate that cannot fail gates
 * nothing. One dropped letter puts it straight back.
 *
 * The allowed set is derived from each command's own `usage` string, which makes usage the single
 * source of truth: a command that reads a flag it does not advertise now FAILS on that flag, so
 * drift is caught the first time anyone uses it rather than never.
 */
describe('a flag the command does not know is an error', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('flag-contract');
    writeFile(repo, 'src/a.ts', "import { b } from './b.js';\nexport function a(): number { return b() + 1; }\n");
    writeFile(repo, 'src/b.ts', 'export function b(): number { return 2; }\n');
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  }, 300000);

  afterAll(() => rmRepo(repo));

  it('refuses a mistyped flag and names it', () => {
    const { combined, status } = runCli(['entry', '--jsn'], { cwd: repo, allowFail: true });
    expect(status).not.toBe(0);
    expect(combined).toMatch(/--jsn/);
  }, 120000);

  /** The dangerous one: a typo silently downgraded a gate to an ordinary report. */
  it('refuses a mistyped flag rather than running a different mode', () => {
    const { combined, status } = runCli(['status', '--jsonn'], { cwd: repo, allowFail: true });
    expect(status).not.toBe(0);
    expect(combined).not.toMatch(/Structural Synapse Status/);
  }, 120000);

  it('still accepts every flag the command advertises', () => {
    expect(runCli(['entry', '--json'], { cwd: repo }).status).toBe(0);
    expect(runCli(['status', '--json'], { cwd: repo }).status).toBe(0);
    expect(runCli(['impact', 'a', '--json', '--tree'], { cwd: repo, allowFail: true }).status).toBe(0);
  }, 180000);

  it('still accepts the global flags no usage string lists', () => {
    expect(runCli(['status', '--verbose'], { cwd: repo }).status).toBe(0);
    expect(runCli(['status', '--help'], { cwd: repo }).status).toBe(0);
  }, 120000);

  /**
   * `trace`, `prune` and `audit` had no `--json` at all — 12 of the 15 read commands offered it and
   * these three did not, and they are precisely the ones a script wants: a dependency chain, a
   * dead-code list, and a set of integrity findings. Two of the three are gates.
   */
  it('trace, prune and audit answer in JSON', () => {
    for (const args of [['trace', 'a', '--json'], ['prune', '--json'], ['audit', '--json']]) {
      const { stdout } = runCli(args, { cwd: repo, allowFail: true });
      expect(() => JSON.parse(stdout)).not.toThrow();
    }
  }, 240000);
});
