import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * ADR 0122 — `diff --base` compared against a pulse the vault no longer holds.
 *
 * The chronoscopic path queried `SELECT * FROM nodes WHERE pulseId = ?`. But `sweepRowsNotInPulse`
 * deletes every row not written by the CURRENT pulse, so a historical pulse has no rows in `nodes`
 * at all. Measured on conducks, comparing two real consecutive pulses:
 *
 *     [DEBUG] Loaded Base: 0 nodes, 0 edges
 *     Summary: Delta: +5472/-0 Symbols, +19675/-0 Relationships.
 *
 * "Your entire codebase was added since the pulse three minutes ago", printed with confidence and
 * exit 0 — and a pulse id that does not exist at all produces the SAME answer, so nothing
 * distinguishes a real comparison from a fabricated one.
 *
 * What the vault DOES retain is `node_history`: pulseId, nodeId, gravity, complexity, fingerprint,
 * for every pulse. There is no edge history, so relationship counts cannot be compared and the
 * command must say so rather than invent them.
 */
describe('diff --base compares against what the vault actually retains', () => {
  let repo: string;
  let firstPulse: string;

  const pulseIdFrom = (out: string): string => {
    const m = out.match(/pulse_\d+_[a-z0-9]+/i);
    if (!m) throw new Error(`no pulse id in:\n${out}`);
    return m[0];
  };

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('diff-cmd');
    writeFile(repo, 'src/a.ts', 'export function a(): number { return 1; }\n');
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
    firstPulse = pulseIdFrom(runCli(['status', '--json'], { cwd: repo }).stdout);

    // A second pulse, so there is a real earlier one to compare against.
    writeFile(repo, 'src/b.ts', 'export function b(): number { return 2; }\n');
    commit(repo, 'add b');
    runCli(['analyze', '--yes'], { cwd: repo });
  }, 300000);

  afterAll(() => rmRepo(repo));

  it('does not report every symbol as new when the base pulse is real', () => {
    const { stdout, combined } = runCli(['diff', '--base', firstPulse, '--json'], { cwd: repo, allowFail: true });
    const result = JSON.parse(stdout);
    // `a` existed in the base pulse. Reporting it as added is the defect.
    expect(result.nodes.added).not.toContain(expect.stringContaining('a.ts::a'));
    expect(result.nodes.addedCount).toBeLessThan(result.baseNodeCount);
    expect(combined).not.toMatch(/\[DEBUG\]/);
  }, 180000);

  it('refuses a pulse id the vault does not hold', () => {
    const { combined, status } = runCli(['diff', '--base', 'pulse_does_not_exist'], { cwd: repo, allowFail: true });
    expect(status).not.toBe(0);
    expect(combined).toMatch(/not found|no such pulse|does not hold/i);
  }, 120000);

  /** Edge history is not retained, so a relationship delta would be invented. */
  it('does not claim a relationship delta it cannot compute', () => {
    const { stdout } = runCli(['diff', '--base', firstPulse, '--json'], { cwd: repo, allowFail: true });
    const result = JSON.parse(stdout);
    expect(result.edges).toBeUndefined();
    expect(result.retains).toMatch(/node/i);
  }, 120000);

  /** `--head` was only read inside the `--base` branch, so alone it silently ran the git path. */
  it('refuses --head without --base instead of silently ignoring it', () => {
    const { status } = runCli(['diff', '--head', 'pulse_whatever'], { cwd: repo, allowFail: true });
    expect(status).not.toBe(0);
  }, 120000);

  /**
   * The git path claims "staged/unstaged" in its own description and ran `git diff -U0`, which
   * shows unstaged changes ONLY — so a fully staged change set reported "No structural changes".
   */
  it('sees a staged change', () => {
    writeFile(repo, 'src/a.ts', 'export function a(): number { return 42; }\n');
    runCli(['analyze', '--yes'], { cwd: repo }); // keep the graph current
    execFileSync('git', ['add', '-A'], { cwd: repo, stdio: 'ignore' });
    const { combined } = runCli(['diff'], { cwd: repo, allowFail: true });
    expect(combined).not.toMatch(/No structural changes detected/);
  }, 300000);
});
