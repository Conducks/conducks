import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * ADR 0124 — the docs tooling reported clean on a project with no docs.
 *
 * Measured on a repository with no `docs/` directory at all:
 *
 *     conducks docs-lint     ✓ docs-lint clean — 0 governed docs conform to the grammar.   exit 0
 *     conducks docs-status   grammar: clean ✓                                              exit 0
 *
 * Both are green ticks over an empty set — the fifth occurrence of the shape ADR 0044, ADR 0073, the
 * sentinel rule matching 0 nodes and ADR 0123 all named. It matters most here, because these two ARE
 * the enforcement: a project that has never written a doc gets the same output as one whose docs are
 * complete and correct.
 */
describe('the docs tooling separates clean from empty', () => {
  let bare: string;
  let boot: string;

  beforeAll(() => {
    ensureBuild();
    bare = mkGitRepo('docs-bare');
    writeFile(bare, 'src/a.ts', 'export const a = 1;\n');
    commit(bare, 'init');

    boot = mkGitRepo('docs-boot');
    writeFile(boot, 'src/a.ts', 'export const a = 1;\n');
    commit(boot, 'init');
    runCli(['bootstrap-docs'], { cwd: boot });
  }, 300000);

  afterAll(() => { rmRepo(bare); rmRepo(boot); });

  it('docs-lint does not call a project with no docs clean', () => {
    const { combined } = runCli(['docs-lint'], { cwd: bare, allowFail: true });
    expect(combined).not.toMatch(/docs-lint clean/);
    expect(combined).toMatch(/no governed docs|nothing to lint|has no docs/i);
  }, 120000);

  it('docs-status does not report the grammar clean when there is no grammar to check', () => {
    const { combined } = runCli(['docs-status'], { cwd: bare, allowFail: true });
    expect(combined).not.toMatch(/grammar: clean/);
  }, 120000);

  /** The control: a real docs tree still reports clean, so the fix cannot be "always complain". */
  it('still reports clean for a bootstrapped tree', () => {
    const { combined, status } = runCli(['docs-lint'], { cwd: boot, allowFail: true });
    expect(status).toBe(0);
    expect(combined).toMatch(/clean/);
  }, 120000);

  /**
   * `bootstrap-docs` writes `features.md`, `handover.md` and `todos/todo01.md` — three governed
   * types — and `docs-lint` then counted 2. A file the standard governs and the linter does not see
   * is a file nothing checks.
   */
  it('lints every governed file bootstrap-docs creates', () => {
    const created = ['features.md', 'handover.md', path.join('todos', 'todo01.md')]
      .filter(f => fs.existsSync(path.join(boot, 'docs', f)));
    expect(created.length).toBe(3);

    const { combined } = runCli(['docs-lint'], { cwd: boot, allowFail: true });
    const n = Number(combined.match(/(\d+) governed docs?/)?.[1] ?? 0);
    expect(n).toBeGreaterThanOrEqual(created.length);
  }, 120000);
});
