import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DocsStatusCommand } from '@/interfaces/cli/commands/docs-status.js';
import { DocsLintCommand } from '@/interfaces/cli/commands/docs-lint.js';
import { buildBoard, buildTrees } from '@/lib/domain/analysis/docs-board.js';

// A working `registry.docs.board` stand-in — the pre-fix `docs-status` reads it directly, so the
// stub must behave like the real thing rather than throw, or a failure here would just be a crash,
// not proof that the merged checks were missing.
// The real builders behind a fake registry: these suites assert what the BOARD reports, so
// stubbing the builder would let the stub decide the answer. Composition is the only thing faked,
// because the commands now reach domain through it (ADR 0005) rather than importing it directly.
const fakeRegistry = {
  docs: {
    board: (r?: string) => buildBoard(r as string),
    trees: (r?: string, o?: { rootOnly?: boolean }) => buildTrees(r as string, o),
  },
} as never;

/**
 * Before `buildTrees`, `docs-status` built its board straight from `registry.docs.board` — the raw
 * `buildBoard`, with neither `treeShapeLint` nor `crossTreeLint` applied. A `docs/README.md` failed
 * `docs-lint` (README is not part of the standard) but read as clean from `docs-status`, because the
 * two commands built the tree two different ways. This proves they now agree: the same fixture that
 * fails `docs-lint` shows up in `docs-status --json`'s `lint`.
 */
describe('docs-status — shares docs-lint\'s checks via buildTrees', () => {
  let root = '';

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'conducks-docsstatus-'));
    mkdirSync(path.join(root, 'docs', 'decisions'), { recursive: true });
    writeFileSync(path.join(root, 'docs', 'decisions', '0001-x.md'),
      '# 0001 — a decision\nStatus: Accepted\n- Date: 2026-07-26\n\n## Context\nc\n## Decision\nd\n## Consequences\nq\n');
    // README.md is invisible to buildBoard's own walk (walkDocs skips it) — only treeShapeLint sees it.
    writeFileSync(path.join(root, 'docs', 'README.md'), '# not part of the standard\n');
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const runJson = async (Cmd: new () => { execute(a: string[], r: unknown): Promise<void> }, args: string[]) => {
    const logs: string[] = [];
    const spy = jest.spyOn(console, 'log').mockImplementation((s: unknown) => { logs.push(String(s)); });
    try {
      await new Cmd().execute(args, fakeRegistry);
    } finally {
      spy.mockRestore();
    }
    return logs.join('\n');
  };

  it('docs-lint fails the README (baseline — what docs-status must now match)', async () => {
    const out = await runJson(DocsLintCommand, [root]);
    expect(out).toMatch(/README\.md/);
    expect(out).toMatch(/not part of the standard/);
  });

  it('docs-status --json now reports the same README violation in board.lint', async () => {
    const out = await runJson(DocsStatusCommand, [root, '--json']);
    const board = JSON.parse(out);
    expect(board.lint.some((l: { file: string; errs: string[] }) =>
      l.file === 'README.md' && l.errs.some((e: string) => e.includes('not part of the standard')))).toBe(true);
  });

  it('the rendered (non-JSON) view also surfaces it as a grammar break', async () => {
    const out = await runJson(DocsStatusCommand, [root]);
    expect(out).toMatch(/file\(s\) break the grammar/);
  });
});
