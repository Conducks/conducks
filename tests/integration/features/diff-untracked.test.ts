import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * The PR risk engine must see a file git does not track yet.
 *
 * `diff` collected changes with `git diff -U0 HEAD`, which reports nothing for an UNTRACKED path —
 * a brand-new file is not tracked until it is added. Measured on a populated vault: adding
 * `src/payments.ts` with a `PaymentProcessor` class and two methods produced
 *
 *     No structural changes detected in workspace.        (exit 0)
 *
 * from the command whose entire job is to say what a change set puts at risk. Running `git add` on
 * the same file changed the answer, which is the tell.
 *
 * SAME ROOT CAUSE as the `watch` blind spot closed in todo51, found the same day in a second place:
 * an empty `git diff` for an untracked path is not evidence that nothing changed. ADR 0122 had
 * already fixed the STAGED half of this blind spot here (bare `git diff` shows unstaged only); the
 * new-file half survived that fix, which is why this is pinned rather than trusted to the comment.
 */
describe('diff sees untracked new files', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('diffuntracked');
    writeFile(repo, 'package.json', JSON.stringify({ name: 'du', version: '1.0.0', type: 'module' }));
    writeFile(repo, 'src/index.ts', 'export function alpha(): number { return 1; }\n');
    commit(repo, 'a tracked baseline');
    runCli(['analyze', '--force', '--yes'], { cwd: repo });
  }, 180000);

  afterAll(() => rmRepo(repo));

  const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

  it('a clean tree still reports no changes — the fix must not invent them', () => {
    const out = plain(runCli(['diff'], { cwd: repo, allowFail: true }).combined);
    expect(out).toMatch(/no structural changes/i);
  });

  it('a brand-new UNTRACKED module is no longer invisible', () => {
    writeFile(repo, 'src/payments.ts', 'export class PaymentProcessor {\n  charge(n: number): number { return n; }\n  refund(n: number): number { return -n; }\n}\n');
    const out = plain(runCli(['diff'], { cwd: repo, allowFail: true }).combined);
    // The exact sentence the old code printed for this input.
    expect(out).not.toMatch(/No structural changes detected/);
  });

  it('once indexed, that untracked module produces a real risk profile', () => {
    // `analyze` indexes it despite git not tracking it, so the symbols now exist — this is the
    // end-to-end proof that the change reaches the risk calculation and not merely the file list.
    runCli(['analyze', '--force', '--yes'], { cwd: repo });
    const out = plain(runCli(['diff'], { cwd: repo, allowFail: true }).combined);
    expect(out).toMatch(/symbols impacted/i);
    expect(out).toMatch(/PR Risk Profile/);
    expect(out).toMatch(/payments\.ts/);
  }, 180000);

  it('gitignored files stay out — otherwise every build artifact becomes a structural change', () => {
    writeFile(repo, '.gitignore', 'ignored/\n');
    writeFile(repo, 'ignored/generated.ts', 'export function machineWritten(): number { return 0; }\n');
    const out = plain(runCli(['diff'], { cwd: repo, allowFail: true }).combined);
    // `--exclude-standard` is what keeps node_modules and build output from drowning the report.
    expect(out).not.toMatch(/generated\.ts/);
  });
});
