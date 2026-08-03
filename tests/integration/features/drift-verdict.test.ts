import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * ADR 0127 — a drift verdict that was not reached is not a pass.
 *
 * `conducks drift pulse_nope` printed "No symbols were comparable between these two pulses, so no
 * drift verdict was reached" — an honest MESSAGE — and exited 0. A script reading only the status
 * could not tell that from "stable", which is the one thing the exit code is for.
 *
 * `DECAYING` still exits 0: decay is an answer, and this command reports rather than gates.
 */
describe('drift exits non-zero when it reaches no verdict', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('drift-verdict');
    writeFile(repo, 'src/a.ts', 'export function a(): number { return 1; }\n');
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  }, 300000);

  afterAll(() => rmRepo(repo));

  it('refuses a pulse it cannot compare against', () => {
    const { combined, status } = runCli(['drift', 'pulse_nope'], { cwd: repo, allowFail: true });
    expect(status).not.toBe(0);
    expect(combined).toMatch(/no drift verdict|not comparable|insufficient/i);
  }, 120000);

  it('still exits 0 when it does reach a verdict', () => {
    writeFile(repo, 'src/b.ts', 'export function b(): number { return 2; }\n');
    commit(repo, 'add b');
    runCli(['analyze', '--yes'], { cwd: repo });
    expect(runCli(['drift'], { cwd: repo, allowFail: true }).status).toBe(0);
  }, 300000);
});
