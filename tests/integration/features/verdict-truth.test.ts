import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * The commands that emit a VERDICT, against a repository whose real state is known (todo50 Phase 3).
 *
 * A wrong verdict is the most expensive kind of wrong answer: it is the one somebody acts on. So
 * each case below is scored against a fixture built to have exactly one correct answer, and — just
 * as important — each asserts what the command must NOT say. A verdict that fires on everything is
 * indistinguishable from one that is right.
 *
 * The fixture carries ONE deliberate circular dependency (`a -> b -> a`) and one clean chain, so
 * "found a cycle" can be scored as right rather than merely plausible, and "found exactly one" is
 * the part that separates a detector from a smoke alarm.
 */
describe('verdicts against a repository whose state is known', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('verdict');
    writeFile(repo, 'package.json', JSON.stringify({ name: 'verdict', version: '1.0.0', type: 'module' }));

    // THE CYCLE — deliberate, and the only one in the fixture.
    writeFile(repo, 'src/a.ts', `
import { fromB } from './b.js';
export function fromA(): number { return fromB() + 1; }
`);
    writeFile(repo, 'src/b.ts', `
import { fromA } from './a.js';
export function fromB(): number { return 2; }
export function alsoB(): number { return fromA(); }
`);
    // A CLEAN chain, so the detector has something it must NOT flag.
    writeFile(repo, 'src/leaf.ts', 'export function leaf(): number { return 1; }\n');
    writeFile(repo, 'src/mid.ts', "import { leaf } from './leaf.js';\nexport function mid(): number { return leaf(); }\n");
    writeFile(repo, 'src/index.ts', "import { mid } from './mid.js';\nexport function main(): number { return mid(); }\n");

    commit(repo, 'one deliberate cycle and one clean chain');
    runCli(['analyze', '--force', '--yes'], { cwd: repo });
  });

  afterAll(() => rmRepo(repo));

  /**
   * Colour codes sit BETWEEN a label and its value — `Grade:       \x1b[32mB\x1b[0m` — so a regex
   * written against what the terminal shows fails against what the pipe carries. Three assertions
   * in this file failed that way before the output was read rather than guessed.
   */
  const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

  it('audit finds the cycle that IS there, and does not invent others', () => {
    const r = runCli(['audit'], { cwd: repo, allowFail: true });
    expect(r.combined).toMatch(/circular/i);
    // The count is the claim worth checking: a detector that reports "cycles found" on any input is
    // not a detector. The fixture contains exactly one.
    const m = r.combined.match(/(\d+)\s+Circular Dependenc/i);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(1);
    // And it must name the files in the cycle, not merely announce one.
    expect(r.combined).toMatch(/\ba\.ts\b/);
    expect(r.combined).toMatch(/\bb\.ts\b/);
    // The clean chain must not appear in the finding.
    expect(r.combined).not.toMatch(/leaf\.ts.*->.*mid\.ts.*->.*leaf\.ts/);
  });

  it('arch DECLINES to name a pattern on a shape that has none, and prints the shape anyway', () => {
    const out = runCli(['arch'], { cwd: repo }).combined;
    // ADR 0134: a verdict comes only from a measurement, and "no pattern detected" is the honest
    // answer for five files with no adapters and no composition root. Naming the nearest label
    // would be the confident-wrong answer the decision table exists to refuse.
    expect(out).toMatch(/no pattern detected/i);
    // Declining is only acceptable because the SHAPE is still reported.
    expect(out).toMatch(/shape|cluster|flows/i);
    expect(out).not.toMatch(/hexagonal|microkernel|clean architecture/i);
  });

  it('guard reports the pre-existing cycle as a finding, and states the layer contract separately', () => {
    const r = runCli(['guard'], { cwd: repo, allowFail: true });
    // Two independent claims, and conflating them is the ADR 0044 failure: a run with findings must
    // not print a clean verdict for the OTHER check two lines later.
    expect(r.combined).toMatch(/no_cycles=1|cycle/i);
    expect(r.combined).toMatch(/layer contract/i);
  });

  it('advise names the cycle as a finding rather than a generic recommendation', () => {
    const out = runCli(['advise'], { cwd: repo }).combined;
    expect(out).toMatch(/circular/i);
  });

  it('fallback REFUSES rather than reporting a clean scan it did not run', () => {
    const r = runCli(['fallback'], { cwd: repo, allowFail: true });
    const out = plain(r.combined);
    // The valuable behaviour, and the one worth pinning: no node carries a fallback analysis in this
    // fixture, and the command says so — "nothing was measured — this is NOT a clean result" — and
    // names the command that would measure it. A zero findings line here would have been a lie.
    expect(out).toMatch(/nothing was measured/i);
    expect(out).toMatch(/NOT a clean result/i);
    expect(out).toMatch(/audit --fallback/);
    expect(r.status).not.toBe(0);
    // Its filters are still stated, so the reader knows what would have been scanned.
    expect(out).toMatch(/confidence|tenure|limit/i);
  });

  it('ledger grades the workspace and shows the arithmetic behind the grade', () => {
    const out = plain(runCli(['ledger'], { cwd: repo }).combined);
    expect(out).toMatch(/Grade:\s*[A-F]\b/);
    expect(out).toMatch(/\(\d+\/100\)/);
    // A grade with no deductions listed is a number nobody can check or argue with.
    expect(out).toMatch(/Deductions/i);
    expect(out).toMatch(/-\d+\s+\w/);
  });

  it('drift REFUSES on one pulse rather than calling a single sample stable', () => {
    const r = runCli(['drift'], { cwd: repo, allowFail: true });
    const out = plain(r.combined);
    // Drift is a comparison; with one pulse there is nothing to compare. Saying so beats answering
    // "stable", which is what a single sample always looks like.
    expect(out).toMatch(/Insufficient historical data|at least 2 pulses/i);
    expect(r.status).not.toBe(0);
  });
});
