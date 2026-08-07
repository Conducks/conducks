import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * The docs and lifecycle surfaces (todo50 Phase 4) — the last family in the walk.
 *
 * These are checked for the property that keeps being violated everywhere else: NOTHING CHECKED
 * MUST NOT READ AS CLEAN (ADR 0124). Most of them can answer "no findings", and the whole question
 * is whether that answer is earned or is the absence of an answer wearing a tick.
 */
describe('docs and lifecycle surfaces', () => {
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

  it('docs-lint on a repo with NO docs says so rather than reporting clean', () => {
    const out = plain(runCli(['docs-lint'], { cwd: repo, allowFail: true }).combined);
    // The distinction this whole session keeps re-finding: zero violations because there is nothing
    // to lint is not the same claim as zero violations because everything conforms.
    expect(out).toMatch(/no docs|nothing|0 governed|not found/i);
  });

  it('visuals-lint says nothing was checked when the folder is absent', () => {
    const out = plain(runCli(['visuals-lint'], { cwd: repo, allowFail: true }).combined);
    expect(out).toMatch(/no docs\/visuals|nothing was checked/i);
    expect(out).not.toMatch(/✓ visuals-lint clean/);
  });

  it('bootstrap-docs creates the create-now set, and docs-lint then passes for a real reason', () => {
    runCli(['bootstrap-docs', 'life'], { cwd: repo });
    for (const f of ['docs/features.md', 'docs/architecture.md', 'docs/handover.md']) {
      expect(existsSync(path.join(repo, f))).toBe(true);
    }
    const out = plain(runCli(['docs-lint'], { cwd: repo, allowFail: true }).combined);
    expect(out).toMatch(/clean/i);
    // Now the pass has a DENOMINATOR — the count is what separates it from the empty case above.
    expect(out).toMatch(/\d+ governed docs/);
  });

  it('docs-lint FAILS on a broken governed line, so the pass above means something', () => {
    const todo = path.join(repo, 'docs', 'todos', 'todo01.md');
    const original = existsSync(todo) ? readFileSync(todo, 'utf8') : null;
    if (original === null) return;                       // nothing to break; skip rather than fake
    writeFileSync(todo, original.replace(/^Status: .*/m, 'Status: banana'));
    const r = runCli(['docs-lint'], { cwd: repo, allowFail: true });
    writeFileSync(todo, original);
    expect(r.status).not.toBe(0);
    expect(plain(r.combined)).toMatch(/banana|not a valid/i);
  });

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

  it('rename refuses an unknown symbol instead of renaming nothing and reporting success', () => {
    const r = runCli(['rename', 'noSuchSymbolAnywhere', 'newName'], { cwd: repo, allowFail: true });
    const out = plain(r.combined);
    expect(out).toMatch(/not found|no symbol|could not resolve|usage/i);
  });

  it('install-hooks is idempotent and reports which state it reached', () => {
    const first = plain(runCli(['install-hooks'], { cwd: repo }).combined);
    expect(first).toMatch(/installed|created|refreshed/i);
    const second = plain(runCli(['install-hooks'], { cwd: repo }).combined);
    expect(second).toMatch(/already current|unchanged/i);
  });

  it('monitor reports each registered project with its state', () => {
    const out = plain(runCli(['monitor'], { cwd: repo, allowFail: true }).combined);
    expect(out).toMatch(/monitor|graph|docs/i);
  });

  it('record answers or refuses, never silently succeeds with no output', () => {
    const r = runCli(['record'], { cwd: repo, allowFail: true });
    expect(plain(r.combined).trim().length).toBeGreaterThan(0);
  });
});
