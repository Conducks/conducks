/**
 * todo29#P1 — a nested repository is discovered, and its history comes from ITS OWN repo.
 *
 * Measured on a fixture before the fix: a workspace with its own `.git` containing a service that
 * also has one produced 3 units where 5 exist. `git ls-files` in the outer repo does not list a
 * directory carrying its own `.git`, and `--recurse-submodules` only descends into REGISTERED
 * submodules — a plain `git init` in a subdirectory is neither. The inner service was absent from
 * the vault entirely: its code was never read, never mind its history.
 *
 * The history half was worse than absent. `getFileHistory` on the inner file returned
 * `count=0 authors=0` for a file with one commit, because git ran SUCCESSFULLY against the outer
 * repository, which truthfully knows nothing about that path. ADR 0049 drew its line at a
 * subprocess that FAILED; this one succeeded and answered about the wrong thing, so nothing
 * surfaced anywhere.
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ChronicleInterface } from '@/lib/core/git/chronicle-interface.js';

const roots: string[] = [];
const mkRoot = (): string => {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-nested-'));
  roots.push(r);
  return r;
};
afterEach(() => { for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true }); });

const repo = (dir: string, file: string, body: string, author: string) => {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), body);
  execFileSync('git', ['init', '-q', '.'], { cwd: dir });
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['-c', `user.email=${author}@t`, '-c', `user.name=${author}`, 'commit', '-qm', 'c'], { cwd: dir });
};

describe('nested repositories (todo29#P1)', () => {
  it('discovers files inside a repository nested in the workspace', async () => {
    const ws = mkRoot();
    repo(ws, 'svc/outer.ts', 'export const outer = 1;\n', 'outer');
    const inner = path.join(ws, 'app');
    repo(inner, 'src/inner.ts', 'export const inner = 2;\n', 'inner');

    const found = await new ChronicleInterface(ws).discoverFiles();
    const rel = found.map(f => path.relative(fs.realpathSync(ws), fs.realpathSync(f)));

    expect(rel).toContain('svc/outer.ts');
    expect(rel).toContain(path.join('app', 'src', 'inner.ts')); // absent entirely before the fix
  });

  it('reads a nested file HISTORY from its own repository, not the workspace anchor', async () => {
    const ws = mkRoot();
    repo(ws, 'svc/outer.ts', 'export const outer = 1;\n', 'outer');
    const inner = path.join(ws, 'app');
    repo(inner, 'src/inner.ts', 'export const inner = 2;\n', 'inner');

    const ch = new ChronicleInterface(ws);
    const h = await ch.getFileHistory(path.join(inner, 'src', 'inner.ts'));

    // Before the fix this was `count: 0, authors: 0` — a confident zero from a healthy subprocess
    // pointed at a repository that has never heard of the path.
    expect(h).not.toBeNull();
    expect(h!.count).toBe(1);
    expect(h!.authors).toBe(1);
  });

  it('still reads a workspace-level file from the workspace repository', async () => {
    const ws = mkRoot();
    repo(ws, 'svc/outer.ts', 'export const outer = 1;\n', 'outer');
    repo(path.join(ws, 'app'), 'src/inner.ts', 'export const inner = 2;\n', 'inner');

    const h = await new ChronicleInterface(ws).getFileHistory(path.join(ws, 'svc', 'outer.ts'));
    expect(h!.count).toBe(1);
  });

  // NOT TESTED HERE, and the reason is a constraint rather than a choice: the third topology (no
  // `.git` at the workspace root, one per service) exercises the FS-scan merge, and that path calls
  // `getDiscoverySurface()`, whose dynamic `import()` calls cannot be resolved by jest's ESM VM —
  // the same reason the sibling `chronicle-interface.test.ts` mocks exec and never reaches it.
  //
  // VERIFIED OUT OF BAND on a real fixture instead: a workspace with `conducks.json`, no root
  // `.git`, and two services each with their own analyzed 5 units including the declaration itself.
  // Before the merge it analyzed 4 and silently dropped `conducks.json` — the file that defines the
  // workspace. Recorded in todo29#P1 with the numbers.
});
