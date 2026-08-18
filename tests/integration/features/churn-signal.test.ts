import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * `churn` is one of the five terms in the composite risk score, and it was 0.00 for every symbol in
 * every project — including three subjects with 975, 288 and 213 commits of history.
 *
 * The data was never missing. `reflector.ts` runs one `git log` per file and writes
 * `metadata.kinetic = { resonance, entropy, … }`; persistence keeps it in the `kinetic` column and in
 * `churn_count_90d`. On the sofie subject `registerIpcHandlers` carries `kinetic.resonance = 116`,
 * which is exactly `git log --oneline -- electron/main/index.ts | wc -l`. Both consumers
 * (`conducks-core.ts` and `governance/advisor.ts`) read `properties.resonance` and
 * `properties.entropy` — flat names no writer sets — so two of the six weighted terms contributed
 * nothing while `explain` printed `churn: 0.00` as though it had been measured.
 *
 * A metric that is structurally zero is worse than an absent one: the reader cannot tell it apart
 * from a real measurement of zero.
 */
describe('churn reflects real commit history', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('churn-signal');

    // A file touched once.
    writeFile(repo, 'src/calm.ts', `
export function calmFunction(): number { return 1; }
`);
    // A file touched many times — each commit is a separate revision of the same file.
    writeFile(repo, 'src/busy.ts', `
export function busyFunction(): number { return 0; }
`);
    commit(repo, 'init');

    for (let i = 1; i <= 12; i++) {
      writeFile(repo, 'src/busy.ts', `
export function busyFunction(): number { return ${i}; }
`);
      commit(repo, `churn ${i}`);
    }

    runCli(['analyze', '--yes'], { cwd: repo });
    expect(JSON.parse(runCli(['query', '*', '--json'], { cwd: repo }).stdout).length).toBeGreaterThan(0);
  }, 300000);

  afterAll(() => rmRepo(repo));

  /** Colour codes sit between the label and the number, so the raw stream is unmatchable. */
  const plain = (s: string): string => s.replace(/\u001b\[[0-9;]*m/g, '');
  const churnOf = (symbol: string): number => {
    const m = /churn:\s*([\d.]+)/.exec(plain(runCli(['explain', symbol], { cwd: repo }).stdout));
    return m ? Number(m[1]) : NaN;
  };

  it('reports a non-zero churn for a repeatedly-modified file', () => {
    const out = plain(runCli(['explain', 'busyFunction'], { cwd: repo }).stdout);
    const churn = /churn:\s*([\d.]+)/.exec(out);
    expect(churn).not.toBeNull();
    expect(Number(churn![1])).toBeGreaterThan(0);
  }, 180000);

  it('reports LESS churn for the file that was touched once', () => {
    // The counter-test. Hard-coding any non-zero churn would pass the case above; the metric has to
    // discriminate, or it is decoration.
    const busy = churnOf('busyFunction');
    const calm = churnOf('calmFunction');
    expect(busy).toBeGreaterThan(calm);
  }, 180000);
});
