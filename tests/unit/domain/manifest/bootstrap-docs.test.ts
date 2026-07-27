import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ManifestService } from '@/lib/domain/manifest/index.js';
import { buildBoard, treeShapeLint } from '@/lib/domain/analysis/docs-board.js';

/**
 * Bootstrap writes the conducks-docs create-now set. Two things must hold, and only a real run on a
 * real directory can show either: every file it writes passes `docs-lint`, and it writes nothing the
 * standard forbids. It used to scaffold `progress.md`, which is derived — never read, never linted —
 * so the very first thing a new project got was a file the standard tells it to delete.
 */
describe('bootstrap-docs', () => {
  let root = '';
  const service = new ManifestService();
  const docs = (...p: string[]) => path.join(root, 'docs', ...p);

  beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), 'conducks-bootstrap-')); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('writes the create-now set at a root tree', async () => {
    const created = await service.bootstrap(root, 'demo', 'root');
    expect(created.sort()).toEqual([
      'architecture.md', 'features.md', 'handover.md', path.join('todos', 'todo01.md'),
    ]);
  });

  it('omits the root-only files from a service tree', async () => {
    const created = await service.bootstrap(root, 'demo', 'service');
    expect(created).not.toContain('handover.md');
    expect(existsSync(docs('handover.md'))).toBe(false);
  });

  it('never writes a derived file', async () => {
    await service.bootstrap(root, 'demo', 'root');
    for (const f of ['progress.md', 'map.md', 'drift.md']) expect(existsSync(docs(f))).toBe(false);
  });

  it('does not scaffold create-when-needed files — a placeholder rule that states nothing true reads as an answer', async () => {
    await service.bootstrap(root, 'demo', 'root');
    expect(existsSync(docs('conventions.md'))).toBe(false);
    expect(existsSync(docs('memory.md'))).toBe(false);
    expect(existsSync(docs('modules'))).toBe(false);
  });

  it('creates the folders a first ADR and a first closed todo need, even while empty', async () => {
    await service.bootstrap(root, 'demo', 'root');
    expect(existsSync(docs('decisions'))).toBe(true);
    expect(existsSync(docs('todos', 'completed'))).toBe(true);
  });

  it('everything it writes passes docs-lint and the tree-shape check', async () => {
    await service.bootstrap(root, 'demo', 'root');
    expect(buildBoard(root).lint).toEqual([]);
    expect(treeShapeLint(root, true).errs).toEqual([]);
  });

  it('a service tree it scaffolds also passes the root-only check', async () => {
    await service.bootstrap(root, 'demo', 'service');
    expect(buildBoard(root).lint).toEqual([]);
    expect(treeShapeLint(root, false).errs).toEqual([]);
  });

  it('leaves the mermaid graph fenced, so its arrows never parse as fields', async () => {
    await service.bootstrap(root, 'demo', 'root');
    const arch = readFileSync(docs('architecture.md'), 'utf8');
    expect(arch).toMatch(/```mermaid/);
    expect(arch).toMatch(/## Contract/);
  });

  it('writes nothing over a file already on disk', async () => {
    await service.bootstrap(root, 'demo', 'root');
    const again = await service.bootstrap(root, 'demo', 'root');
    expect(again).toEqual([]);
  });
});
