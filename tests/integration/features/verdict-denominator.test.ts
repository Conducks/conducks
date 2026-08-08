import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * The first surface migrated to `Verdict` — proof the type does its job on a real command.
 *
 * `advise` printed `✅ Structural Integrity is Pristine. No sins detected.` whenever the advice list
 * came back empty, with no denominator anywhere, so a repository with 5,294 symbols and a vault with
 * none produced the SAME tick. On a genuinely empty vault it did not even reach that line — it walked
 * an unmaterialised graph and died on the `getAllNodes` guard, so "nothing to check" surfaced as an
 * internal error.
 *
 * This is the pattern every remaining report surface should follow: read the denominator FIRST, and
 * let the type make the empty case impossible to forget.
 */
describe('advise carries the denominator its verdict depends on', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('verdict');
    writeFile(repo, 'package.json', JSON.stringify({ name: 'vd', version: '1.0.0', type: 'module' }));
    writeFile(repo, 'src/index.ts', 'export function alpha(): number { return 1; }\nexport function beta(): number { return alpha(); }\n');
    commit(repo, 'a project to advise on');
    runCli(['analyze', '--force', '--yes'], { cwd: repo });
  }, 180000);

  afterAll(() => rmRepo(repo));

  const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

  it('a real pass states how many symbols it examined', () => {
    const out = plain(runCli(['advise'], { cwd: repo, allowFail: true }).combined);
    // The count is what separates this from the empty case below. Without it the two are one claim.
    expect(out).toMatch(/\d+ symbol\(s\) examined/);
    expect(out).not.toMatch(/nothing was checked/);
  });

  it('the JSON answer carries checked, not a bare array', () => {
    const j = JSON.parse(runCli(['advise', '--json'], { cwd: repo }).stdout);
    expect(j.status).toBe('clean');
    expect(j.checked).toBeGreaterThan(0);
    expect(Array.isArray(j.found)).toBe(true);
  });

  it('an EMPTY vault says nothing was checked — it never claims pristine', () => {
    runCli(['clean'], { cwd: repo, allowFail: true });
    const r = runCli(['advise'], { cwd: repo, allowFail: true });
    const out = plain(r.combined);

    expect(out).toMatch(/nothing was checked/i);
    expect(out).toMatch(/run `conducks analyze`/);
    // The exact sentence the old code printed on this input.
    expect(out).not.toMatch(/Pristine|No sins detected/i);
    // And it must not resurface as the crash it used to be.
    expect(out).not.toMatch(/not materialised|Execution Error/i);
  });

  it('the empty JSON answer is distinguishable from a clean one BY A MACHINE', () => {
    const j = JSON.parse(runCli(['advise', '--json'], { cwd: repo }).stdout);
    // An agent reading `[]` cannot tell these apart, and acts on the answer silently.
    expect(j.status).toBe('nothing-to-check');
    expect(j.checked).toBe(0);
    expect(j.why).toMatch(/no symbols/i);
  });

  it('analyze restores it, and the verdict returns to a counted pass', () => {
    runCli(['analyze', '--force', '--yes'], { cwd: repo });
    const j = JSON.parse(runCli(['advise', '--json'], { cwd: repo }).stdout);
    expect(j.status).toBe('clean');
    expect(j.checked).toBeGreaterThan(0);
  }, 180000);
});
