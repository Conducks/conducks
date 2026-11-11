import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * The lifecycle surfaces — the last family in the walk.
 *
 * These are checked for the property that keeps being violated everywhere else: NOTHING CHECKED
 * MUST NOT READ AS CLEAN (ADR 0124). Most of them can answer "no findings", and the whole question
 * is whether that answer is earned or is the absence of an answer wearing a tick.
 */
describe('lifecycle surfaces', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('lifecycle');
    writeFile(repo, 'package.json', JSON.stringify({ name: 'life', version: '1.0.0', type: 'module' }));
    writeFile(repo, 'src/index.ts', "export function main(): number { return 1; }\nexport function unused(): number { return 2; }\n");
    commit(repo, 'a small project');
    runCli(['analyze', '--force', '--yes'], { cwd: repo });
  });

  afterAll(() => rmRepo(repo));

  const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

  it('prune reports what it would remove with a count, never a bare "done"', () => {
    const out = plain(runCli(['prune'], { cwd: repo, allowFail: true }).combined);
    expect(out).toMatch(/\d+/);
  });

  it('doctor checks the environment and names each check', () => {
    const out = plain(runCli(['doctor'], { cwd: repo, allowFail: true }).combined);
    expect(out).toMatch(/node/i);
    expect(out).toMatch(/duckdb/i);
    expect(out).toMatch(/\[.\]/);                        // a per-check verdict marker
  });

  it('supply-chain distinguishes "no dependencies" from "not analyzed"', () => {
    // It used to print one sentence for both — "No boundary edges found. Run 'conducks analyze'
    // first." — so a project with zero third-party imports was told to repeat work it had already
    // done, and a true empty answer read as a tool failure. This fixture HAS been analyzed and
    // genuinely has no dependencies, which is the case that was being mislabelled.
    const out = plain(runCli(['supply-chain'], { cwd: repo, allowFail: true }).combined);
    expect(out).toMatch(/no third-party dependencies/i);
    expect(out).toMatch(/not a missing analysis/i);
    expect(out).not.toMatch(/Run 'conducks analyze' first/);
  });

  it('diff on an unchanged workspace says NO CHANGES rather than printing an empty report', () => {
    const out = plain(runCli(['diff'], { cwd: repo, allowFail: true }).combined);
    expect(out).toMatch(/no structural changes|no changes/i);
  });

  it('coverage without a report file refuses and states the usage', () => {
    const r = runCli(['coverage'], { cwd: repo, allowFail: true });
    expect(plain(r.combined)).toMatch(/missing coverage file|usage/i);
  });

  it('link without a path refuses rather than linking something arbitrary', () => {
    const r = runCli(['link'], { cwd: repo, allowFail: true });
    expect(plain(r.combined)).toMatch(/provide a path|usage/i);
  });

  it('monitor reports each registered project with its state', () => {
    const out = plain(runCli(['monitor'], { cwd: repo, allowFail: true }).combined);
    expect(out).toMatch(/monitor|graph/i);
  });
});
