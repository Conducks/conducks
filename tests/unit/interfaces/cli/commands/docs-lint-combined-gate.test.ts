import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DocsLintCommand } from '@/interfaces/cli/commands/docs-lint.js';
import { buildBoard, buildTrees, governedCount } from '@/lib/domain/docs/index.js';
import type { VisualsReport } from '@/lib/domain/docs/index.js';

/**
 * ADR 0194 — `docs-lint` is the single gate over every authored doc: it runs the grammar AND
 * invokes `visuals-lint`, and the two halves set `process.exitCode` independently so a reader can
 * tell which one failed without re-running either command alone. Phase 4 built and hand-verified
 * this; nothing exercised it until now.
 *
 * Only `registry.visuals.lint` is faked — `docs.trees`/`governedCount` are the real domain
 * functions over a real temp `docs/` tree, same style as `docs-status.test.ts`, so this proves the
 * ACTUAL grammar behaviour rather than a stub deciding the grammar half's answer too.
 */
describe('docs-lint — the combined gate (ADR 0194)', () => {
  let root = '';

  const writeCleanTodo = () => {
    mkdirSync(path.join(root, 'docs', 'todos'), { recursive: true });
    writeFileSync(path.join(root, 'docs', 'todos', 'todo01.md'),
      '# todo01 — first milestone\nStatus: todo\n- Acceptance: one line\n\n## Phase 1 — setup\n- [ ] first task\n');
  };

  beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), 'conducks-docslint-combined-')); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const savedExitCode = process.exitCode;
  beforeAll(() => { process.exitCode = undefined; });
  afterAll(() => { process.exitCode = savedExitCode; });

  const fakeRegistry = (visualsLint: () => Promise<VisualsReport & { pages: number }>) => ({
    docs: {
      board: (r?: string) => buildBoard(r as string),
      trees: (r?: string, o?: { rootOnly?: boolean }) => buildTrees(r as string, o),
      governedCount,
    },
    visuals: {
      lint: visualsLint,
      // driftGate runs after every lint, pass or fail — neutral stand-ins for the parts this test
      // does not exercise (review stamps, drift) so it does not have to build a visuals/ tree.
      review: async () => ({ flags: [], orphans: [], unstamped: [], exemptErrors: [], stamped: 0 }),
      drift: async () => ({ status: 'skipped', command: null }),
    },
  }) as never;

  const run = async (registry: unknown) => {
    process.exitCode = undefined;
    const logs: string[] = [];
    const spy = jest.spyOn(console, 'log').mockImplementation((s: unknown) => { logs.push(String(s)); });
    try {
      await new DocsLintCommand().execute([root], registry as never);
    } finally {
      spy.mockRestore();
    }
    return { out: logs.join('\n'), exitCode: process.exitCode };
  };

  const NO_VISUALS: VisualsReport & { pages: number } =
    { violations: [], checked: 0, pagesWithAnchors: 0, pages: 0 };

  it('always prints the visuals half under its own header, whether or not grammar found anything to say', async () => {
    writeCleanTodo();
    const { out } = await run(fakeRegistry(async () => NO_VISUALS));
    expect(out).toMatch(/docs-lint clean/);
    expect(out).toMatch(/Conducks Docs Lint — visuals/);
  });

  it('fails the run when the grammar half breaks, even if visuals has nothing to check', async () => {
    mkdirSync(path.join(root, 'docs', 'todos'), { recursive: true });
    writeFileSync(path.join(root, 'docs', 'todos', 'todo01.md'),
      '# todo01 — first milestone\nStatus: banana\n- Acceptance: one line\n\n## Phase 1 — setup\n- [ ] first task\n');
    const { out, exitCode } = await run(fakeRegistry(async () => NO_VISUALS));
    expect(exitCode).toBe(1);
    expect(out).toMatch(/violate the grammar/);
    expect(out).toMatch(/No docs\/visuals/);
  });

  it('fails the run when the visuals half breaks, even though grammar is clean', async () => {
    writeCleanTodo();
    const broken: VisualsReport & { pages: number } = {
      violations: [{ page: 'docs/visuals/modules/x.md', anchor: 'src/y.ts', severity: 'error', reason: 'no such file' }],
      checked: 0, pagesWithAnchors: 1, pages: 1,
    };
    const { out, exitCode } = await run(fakeRegistry(async () => broken));
    expect(exitCode).toBe(1);
    expect(out).toMatch(/docs-lint clean/);       // the grammar half itself is unaffected
    expect(out).toMatch(/broken anchor/);
  });

  it('leaves exitCode unset when both halves are clean', async () => {
    writeCleanTodo();
    const { out, exitCode } = await run(fakeRegistry(async () => NO_VISUALS));
    expect(exitCode).toBeUndefined();
    expect(out).toMatch(/docs-lint clean/);
    expect(out).toMatch(/No docs\/visuals/);
  });
});
