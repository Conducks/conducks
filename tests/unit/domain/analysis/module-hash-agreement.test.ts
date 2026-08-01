import { describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProjectMonitor } from '@/lib/domain/analysis/project-monitor.js';
import { buildBoard } from '@/lib/domain/analysis/docs-board.js';

/**
 * todo21#P3 / ADR 0031 — the two module-hash implementations must agree.
 *
 * Module structure is encoded twice: `ProjectMonitor.moduleHash` writes the hash a dismissal is
 * bound to, and the docs board's private `moduleHashOf` reads it back to decide whether an
 * architecture note has drifted. ADR 0031 calls them "deliberately identical and deliberately
 * separate" — identical so the board and the command never disagree about the same module, separate
 * so the docs layer does not import the code layer (CONDUCKS-24).
 *
 * "Deliberately identical" is an unenforced promise, and this is what enforces it. The two are
 * tested through their PUBLIC surfaces rather than by comparing the functions, because that is how
 * a disagreement would actually reach a user: `monitor --dismiss` records "checked, still accurate",
 * and `docs-status` immediately calls the same note drifted. Nobody would suspect the hash — they
 * would think the dismissal was broken.
 */
const tmp: string[] = [];
const mkProject = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-modhash-'));
  tmp.push(root);
  fs.mkdirSync(path.join(root, 'src', 'lib', 'foo'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs', 'modules', 'foo'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'lib', 'foo', 'a.ts'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(root, 'src', 'lib', 'foo', 'b.ts'), 'export const b = 2;\n');
  fs.writeFileSync(path.join(root, 'docs', 'modules', 'foo', 'MODULE.md'), '# foo\n');
  return root;
};
afterEach(() => { while (tmp.length) fs.rmSync(tmp.pop()!, { recursive: true, force: true }); });

const MODULE = 'src/lib/foo';
const driftedModules = (root: string) => (buildBoard(root).reviews ?? []).map(r => r.module);

describe('ProjectMonitor.moduleHash and the docs board agree on a module', () => {
  /**
   * The load-bearing case. If the two rules disagree by so much as a separator, a note dismissed one
   * second ago reads as already drifted.
   */
  it('a note dismissed by the monitor does not immediately read as drifted on the board', () => {
    const root = mkProject();

    new ProjectMonitor().dismissReview(root, MODULE);

    expect(driftedModules(root)).toEqual([]);
  });

  it('the note drifts once the module changes', () => {
    const root = mkProject();
    new ProjectMonitor().dismissReview(root, MODULE);

    fs.writeFileSync(path.join(root, 'src', 'lib', 'foo', 'a.ts'), 'export const a = 99;\n');

    expect(driftedModules(root)).toEqual([MODULE]);
  });

  /** Both rules hash the files in the directory, so adding one to the module must move the hash. */
  it('the note drifts when a file is added to the module', () => {
    const root = mkProject();
    new ProjectMonitor().dismissReview(root, MODULE);

    fs.writeFileSync(path.join(root, 'src', 'lib', 'foo', 'c.ts'), 'export const c = 3;\n');

    expect(driftedModules(root)).toEqual([MODULE]);
  });

  it('the note drifts when a file is removed from the module', () => {
    const root = mkProject();
    new ProjectMonitor().dismissReview(root, MODULE);

    fs.rmSync(path.join(root, 'src', 'lib', 'foo', 'b.ts'));

    expect(driftedModules(root)).toEqual([MODULE]);
  });

  /**
   * Both rules filter by the same extension set, and both hash CONTENT only — no path, no mtime.
   * A non-source file in the directory is invisible to each, and they must be invisible together.
   */
  it('both ignore a non-source file added to the module', () => {
    const root = mkProject();
    new ProjectMonitor().dismissReview(root, MODULE);

    fs.writeFileSync(path.join(root, 'src', 'lib', 'foo', 'notes.txt'), 'not source\n');
    fs.writeFileSync(path.join(root, 'src', 'lib', 'foo', 'data.json'), '{}\n');

    expect(driftedModules(root)).toEqual([]);
  });

  /** Re-dismissing after a real change rebinds to the new code, and the flag clears again. */
  it('re-dismissing after a change binds to the new code', () => {
    const root = mkProject();
    const monitor = new ProjectMonitor();
    monitor.dismissReview(root, MODULE);
    fs.writeFileSync(path.join(root, 'src', 'lib', 'foo', 'a.ts'), 'export const a = 99;\n');
    expect(driftedModules(root)).toEqual([MODULE]);

    monitor.dismissReview(root, MODULE);

    expect(driftedModules(root)).toEqual([]);
  });
});
