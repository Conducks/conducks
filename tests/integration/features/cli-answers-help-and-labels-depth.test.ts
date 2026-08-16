import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * Two output defects that had been checked by eye and by nothing else.
 *
 * `conducks --help` answered `Unknown command "--help"` and exited 1. A first run that fails is a
 * bad first run, and `-h` did the same. The per-command form (`conducks impact --help`) already
 * worked and must keep working — the flag has two meanings depending on whether a command precedes
 * it, and the fix has to keep both.
 *
 * `impact` prints a TRANSITIVE blast radius at the default depth of 5, as a bare count: on a real
 * subject `createLogger` reads "409 Symbols affected" where 71 are direct. A reader asking "who
 * calls this" takes the headline as the answer to that question. The flag existed; the label did not.
 */
describe('the CLI answers --help and labels its depth', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('help-and-depth');
    writeFile(repo, 'src/dep.ts', 'export function dep(): number { return 1; }\n');
    writeFile(repo, 'src/main.ts',
      "import { dep } from './dep.js';\nexport function run(): number { return dep(); }\n");
    commit(repo, 'init');
    runCli(['analyze'], { cwd: repo });
  }, 300_000);

  afterAll(() => rmRepo(repo));

  for (const flag of ['--help', '-h']) {
    it(`prints the command LIST for ${flag}`, () => {
      const res = runCli([flag], { cwd: repo, allowFail: true });

      expect(res.status).toBe(0);
      expect(res.combined).toContain('impact');
      expect(res.combined).toContain('prune');
      expect(res.combined).not.toContain('Unknown command');
    });
  }

  it('still prints ONE command usage for `impact --help`', () => {
    // The counter-test. The same flag means "this command's usage" once a command precedes it, and
    // a fix that swallowed it here would trade one broken form for another.
    const res = runCli(['impact', '--help'], { cwd: repo, allowFail: true });

    expect(res.combined).toContain('blast radius');
    expect(res.combined).not.toContain('prune');
  });

  it('says the impact headline counts hops, not direct callers', () => {
    const out = runCli(['impact', 'dep', 'upstream'], { cwd: repo }).combined;

    expect(out).toContain('Symbols affected');
    expect(out).toMatch(/up to 5 hops/);
  });

  it('says "direct only" when asked for depth 1', () => {
    const out = runCli(['impact', 'dep', 'upstream', '--depth', '1'], { cwd: repo }).combined;

    expect(out).toContain('(direct only)');
    expect(out).not.toMatch(/up to \d+ hops/);
  });
});
